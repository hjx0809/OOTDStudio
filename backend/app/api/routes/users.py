"""Profile, body measurements, base photo and account security endpoints."""

from __future__ import annotations

import logging
import shutil

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field

from app.api.serializers import serialize_user
from app.core.config import get_settings
from app.core.security import (
    CurrentUser,
    DbSession,
    get_token_from_request,
    hash_password,
    verify_password,
)
from app.schemas.auth import MessageResponse, ProfileUpdate, UserRead
from app.services.storage import (
    delete_stored_image,
    read_upload,
    store_user_image,
)

router = APIRouter(prefix="/users", tags=["users"])
logger = logging.getLogger(__name__)


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class DeleteAccountRequest(BaseModel):
    password: str


@router.get("/me", response_model=UserRead)
def get_me(user: CurrentUser, request: Request) -> UserRead:
    return serialize_user(user, get_token_from_request(request) or "")


@router.patch("/me", response_model=UserRead)
def update_me(
    payload: ProfileUpdate, user: CurrentUser, request: Request, db: DbSession
) -> UserRead:
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="没有需要保存的修改")
    if "display_name" in updates:
        display_name = " ".join((updates["display_name"] or "").split())
        if not display_name:
            raise HTTPException(status_code=422, detail="称呼不能为空")
        updates["display_name"] = display_name
    if "style_preferences" in updates:
        updates["style_preferences"] = list(
            dict.fromkeys(tag.strip() for tag in updates["style_preferences"] if tag.strip())
        )[:10]
    if "avoid_colors" in updates:
        updates["avoid_colors"] = list(
            dict.fromkeys(tag.strip() for tag in updates["avoid_colors"] if tag.strip())
        )[:10]
    for field_name, value in updates.items():
        setattr(user, field_name, value)
    db.commit()
    db.refresh(user)
    return serialize_user(user, get_token_from_request(request) or "")


@router.post("/me/base-photo", response_model=UserRead)
async def upload_base_photo(
    user: CurrentUser,
    request: Request,
    db: DbSession,
    photo: UploadFile = File(...),
) -> UserRead:
    data = await read_upload(photo)
    old_paths = (user.base_photo_path, user.base_photo_thumb_path)
    stored = store_user_image(
        user.id,
        data,
        kind="base",
        max_edge=2000,
        thumb_edge=640,
        quality=91,
    )
    user.base_photo_path = stored.path
    user.base_photo_thumb_path = stored.thumbnail_path
    db.commit()
    db.refresh(user)
    delete_stored_image(*old_paths)
    return serialize_user(user, get_token_from_request(request) or "")


@router.post("/me/complete-onboarding", response_model=UserRead)
def complete_onboarding(
    user: CurrentUser, request: Request, db: DbSession
) -> UserRead:
    missing: list[str] = []
    if not user.base_photo_path:
        missing.append("全身基础照片")
    if not user.height_cm:
        missing.append("身高")
    if not user.weight_kg:
        missing.append("体重")
    if not user.chest_cm:
        missing.append("胸围")
    if not user.waist_cm:
        missing.append("腰围")
    if not user.hip_cm:
        missing.append("臀围")
    if not user.shoe_size:
        missing.append("鞋码")
    if not user.fit_preference:
        missing.append("版型偏好")
    if not user.style_preferences:
        missing.append("风格偏好")
    if missing:
        raise HTTPException(
            status_code=422,
            detail="还需要填写：" + "、".join(missing),
        )
    user.onboarding_completed = True
    db.commit()
    db.refresh(user)
    return serialize_user(user, get_token_from_request(request) or "")


@router.post("/me/password", response_model=MessageResponse)
def change_password(
    payload: PasswordChangeRequest, user: CurrentUser, db: DbSession
) -> MessageResponse:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="当前密码不正确")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=422, detail="新密码不能与当前密码相同")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return MessageResponse(message="密码已更新")


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    payload: DeleteAccountRequest, user: CurrentUser, db: DbSession
) -> None:
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail="密码不正确，账户未删除")
    settings = get_settings()
    user_id = user.id
    user_root = (settings.upload_dir / user_id).resolve()
    upload_root = settings.upload_dir.resolve()
    db.delete(user)
    db.commit()
    if user_root.parent == upload_root and user_root.is_dir():
        try:
            shutil.rmtree(user_root)
        except OSError:
            logger.warning("Could not remove media directory for deleted account", exc_info=True)
