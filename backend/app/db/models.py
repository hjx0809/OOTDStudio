"""Persistent domain models for OUL Studio."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    base_photo_path: Mapped[str | None] = mapped_column(String(500))
    base_photo_thumb_path: Mapped[str | None] = mapped_column(String(500))

    height_cm: Mapped[int | None] = mapped_column(Integer)
    weight_kg: Mapped[float | None] = mapped_column(Float)
    chest_cm: Mapped[float | None] = mapped_column(Float)
    waist_cm: Mapped[float | None] = mapped_column(Float)
    hip_cm: Mapped[float | None] = mapped_column(Float)
    inseam_cm: Mapped[float | None] = mapped_column(Float)
    shoe_size: Mapped[float | None] = mapped_column(Float)
    body_shape: Mapped[str | None] = mapped_column(String(40))
    skin_tone: Mapped[str | None] = mapped_column(String(40))
    fit_preference: Mapped[str] = mapped_column(String(30), default="regular")
    style_preferences: Mapped[list[str]] = mapped_column(JSON, default=list)
    avoid_colors: Mapped[list[str]] = mapped_column(JSON, default=list)
    city: Mapped[str | None] = mapped_column(String(120))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)

    items: Mapped[list[WardrobeItem]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    recommendations: Mapped[list[Recommendation]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class WardrobeItem(Base):
    __tablename__ = "wardrobe_items"
    __table_args__ = (
        Index("ix_wardrobe_items_user_category", "user_id", "category"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(30), index=True)
    subcategory: Mapped[str | None] = mapped_column(String(80))
    color_name: Mapped[str] = mapped_column(String(60), default="Neutral")
    color_hex: Mapped[str | None] = mapped_column(String(9))
    pattern: Mapped[str | None] = mapped_column(String(50))
    material: Mapped[str | None] = mapped_column(String(80))
    brand: Mapped[str | None] = mapped_column(String(80))
    formality: Mapped[int] = mapped_column(Integer, default=3)
    warmth: Mapped[int] = mapped_column(Integer, default=3)
    seasons: Mapped[list[str]] = mapped_column(JSON, default=list)
    style_tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    image_path: Mapped[str] = mapped_column(String(500))
    thumbnail_path: Mapped[str | None] = mapped_column(String(500))
    available: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    force_include: Mapped[bool] = mapped_column(Boolean, default=False)
    favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)
    last_worn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    user: Mapped[User] = relationship(back_populates="items")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    occasion: Mapped[str] = mapped_column(String(200))
    occasion_type: Mapped[str] = mapped_column(String(40), default="everyday")
    weather: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    forced_item_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(30), default="ready")
    ai_source: Mapped[str] = mapped_column(String(30), default="atelier")
    scenario_note: Mapped[str | None] = mapped_column(Text)
    warnings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    shopping_suggestions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    user: Mapped[User] = relationship(back_populates="recommendations")
    outfits: Mapped[list[Outfit]] = relationship(
        back_populates="recommendation",
        cascade="all, delete-orphan",
        order_by="Outfit.sort_order",
    )


class Outfit(Base):
    __tablename__ = "outfits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    recommendation_id: Mapped[str] = mapped_column(
        ForeignKey("recommendations.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(120))
    rationale: Mapped[str] = mapped_column(Text)
    styling_note: Mapped[str | None] = mapped_column(Text)
    score: Mapped[int] = mapped_column(Integer, default=80)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    item_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    items_snapshot: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    missing_categories: Mapped[list[str]] = mapped_column(JSON, default=list)
    warnings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    image_path: Mapped[str | None] = mapped_column(String(500))
    image_status: Mapped[str] = mapped_column(String(30), default="pending")
    image_kind: Mapped[str | None] = mapped_column(String(30))
    image_error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    recommendation: Mapped[Recommendation] = relationship(back_populates="outfits")
