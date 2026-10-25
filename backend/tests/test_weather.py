"""Weather location fallbacks: IP lookup and non-English city names."""

from __future__ import annotations

from collections.abc import Callable

import httpx
import pytest

from app.services import weather

FORECAST = {
    "daily": {
        "time": ["2026-10-25", "2026-10-26"],
        "temperature_2m_min": [12, 13],
        "temperature_2m_max": [19, 20],
        "apparent_temperature_min": [11, 12],
        "apparent_temperature_max": [18, 19],
        "precipitation_probability_max": [10, 20],
        "wind_speed_10m_max": [9, 14],
        "weather_code": [1, 2],
    }
}


@pytest.fixture
def fake_http(monkeypatch):
    """Route the service's httpx calls through a handler; records each request."""
    requests: list[httpx.Request] = []
    routes: dict[str, httpx.Response | Callable[[httpx.Request], httpx.Response]] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        for prefix, response in routes.items():
            if str(request.url).startswith(prefix):
                return response(request) if callable(response) else response
        return httpx.Response(404)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        weather.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    weather._ip_cache.clear()
    weather._weather_cache.clear()
    weather._geocode_cache.clear()
    return routes, requests


def test_public_ip_skips_private_and_garbage():
    assert weather.public_ip(["10.0.0.4", " 8.8.8.8", "127.0.0.1"]) == "8.8.8.8"
    assert weather.public_ip(["", None, "not-an-ip", "192.168.1.2", "::1"]) is None


@pytest.mark.asyncio
async def test_locate_ip_falls_back_to_second_provider(fake_http):
    routes, requests = fake_http
    routes["https://ipwho.is/"] = httpx.Response(200, json={"success": False})
    routes["https://get.geojs.io/"] = httpx.Response(
        200,
        json={
            "city": "San Francisco",
            "region": "California",
            "country": "United States",
            "latitude": "37.77",
            "longitude": "-122.44",
            "timezone": "America/Los_Angeles",
        },
    )

    place = await weather.locate_ip("8.8.8.8")

    assert place.name == "San Francisco"
    assert (place.latitude, place.longitude) == (37.77, -122.44)
    assert [str(r.url) for r in requests] == [
        "https://ipwho.is/8.8.8.8",
        "https://get.geojs.io/v1/ip/geo/8.8.8.8.json",
    ]


def test_auto_endpoint_returns_forecast_for_ip_city(client, fake_http):
    routes, requests = fake_http
    routes["https://ipwho.is/"] = httpx.Response(
        200,
        json={
            "success": True,
            "city": "Shanghai",
            "region": "Shanghai",
            "country": "China",
            "latitude": 31.23,
            "longitude": 121.47,
            "timezone": {"id": "Asia/Shanghai"},
        },
    )
    routes["https://api.open-meteo.com/"] = httpx.Response(200, json=FORECAST)

    response = client.get("/api/weather/auto", headers={"X-Forwarded-For": "1.2.3.4, 10.0.0.1"})

    assert response.status_code == 200
    body = response.json()
    assert body["city"] == "Shanghai"
    assert body["date"] == "2026-10-26"
    assert str(requests[0].url) == "https://ipwho.is/1.2.3.4"


def test_auto_endpoint_reports_when_location_unknown(client, fake_http):
    response = client.get("/api/weather/auto")
    assert response.status_code == 502


@pytest.mark.asyncio
async def test_geocode_retries_chinese_city_names(fake_http):
    routes, requests = fake_http
    hit = {"results": [{"name": "旧金山", "latitude": 37.77, "longitude": -122.42}]}
    routes["https://geocoding-api.open-meteo.com/"] = lambda request: httpx.Response(
        200, json=hit if request.url.params["language"] == "zh" else {}
    )

    results = await weather.geocode_city("旧金山")

    assert [r.name for r in results] == ["旧金山"]
    assert [r.url.params["language"] for r in requests] == ["en", "zh"]
