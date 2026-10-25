"""Response serializers that sign private media paths per request."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import Outfit, Recommendation, User, WardrobeItem
from app.schemas.auth import UserRead
from app.schemas.recommendation import (
    OutfitItemSnapshot,
    OutfitRead,
    OutfitWarning,
    RecommendationRead,
    RecommendationSummary,
    ShoppingSuggestion,
    WeatherSnapshot,
)
from app.schemas.wardrobe import CATEGORY_LABELS, WardrobeItemRead
from app.services.storage import media_url


def _version(value: datetime | None) -> int | None:
    return int(value.timestamp()) if value else None


def serialize_user(user: User, token: str) -> UserRead:
    return UserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        onboarding_completed=user.onboarding_completed,
        created_at=user.created_at,
        base_photo_url=media_url(
            user.base_photo_path, token, version=_version(user.updated_at)
        ),
        base_photo_thumb_url=media_url(
            user.base_photo_thumb_path, token, version=_version(user.updated_at)
        ),
        height_cm=user.height_cm,
        weight_kg=user.weight_kg,
        chest_cm=user.chest_cm,
        waist_cm=user.waist_cm,
        hip_cm=user.hip_cm,
        inseam_cm=user.inseam_cm,
        shoe_size=user.shoe_size,
        body_shape=user.body_shape,
        skin_tone=user.skin_tone,
        fit_preference=user.fit_preference,
        style_preferences=user.style_preferences or [],
        avoid_colors=user.avoid_colors or [],
        city=user.city,
        latitude=user.latitude,
        longitude=user.longitude,
    )


def serialize_item(item: WardrobeItem, token: str) -> WardrobeItemRead:
    version = _version(item.updated_at)
    return WardrobeItemRead(
        id=item.id,
        name=item.name,
        category=item.category,
        category_label=CATEGORY_LABELS.get(item.category, item.category),
        subcategory=item.subcategory,
        color_name=item.color_name,
        color_hex=item.color_hex,
        pattern=item.pattern,
        material=item.material,
        brand=item.brand,
        formality=item.formality,
        warmth=item.warmth,
        seasons=item.seasons or [],
        style_tags=item.style_tags or [],
        available=item.available,
        force_include=item.force_include,
        favorite=item.favorite,
        notes=item.notes,
        last_worn_at=item.last_worn_at,
        created_at=item.created_at,
        image_url=media_url(
            item.thumbnail_path or item.image_path, token, version=version
        )
        or "",
        full_image_url=media_url(item.image_path, token, version=version) or "",
    )


def _serialize_outfit_item(
    snapshot: dict[str, Any],
    db: Session,
    token: str,
) -> OutfitItemSnapshot:
    item = db.get(WardrobeItem, snapshot.get("id", ""))
    path = (
        (item.thumbnail_path or item.image_path)
        if item is not None
        else (snapshot.get("thumbnail_path") or snapshot.get("image_path"))
    )
    version = _version(item.updated_at) if item is not None else None
    payload = {
        **snapshot,
        "image_url": media_url(path, token, version=version) or "",
        "available": item.available if item is not None else snapshot.get("available", True),
        "force_include": item.force_include
        if item is not None
        else snapshot.get("force_include", False),
        "category_label": snapshot.get("category_label")
        or CATEGORY_LABELS.get(snapshot.get("category", ""), "单品"),
    }
    return OutfitItemSnapshot.model_validate(payload)


def serialize_outfit(outfit: Outfit, db: Session, token: str) -> OutfitRead:
    version = _version(outfit.updated_at)
    return OutfitRead(
        id=outfit.id,
        title=outfit.title,
        rationale=outfit.rationale,
        styling_note=outfit.styling_note,
        score=outfit.score,
        sort_order=outfit.sort_order,
        items=[
            _serialize_outfit_item(snapshot, db, token)
            for snapshot in (outfit.items_snapshot or [])
        ],
        missing_categories=outfit.missing_categories or [],
        warnings=[OutfitWarning.model_validate(warning) for warning in (outfit.warnings or [])],
        image_url=media_url(outfit.image_path, token, version=version),
        image_status=outfit.image_status,
        image_kind=outfit.image_kind,
        image_error=outfit.image_error,
        background_mode=outfit.background_mode,
        background_prompt=outfit.background_prompt,
    )


def serialize_recommendation(
    recommendation: Recommendation, db: Session, token: str
) -> RecommendationRead:
    outfits = sorted(recommendation.outfits, key=lambda outfit: outfit.sort_order)
    serialized_outfits = [serialize_outfit(outfit, db, token) for outfit in outfits]
    pending = recommendation.status in {"planning", "failed"} or any(
        outfit.image_status in {"pending", "generating"} for outfit in outfits
    )
    return RecommendationRead(
        id=recommendation.id,
        occasion=recommendation.occasion,
        occasion_type=recommendation.occasion_type,
        weather=WeatherSnapshot.model_validate(recommendation.weather or {}),
        background_mode=recommendation.background_mode,
        background_prompt=recommendation.background_prompt,
        forced_item_ids=recommendation.forced_item_ids or [],
        status=recommendation.status,
        ai_source=recommendation.ai_source,
        scenario_note=recommendation.scenario_note,
        warnings=[
            OutfitWarning.model_validate(warning)
            for warning in (recommendation.warnings or [])
        ],
        shopping_suggestions=[
            ShoppingSuggestion.model_validate(suggestion)
            for suggestion in (recommendation.shopping_suggestions or [])
        ],
        outfits=serialized_outfits,
        created_at=recommendation.created_at,
        is_complete=not pending,
    )


def serialize_summary(
    recommendation: Recommendation, db: Session, token: str
) -> RecommendationSummary:
    outfits = sorted(recommendation.outfits, key=lambda outfit: outfit.sort_order)
    cover = next(
        (outfit for outfit in outfits if outfit.image_status == "ready" and outfit.image_path),
        outfits[0] if outfits else None,
    )
    return RecommendationSummary(
        id=recommendation.id,
        occasion=recommendation.occasion,
        occasion_type=recommendation.occasion_type,
        status=recommendation.status,
        weather=WeatherSnapshot.model_validate(recommendation.weather or {}),
        cover_image_url=media_url(
            cover.image_path if cover else None,
            token,
            version=_version(cover.updated_at) if cover else None,
        ),
        look_count=len(outfits),
        created_at=recommendation.created_at,
    )
