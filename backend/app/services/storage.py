"""Image validation, privacy-safe storage and thumbnail generation."""

from __future__ import annotations

import io
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from app.core.config import get_settings

register_heif_opener()
Image.MAX_IMAGE_PIXELS = 48_000_000

ALLOWED_UPLOAD_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}
UPLOAD_TYPE_LABELS = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
    "image/heic": "HEIC",
    "image/heif": "HEIF",
}


@dataclass(frozen=True)
class StoredImage:
    path: str
    thumbnail_path: str


def _safe_unlink(path: str | None) -> None:
    if not path:
        return
    try:
        (get_settings().upload_dir / path).unlink(missing_ok=True)
    except OSError:
        pass


async def read_upload(upload: UploadFile) -> bytes:
    settings = get_settings()
    if upload.content_type not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(
            status_code=415,
            detail="仅支持 JPG、PNG、WebP 或 HEIC 格式的照片",
        )
    limit = settings.max_upload_mb * 1024 * 1024
    data = await upload.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"照片不能超过 {settings.max_upload_mb} MB",
        )
    if not data:
        raise HTTPException(status_code=400, detail="照片内容为空，请重新选择")
    return data


def _normalize(data: bytes, max_edge: int, *, quality: int = 90) -> Image.Image:
    try:
        with Image.open(io.BytesIO(data)) as opened:
            image = ImageOps.exif_transpose(opened)
            image.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="无法读取这张照片，请换一张重试") from exc

    if image.width * image.height > 48_000_000:
        raise HTTPException(status_code=422, detail="照片分辨率过高，请压缩后重试")

    if image.mode in {"RGBA", "LA"} or (
        image.mode == "P" and "transparency" in image.info
    ):
        background = Image.new("RGB", image.size, (248, 246, 241))
        rgba = image.convert("RGBA")
        background.paste(rgba, mask=rgba.getchannel("A"))
        image = background
    else:
        image = image.convert("RGB")

    image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    return image


def _write_jpeg(image: Image.Image, destination: Path, *, quality: int = 90) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    image.save(temporary, "JPEG", quality=quality, optimize=True, progressive=True)
    os.chmod(temporary, 0o600)
    temporary.replace(destination)


def store_user_image(
    user_id: str,
    data: bytes,
    *,
    kind: str,
    stem: str | None = None,
    max_edge: int = 1600,
    thumb_edge: int = 560,
    quality: int = 90,
) -> StoredImage:
    """Store an image under a user-private folder plus a small grid thumbnail."""
    settings = get_settings()
    if kind not in {"base", "items", "looks"}:
        raise ValueError(f"Unsupported image kind: {kind}")
    image = _normalize(data, max_edge)
    stem = stem or uuid.uuid4().hex
    relative = Path(user_id) / kind / f"{stem}.jpg"
    thumbnail_relative = Path(user_id) / kind / f"{stem}_thumb.jpg"

    full_destination = settings.upload_dir / relative
    thumb_destination = settings.upload_dir / thumbnail_relative
    _write_jpeg(image, full_destination, quality=quality)

    thumb = image.copy()
    thumb.thumbnail((thumb_edge, thumb_edge), Image.Resampling.LANCZOS)
    _write_jpeg(thumb, thumb_destination, quality=82)

    return StoredImage(path=relative.as_posix(), thumbnail_path=thumbnail_relative.as_posix())


def delete_stored_image(path: str | None, thumbnail_path: str | None = None) -> None:
    _safe_unlink(path)
    _safe_unlink(thumbnail_path)


def thumbnail_path_for(path: str | None) -> str | None:
    """The renderer names look thumbnails `<stem>_thumb.jpg`."""
    if not path:
        return None
    candidate = Path(path)
    return str(candidate.with_name(f"{candidate.stem}_thumb.jpg"))


def resolve_media_path(relative_path: str, user_id: str) -> Path:
    settings = get_settings()
    root = settings.upload_dir.resolve()
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="图片不存在") from exc
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="图片不存在")
    # A user can only read files inside their own namespace.
    try:
        candidate.relative_to(root / user_id)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="无权访问这张图片") from exc
    if candidate.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=404, detail="图片不存在")
    return candidate


def media_url(
    relative_path: str | None, token: str, *, version: int | str | None = None
) -> str | None:
    if not relative_path:
        return None
    suffix = f"&v={version}" if version is not None else ""
    return f"/api/media/{quote(relative_path)}?token={quote(token)}{suffix}"


def dominant_color(data: bytes) -> tuple[str, str]:
    """Extract a stable accent color from a garment photo."""
    try:
        image = _normalize(data, 400, quality=80)
    except HTTPException:
        return "中性色", "#A59F95"
    # Focus on the centre of the frame: garment photos are usually centred,
    # while the border is often background/wall/floor and would otherwise
    # dominate the palette.
    width, height = image.size
    image = image.crop(
        (
            int(width * 0.17),
            int(height * 0.12),
            int(width * 0.83),
            int(height * 0.88),
        )
    )
    image = image.resize((100, 100))
    quantized = image.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette() or []
    counts = sorted(quantized.getcolors() or [], reverse=True)
    candidates: list[tuple[int, int, int, int]] = []
    for count, index in counts[:8]:
        r, g, b = palette[index * 3 : index * 3 + 3]
        brightness = (r + g + b) / 3
        saturation = max(r, g, b) - min(r, g, b)
        if 28 < brightness < 235:
            candidates.append((count, r, g, b))
    if candidates:
        _, r, g, b = candidates[0]
    elif counts:
        _, index = counts[0]
        r, g, b = palette[index * 3 : index * 3 + 3]
    else:
        r, g, b = 165, 159, 149
    hex_value = f"#{r:02X}{g:02X}{b:02X}"
    return _nearest_color_name(r, g, b), hex_value


def _nearest_color_name(r: int, g: int, b: int) -> str:
    named = {
        "黑色": (25, 25, 25),
        "炭灰": (78, 78, 76),
        "雾灰": (160, 160, 154),
        "米白": (238, 232, 218),
        "纯白": (250, 250, 247),
        "奶油": (226, 209, 173),
        "驼色": (181, 144, 104),
        "焦糖": (137, 85, 52),
        "酒红": (110, 35, 45),
        "砖红": (181, 80, 60),
        "橘棕": (198, 108, 58),
        "柠檬黄": (219, 211, 92),
        "橄榄绿": (93, 104, 68),
        "松针绿": (45, 74, 58),
        "雾蓝": (124, 150, 166),
        "海军蓝": (35, 52, 84),
        "薰衣草": (168, 150, 186),
        "裸粉": (220, 184, 177),
        "牛仔蓝": (77, 111, 145),
    }
    best = min(
        named.items(),
        key=lambda entry: (entry[1][0] - r) ** 2
        + (entry[1][1] - g) ** 2
        + (entry[1][2] - b) ** 2,
    )
    return best[0]
