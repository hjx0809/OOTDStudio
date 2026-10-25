"""Wardrobe request and response contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ItemCategory = Literal[
    "top", "bottom", "dress", "outerwear", "shoes", "bag", "accessory"
]
Season = Literal["spring", "summer", "autumn", "winter"]

CATEGORY_LABELS: dict[str, str] = {
    "top": "Top",
    "bottom": "Bottom",
    "dress": "Dress / Jumpsuit",
    "outerwear": "Outerwear",
    "shoes": "Shoes",
    "bag": "Bag",
    "accessory": "Accessory",
}


class WardrobeItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    category: str
    category_label: str = ""
    subcategory: str | None = None
    color_name: str
    color_hex: str | None = None
    pattern: str | None = None
    material: str | None = None
    brand: str | None = None
    formality: int
    warmth: int
    seasons: list[str] = Field(default_factory=list)
    style_tags: list[str] = Field(default_factory=list)
    available: bool
    force_include: bool
    favorite: bool
    notes: str | None = None
    last_worn_at: datetime | None = None
    created_at: datetime
    image_url: str = ""
    full_image_url: str = ""


class WardrobeItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: ItemCategory | None = None
    subcategory: str | None = Field(default=None, max_length=80)
    color_name: str | None = Field(default=None, min_length=1, max_length=60)
    color_hex: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    pattern: str | None = Field(default=None, max_length=50)
    material: str | None = Field(default=None, max_length=80)
    brand: str | None = Field(default=None, max_length=80)
    formality: int | None = Field(default=None, ge=1, le=5)
    warmth: int | None = Field(default=None, ge=1, le=5)
    seasons: list[Season] | None = Field(default=None, max_length=4)
    style_tags: list[str] | None = Field(default=None, max_length=10)
    available: bool | None = None
    force_include: bool | None = None
    favorite: bool | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("name", "color_name")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class AvailabilityUpdate(BaseModel):
    available: bool


class ForceIncludeUpdate(BaseModel):
    force_include: bool


class FavoriteUpdate(BaseModel):
    favorite: bool


class WardrobeSummary(BaseModel):
    total: int
    available: int
    forced: int
    by_category: dict[str, int]
    last_updated: datetime | None = None


class GarmentAnalysis(BaseModel):
    available: bool
    reason: str | None = None
    name: str | None = None
    category: str | None = None
    subcategory: str | None = None
    color_name: str | None = None
    color_hex: str | None = None
    pattern: str | None = None
    material: str | None = None
    formality: int | None = None
    warmth: int | None = None
    seasons: list[str] = Field(default_factory=list)
    style_tags: list[str] = Field(default_factory=list)
