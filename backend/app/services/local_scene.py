"""Offline scene generation and person cut-out for the local lookboard.

Gemini remains the primary try-on path. When it is unavailable, we still make
the user's background choice real: a small segmentation model isolates the
person, then a prompt-aware editorial scene is composed behind them. This is
explicitly a *preview* (the original clothing is not replaced), but it is not a
static placeholder — the background prompt changes the rendered result.
"""

from __future__ import annotations

import hashlib
import logging
import math
import os
import random
import threading
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

logger = logging.getLogger(__name__)
ASSETS = Path(__file__).resolve().parent.parent / "assets"
MODELS = ASSETS / "models"

_session = None
_session_lock = threading.Lock()


def _get_session():
    global _session
    if _session is not None:
        return _session
    with _session_lock:
        if _session is not None:
            return _session
        model_home = os.environ.get("U2NET_HOME") or str(MODELS)
        os.environ["U2NET_HOME"] = model_home
        from rembg import new_session

        _session = new_session(
            "u2netp",
            providers=["CPUExecutionProvider"],
        )
        return _session


@lru_cache(maxsize=24)
def _cutout_cached(path_value: str, modified_ns: int) -> Image.Image | None:
    try:
        from rembg import remove

        with Image.open(path_value) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
        image.thumbnail((1300, 1300), Image.Resampling.LANCZOS)
        session = _get_session()
        cutout = remove(
            image,
            session=session,
            only_mask=False,
            alpha_matting=False,
            post_process_mask=True,
        )
        if cutout.mode != "RGBA":
            cutout = cutout.convert("RGBA")
        # Trim the one-pixel background fringe left by the segmentation model.
        alpha = cutout.getchannel("A").filter(ImageFilter.MinFilter(3))
        alpha = alpha.filter(ImageFilter.GaussianBlur(0.6))
        cutout.putalpha(alpha)
        alpha_bbox = cutout.getchannel("A").getbbox()
        if not alpha_bbox:
            return None
        left, top, right, bottom = alpha_bbox
        if (bottom - top) < image.height * 0.2 or (right - left) < image.width * 0.05:
            return None
        return cutout.crop(alpha_bbox)
    except Exception as exc:
        logger.warning("Local person segmentation unavailable: %s", type(exc).__name__)
        return None


def person_cutout(path: Path) -> Image.Image | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    cutout = _cutout_cached(str(path), stat.st_mtime_ns)
    return cutout.copy() if cutout is not None else None


def _prompt_seed(prompt: str | None) -> int:
    return int(hashlib.sha256((prompt or "studio").encode("utf-8")).hexdigest()[:10], 16)


def _linear_gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size, top)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = tuple(
            int(top[channel] + (bottom[channel] - top[channel]) * ratio)
            for channel in range(3)
        )
        draw.line((0, y, width, y), fill=color)
    return image


def _palette(prompt: str) -> tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]]:
    seed = _prompt_seed(prompt)
    rng = random.Random(seed)
    base_hue = rng.choice(
        [
            ((236, 229, 216), (198, 186, 168), (112, 100, 83)),
            ((223, 227, 221), (155, 163, 151), (76, 85, 76)),
            ((235, 218, 202), (190, 151, 117), (91, 63, 44)),
            ((207, 218, 224), (132, 151, 162), (55, 65, 75)),
            ((226, 218, 210), (170, 155, 143), (82, 72, 64)),
        ]
    )
    return base_hue


def _bokeh(image: Image.Image, rng: random.Random, count: int, color: tuple[int, int, int]) -> None:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    width, height = image.size
    for _ in range(count):
        radius = rng.randint(5, 34)
        x = rng.randint(-30, width + 30)
        y = rng.randint(int(height * 0.05), int(height * 0.72))
        alpha = rng.randint(10, 46)
        draw.ellipse(
            (x - radius, y - radius, x + radius, y + radius),
            fill=(*color, alpha),
        )
    image.paste(layer, (0, 0), layer)


def _vignette(image: Image.Image) -> None:
    width, height = image.size
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(
        (-width * 0.28, -height * 0.16, width * 1.28, height * 1.16),
        fill=255,
    )
    mask = mask.filter(ImageFilter.GaussianBlur(180))
    black = Image.new("RGB", image.size, (12, 12, 10))
    image.paste(Image.composite(image, black, mask), (0, 0))


def _studio(size: tuple[int, int]) -> Image.Image:
    image = _linear_gradient(size, (238, 234, 225), (190, 184, 172))
    width, height = size
    light = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(light)
    draw.ellipse(
        (width * 0.18, height * 0.03, width * 1.02, height * 0.92),
        fill=(255, 252, 241, 90),
    )
    light = light.filter(ImageFilter.GaussianBlur(150))
    image.paste(light, (0, 0), light)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, int(height * 0.71), width, height), fill=(178, 171, 159))
    draw.line(
        (0, int(height * 0.71), width, int(height * 0.71)),
        fill=(203, 196, 183),
        width=3,
    )
    return image


def _city(size: tuple[int, int], prompt: str) -> Image.Image:
    width, height = size
    rng = random.Random(_prompt_seed(prompt))
    night = any(word in prompt for word in ("夜", "晚", "灯光", "霓虹", "night"))
    if night:
        image = _linear_gradient(size, (23, 32, 48), (117, 91, 78))
    else:
        image = _linear_gradient(size, (122, 159, 178), (238, 204, 170))
    draw = ImageDraw.Draw(image)
    horizon = int(height * 0.695)
    x = -20
    while x < width + 40:
        building_width = rng.randint(55, 180)
        building_height = rng.randint(110, 410)
        shade = rng.randint(45, 100) if night else rng.randint(90, 135)
        top = horizon - building_height
        draw.rectangle(
            (x, top, x + building_width, horizon),
            fill=(shade, shade + 8, shade + 12),
        )
        for row in range(top + 26, horizon - 20, 42):
            for column in range(x + 16, x + building_width - 10, 34):
                if rng.random() > (0.38 if night else 0.82):
                    color = (246, 215, 144) if night else (222, 221, 209)
                    draw.rectangle(
                        (column, row, column + 11, row + 15),
                        fill=color,
                    )
        x += building_width + rng.randint(8, 22)
    draw.rectangle((0, horizon, width, height), fill=(62, 62, 58) if night else (112, 106, 95))
    _bokeh(
        image,
        rng,
        22 if night else 12,
        (255, 208, 128) if night else (255, 245, 224),
    )
    return image


def _courtyard(size: tuple[int, int], prompt: str) -> Image.Image:
    width, height = size
    rng = random.Random(_prompt_seed(prompt))
    image = _linear_gradient(size, (201, 210, 207), (231, 219, 199))
    draw = ImageDraw.Draw(image)
    wall_top = int(height * 0.18)
    floor = int(height * 0.71)
    draw.rectangle((0, wall_top, width, floor), fill=(191, 185, 173))
    for column in range(0, width + 140, 138):
        draw.line((column, wall_top, column, floor), fill=(168, 161, 149), width=3)
    draw.rectangle((0, floor, width, height), fill=(163, 157, 146))
    for row in range(floor, height + 60, 60):
        draw.line((0, row, width, row), fill=(140, 134, 123), width=2)
    # soft sunbeam
    beam = Image.new("RGBA", size, (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(beam)
    bdraw.polygon(
        [
            (width * 0.1, 0),
            (width * 0.35, 0),
            (width * 0.78, floor),
            (width * 0.49, floor),
        ],
        fill=(255, 247, 215, 50),
    )
    beam = beam.filter(ImageFilter.GaussianBlur(24))
    image.paste(beam, (0, 0), beam)
    foliage = Image.new("RGBA", size, (0, 0, 0, 0))
    fdraw = ImageDraw.Draw(foliage)
    for _ in range(38):
        radius = rng.randint(25, 74)
        x = rng.choice([rng.randint(-20, 190), rng.randint(width - 210, width + 20)])
        y = rng.randint(int(height * 0.22), int(height * 0.8))
        fdraw.ellipse(
            (x - radius, y - radius, x + radius, y + radius),
            fill=(55 + rng.randint(0, 30), 78 + rng.randint(0, 40), 52, rng.randint(80, 170)),
        )
    foliage = foliage.filter(ImageFilter.GaussianBlur(11))
    image.paste(foliage, (0, 0), foliage)
    return image


def _gallery(size: tuple[int, int], prompt: str) -> Image.Image:
    width, height = size
    rng = random.Random(_prompt_seed(prompt))
    image = _linear_gradient(size, (241, 237, 229), (218, 210, 198))
    draw = ImageDraw.Draw(image)
    floor = int(height * 0.71)
    draw.rectangle((0, 0, width, floor), fill=(236, 232, 224))
    draw.rectangle((0, floor, width, height), fill=(191, 182, 169))
    draw.line((0, floor, width, floor), fill=(210, 203, 191), width=3)
    frames = [
        (width * 0.08, height * 0.23, width * 0.3, height * 0.49),
        (width * 0.36, height * 0.17, width * 0.58, height * 0.38),
    ]
    art_colors = [(164, 88, 61), (74, 102, 91), (216, 255, 79)]
    for index, (x1, y1, x2, y2) in enumerate(frames):
        draw.rectangle((x1, y1, x2, y2), fill=(250, 248, 240), outline=(120, 114, 102), width=3)
        draw.rectangle(
            (x1 + 14, y1 + 14, x2 - 14, y2 - 14),
            fill=art_colors[index % len(art_colors)],
        )
    # warm pool of light
    light = Image.new("RGBA", size, (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(light)
    ldraw.ellipse(
        (width * 0.42, height * 0.32, width * 0.93, height * 0.95),
        fill=(255, 250, 231, 100),
    )
    light = light.filter(ImageFilter.GaussianBlur(130))
    image.paste(light, (0, 0), light)
    _bokeh(image, rng, 8, (255, 250, 230))
    return image


def _sea(size: tuple[int, int], prompt: str) -> Image.Image:
    width, height = size
    rng = random.Random(_prompt_seed(prompt))
    image = _linear_gradient(size, (154, 190, 209), (246, 217, 184))
    draw = ImageDraw.Draw(image)
    horizon = int(height * 0.67)
    draw.rectangle((0, horizon, width, height), fill=(77, 117, 133))
    sun_x = width * rng.uniform(0.3, 0.7)
    sun_y = horizon * rng.uniform(0.35, 0.6)
    for radius, alpha in [(160, 22), (95, 32), (50, 70)]:
        glow = Image.new("RGBA", size, (0, 0, 0, 0))
        gdraw = ImageDraw.Draw(glow)
        gdraw.ellipse(
            (sun_x - radius, sun_y - radius, sun_x + radius, sun_y + radius),
            fill=(255, 238, 191, alpha),
        )
        glow = glow.filter(ImageFilter.GaussianBlur(24))
        image.paste(glow, (0, 0), glow)
    draw.ellipse(
        (sun_x - 28, sun_y - 28, sun_x + 28, sun_y + 28),
        fill=(255, 245, 205),
    )
    # water shimmer
    for _ in range(90):
        x = rng.randint(0, width)
        y = rng.randint(horizon + 4, height)
        length = rng.randint(10, 80)
        draw.line(
            (x, y, x + length, y),
            fill=tuple(min(255, channel + 28) for channel in (77, 117, 133)),
            width=1,
        )
    return image


def _greenery(size: tuple[int, int], prompt: str) -> Image.Image:
    width, height = size
    rng = random.Random(_prompt_seed(prompt))
    image = _linear_gradient(size, (197, 212, 183), (78, 103, 73))
    foliage = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(foliage)
    for _ in range(56):
        radius = rng.randint(26, 120)
        x = rng.randint(-30, width + 30)
        y = rng.randint(-40, height + 40)
        green = (
            28 + rng.randint(0, 55),
            55 + rng.randint(0, 70),
            36 + rng.randint(0, 40),
            rng.randint(60, 170),
        )
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=green)
    foliage = foliage.filter(ImageFilter.GaussianBlur(30))
    image.paste(foliage, (0, 0), foliage)
    light = Image.new("RGBA", size, (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(light)
    ldraw.polygon(
        [(width * 0.18, 0), (width * 0.47, 0), (width * 0.7, height), (width * 0.34, height)],
        fill=(255, 246, 209, 45),
    )
    light = light.filter(ImageFilter.GaussianBlur(60))
    image.paste(light, (0, 0), light)
    return image


def _interior(size: tuple[int, int], prompt: str) -> Image.Image:
    width, height = size
    rng = random.Random(_prompt_seed(prompt))
    image = _linear_gradient(size, (225, 211, 193), (164, 132, 101))
    draw = ImageDraw.Draw(image)
    floor = int(height * 0.7)
    draw.rectangle((0, 0, width, floor), fill=(231, 220, 204))
    draw.rectangle((0, floor, width, height), fill=(154, 119, 84))
    for row in range(floor, height + 40, 44):
        draw.line((0, row, width, row), fill=(127, 96, 68), width=2)
    draw.line((0, floor, width, floor), fill=(181, 164, 141), width=3)
    # window
    draw.rectangle(
        (width * 0.08, height * 0.15, width * 0.48, height * 0.58),
        fill=(210, 224, 224),
        outline=(127, 113, 96),
        width=4,
    )
    draw.line(
        (width * 0.28, height * 0.15, width * 0.28, height * 0.58),
        fill=(127, 113, 96),
        width=3,
    )
    # plant
    foliage = Image.new("RGBA", size, (0, 0, 0, 0))
    fdraw = ImageDraw.Draw(foliage)
    for _ in range(24):
        radius = rng.randint(18, 50)
        x = int(width * rng.uniform(0.7, 0.93))
        y = int(height * rng.uniform(0.42, 0.68))
        fdraw.ellipse(
            (x - radius, y - radius, x + radius, y + radius),
            fill=(51, 75 + rng.randint(0, 30), 52, rng.randint(120, 230)),
        )
    foliage = foliage.filter(ImageFilter.GaussianBlur(8))
    image.paste(foliage, (0, 0), foliage)
    return image


def render_scene(background_mode: str, prompt: str | None, size: tuple[int, int] = (1080, 1440)) -> Image.Image:
    """Build a photographic-feeling (but procedural) scene from the user's prompt."""
    if background_mode != "custom" or not (prompt or "").strip():
        return _studio(size)
    normalized = (prompt or "").strip().lower()
    if any(word in normalized for word in ("城市", "屋顶", "街道", "街景", "city", "rooftop", "都市")):
        image = _city(size, normalized)
    elif any(word in normalized for word in ("庭院", "混凝土", "石材", "courtyard", "concrete", "露台")):
        image = _courtyard(size, normalized)
    elif any(word in normalized for word in ("画廊", "white wall", "gallery", "展厅", "美术馆")):
        image = _gallery(size, normalized)
    elif any(word in normalized for word in ("海边", "海滩", "海", "beach", "sea", "海岸")):
        image = _sea(size, normalized)
    elif any(word in normalized for word in ("森林", "公园", "植物", "绿植", "garden", "forest", "树")):
        image = _greenery(size, normalized)
    elif any(word in normalized for word in ("室内", "木地板", "木", "interior", "室内", "咖啡")):
        image = _interior(size, normalized)
    else:
        top, middle, bottom = _palette(normalized)
        image = _linear_gradient(size, top, bottom)
        rng = random.Random(_prompt_seed(normalized))
        overlay = Image.new("RGBA", size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        for _ in range(5):
            width, height = size
            radius = rng.randint(260, 680)
            x = rng.randint(-100, width + 100)
            y = rng.randint(-100, height + 100)
            draw.ellipse(
                (x - radius, y - radius, x + radius, y + radius),
                fill=(*middle, rng.randint(18, 48)),
            )
        overlay = overlay.filter(ImageFilter.GaussianBlur(80))
        image.paste(overlay, (0, 0), overlay)
        _bokeh(image, rng, 22, (255, 244, 219))

    image = image.filter(ImageFilter.GaussianBlur(3.2))
    _vignette(image)
    return image


def compose_person(
    scene: Image.Image,
    person_source: Image.Image | None,
    *,
    person_rect: tuple[int, int, int, int] | None = None,
) -> Image.Image:
    """Place the isolated person (or a framed photo) into the scene.

    person_rect allows a graceful rectangle fallback when segmentation is not
    available, preserving the custom background anyway.
    """
    canvas = scene.convert("RGBA")
    width, height = canvas.size
    if person_source is not None and person_source.mode == "RGBA":
        cutout = person_source.copy()
        bbox = cutout.getchannel("A").getbbox()
        if bbox:
            cutout = cutout.crop(bbox)
            target_height = int(height * 0.64)
            scale = target_height / cutout.height
            if cutout.width * scale > width * 0.56:
                scale = (width * 0.56) / cutout.width
            target_size = (
                max(1, int(cutout.width * scale)),
                max(1, int(cutout.height * scale)),
            )
            cutout = cutout.resize(target_size, Image.Resampling.LANCZOS)
            x = int(width * 0.64 - target_size[0] / 2)
            bottom = int(height * 0.735)
            y = bottom - target_size[1]
            shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            sdraw = ImageDraw.Draw(shadow)
            sdraw.ellipse(
                (
                    x + target_size[0] * 0.12,
                    bottom - 18,
                    x + target_size[0] * 0.88,
                    bottom + 24,
                ),
                fill=(10, 10, 8, 120),
            )
            shadow = shadow.filter(ImageFilter.GaussianBlur(20))
            canvas.alpha_composite(shadow)
            canvas.alpha_composite(cutout, (x, y))
            return canvas.convert("RGB")

    if person_source is not None:
        # Framed but still real: show the person, while the prompt-driven scene
        # remains visible around them.
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

    return canvas.convert("RGB")
