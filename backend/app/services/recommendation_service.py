"""Orchestration for AI-assisted outfit planning and rendered look creation."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Outfit, Recommendation, User, WardrobeItem
from app.db.session import SessionLocal
from app.schemas.recommendation import CreateRecommendationRequest, WeatherSnapshot
from app.services.gemini import GeminiError, gemini_service
from app.services.stylist import (
    OCCASIONS,
    OutfitPlan,
    PlanResult,
    plan_outfits,
    outfit_item_snapshot,
)
from app.schemas.wardrobe import CATEGORY_LABELS

logger = logging.getLogger(__name__)


def _wardrobe_payload(items: list[WardrobeItem], forced_ids: set[str]) -> list[dict[str, Any]]:
    payload = []
    for item in items:
        if not item.available:
            continue
        payload.append(
            {
                "id": item.id,
                "name": item.name,
                "category": item.category,
                "subcategory": item.subcategory,
                "color": item.color_name,
                "pattern": item.pattern,
                "material": item.material,
                "formality": item.formality,
                "warmth": item.warmth,
                "seasons": item.seasons or [],
                "style_tags": item.style_tags or [],
                "available": True,
                "force_include": item.id in forced_ids or item.force_include,
            }
        )
    return payload


def _planning_prompt(
    items: list[WardrobeItem],
    user: User,
    weather: WeatherSnapshot,
    occasion: str,
    occasion_type: str,
    forced_ids: set[str],
    outfit_count: int,
) -> str:
    profile = OCCASIONS.get(occasion_type, OCCASIONS["everyday"])
    body = {
        "height_cm": user.height_cm,
        "weight_kg": user.weight_kg,
        "chest_cm": user.chest_cm,
        "waist_cm": user.waist_cm,
        "hip_cm": user.hip_cm,
        "inseam_cm": user.inseam_cm,
        "body_shape": user.body_shape,
        "fit_preference": user.fit_preference,
        "skin_tone": user.skin_tone,
        "style_preferences": user.style_preferences or [],
        "avoid_colors": user.avoid_colors or [],
    }
    return f"""TOMORROW'S BRIEF
Occasion text: {occasion}
Occasion category: {profile.label} (target formality {profile.formality}/5, priority: {profile.priority})
Weather: {weather.condition}, feels like {weather.apparent_temp:.1f}°C, low {weather.temp_min:.0f}°C / high {weather.temp_max:.0f}°C, rain {weather.precipitation_probability}%, wind {weather.wind_speed:.0f} km/h, date {weather.date or "tomorrow"}.
Body profile: {json.dumps(body, ensure_ascii=False)}
Forced/always-wear item ids: {sorted(forced_ids) or "none"}
Number of distinct outfits required: {outfit_count}

WARDROBE (only these available items may be used):
{json.dumps(_wardrobe_payload(items, forced_ids), ensure_ascii=False, indent=1)}

Return exactly the JSON object specified in the system instruction. Ensure every outfit contains one of top/dress, trousers/skirt if a top is used, and shoes. Outfits must differ visibly.
"""


def _valid_ai_outfits(
    ai_data: dict[str, Any],
    items: list[WardrobeItem],
    forced_ids: set[str],
    outfit_count: int,
) -> list[OutfitPlan]:
    available = {item.id: item for item in items if item.available}
    raw_outfits = ai_data.get("outfits")
    if not isinstance(raw_outfits, list):
        return []

    plans: list[OutfitPlan] = []
    seen_sets: set[frozenset[str]] = set()
    for entry in raw_outfits[:outfit_count + 2]:
        if not isinstance(entry, dict):
            continue
        raw_ids = entry.get("item_ids")
        if not isinstance(raw_ids, list):
            continue
        item_ids = [str(item_id) for item_id in raw_ids]
        if len(item_ids) != len(set(item_ids)):
            continue
        if any(item_id not in available for item_id in item_ids):
            continue
        if not forced_ids.issubset(set(item_ids)):
            continue
        selected = [available[item_id] for item_id in item_ids]
        categories = {item.category for item in selected}
        if not categories & {"top", "dress"}:
            continue
        if "top" in categories and "bottom" not in categories:
            continue
        if "dress" not in categories and "bottom" not in categories:
            continue
        if "shoes" not in categories:
            continue
        if len(selected) > 7:
            continue
        key = frozenset(item_ids)
        if key in seen_sets:
            continue
        seen_sets.add(key)

        title = str(entry.get("title") or "").strip()[:24] or "明日造型"
        rationale = str(entry.get("rationale") or "").strip()
        if len(rationale) < 12:
            continue
        styling_note = str(entry.get("styling_note") or "").strip() or None
        try:
            score = max(60, min(99, int(entry.get("score") or 82)))
        except (TypeError, ValueError):
            score = 82
        roles = entry.get("roles") if isinstance(entry.get("roles"), dict) else {}
        warnings = []
        for message in entry.get("warnings") or []:
            if isinstance(message, str) and message.strip():
                warnings.append(
                    {
                        "code": "ai_note",
                        "message": message.strip()[:300],
                        "severity": "info",
                    }
                )
        selected.sort(key=lambda item: {
            "outerwear": 0,
            "dress": 1,
            "top": 2,
            "bottom": 3,
            "shoes": 4,
            "bag": 5,
            "accessory": 6,
        }.get(item.category, 9))
        missing = []
        if "dress" not in categories and "bottom" not in categories:
            missing.append("bottom")
        if "shoes" not in categories:
            missing.append("shoes")
        plans.append(
            OutfitPlan(
                title=title,
                rationale=rationale[:700],
                styling_note=styling_note,
                score=score,
                items=selected,
                roles={
                    item.id: str(roles.get(item.id) or CATEGORY_LABELS.get(item.category, "单品"))[:20]
                    for item in selected
                },
                missing_categories=missing,
                warnings=warnings,
            )
        )
    return plans


def _validate_ai_suggestions(data: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str | None]:
    warnings: list[dict[str, Any]] = []
    suggestions: list[dict[str, Any]] = []
    for raw in data.get("warnings") or []:
        if not isinstance(raw, dict):
            continue
        message = str(raw.get("message") or "").strip()
        if not message:
            continue
        severity = raw.get("severity")
        if severity not in {"info", "warning", "critical"}:
            severity = "info"
        warnings.append(
            {
                "code": str(raw.get("code") or "stylist_note")[:50],
                "message": message[:400],
                "severity": severity,
            }
        )
    valid_categories = set(CATEGORY_LABELS)
    for raw in data.get("shopping_suggestions") or []:
        if not isinstance(raw, dict):
            continue
        category = str(raw.get("category") or "")
        title = str(raw.get("title") or "").strip()
        reason = str(raw.get("reason") or "").strip()
        query = str(raw.get("search_query") or "").strip()
        if category not in valid_categories or not title or not query:
            continue
        priority = raw.get("priority")
        if priority not in {"high", "medium", "low"}:
            priority = "medium"
        suggestions.append(
            {
                "category": category,
                "title": title[:120],
                "reason": reason[:300] or "补齐这件单品能让造型更完整。",
                "priority": priority,
                "search_query": query[:120],
            }
        )
    note = data.get("scenario_note")
    return warnings, suggestions[:4], str(note).strip()[:400] if note else None


def _merge_ai_plan(
    local: PlanResult,
    ai_data: dict[str, Any],
    items: list[WardrobeItem],
    forced_ids: set[str],
    outfit_count: int,
) -> tuple[PlanResult, bool]:
    ai_outfits = _valid_ai_outfits(ai_data, items, forced_ids, outfit_count)
    if not ai_outfits:
        return local, False

    # Fill any shortfall with distinct local looks.
    combined = list(ai_outfits)
    for local_outfit in local.outfits:
        if len(combined) >= outfit_count:
            break
        local_set = {item.id for item in local_outfit.items}
        if any(
            local_set == {item.id for item in existing.items} for existing in combined
        ):
            continue
        combined.append(local_outfit)

    ai_warnings, ai_suggestions, ai_note = _validate_ai_suggestions(ai_data)
    warnings_by_message: dict[str, dict[str, Any]] = {}
    for warning in [*local.warnings, *ai_warnings]:
        warnings_by_message[warning["message"]] = warning
    warnings = list(warnings_by_message.values())

    suggestions: list[dict[str, Any]] = []
    seen_titles: set[str] = set()
    for suggestion in [*local.shopping_suggestions, *ai_suggestions]:
        title_key = suggestion["title"].lower().strip()
        if title_key in seen_titles:
            continue
        seen_titles.add(title_key)
        suggestions.append(suggestion)
        if len(suggestions) >= 5:
            break

    status = "ready" if all(not outfit.missing_categories for outfit in combined) else "ready_partial"
    return (
        PlanResult(
            outfits=combined[:outfit_count],
            scenario_note=ai_note or local.scenario_note,
            warnings=warnings,
            shopping_suggestions=suggestions,
            status=status,
            forced_item_ids=local.forced_item_ids,
        ),
        True,
    )


def _prepare_plan(
    user: User,
    all_items: list[WardrobeItem],
    request: CreateRecommendationRequest,
) -> tuple[PlanResult, str]:
    """Run the stylist (local + optional Gemini) without touching the database."""
    requested_forced_ids = set(request.forced_item_ids)
    requested_forced_ids.update(item.id for item in all_items if item.force_include)
    unavailable_forced = [
        item
        for item in all_items
        if item.id in requested_forced_ids and not item.available
    ]
    forced_ids = requested_forced_ids & {item.id for item in all_items if item.available}

    plan = plan_outfits(
        all_items,
        user={
            "fit_preference": user.fit_preference,
            "height_cm": user.height_cm,
            "body_shape": user.body_shape,
            "style_preferences": user.style_preferences,
        },
        weather=request.weather,
        occasion=request.occasion,
        occasion_type=request.occasion_type,
        forced_ids=sorted(forced_ids),
        outfit_count=request.outfit_count,
    )
    source = "atelier"
    if unavailable_forced:
        plan.warnings.append(
            {
                "code": "forced_unavailable",
                "message": "必穿清单中的 "
                + "、".join(f"「{item.name}」" for item in unavailable_forced[:3])
                + " 已标记为不可用，本次没有加入造型。",
                "severity": "warning",
            }
        )

    if gemini_service.enabled and plan.outfits:
        prompt = _planning_prompt(
            all_items,
            user,
            request.weather,
            request.occasion,
            request.occasion_type,
            forced_ids,
            request.outfit_count,
        )
        try:
            ai_data = gemini_service.plan_outfits(prompt)
            plan, used_ai = _merge_ai_plan(
                plan, ai_data, all_items, forced_ids, request.outfit_count
            )
            if used_ai:
                source = "gemini"
        except GeminiError as exc:
            logger.info("Falling back to atelier planner: %s", exc)

    return plan, source


def queue_recommendation(
    db: Session,
    user: User,
    request: CreateRecommendationRequest,
) -> Recommendation:
    """Persist a placeholder recommendation and return immediately.

    The caller schedules ``run_generation`` so the POST never waits on the
    stylist or on image rendering.
    """
    recommendation = Recommendation(
        user_id=user.id,
        occasion=request.occasion,
        occasion_type=request.occasion_type,
        weather=request.weather.model_dump(),
        background_mode=request.background_mode,
        background_prompt=request.background_prompt,
        forced_item_ids=request.forced_item_ids,
        status="planning",
        ai_source="atelier",
        scenario_note=None,
        warnings=[],
        shopping_suggestions=[],
    )
    db.add(recommendation)
    db.commit()
    db.refresh(recommendation)
    return recommendation


def _save_plan(
    db: Session,
    recommendation: Recommendation,
    request: CreateRecommendationRequest,
    plan: PlanResult,
    source: str,
) -> list[str]:
    """Write the planned outfits onto an existing recommendation row."""
    recommendation.forced_item_ids = plan.forced_item_ids
    recommendation.status = plan.status
    recommendation.ai_source = source
    recommendation.scenario_note = plan.scenario_note
    recommendation.warnings = plan.warnings
    recommendation.shopping_suggestions = plan.shopping_suggestions

    render_outfits: list[Outfit] = []
    for index, planned in enumerate(plan.outfits):
        snapshot = [
            outfit_item_snapshot(
                item,
                role=planned.roles.get(item.id),
            )
            for item in planned.items
        ]
        categories = {item.category for item in planned.items}
        renderable = (
            bool(categories & {"top", "dress"})
            and ("dress" in categories or "bottom" in categories)
            and "shoes" in categories
        )
        if renderable:
            image_status = "pending"
            image_error = None
        else:
            image_status = "unavailable"
            image_error = "补齐完整造型后即可生成试穿图"
        outfit = Outfit(
            recommendation_id=recommendation.id,
            title=planned.title,
            rationale=planned.rationale,
            styling_note=planned.styling_note,
            score=planned.score,
            sort_order=index,
            item_ids=[item.id for item in planned.items],
            items_snapshot=snapshot,
            missing_categories=planned.missing_categories,
            warnings=planned.warnings,
            image_status=image_status,
            image_error=image_error,
            background_mode=request.background_mode,
            background_prompt=request.background_prompt,
        )
        db.add(outfit)
        if renderable:
            render_outfits.append(outfit)

    db.commit()
    # Flush assigns UUID primary keys, so only read ids after commit.
    return [outfit.id for outfit in render_outfits]


def run_generation(recommendation_id: str, outfit_count: int = 3) -> None:
    """Worker entry point: plan a queued recommendation and queue its renders."""
    from app.services.jobs import submit_render

    db: Session = SessionLocal()
    render_task_ids: list[str] = []
    try:
        recommendation = db.get(Recommendation, recommendation_id)
        if recommendation is None or recommendation.status != "planning":
            return
        user = db.get(User, recommendation.user_id)
        if user is None:
            recommendation.status = "failed"
            recommendation.warnings = [
                {
                    "code": "generation_failed",
                    "message": "账户信息暂时不可用，请重新登录后再试。",
                    "severity": "critical",
                }
            ]
            db.commit()
            return
        all_items = list(
            db.scalars(
                select(WardrobeItem).where(WardrobeItem.user_id == user.id)
            ).all()
        )
        try:
            request = CreateRecommendationRequest(
                occasion=recommendation.occasion,
                occasion_type=recommendation.occasion_type,
                weather=WeatherSnapshot.model_validate(recommendation.weather or {}),
                background_mode=recommendation.background_mode,
                background_prompt=recommendation.background_prompt,
                forced_item_ids=recommendation.forced_item_ids or [],
                outfit_count=max(1, min(4, outfit_count)),
            )
            plan, source = _prepare_plan(user, all_items, request)
        except Exception:
            logger.exception("Outfit planning failed for %s", recommendation_id)
            recommendation.status = "failed"
            recommendation.warnings = [
                {
                    "code": "generation_failed",
                    "message": "这组造型没有生成成功，请回到造型页重试。",
                    "severity": "critical",
                }
            ]
            db.commit()
            return

        render_task_ids = _save_plan(db, recommendation, request, plan, source)
    except Exception:
        logger.exception("Generation job crashed for %s", recommendation_id)
        db.rollback()
        return
    finally:
        db.close()

    for outfit_id in render_task_ids:
        submit_render(outfit_id)


def rerender_outfit(
    db: Session,
    user: User,
    outfit: Outfit,
    background_mode: str,
    background_prompt: str | None,
) -> bool:
    """Update background choice and queue a render. Returns True when queued."""
    recommendation = db.get(Recommendation, outfit.recommendation_id)
    if recommendation is None or recommendation.user_id != user.id:
        return False
    snapshot = outfit.items_snapshot or []
    categories = {item.get("category") for item in snapshot}
    if not categories & {"top", "dress"} or "shoes" not in categories:
        outfit.image_status = "unavailable"
        outfit.image_error = "补齐完整造型后即可生成试穿图"
        db.commit()
        return False
    outfit.background_mode = background_mode
    outfit.background_prompt = background_prompt
    outfit.image_status = "generating"
    outfit.image_error = None
    db.commit()
    return True


__all__ = [
    "queue_recommendation",
    "rerender_outfit",
    "run_generation",
]
