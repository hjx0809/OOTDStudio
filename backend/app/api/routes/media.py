"""Authenticated media delivery for private wardrobe and look images."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.core.security import DbSession, get_media_user
from app.db.models import User
from app.services.storage import resolve_media_path

router = APIRouter(tags=["media"])


@router.get("/media/{path:path}", include_in_schema=False)
def get_media(
    path: str,
    db: DbSession,
    user: User = Depends(get_media_user),
) -> FileResponse:
    file_path: Path = resolve_media_path(path, user.id)
    return FileResponse(
        file_path,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "private, max-age=86400",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        },
    )
