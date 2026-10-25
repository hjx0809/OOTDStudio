"""Weather and city lookup endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas.recommendation import GeocodeResult, WeatherResponse
from app.services.weather import fetch_tomorrow_weather, geocode_city

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("/tomorrow", response_model=WeatherResponse)
async def tomorrow(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    city: str | None = Query(default=None, max_length=120),
) -> WeatherResponse:
    return await fetch_tomorrow_weather(latitude, longitude, city)


@router.get("/geocode", response_model=list[GeocodeResult])
async def geocode(q: str = Query(min_length=1, max_length=120)) -> list[GeocodeResult]:
    return await geocode_city(q)
