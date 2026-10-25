"""Tomorrow's forecast via Open-Meteo, with a short in-process cache."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import get_settings
from app.schemas.recommendation import GeocodeResult, WeatherResponse

WMO: dict[int, tuple[str, str]] = {
    0: ("晴朗", "☀️"),
    1: ("大致晴朗", "🌤️"),
    2: ("局部多云", "⛅"),
    3: ("阴天", "☁️"),
    45: ("有雾", "🌫️"),
    48: ("雾凇", "🌫️"),
    51: ("小毛毛雨", "🌦️"),
    53: ("毛毛雨", "🌦️"),
    55: ("较强毛毛雨", "🌧️"),
    56: ("冻毛毛雨", "🌧️"),
    57: ("强冻毛毛雨", "🌧️"),
    61: ("小雨", "🌦️"),
    63: ("中雨", "🌧️"),
    65: ("大雨", "🌧️"),
    66: ("冻雨", "🌧️"),
    67: ("强冻雨", "🌧️"),
    71: ("小雪", "🌨️"),
    73: ("中雪", "🌨️"),
    75: ("大雪", "❄️"),
    77: ("米雪", "🌨️"),
    80: ("阵雨", "🌦️"),
    81: ("中等阵雨", "🌧️"),
    82: ("强阵雨", "⛈️"),
    85: ("阵雪", "🌨️"),
    86: ("强阵雪", "❄️"),
    95: ("雷阵雨", "⛈️"),
    96: ("雷阵雨伴小冰雹", "⛈️"),
    99: ("雷阵雨伴冰雹", "⛈️"),
}


@dataclass
class _CacheEntry:
    expires_at: float
    value: WeatherResponse


_weather_cache: dict[tuple[float, float], _CacheEntry] = {}
_geocode_cache: dict[str, tuple[float, list[GeocodeResult]]] = {}


def _condition(code: int | None) -> tuple[str, str]:
    return WMO.get(int(code or 0), ("天气多变", "🌤️"))


async def fetch_tomorrow_weather(
    latitude: float, longitude: float, city: str | None = None
) -> WeatherResponse:
    settings = get_settings()
    key = (round(latitude, 3), round(longitude, 3))
    cached = _weather_cache.get(key)
    if cached and cached.expires_at > time.monotonic():
        if city and not cached.value.city:
            return cached.value.model_copy(update={"city": city})
        return cached.value

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": ",".join(
            [
                "temperature_2m_max",
                "temperature_2m_min",
                "apparent_temperature_max",
                "apparent_temperature_min",
                "precipitation_probability_max",
                "wind_speed_10m_max",
                "weather_code",
            ]
        ),
        "timezone": "auto",
        "forecast_days": 2,
        "temperature_unit": "celsius",
        "wind_speed_unit": "kmh",
    }
    try:
        async with httpx.AsyncClient(timeout=settings.weather_timeout_seconds) as client:
            response = await client.get(
                "https://api.open-meteo.com/v1/forecast", params=params
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail="暂时无法获取天气，请手动填写体感温度",
        ) from exc

    try:
        daily = payload["daily"]
        index = 1 if len(daily.get("time", [])) > 1 else 0
        temp_min = float(daily["temperature_2m_min"][index])
        temp_max = float(daily["temperature_2m_max"][index])
        apparent_min = float(daily["apparent_temperature_min"][index])
        apparent_max = float(daily["apparent_temperature_max"][index])
        precipitation = int(daily.get("precipitation_probability_max", [0, 0])[index] or 0)
        wind = float(daily.get("wind_speed_10m_max", [0, 0])[index] or 0)
        condition, icon = _condition(daily.get("weather_code", [0, 0])[index])
        date = str(daily["time"][index])
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="天气数据暂不可用，请稍后重试") from exc

    result = WeatherResponse(
        city=city,
        date=date,
        temp_min=round(temp_min),
        temp_max=round(temp_max),
        apparent_temp=round((apparent_min + apparent_max) / 2),
        precipitation_probability=max(0, min(100, precipitation)),
        wind_speed=round(wind),
        condition=condition,
        icon=icon,
        source="open-meteo",
    )
    _weather_cache[key] = _CacheEntry(
        expires_at=time.monotonic() + settings.weather_cache_seconds,
        value=result,
    )
    return result


async def geocode_city(query: str) -> list[GeocodeResult]:
    normalized = query.strip().lower()
    if not normalized:
        return []
    cached = _geocode_cache.get(normalized)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    try:
        async with httpx.AsyncClient(timeout=get_settings().weather_timeout_seconds) as client:
            response = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={
                    "name": query.strip(),
                    "count": 6,
                    "language": "zh",
                    "format": "json",
                },
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="城市搜索暂不可用") from exc

    results: list[GeocodeResult] = []
    for row in payload.get("results") or []:
        try:
            results.append(
                GeocodeResult(
                    name=row["name"],
                    admin1=row.get("admin1"),
                    country=row.get("country"),
                    latitude=float(row["latitude"]),
                    longitude=float(row["longitude"]),
                    timezone=row.get("timezone"),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    _geocode_cache[normalized] = (time.monotonic() + 86_400, results)
    return results


def weather_summary(weather: WeatherSnapshotLike) -> str:
    return (
        f"{weather.condition}，{weather.temp_min:.0f}–{weather.temp_max:.0f}°C，"
        f"降水概率 {weather.precipitation_probability}%"
    )


class WeatherSnapshotLike:
    condition: str
    temp_min: float
    temp_max: float
    precipitation_probability: int
    apparent_temp: float


def temperature_band(apparent: float) -> tuple[str, int, int]:
    """Human label, min warmth and max warmth for a given feel-like temp."""
    if apparent >= 30:
        return "炎热", 1, 2
    if apparent >= 24:
        return "温暖", 1, 3
    if apparent >= 18:
        return "舒适", 2, 3
    if apparent >= 12:
        return "微凉", 2, 4
    if apparent >= 5:
        return "寒冷", 3, 5
    return "严寒", 4, 5


def season_for_date(date_string: str | None) -> str:
    if not date_string:
        return "autumn"
    try:
        month = int(date_string.split("-")[1])
    except (IndexError, ValueError):
        return "autumn"
    if month in {3, 4, 5}:
        return "spring"
    if month in {6, 7, 8}:
        return "summer"
    if month in {9, 10, 11}:
        return "autumn"
    return "winter"
