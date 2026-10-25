"""Wardrobe CRUD, availability, forced pieces and AI garment tagging."""

from __future__ import annotations

from typing import Annotated

from fastapi import (
    APIRouter,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import func, select
from starlette.concurrency import run_in_threadpool

from app.api.serializers import serialize_item
from app.core.security import CurrentUser, DbSession, get_token_from_request
from app.db.models import WardrobeItem
from app.schemas.wardrobe import (
    AvailabilityUpdate,
    FavoriteUpdate,
    ForceIncludeUpdate,
    GarmentAnalysis,
    WardrobeItemRead,
    WardrobeItemUpdate,
    WardrobeSummary,
    CATEGORY_LABELS,
)
from app.services.gemini import GeminiError, gemini_service
from app.services.storage import (
    delete_stored_image,
    dominant_color,
    read_upload,
    store_user_image,
)

router = APIRouter(prefix="/wardrobe", tags=["wardrobe"])

VALID_CATEGORIES = set(CATEGORY_LABELS)
SEASON_ALIASES = {
    "春": "spring",
    "春夏": "spring",
    "夏": "summer",
    "秋": "autumn",
    "秋冬": "autumn",
    "冬": "winter",
    "spring": "spring",
    "summer": "summer",
    "autumn": "autumn",
    "fall": "autumn",
    "winter": "winter",
}


def _owned_item(db: DbSession, user_id: str, item_id: str) -> WardrobeItem:
    item = db.get(WardrobeItem, item_id)
    if item is None or item.user_id != user_id:
        raise HTTPException(status_code=404, detail="Wardrobe item not found")
    return item


def _parse_seasons(raw: str | None) -> list[str]:
    if not raw:
        return []
    values = []
    for token in raw.replace("，", ",").split(","):
        canonical = SEASON_ALIASES.get(token.strip().lower()) or SEASON_ALIASES.get(
            token.strip()
        )
        if canonical and canonical not in values:
            values.append(canonical)
    return values


def _parse_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    values = []
    for token in raw.replace("，", ",").split(","):
        clean = token.strip()[:20]
        if clean and clean not in values:
            values.append(clean)
    return values[:10]


def _validate_category(category: str) -> str:
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail="Please choose a valid category")
    return category


def _validate_int(value: int, field: str, low: int = 1, high: int = 5) -> int:
    if not low <= value <= high:
        raise HTTPException(status_code=422, detail=f"{field} must be between {low} and {high}")
    return value


@router.get("", response_model=list[WardrobeItemRead])
def list_items(
    user: CurrentUser,
    request: Request,
    db: DbSession,
    category: str | None = Query(default=None),
    available: bool | None = Query(default=None),
) -> list[WardrobeItemRead]:
    token = get_token_from_request(request) or ""
    statement = select(WardrobeItem).where(WardrobeItem.user_id == user.id)
    if category:
        statement = statement.where(WardrobeItem.category == category)
    if available is not None:
        statement = statement.where(WardrobeItem.available == available)
    statement = statement.order_by(
        WardrobeItem.force_include.desc(),
        WardrobeItem.created_at.desc(),
    )
    return [serialize_item(item, token) for item in db.scalars(statement).all()]


@router.get("/summary", response_model=WardrobeSummary)
def summary(user: CurrentUser, db: DbSession) -> WardrobeSummary:
    items = db.scalars(
        select(WardrobeItem).where(WardrobeItem.user_id == user.id)
    ).all()
    by_category: dict[str, int] = {}
    for item in items:
        by_category[item.category] = by_category.get(item.category, 0) + 1
    updated = max((item.updated_at for item in items), default=None)
    return WardrobeSummary(
        total=len(items),
        available=sum(1 for item in items if item.available),
        forced=sum(1 for item in items if item.force_include),
        by_category=by_category,
        last_updated=updated,
    )


@router.post("", response_model=WardrobeItemRead, status_code=status.HTTP_201_CREATED)
async def create_item(
    user: CurrentUser,
    request: Request,
    db: DbSession,
    image: Annotated[UploadFile, File(...)],
    category: Annotated[str, Form(...)],
    name: Annotated[str | None, Form()] = None,
    subcategory: Annotated[str | None, Form()] = None,
    color_name: Annotated[str | None, Form()] = None,
    color_hex: Annotated[str | None, Form()] = None,
    pattern: Annotated[str | None, Form()] = None,
    material: Annotated[str | None, Form()] = None,
    brand: Annotated[str | None, Form()] = None,
    formality: Annotated[int, Form()] = 3,
    warmth: Annotated[int, Form()] = 3,
    seasons: Annotated[str | None, Form()] = None,
    style_tags: Annotated[str | None, Form()] = None,
    notes: Annotated[str | None, Form()] = None,
    available: Annotated[bool, Form()] = True,
    force_include: Annotated[bool, Form()] = False,
    favorite: Annotated[bool, Form()] = False,
) -> WardrobeItemRead:
    _validate_category(category)
    _validate_int(formality, "Formality")
    _validate_int(warmth, "Warmth")
    data = await read_upload(image)
    computed_color_name, computed_color_hex = dominant_color(data)
    if not color_name or color_name.strip() in {"", "Neutral", "中性色"}:
        color_name = computed_color_name
    if not color_hex:
        color_hex = computed_color_hex
    if not color_hex.startswith("#") or len(color_hex) != 7:
        color_hex = computed_color_hex
    color_hex = color_hex.upper()

    stored = store_user_image(
        user.id,
        data,
        kind="items",
        max_edge=1600,
        thumb_edge=560,
        quality=90,
    )
    clean_name = " ".join((name or "").split())[:120]
    if not clean_name:
        clean_name = f"{color_name} {subcategory or CATEGORY_LABELS[category]}"

    parsed_seasons = _parse_seasons(seasons)
    item = WardrobeItem(
        user_id=user.id,
        name=clean_name,
        category=category,
        subcategory=(subcategory or "").strip()[:80] or None,
        color_name=color_name.strip()[:60],
        color_hex=color_hex,
        pattern=(pattern or "").strip()[:50] or None,
        material=(material or "").strip()[:80] or None,
        brand=(brand or "").strip()[:80] or None,
        formality=formality,
        warmth=warmth,
        seasons=parsed_seasons,
        style_tags=_parse_tags(style_tags),
        image_path=stored.path,
        thumbnail_path=stored.thumbnail_path,
        available=available,
        force_include=force_include,
        favorite=favorite,
        notes=(notes or "").strip()[:1000] or None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_item(item, get_token_from_request(request) or "")


@router.post("/analyze", response_model=GarmentAnalysis)
async def analyze_garment(
    user: CurrentUser,
    image: Annotated[UploadFile, File(...)],
) -> GarmentAnalysis:
    data = await read_upload(image)
    computed_name, computed_hex = dominant_color(data)
    if not gemini_service.enabled:
        return GarmentAnalysis(
            available=False,
            reason="Dominant colour extracted. AI category recognition is currently disabled; please choose a category manually.",
            color_name=computed_name,
            color_hex=computed_hex,
        )
    try:
        analysis = await run_in_threadpool(
            gemini_service.analyze_garment,
            data,
            image.content_type or "image/jpeg",
        )
    except GeminiError as exc:
        return GarmentAnalysis(
            available=False,
            reason=str(exc),
            color_name=computed_name,
            color_hex=computed_hex,
        )
    category = str(analysis.get("category") or "")
    if category not in VALID_CATEGORIES:
        category = None
    formality = analysis.get("formality")
    warmth = analysis.get("warmth")
    try:
        formality = max(1, min(5, int(formality))) if formality is not None else None
        warmth = max(1, min(5, int(warmth))) if warmth is not None else None
    except (TypeError, ValueError):
        formality, warmth = None, None
    season_values = []
    for season in analysis.get("seasons") or []:
        canonical = SEASON_ALIASES.get(str(season).lower()) or SEASON_ALIASES.get(str(season))
        if canonical and canonical not in season_values:
            season_values.append(canonical)
    tags = [
        str(tag).strip()[:20]
        for tag in (analysis.get("style_tags") or [])
        if str(tag).strip()
    ][:5]
    color_hex = str(analysis.get("color_hex") or computed_hex)
    if not color_hex.startswith("#") or len(color_hex) != 7:
        color_hex = computed_hex
    return GarmentAnalysis(
        available=True,
        name=str(analysis.get("name") or "").strip()[:120] or None,
        category=category,
        subcategory=str(analysis.get("subcategory") or "").strip()[:80] or None,
        color_name=str(analysis.get("color_name") or computed_name).strip()[:60],
        color_hex=color_hex.upper(),
        pattern=str(analysis.get("pattern") or "").strip()[:50] or None,
        material=str(analysis.get("material") or "").strip()[:80] or None,
        formality=formality,
        warmth=warmth,
        seasons=season_values,
        style_tags=tags,
    )


@router.get("/{item_id}", response_model=WardrobeItemRead)
def get_item(
    item_id: str,
    user: CurrentUser,
    request: Request,
    db: DbSession,
) -> WardrobeItemRead:
    item = _owned_item(db, user.id, item_id)
    return serialize_item(item, get_token_from_request(request) or "")


@router.patch("/{item_id}", response_model=WardrobeItemRead)
def update_item(
    item_id: str,
    payload: WardrobeItemUpdate,
    user: CurrentUser,
    request: Request,
    db: DbSession,
) -> WardrobeItemRead:
    item = _owned_item(db, user.id, item_id)
    updates = payload.model_dump(exclude_unset=True)
    if "category" in updates:
        _validate_category(updates["category"])
    if "color_hex" in updates and updates["color_hex"]:
        updates["color_hex"] = updates["color_hex"].upper()
    for field_name, value in updates.items():
        setattr(item, field_name, value)
    db.commit()
    db.refresh(item)
    return serialize_item(item, get_token_from_request(request) or "")


@router.post("/{item_id}/image", response_model=WardrobeItemRead)
async def replace_image(
    item_id: str,
    user: CurrentUser,
    request: Request,
    db: DbSession,
    image: Annotated[UploadFile, File(...)],
) -> WardrobeItemRead:
    item = _owned_item(db, user.id, item_id)
    data = await read_upload(image)
    old_paths = (item.image_path, item.thumbnail_path)
    stored = store_user_image(
        user.id,
        data,
        kind="items",
        max_edge=1600,
        thumb_edge=560,
        quality=90,
    )
    item.image_path = stored.path
    item.thumbnail_path = stored.thumbnail_path
    db.commit()
    db.refresh(item)
    delete_stored_image(*old_paths)
    return serialize_item(item, get_token_from_request(request) or "")


@router.patch("/{item_id}/availability", response_model=WardrobeItemRead)
def set_availability(
    item_id: str,
    payload: AvailabilityUpdate,
    user: CurrentUser,
    request: Request,
    db: DbSession,
) -> WardrobeItemRead:
    item = _owned_item(db, user.id, item_id)
    item.available = payload.available
    if not payload.available:
        item.force_include = False
    db.commit()
    db.refresh(item)
    return serialize_item(item, get_token_from_request(request) or "")


@router.patch("/{item_id}/force", response_model=WardrobeItemRead)
def set_force_include(
    item_id: str,
    payload: ForceIncludeUpdate,
    user: CurrentUser,
    request: Request,
    db: DbSession,
) -> WardrobeItemRead:
    item = _owned_item(db, user.id, item_id)
    if payload.force_include and not item.available:
        raise HTTPException(
            status_code=422,
            detail="An unavailable item cannot be marked as always-wear. Make it available first.",
        )
    item.force_include = payload.force_include
    db.commit()
    db.refresh(item)
    return serialize_item(item, get_token_from_request(request) or "")


@router.patch("/{item_id}/favorite", response_model=WardrobeItemRead)
def set_favorite(
    item_id: str,
    payload: FavoriteUpdate,
    user: CurrentUser,
    request: Request,
    db: DbSession,
) -> WardrobeItemRead:
    item = _owned_item(db, user.id, item_id)
    item.favorite = payload.favorite
    db.commit()
    db.refresh(item)
    return serialize_item(item, get_token_from_request(request) or "")


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: str, user: CurrentUser, db: DbSession
) -> None:
    item = _owned_item(db, user.id, item_id)
    paths = (item.image_path, item.thumbnail_path)
    db.delete(item)
    db.commit()
    delete_stored_image(*paths)
