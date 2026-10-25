"""Offline lookboard composition on a pure white background.

Gemini remains the primary try-on path. When it is unavailable, the framed
base photo is placed on a plain white background so nothing competes with the
outfit itself.
"""

from __future__ import annotations

from PIL import Image, ImageDraw, ImageOps


def render_background(size: tuple[int, int] = (1080, 1440)) -> Image.Image:
    """A seamless pure white studio background."""
    return Image.new("RGB", size, (255, 255, 255))


def compose_person(
    background: Image.Image, person_source: Image.Image | None
) -> Image.Image:
    """Place the user's framed base photo onto the white background."""
    canvas = background.convert("RGBA")
    width, height = canvas.size
    if person_source is not None:
        portrait = person_source.convert("RGB")
        target_height = int(height * 0.63)
        scale = target_height / portrait.height
        if portrait.width * scale > width * 0.46:
            scale = (width * 0.46) / portrait.width
        target_size = (max(1, int(portrait.width * scale)), max(1, int(portrait.height * scale)))
        portrait = ImageOps.fit(portrait, target_size, method=Image.Resampling.LANCZOS)
        x = int(width * 0.64 - target_size[0] / 2)
        bottom = int(height * 0.735)
        y = bottom - target_size[1]
        mask = Image.new("L", target_size, 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, target_size[0], target_size[1]), radius=22, fill=255
        )
        canvas.paste(portrait, (x, y), mask)
    return canvas.convert("RGB")
