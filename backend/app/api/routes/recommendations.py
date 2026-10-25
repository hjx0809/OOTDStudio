"""Recommendation creation, polling, history and per-look re-rendering."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.serializers import serialize_recommendation, serialize_summary
from app.core.security import CurrentUser, DbSession, get_token_from_request
from app.db.models import Outfit, Recommendation
from app.schemas.recommendation import (
    CreateRecommendationRequest,
    RecommendationRead,
    RecommendationSummary,
    RenderImageRequest,
    WeatherSnapshot,
)
from app.services.jobs import submit_generation, submit_render
from app.services.recommendation_service import (
    queue_recommendation,
    rerender_outfit,
)
from app.services.storage import delete_stored_image, thumbnail_path_for

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


def _own_recommendation(db: DbSession, user_id: str, recommendation_id: str) -> Recommendation:
    statement = (
        select(Recommendation)
        .where(
            Recommendation.id == recommendation_id,
            Recommendation.user_id == user_id,
        )
        .options(selectinload(Recommendation.outfits))
    )
    recommendation = db.scalar(statement)
    if recommendation is None:
        raise HTTPException(status_code=404, detail="找不到这条造型推荐")
    return recommendation


@router.post(
    "",
    response_model=RecommendationRead,
    status_code=status.HTTP_201_CREATED,
)
def create(
    payload: CreateRecommendationRequest,
    user: CurrentUser,
    request: Request,
    db: DbSession,
) -> RecommendationRead:
    if not user.onboarding_completed:
        raise HTTPException(
            status_code=409,
            detail="请先完成身体参数与基础照片设置",
        )
    if not user.base_photo_path:
        raise HTTPException(status_code=409, detail="请先上传一张全身基础照片")
    # Return a pending recommendation straight away; planning and rendering
    # run in the background so navigating away never cancels them.
    recommendation = queue_recommendation(db, user, payload)
    submit_generation(recommendation.id, payload.outfit_count)
    db.refresh(recommendation)
    return serialize_recommendation(
        recommendation, db, get_token_from_request(request) or ""
    )


@router.get("", response_model=list[RecommendationSummary])
def history(
    user: CurrentUser,
    request: Request,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=30)] = 12,
) -> list[RecommendationSummary]:
    token = get_token_from_request(request) or ""
    statement = (
        select(Recommendation)
        .where(Recommendation.user_id == user.id)
        .options(selectinload(Recommendation.outfits))
        .order_by(Recommendation.created_at.desc())
        .limit(limit)
    )
    recommendations = db.scalars(statement).all()
    return [serialize_summary(rec, db, token) for rec in recommendations]


@router.get("/{recommendation_id}", response_model=RecommendationRead)
def detail(
    recommendation_id: str,
    user: CurrentUser,
    request: Request,
    db: DbSession,
) -> RecommendationRead:
    recommendation = _own_recommendation(db, user.id, recommendation_id)
    return serialize_recommendation(
        recommendation, db, get_token_from_request(request) or ""
    )


@router.post("/{recommendation_id}/reroll", response_model=RecommendationRead, status_code=201)
def reroll(
    recommendation_id: str,
    user: CurrentUser,
    request: Request,
    db: DbSession,
) -> RecommendationRead:
    if not user.onboarding_completed:
        raise HTTPException(status_code=409, detail="请先完成身体参数与基础照片设置")
    original = _own_recommendation(db, user.id, recommendation_id)
    try:
        weather = WeatherSnapshot.model_validate(original.weather or {})
    except Exception as exc:
        raise HTTPException(
            status_code=409, detail="这条推荐缺少可复用的天气信息，请重新开始造型"
        ) from exc
    payload = CreateRecommendationRequest(
        occasion=original.occasion,
        occasion_type=original.occasion_type,
        weather=weather,
        background_mode=original.background_mode if original.background_mode in {"studio", "custom"} else "studio",
        background_prompt=original.background_prompt,
        forced_item_ids=[],
        outfit_count=max(1, min(4, len(original.outfits) or 3)),
    )
    recommendation = queue_recommendation(db, user, payload)
    submit_generation(recommendation.id, payload.outfit_count)
    db.refresh(recommendation)
    return serialize_recommendation(
        recommendation, db, get_token_from_request(request) or ""
    )


@router.post(
    "/{recommendation_id}/outfits/{outfit_id}/render",
    response_model=RecommendationRead,
)
def render_outfit(
    recommendation_id: str,
    outfit_id: str,
    payload: RenderImageRequest,
    user: CurrentUser,
    request: Request,
    db: DbSession,
) -> RecommendationRead:
    recommendation = _own_recommendation(db, user.id, recommendation_id)
    outfit = db.get(Outfit, outfit_id)
    if outfit is None or outfit.recommendation_id != recommendation.id:
        raise HTTPException(status_code=404, detail="找不到这套造型")
    if outfit.image_status == "generating":
        return serialize_recommendation(
            recommendation, db, get_token_from_request(request) or ""
        )
    queued = rerender_outfit(
        db,
        user,
        outfit,
        payload.background_mode,
        payload.background_prompt,
    )
    if queued:
        submit_render(outfit.id)
    db.refresh(recommendation)
    return serialize_recommendation(
        recommendation, db, get_token_from_request(request) or ""
    )


@router.delete("/{recommendation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recommendation(
    recommendation_id: str, user: CurrentUser, db: DbSession
) -> None:
    recommendation = _own_recommendation(db, user.id, recommendation_id)
    paths = [
        (outfit.image_path, thumbnail_path_for(outfit.image_path))
        for outfit in recommendation.outfits
        if outfit.image_path
    ]
    db.delete(recommendation)
    db.commit()
    for full, thumb in paths:
        delete_stored_image(full, thumb)
