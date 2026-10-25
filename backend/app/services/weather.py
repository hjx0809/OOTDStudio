"""Tomorrow's forecast via Open-Meteo, with a short in-process cache."""

from __future__ import annotations

import ipaddress
import time
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import get_settings
from app.schemas.recommendation import GeocodeResult, WeatherResponse

WMO: dict[int, tuple[str, str]] = {
    0: ("Clear", "☀️"),
    1: ("Mainly clear", "🌤️"),
    2: ("Partly cloudy", "⛅"),
    3: ("Overcast", "☁️"),
    45: ("Fog", "🌫️"),
    48: ("Depositing rime fog", "🌫️"),
    51: ("Light drizzle", "🌦️"),
    53: ("Drizzle", "🌦️"),
    55: ("Dense drizzle", "🌧️"),
    56: ("Light freezing drizzle", "🌧️"),
    57: ("Dense freezing drizzle", "🌧️"),
    61: ("Light rain", "🌦️"),
    63: ("Moderate rain", "🌧️"),
    65: ("Heavy rain", "🌧️"),
    66: ("Light freezing rain", "🌧️"),
    67: ("Heavy freezing rain", "🌧️"),
    71: ("Light snow", "🌨️"),
    73: ("Moderate snow", "🌨️"),
    75: ("Heavy snow", "❄️"),
    77: ("Snow grains", "🌨️"),
    80: ("Light rain showers", "🌦️"),
    81: ("Moderate rain showers", "🌧️"),
    82: ("Violent rain showers", "⛈️"),
    85: ("Light snow showers", "🌨️"),
    86: ("Heavy snow showers", "❄️"),
    95: ("Thunderstorm", "⛈️"),
    96: ("Thunderstorm with slight hail", "⛈️"),
    99: ("Thunderstorm with heavy hail", "⛈️"),
}


@dataclass
class _CacheEntry:
    expires_at: float
    value: WeatherResponse


_weather_cache: dict[tuple[float, float], _CacheEntry] = {}
_geocode_cache: dict[str, tuple[float, list[GeocodeResult]]] = {}
_ip_cache: dict[str, tuple[float, GeocodeResult]] = {}
_IP_CACHE_SECONDS = 6 * 3600


def _condition(code: int | None) -> tuple[str, str]:
    return WMO.get(int(code or 0), ("Changeable", "🌤️"))


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
            detail="Weather is temporarily unavailable. Please enter the feels-like temperature manually.",
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
        raise HTTPException(
            status_code=502, detail="Weather data is temporarily unavailable. Please try again shortly."
        ) from exc

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
    # Open-Meteo only matches names in the requested language, so a city saved
    # as "旧金山" finds nothing in English. Retry non-ASCII queries in Chinese.
    languages = ["en"] if query.isascii() else ["en", "zh"]
    rows: list[dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=get_settings().weather_timeout_seconds) as client:
            for language in languages:
                response = await client.get(
                    "https://geocoding-api.open-meteo.com/v1/search",
                    params={
                        "name": query.strip(),
                        "count": 6,
                        "language": language,
                        "format": "json",
                    },
                )
                response.raise_for_status()
                rows = response.json().get("results") or []
                if rows:
                    break
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="City search is temporarily unavailable") from exc

    results: list[GeocodeResult] = []
    for row in rows:
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


def public_ip(candidates: list[str | None]) -> str | None:
    """First globally routable address, skipping loopback/private hops."""
    for candidate in candidates:
        try:
            address = ipaddress.ip_address((candidate or "").strip())
        except ValueError:
            continue
        if address.is_global:
            return str(address)
    return None


def _from_ipwhois(payload: dict[str, Any]) -> GeocodeResult | None:
    if not payload.get("success"):
        return None
    timezone = payload.get("timezone")
    return GeocodeResult(
        name=payload.get("city") or payload.get("region") or payload.get("country") or "",
        admin1=payload.get("region"),
        country=payload.get("country"),
        latitude=float(payload["latitude"]),
        longitude=float(payload["longitude"]),
        timezone=timezone.get("id") if isinstance(timezone, dict) else None,
    )


def _from_geojs(payload: dict[str, Any]) -> GeocodeResult | None:
    if payload.get("latitude") in (None, "") or payload.get("longitude") in (None, ""):
        return None
    return GeocodeResult(
        name=payload.get("city") or payload.get("region") or payload.get("country") or "",
        admin1=payload.get("region"),
        country=payload.get("country"),
        latitude=float(payload["latitude"]),
        longitude=float(payload["longitude"]),
        timezone=payload.get("timezone"),
    )


async def locate_ip(ip: str | None) -> GeocodeResult:
    """Approximate city for an IP. ``None`` locates the server's own public IP,
    which is the right answer when the app runs on the user's machine."""
    cache_key = ip or ""
    cached = _ip_cache.get(cache_key)
    if cached and cached[0] > time.monotonic():
        return cached[1]

    providers = [
        (f"https://ipwho.is/{ip or ''}", _from_ipwhois),
        (f"https://get.geojs.io/v1/ip/geo{'/' + ip if ip else ''}.json", _from_geojs),
    ]
    async with httpx.AsyncClient(timeout=get_settings().weather_timeout_seconds) as client:
        for url, parse in providers:
            try:
                response = await client.get(url)
                response.raise_for_status()
                result = parse(response.json())
            except (httpx.HTTPError, ValueError, KeyError, TypeError):
                continue
            if result is not None:
                _ip_cache[cache_key] = (time.monotonic() + _IP_CACHE_SECONDS, result)
                return result
    raise HTTPException(
        status_code=502,
        detail="Couldn’t detect your location. Set a city in your profile or enter the weather manually.",
    )


def weather_summary(weather: WeatherSnapshotLike) -> str:
    return (
        f"{weather.condition}, {weather.temp_min:.0f}–{weather.temp_max:.0f}°C, "
        f"{weather.precipitation_probability}% chance of precipitation"
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
        return "Hot", 1, 2
    if apparent >= 24:
        return "Warm", 1, 3
    if apparent >= 18:
        return "Comfortable", 2, 3
    if apparent >= 12:
        return "Cool", 2, 4
    if apparent >= 5:
        return "Cold", 3, 5
    return "Freezing", 4, 5


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
