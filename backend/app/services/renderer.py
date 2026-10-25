"""Outfit image rendering: Gemini try-on first, editorial lookboard fallback."""

from __future__ import annotations

import io
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont, ImageOps
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Outfit, Recommendation, User
from app.db.session import SessionLocal
from app.services.gemini import gemini_service
from app.services.lookboard import compose_person, render_background
from app.services.storage import resolve_media_path, store_user_image

logger = logging.getLogger(__name__)
ASSETS = Path(__file__).resolve().parent.parent / "assets" / "fonts"
ROLE_EN = {
    "top": "TOP",
    "bottom": "BOTTOM",
    "dress": "DRESS",
    "outerwear": "OUTER",
    "shoes": "SHOES",
    "bag": "BAG",
    "accessory": "ACCESSORY",
}
LOOK_NAMES = ("QUIET FORM", "SOFT STRUCTURE", "CITY LIGHT", "OPEN EDIT")


def _font(filename: str, size: int, weight: int | None = None) -> ImageFont.FreeTypeFont:
    path = ASSETS / filename
    try:
        font = ImageFont.truetype(str(path), size)
        if weight is not None:
            try:
                font.set_variation_by_axes([weight])
            except (AttributeError, OSError):
                pass
        return font
    except OSError:
        return ImageFont.load_default(size=size)


def _mime_for(path: Path) -> str:
    return "image/png" if path.suffix.lower() == ".png" else "image/jpeg"


def _background_description() -> str:
    return (
        "Use a seamless pure white (#FFFFFF) background behind the person: "
        "no props, no horizon line, no gradient, no vignette, no wall shadow "
        "and no text."
    )


def _build_tryon_prompt(
    recommendation: Recommendation,
    user: User,
    snapshot_items: list[dict[str, Any]],
) -> str:
    garments = []
    for index, item in enumerate(snapshot_items, start=2):
        role = ROLE_EN.get(item.get("category", ""), item.get("category", "item"))
        garments.append(
            f"- Image {index}: {role} — {item.get('color_name', '')} "
            f"{item.get('name', '')}"
        )
    garment_text = "\n".join(garments) or "- No garment images supplied."
    weather = recommendation.weather or {}
    body = (
        f"Height {user.height_cm or 'unknown'} cm, fit preference "
        f"{user.fit_preference or 'regular'}. Preserve the person's real "
        "body proportions, face, skin tone and hair exactly."
    )
    return f"""Create a photorealistic full-body editorial fashion photograph for a premium styling app.

Image 1 is the identity and body reference. It is the same person who must appear in the output. Preserve this exact person's face, facial features, skin tone, hair, age and body shape. Do not beautify, slim, broaden or otherwise alter their identity or proportions. Do not make them look like a different person.

The other images are the actual garments to dress this person in. Dress the person in every listed piece, adapted naturally to their body:
{garment_text}

{body}

Occasion: {recommendation.occasion}.
Weather: {weather.get('condition', '')}, feels like {weather.get('apparent_temp', '')}°C.

{_background_description()}

Composition requirements:
- Full body visible from head to toe, including shoes, with a little breathing room above the head and below the feet.
- Natural, relaxed standing pose with both feet planted. Arms not covering the outfit.
- Vertical 3:4 composition, 85mm editorial lens feel, soft directional studio light.
- Realistic fabric drape, folds and fit. Keep garment colours, patterns and proportions faithful to the reference images.
- High-end but believable retouching; visible skin texture; no plastic skin.
- Absolutely no text, logos, graphics, frame, border or watermark in the image.
- No extra people, no duplicate limbs, no distorted hands or feet.

If an item cannot be worn for safety or physical reasons, keep the rest of the outfit faithful and make the most sensible substitution without mentioning it.
"""


def _rounded_thumbnail(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    fitted = ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.45))
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=22, fill=255)
    output = Image.new("RGBA", size, (0, 0, 0, 0))
    output.paste(fitted.convert("RGBA"), (0, 0), mask)
    return output


def _load_person_image(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        return ImageOps.exif_transpose(opened).convert("RGB")


def _render_lookboard(
    outfit: Outfit,
    recommendation: Recommendation,
    user: User,
    snapshot_items: list[dict[str, Any]],
) -> bytes:
    """Compose a preview board: framed base photo on a pure white background.

    The preview does not replace the person's clothes (Gemini does that); it
    simply places the base photo on white so nothing distracts from the outfit.
    """
    scene = render_background((1080, 1440))

    person_path: Path | None = None
    if user.base_photo_path:
        try:
            person_path = resolve_media_path(user.base_photo_path, user.id)
        except Exception:
            person_path = None

    person_photo = None
    if person_path:
        try:
            person_photo = _load_person_image(person_path)
        except Exception:
            person_photo = None
    canvas = compose_person(scene, person_photo)
    draw = ImageDraw.Draw(canvas)

    ink = (24, 24, 21)
    muted = (118, 112, 101)
    accent = (86, 108, 30)
    manrope_med = _font("Manrope-Variable.ttf", 22, 620)
    manrope_small = _font("Manrope-Variable.ttf", 17, 540)
    serif = _font("InstrumentSerif-Regular.ttf", 76)
    serif_small = _font("InstrumentSerif-Regular.ttf", 44)

    # Brand lockup and look badge.
    draw.text((72, 60), "OOTD", font=_font("Manrope-Variable.ttf", 34, 760), fill=ink)
    draw.text((72, 104), "STUDIO / TOMORROW'S EDIT", font=manrope_small, fill=muted)
    look_index = outfit.sort_order + 1
    badge_text = f"LOOK {look_index:02d}"
    badge_width = draw.textlength(badge_text, font=manrope_med)
    draw.rounded_rectangle(
        (1080 - 72 - badge_width - 36, 58, 1008, 104),
        radius=23,
        fill=(255, 255, 255, 235),
        outline=(24, 24, 21, 70),
    )
    draw.text((1080 - 72 - badge_width - 18, 69), badge_text, font=manrope_med, fill=ink)

    # Editorial title stays in the left third so the full-body cut-out remains
    # readable on the right.
    look_name = LOOK_NAMES[(look_index - 1) % len(LOOK_NAMES)]
    title_lines = look_name.split(" ")
    title_y = 752 if len(title_lines) == 2 else 790
    for offset, line in enumerate(title_lines):
        draw.text((72, title_y + offset * 78), line, font=serif, fill=ink)
    subtitle_y = title_y + len(title_lines) * 78 + 12
    draw.text(
        (76, subtitle_y),
        "A STUDY IN PROPORTION, COLOUR AND WEATHER.",
        font=manrope_small,
        fill=muted,
    )
    draw.line((72, subtitle_y + 32, 1008, subtitle_y + 32), fill=(24, 24, 21, 45), width=1)

    # Garment cards strip.
    top = 1084
    card_width, card_height = 220, 232
    gap = 14
    max_cards = 4
    usable_items = snapshot_items[:max_cards]

    for index, item in enumerate(usable_items):
        x = 72 + index * (card_width + gap)
        image_path = item.get("image_path") or item.get("thumbnail_path")
        card = Image.new("RGB", (card_width, card_height), (244, 241, 234))
        if image_path:
            try:
                path = resolve_media_path(image_path, user.id)
                with Image.open(path) as opened:
                    card = ImageOps.fit(
                        opened.convert("RGB"),
                        (card_width, card_height),
                        method=Image.Resampling.LANCZOS,
                        centering=(0.5, 0.42),
                    )
            except Exception:
                pass
        card_rgba = _rounded_thumbnail(card, (card_width, card_height))
        canvas.paste(card_rgba, (x, top), card_rgba)
        role = ROLE_EN.get(item.get("category", ""), "PIECE")
        draw.text(
            (x + 2, top + card_height + 10),
            f"{index + 1:02d}  {role}",
            font=manrope_small,
            fill=ink,
        )

    if len(snapshot_items) > max_cards:
        x = 72 + max_cards * (card_width + gap)
        draw.rounded_rectangle(
            (x, top, x + card_width, top + card_height),
            radius=22,
            fill=(245, 245, 243),
            outline=(24, 24, 21, 40),
        )
        draw.text(
            (x + 24, top + card_height // 2 - 30),
            f"+{len(snapshot_items) - max_cards}",
            font=serif_small,
            fill=ink,
        )
        draw.text(
            (x + 24, top + card_height // 2 + 26),
            "PIECES",
            font=manrope_small,
            fill=muted,
        )

    draw.text((76, 1400), "PERSONAL LOOKBOARD", font=manrope_small, fill=muted)
    draw.text((1008, 1400), "OOTD.STUDIO", font=manrope_small, fill=accent, anchor="ra")

    buffer = io.BytesIO()
    canvas.convert("RGB").save(buffer, "JPEG", quality=92, optimize=True, progressive=True)
    return buffer.getvalue()

def _load_snapshot_images(
    user: User, snapshot_items: list[dict[str, Any]]
) -> list[tuple[bytes, str]]:
    images: list[tuple[bytes, str]] = []
    for item in snapshot_items:
        path_value = item.get("image_path") or item.get("thumbnail_path")
        if not path_value:
            continue
        try:
            path = resolve_media_path(path_value, user.id)
            images.append((path.read_bytes(), _mime_for(path)))
        except Exception:
            continue
    return images


def _render_outfit_sync(outfit_id: str) -> None:
    settings = get_settings()
    db: Session = SessionLocal()
    try:
        outfit = db.get(Outfit, outfit_id)
        if outfit is None:
            return
        recommendation = db.get(Recommendation, outfit.recommendation_id)
        if recommendation is None:
            outfit.image_status = "failed"
            outfit.image_error = "Recommendation not found"
            db.commit()
            return
        user = db.get(User, recommendation.user_id)
        if user is None:
            outfit.image_status = "failed"
            outfit.image_error = "Account not found"
            db.commit()
            return

        snapshot_items = outfit.items_snapshot or []
        base_required = {"top", "dress"}
        categories = {item.get("category") for item in snapshot_items}
        if not categories & base_required or "shoes" not in categories:
            outfit.image_status = "unavailable"
            outfit.image_kind = None
            outfit.image_error = "Add a top, bottom and shoes to generate a complete try-on image"
            outfit.updated_at = datetime.now(timezone.utc)
            db.commit()
            return

        if not user.base_photo_path:
            outfit.image_status = "unavailable"
            outfit.image_kind = None
            outfit.image_error = "Please upload a full-body base photo first"
            db.commit()
            return

        outfit.image_status = "generating"
        outfit.updated_at = datetime.now(timezone.utc)
        db.commit()

        image_bytes: bytes | None = None
        image_kind = "lookboard"
        note: str | None = None

        if gemini_service.enabled and settings.enable_ai_images:
            try:
                base_path = resolve_media_path(user.base_photo_path, user.id)
                garment_images = _load_snapshot_images(user, snapshot_items)
                prompt = _build_tryon_prompt(recommendation, user, snapshot_items)
                image_bytes, _mime = gemini_service.render_outfit(
                    person_image=base_path.read_bytes(),
                    person_mime=_mime_for(base_path),
                    garment_images=garment_images,
                    prompt=prompt,
                )
                image_kind = "ai_tryon"
            except Exception as exc:
                logger.warning("Try-on render fell back to lookboard: %s", type(exc).__name__)
                note = "A lookboard preview is shown instead."

        if image_bytes is None:
            image_bytes = _render_lookboard(outfit, recommendation, user, snapshot_items)
            if gemini_service.enabled:
                note = note or "A lookboard preview is shown instead."

        stored = store_user_image(
            user.id,
            image_bytes,
            kind="looks",
            stem=outfit.id,
            max_edge=1600,
            thumb_edge=720,
            quality=91,
        )
        outfit.image_path = stored.path
        outfit.image_status = "ready"
        outfit.image_kind = image_kind
        outfit.image_error = note
        outfit.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        logger.exception("Outfit rendering failed: %s", type(exc).__name__)
        db.rollback()
        try:
            outfit = db.get(Outfit, outfit_id)
            if outfit is not None:
                outfit.image_status = "failed"
                outfit.image_error = "Image generation failed. Please try again shortly."
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


def render_outfit_image(outfit_id: str) -> None:
    """Background-task entry point with its own DB session."""
    _render_outfit_sync(outfit_id)
