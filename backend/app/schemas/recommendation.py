"""Recommendation, outfit and weather contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

OccasionType = Literal[
    "everyday",
    "work",
    "interview",
    "date",
    "dinner",
    "party",
    "formal",
    "travel",
    "outdoor",
    "sport",
    "study",
    "lounge",
]


class WeatherSnapshot(BaseModel):
    city: str | None = None
    date: str | None = None
    temp_min: float = Field(ge=-60, le=60)
    temp_max: float = Field(ge=-60, le=70)
    apparent_temp: float = Field(ge=-70, le=80)
    precipitation_probability: int = Field(default=0, ge=0, le=100)
    wind_speed: float = Field(default=0, ge=0, le=300)
    condition: str = Field(default="Clear", max_length=60)
    icon: str = Field(default="☀️", max_length=16)
    source: str | None = Field(default="manual", max_length=40)

    @model_validator(mode="after")
    def validate_range(self) -> WeatherSnapshot:
        if self.temp_max < self.temp_min:
            raise ValueError("The maximum temperature cannot be lower than the minimum")
        return self


class CreateRecommendationRequest(BaseModel):
    occasion: str = Field(min_length=2, max_length=200)
    occasion_type: OccasionType = "everyday"
    weather: WeatherSnapshot
    forced_item_ids: list[str] = Field(default_factory=list, max_length=20)
    outfit_count: int = Field(default=3, ge=1, le=4)

    @field_validator("occasion")
    @classmethod
    def clean_occasion(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Please describe tomorrow's occasion in a little more detail")
        return value


class OutfitItemSnapshot(BaseModel):
    id: str
    name: str
    category: str
    category_label: str | None = None
    subcategory: str | None = None
    color_name: str
    color_hex: str | None = None
    image_url: str = ""
    available: bool = True
    force_include: bool = False
    warmth: int = 3
    formality: int = 3
    role: str | None = None


class OutfitWarning(BaseModel):
    code: str
    message: str
    severity: Literal["info", "warning", "critical"] = "info"


class ShoppingSuggestion(BaseModel):
    category: str
    title: str
    reason: str
    priority: Literal["high", "medium", "low"] = "medium"
    search_query: str


class OutfitRead(BaseModel):
    id: str
    title: str
    rationale: str
    styling_note: str | None = None
    score: int
    sort_order: int
    items: list[OutfitItemSnapshot]
    missing_categories: list[str] = Field(default_factory=list)
    warnings: list[OutfitWarning] = Field(default_factory=list)
    image_url: str | None = None
    image_status: str
    image_kind: str | None = None
    image_error: str | None = None


class RecommendationRead(BaseModel):
    id: str
    occasion: str
    occasion_type: str
    weather: WeatherSnapshot
    forced_item_ids: list[str] = Field(default_factory=list)
    status: str
    ai_source: str
    scenario_note: str | None = None
    warnings: list[OutfitWarning] = Field(default_factory=list)
    shopping_suggestions: list[ShoppingSuggestion] = Field(default_factory=list)
    outfits: list[OutfitRead] = Field(default_factory=list)
    created_at: datetime
    is_complete: bool = False


class RecommendationSummary(BaseModel):
    id: str
    occasion: str
    occasion_type: str
    status: str
    weather: WeatherSnapshot
    cover_image_url: str | None = None
    look_count: int
    created_at: datetime


class WeatherResponse(BaseModel):
    city: str | None = None
    date: str
    temp_min: float
    temp_max: float
    apparent_temp: float
    precipitation_probability: int
    wind_speed: float
    condition: str
    icon: str
    source: str = "open-meteo"


class GeocodeResult(BaseModel):
    name: str
    admin1: str | None = None
    country: str | None = None
    latitude: float
    longitude: float
    timezone: str | None = None
