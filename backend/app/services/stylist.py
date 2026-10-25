"""Deterministic styling engine that works with or without Gemini.

The atelier planner is the reliability floor: it always produces a safe,
weather-aware combination from what the user actually owns. Gemini, when
configured, is layered on top for more nuanced styling copy and choices.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from itertools import product
from typing import Any, Iterable

from app.db.models import WardrobeItem
from app.schemas.recommendation import WeatherSnapshot
from app.schemas.wardrobe import CATEGORY_LABELS
from app.services.weather import season_for_date, temperature_band

ROLE_LABELS = {
    "top": "Top",
    "bottom": "Bottom",
    "dress": "Dress / Jumpsuit",
    "outerwear": "Outerwear",
    "shoes": "Shoes",
    "bag": "Bag",
    "accessory": "Accessory",
}

CATEGORY_ORDER = ["outerwear", "dress", "top", "bottom", "shoes", "bag", "accessory"]

OCCASION_LABELS = {
    "everyday": "Everyday",
    "work": "Work",
    "interview": "Interview",
    "date": "Date",
    "dinner": "Dinner",
    "party": "Party",
    "formal": "Formal occasion",
    "travel": "Travel",
    "outdoor": "Outdoor",
    "sport": "Sport",
    "study": "Campus",
    "lounge": "At home",
}


@dataclass(frozen=True)
class OccasionProfile:
    label: str
    formality: float
    tags: tuple[str, ...]
    outdoor: bool = False
    active: bool = False
    priority: str = "overall proportion and comfort"


OCCASIONS: dict[str, OccasionProfile] = {
    "everyday": OccasionProfile(
        "Everyday",
        2.6,
        ("casual", "minimal", "everyday", "休闲", "极简", "日常"),
        priority="effortless but complete",
    ),
    "work": OccasionProfile(
        "Work",
        3.5,
        ("work", "polished", "minimal", "business", "通勤", "利落", "极简", "商务"),
        priority="a clean, professional line",
    ),
    "interview": OccasionProfile(
        "Interview",
        4.1,
        ("business", "polished", "minimal", "formal", "商务", "利落", "极简", "正式"),
        priority="a trustworthy first impression",
    ),
    "date": OccasionProfile(
        "Date",
        3.1,
        ("elegant", "romantic", "minimal", "french", "优雅", "浪漫", "极简", "法式"),
        priority="relaxed polish",
    ),
    "dinner": OccasionProfile(
        "Dinner",
        3.6,
        ("elegant", "refined", "minimal", "french", "优雅", "精致", "极简", "法式"),
        priority="texture under evening light",
    ),
    "party": OccasionProfile(
        "Party",
        3.9,
        ("statement", "party", "elegant", "edgy", "吸睛", "派对", "优雅", "前卫"),
        priority="a silhouette with a memorable detail",
    ),
    "formal": OccasionProfile(
        "Formal occasion",
        4.6,
        ("formal", "elegant", "classic", "business", "正式", "优雅", "经典", "商务"),
        priority="gravitas and a precise fit",
    ),
    "travel": OccasionProfile(
        "Travel",
        2.2,
        ("casual", "comfortable", "technical", "sport", "休闲", "舒适", "机能", "运动"),
        priority="comfort over long hours of movement",
    ),
    "outdoor": OccasionProfile(
        "Outdoor",
        1.8,
        ("outdoor", "technical", "sport", "casual", "户外", "机能", "运动", "休闲"),
        outdoor=True,
        active=True,
        priority="protection and freedom of movement",
    ),
    "sport": OccasionProfile(
        "Sport",
        1.3,
        ("sport", "technical", "casual", "运动", "机能", "休闲"),
        active=True,
        priority="breathability and range of motion",
    ),
    "study": OccasionProfile(
        "Campus",
        2.2,
        ("casual", "minimal", "preppy", "休闲", "极简", "学院"),
        priority="ease and durability",
    ),
    "lounge": OccasionProfile(
        "At home",
        1.2,
        ("lounge", "comfortable", "casual", "居家", "舒适", "休闲"),
        priority="softness and relaxation",
    ),
}

KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("面试", "面谈", "求职", "复试", "interview"), "interview"),
    (
        ("婚礼", "典礼", "颁奖", "葬礼", "晚宴", "正式", "年会", "wedding", "ceremony", "gala", "funeral", "awards"),
        "formal",
    ),
    (
        ("上班", "通勤", "会议", "汇报", "商务", "办公", "见客户", "office", "commute", "meeting", "presentation", "business", "client"),
        "work",
    ),
    (("约会", "date", "咖啡", "看展", "见面", "coffee", "gallery"), "date"),
    (("晚餐", "dinner", "餐厅", "小酒馆", "聚餐", "restaurant"), "dinner"),
    (("派对", "party", "生日", "酒吧", "livehouse", "音乐节", "birthday", "bar", "concert", "festival"), "party"),
    (("徒步", "露营", "爬山", "户外", "郊游", "公园", "海边", "hike", "hiking", "camping", "outdoor", "park", "beach"), "outdoor"),
    (("跑步", "健身", "运动", "瑜伽", "球", "骑行", "run", "running", "gym", "workout", "yoga", "cycling", "sport"), "sport"),
    (("出差", "旅行", "旅游", "度假", "飞机", "高铁", "机场", "travel", "trip", "vacation", "flight", "airport", "train"), "travel"),
    (("上课", "校园", "图书馆", "自习", "学校", "class", "campus", "library", "study", "school"), "study"),
    (("居家", "在家", "宅", "楼下", "home", "lounge", "relax"), "lounge"),
]


NEUTRAL_KEYWORDS = {
    "黑",
    "白",
    "灰",
    "米",
    "奶油",
    "驼",
    "海军蓝",
    "牛仔",
    "炭",
    "裸",
    "沙",
    "black",
    "white",
    "grey",
    "gray",
    "ivory",
    "cream",
    "camel",
    "navy",
    "denim",
    "charcoal",
    "blush",
    "sand",
    "neutral",
}


@dataclass
class OutfitPlan:
    title: str
    rationale: str
    styling_note: str
    score: int
    items: list[WardrobeItem]
    roles: dict[str, str]
    missing_categories: list[str]
    warnings: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class PlanResult:
    outfits: list[OutfitPlan]
    scenario_note: str
    warnings: list[dict[str, Any]]
    shopping_suggestions: list[dict[str, Any]]
    status: str
    forced_item_ids: list[str]


def infer_occasion_type(occasion: str) -> str:
    text = occasion.lower()
    for keywords, occasion_type in KEYWORDS:
        if any(keyword in text for keyword in keywords):
            return occasion_type
    return "everyday"


def _item_score(
    item: WardrobeItem,
    *,
    target_formality: float,
    target_warmth: int,
    season: str,
    style_tags: Iterable[str],
    colors_seen: list[str] | None = None,
) -> float:
    score = 40.0
    score -= abs(item.formality - target_formality) * 7.0
    score -= abs(item.warmth - target_warmth) * 4.5
    if item.seasons and season not in item.seasons:
        score -= 9.0
    overlaps = set(item.style_tags or []) & set(style_tags)
    score += min(len(overlaps) * 3.5, 10.5)
    if item.favorite:
        score += 3.0
    if item.force_include:
        score += 40.0
    color = item.color_name or ""
    if any(token in color for token in NEUTRAL_KEYWORDS):
        score += 2.5
    if colors_seen and color and color not in colors_seen:
        score += 1.0
    return score


def _target_warmth(apparent: float, category: str) -> int:
    _, low, high = temperature_band(apparent)
    target = round((low + high) / 2)
    if category == "outerwear":
        if apparent >= 18:
            return 1
        if apparent >= 10:
            return 2
        if apparent >= 2:
            return 3
        return 4
    if category == "shoes":
        if apparent <= 4:
            return 4
        if apparent <= 12:
            return 3
        if apparent >= 27:
            return 1
        return 2
    return max(1, min(5, target))


def _needs_outerwear(weather: WeatherSnapshot) -> bool:
    return weather.apparent_temp < 18 or (
        weather.precipitation_probability >= 55 and weather.apparent_temp < 24
    )


def _needs_rain_shoes(weather: WeatherSnapshot) -> bool:
    return weather.precipitation_probability >= 55


def _color_story(items: list[WardrobeItem]) -> str:
    non_neutral = [
        item.color_name
        for item in items
        if item.color_name and not any(token in item.color_name for token in NEUTRAL_KEYWORDS)
    ]
    if non_neutral:
        return non_neutral[0]
    for item in items:
        if item.category in {"top", "dress"}:
            return item.color_name or "Neutral"
    return "Neutral"


TITLE_PATTERNS = (
    ("Quiet", "Prelude", "Silhouette"),
    ("Still", "Layers", "Study"),
    ("City", "Glow", "Walk"),
    ("Soft", "Structure", "Daily"),
    ("Low", "Lines", "Moment"),
    ("Morning", "Rhythm", "Brief"),
)


def _title_for(index: int, items: list[WardrobeItem], occasion: str) -> str:
    color = _color_story(items)
    cleaned = color.replace("色", "").replace("纯", "").replace("雾", "").strip()
    color_token = cleaned.split()[0].capitalize() if cleaned else "Neutral"
    first, second, third = TITLE_PATTERNS[index % len(TITLE_PATTERNS)]
    if index == 0:
        return f"{color_token} {second}"
    if index == 1:
        return f"{first} {third}"
    return f"{first} {second}"


def _fit_note(user: dict[str, Any]) -> str:
    fit = user.get("fit_preference") or "regular"
    height = user.get("height_cm") or 0
    shape = (user.get("body_shape") or "").lower()
    notes: list[str] = []
    if fit == "tailored":
        notes.append("sharp shoulders and a fitted waist give the look lift")
    elif fit == "relaxed":
        notes.append("keep one point of definition inside the relaxed volume so it doesn't swallow you")
    else:
        notes.append("leave a little room so movement and proportion both feel natural")

    if height and height < 165:
        notes.append("a higher waist and a visible ankle shift the balance upward")
    elif height and height >= 180:
        notes.append("tonal layering stretches the vertical line")
    if "梨" in shape or "pear" in shape:
        notes.append("add a little structure on top and keep the bottom straight to balance shoulders and hips")
    elif "苹果" in shape or "圆" in shape or "apple" in shape or "round" in shape:
        notes.append("a V neck and a vertically open jacket feel lighter")
    elif "倒三角" in shape or "inverted triangle" in shape:
        notes.append("keep a little volume in the bottom and clean lines on top")
    elif "沙漏" in shape or "hourglass" in shape:
        notes.append("define the waist without pulling it tight to highlight your natural line")
    return notes[0][:1].upper() + notes[0][1:] + "".join(
        "; " + note for note in notes[1:]
    ) + "."


def _weather_phrase(weather: WeatherSnapshot) -> str:
    feel, _, _ = temperature_band(weather.apparent_temp)
    return f"{weather.condition.lower()}, with a feels-like temperature of about {weather.apparent_temp:.0f}°C ({feel.lower()})"


def _item_label(item: WardrobeItem) -> str:
    """Avoid repeating the colour when the item name already contains it."""
    color = (item.color_name or "").strip()
    name = item.name.lower()
    tokens = {color.lower(), color.replace("色", "").lower()}
    if any(token and token in name for token in tokens):
        return item.name
    return f"{color} {item.name}" if color else item.name


def _rationale(
    items: list[WardrobeItem],
    weather: WeatherSnapshot,
    occasion: str,
    profile: OccasionProfile,
    user: dict[str, Any],
    index: int,
) -> str:
    base = next(
        (item for item in items if item.category in {"dress", "top"}), items[0] if items else None
    )
    shoes = next((item for item in items if item.category == "shoes"), None)
    lead = f"Tomorrow: {_weather_phrase(weather)}. "
    if base and shoes:
        core = f"Built around the {_item_label(base)} and the {_item_label(shoes)}, "
    elif base:
        core = f"Built around the {_item_label(base)}, "
    else:
        core = ""
    occasion_line = (
        f"the priority is {profile.priority} for this {profile.label.lower()} occasion. "
        if index == 0
        else f"it answers the same need for {profile.priority} in a different way. "
    )
    return lead + core + occasion_line + _fit_note(user)


def _styling_note(items: list[WardrobeItem], profile: OccasionProfile) -> str:
    top = next((item for item in items if item.category == "top"), None)
    bottom = next((item for item in items if item.category == "bottom"), None)
    dress = next((item for item in items if item.category == "dress"), None)
    outer = next((item for item in items if item.category == "outerwear"), None)
    bag = next((item for item in items if item.category == "bag"), None)
    shoes = next((item for item in items if item.category == "shoes"), None)
    accessory = next((item for item in items if item.category == "accessory"), None)
    if dress:
        shoe_line = (
            f"keep the {shoes.color_name} shoes clean, "
            if shoes
            else ""
        )
        return (
            f"The {dress.name} already carries enough presence; {shoe_line}"
            "let the bag be the only accent and skip extra accessories."
        )
    if outer and top:
        return (
            f"Wear the {outer.name} open so the {top.name} neckline creates one long "
            "vertical line; half a centimetre of cuff showing feels lighter."
        )
    if top and bottom:
        if bag:
            return (
                f"Tuck the front of the {top.name} lightly into the {bottom.name}, make "
                f"the {bag.name} the only pop of colour, and keep everything else restrained."
            )
        return (
            f"Tuck the front of the {top.name} lightly into the {bottom.name}; the waist "
            "reads clearly without being pulled tight."
        )
    if bag and shoes:
        return f"Let the {bag.name} carry the only colour and keep the {shoes.color_name} shoes restrained."
    if bag:
        return f"Make the {bag.name} the single focal point of the look."
    if accessory:
        return f"Use the {accessory.name} as the final touch and let everything else stay quiet."
    if profile.active:
        return "Prioritise freedom of movement: no bunching at the cuffs or hem, and lace the shoes securely."
    return "Keep the palette to three colours or fewer and use texture, not extra decoration, for interest."


def _weather_warnings(weather: WeatherSnapshot, profile: OccasionProfile) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    if weather.apparent_temp <= 2:
        warnings.append(
            {
                "code": "severe_cold",
                "message": f"It feels like only {weather.apparent_temp:.0f}°C. Prioritise warmth: add a thermal base layer and choose shoes that cover the ankle.",
                "severity": "warning",
            }
        )
    elif weather.apparent_temp >= 33:
        warnings.append(
            {
                "code": "severe_heat",
                "message": f"It feels like about {weather.apparent_temp:.0f}°C. Skip heavy fabrics and favour breathable, light-coloured, relaxed silhouettes.",
                "severity": "warning",
            }
        )
    if weather.precipitation_probability >= 55:
        warnings.append(
            {
                "code": "rain",
                "message": f"{weather.precipitation_probability}% chance of precipitation. Avoid suede and canvas shoes, and carry a lightweight umbrella.",
                "severity": "warning" if weather.precipitation_probability >= 75 else "info",
            }
        )
    if weather.wind_speed >= 35:
        warnings.append(
            {
                "code": "wind",
                "message": f"Gusts up to about {weather.wind_speed:.0f} km/h. Have a backup for skirts or wide-brim hats, and choose a coat with a collar that can be closed.",
                "severity": "info",
            }
        )
    if profile.outdoor and (
        weather.precipitation_probability >= 70
        or weather.apparent_temp >= 35
        or weather.apparent_temp <= -5
        or weather.wind_speed >= 45
    ):
        warnings.append(
            {
                "code": "unsuitable_outdoor_scenario",
                "message": "This outdoor plan doesn't suit tomorrow's weather. Prepare an indoor alternative or adjust the timing; the looks below are still built for protection.",
                "severity": "critical",
            }
        )
    if profile.formality >= 4.2 and weather.apparent_temp >= 30:
        warnings.append(
            {
                "code": "formal_heat",
                "message": "Formalwear in high heat: favour unlined tailoring, silk or high-twist cotton shirts, and keep accessories light.",
                "severity": "info",
            }
        )
    return warnings


def _shopping_gaps(
    items: list[WardrobeItem],
    weather: WeatherSnapshot,
    profile: OccasionProfile,
    missing_categories: list[str],
) -> list[dict[str, Any]]:
    available = [item for item in items if item.available]
    categories = {item.category for item in available}
    suggestions: list[dict[str, Any]] = []

    def add(
        category: str,
        title: str,
        reason: str,
        priority: str,
        query: str,
    ) -> None:
        if any(item["category"] == category and item["title"] == title for item in suggestions):
            return
        suggestions.append(
            {
                "category": category,
                "title": title,
                "reason": reason,
                "priority": priority,
                "search_query": query,
            }
        )

    if "top" in missing_categories and "top" not in categories and "dress" not in categories:
        add(
            "top",
            "A cleanly tailored basic top",
            f"A {profile.label.lower()} occasion needs a top that can anchor a look; "
            "white, cream or charcoal combine most easily with what you own.",
            "high",
            "basic tailored shirt top neutral",
        )
    if "bottom" in missing_categories and "bottom" not in categories and "dress" not in categories:
        add(
            "bottom",
            "Straight-leg trousers with drape",
            "Straight-leg trousers complete the lower half and connect easily with your existing tops and shoes.",
            "high",
            "drape high-waist straight-leg trousers work",
        )
    if "dress" in missing_categories and "dress" not in categories:
        add(
            "dress",
            "A simple tailored dress",
            f"A {profile.label.lower()} occasion benefits from a one-piece option that reduces styling effort.",
            "medium",
            "minimal tailored dress formal",
        )
    if "shoes" in missing_categories or "shoes" not in categories:
        add(
            "shoes",
            "Leather loafers you can walk in all day",
            "Shoes are the foundation of a complete look; neutral leather works for both workdays and weekends.",
            "high",
            "neutral leather loafers work",
        )
    if profile.formality >= 4 and not any(
        item.formality >= 4 for item in available
    ):
        add(
            "outerwear",
            "Dark unlined blazer",
            f"A {profile.label.lower()} occasion calls for clearer formality; this instantly sharpens the upper body.",
            "high",
            "dark unlined blazer formal",
        )
        add(
            "bottom",
            "Drapey straight-leg suit trousers",
            "Paired with your existing tops, these create the clean vertical line a formal occasion needs.",
            "medium",
            "high-waist drape straight-leg trousers",
        )
    if _needs_outerwear(weather) and "outerwear" not in categories:
        add(
            "outerwear",
            "Lightweight windproof layer",
            f"Feels like {weather.apparent_temp:.0f}°C, so a thin coat that can be closed covers the morning-to-evening swing.",
            "high",
            "lightweight windproof layer jacket",
        )
    available_shoes = [item for item in available if item.category == "shoes"]
    if (
        profile.formality >= 3.8
        and available_shoes
        and max(item.formality for item in available_shoes) < 3
    ):
        add(
            "shoes",
            "Leather shoes or strappy heels for formal occasions",
            f"Your current shoes aren't formal enough for a {profile.label.lower()} occasion; a clean pair of leather shoes closes the gap instantly.",
            "high",
            "formal leather shoes strappy heels",
        )
    if _needs_rain_shoes(weather):
        add(
            "shoes",
            "Waterproof boots or rubber-soled loafers",
            f"{weather.precipitation_probability}% chance of precipitation; a waterproof sole is more effective than changing the whole outfit.",
            "medium",
            "waterproof boots rubber sole",
        )
    if weather.apparent_temp >= 30 and not any(
        item.warmth <= 2 for item in available
    ):
        add(
            "top",
            "Loose linen or high-twist cotton shirt",
            "Hot days need a genuinely breathable top that works with your existing bottoms.",
            "high",
            "linen high-twist cotton loose shirt",
        )
    if weather.apparent_temp <= 5 and not any(item.warmth >= 4 for item in available):
        add(
            "outerwear",
            "Wool-blend long coat",
            "Your wardrobe lacks a layer that truly handles the cold; a long coat protects both warmth and line.",
            "high",
            "wool blend long coat winter",
        )
    if profile.active and not any(
        {"sport", "technical", "outdoor", "运动", "机能", "户外"}
        & set(item.style_tags or [])
        for item in available
    ):
        add(
            "shoes",
            "Lightweight trainers with good grip",
            "For active plans, prioritise sole support and slip resistance over looks.",
            "medium",
            "lightweight non-slip trainers outdoor",
        )
    return suggestions[:4]


def _build_candidate(
    base_items: list[WardrobeItem],
    all_items: list[WardrobeItem],
    *,
    weather: WeatherSnapshot,
    profile: OccasionProfile,
    season: str,
    forced_ids: set[str],
) -> tuple[list[WardrobeItem], float, list[str]]:
    selected = list(base_items)
    selected_ids = {item.id for item in selected}
    warnings: list[str] = []

    outerwear_forced = [
        item
        for item in all_items
        if item.id in forced_ids and item.category == "outerwear"
    ]
    if outerwear_forced:
        for item in outerwear_forced:
            if item.id not in selected_ids:
                selected.append(item)
                selected_ids.add(item.id)
    elif _needs_outerwear(weather):
        candidates = [
            item
            for item in all_items
            if item.category == "outerwear" and item.id not in selected_ids
        ]
        if candidates:
            best = max(
                candidates,
                key=lambda item: _item_score(
                    item,
                    target_formality=profile.formality,
                    target_warmth=_target_warmth(weather.apparent_temp, "outerwear"),
                    season=season,
                    style_tags=profile.tags,
                ),
            )
            selected.append(best)
            selected_ids.add(best.id)

    for category in ("bag", "accessory"):
        forced = [item for item in all_items if item.id in forced_ids and item.category == category]
        pool = forced or [item for item in all_items if item.category == category]
        if not pool:
            continue
        candidates = [item for item in pool if item.id not in selected_ids]
        if not candidates:
            continue
        if forced or category == "bag":
            best = max(
                candidates,
                key=lambda item: _item_score(
                    item,
                    target_formality=profile.formality,
                    target_warmth=_target_warmth(weather.apparent_temp, category),
                    season=season,
                    style_tags=profile.tags,
                ),
            )
            selected.append(best)
            selected_ids.add(best.id)
            if category == "accessory" and not forced:
                break

    score = sum(
        _item_score(
            item,
            target_formality=profile.formality,
            target_warmth=_target_warmth(weather.apparent_temp, item.category),
            season=season,
            style_tags=profile.tags,
        )
        for item in selected
    )
    # Reward a coherent, restrained palette.
    colors = [item.color_name for item in selected if item.color_name]
    if len(set(colors)) > 3:
        score -= (len(set(colors)) - 3) * 6
    if any(item.force_include for item in selected):
        score += 15

    categories = {item.category for item in selected}
    missing: list[str] = []
    if not categories & {"dress", "top"}:
        missing.append("top")
    if "dress" not in categories and "bottom" not in categories:
        missing.append("bottom")
    if "shoes" not in categories:
        missing.append("shoes")
    if _needs_outerwear(weather) and "outerwear" not in categories:
        missing.append("outerwear")

    for item in selected:
        if abs(item.formality - profile.formality) >= 1.6:
            warnings.append(
                f"{item.name} sits a little away from the formality of a {profile.label.lower()} occasion; colour and accessories will pull it together."
            )
    return selected, score, warnings


def _validate_forced(
    items: list[WardrobeItem],
    forced_ids: list[str],
    profile: OccasionProfile,
    weather: WeatherSnapshot,
) -> tuple[list[dict[str, Any]], set[str]]:
    warnings: list[dict[str, Any]] = []
    by_id = {item.id: item for item in items}
    active_forced: set[str] = set()
    for item_id in forced_ids:
        item = by_id.get(item_id)
        if item is None:
            continue
        if not item.available:
            warnings.append(
                {
                    "code": "forced_unavailable",
                    "message": f"{item.name} is marked unavailable, so it was not forced into this look. Make it available and try again.",
                    "severity": "warning",
                }
            )
            continue
        active_forced.add(item_id)
        if abs(item.formality - profile.formality) >= 1.8:
            warnings.append(
                {
                    "code": "forced_formality_conflict",
                    "message": f"The always-wear {item.name} and a {profile.label.lower()} occasion are not quite aligned on formality; the styling uses colour and layering to bridge the gap.",
                    "severity": "warning",
                }
            )
        if item.warmth >= 4 and weather.apparent_temp >= 27:
            warnings.append(
                {
                    "code": "forced_heat_conflict",
                    "message": f"{item.name} is on the heavy side for a feels-like {weather.apparent_temp:.0f}°C day; wear it only briefly as an outer layer or switch to something lighter.",
                    "severity": "warning",
                }
            )
        if item.warmth <= 2 and weather.apparent_temp <= 6:
            warnings.append(
                {
                    "code": "forced_cold_conflict",
                    "message": f"{item.name} is light for these temperatures; layer a base underneath or you may feel cold.",
                    "severity": "warning",
                }
            )
    return warnings, active_forced


def plan_outfits(
    items: list[WardrobeItem],
    user: dict[str, Any],
    weather: WeatherSnapshot,
    occasion: str,
    occasion_type: str,
    forced_ids: list[str],
    outfit_count: int = 3,
) -> PlanResult:
    profile = OCCASIONS.get(occasion_type, OCCASIONS["everyday"])
    season = season_for_date(weather.date)
    available = [item for item in items if item.available]
    forced_ids = list(dict.fromkeys(forced_ids))

    warnings, active_forced = _validate_forced(items, forced_ids, profile, weather)
    warnings.extend(_weather_warnings(weather, profile))

    forced_by_category: dict[str, list[WardrobeItem]] = {}
    for item in available:
        if item.id in active_forced:
            forced_by_category.setdefault(item.category, []).append(item)

    tops = [item for item in available if item.category == "top"]
    bottoms = [item for item in available if item.category == "bottom"]
    dresses = [item for item in available if item.category == "dress"]
    shoes = [item for item in available if item.category == "shoes"]

    forced_dress = forced_by_category.get("dress", [])
    forced_top = forced_by_category.get("top", [])
    forced_bottom = forced_by_category.get("bottom", [])
    forced_shoes = forced_by_category.get("shoes", [])

    if forced_dress and (forced_top or forced_bottom):
        warnings.append(
            {
                "code": "forced_layering_conflict",
                "message": "You marked both a dress and a top/bottom as always-wear. They rarely work as one complete look, so the dress option takes priority here.",
                "severity": "warning",
            }
        )
        forced_top = []
        forced_bottom = []

    if forced_top:
        tops = [item for item in tops if item.id in {entry.id for entry in forced_top}]
    if forced_bottom:
        bottoms = [item for item in bottoms if item.id in {entry.id for entry in forced_bottom}]
    if forced_shoes:
        shoes = [item for item in shoes if item.id in {entry.id for entry in forced_shoes}]
    if forced_dress:
        dresses = [item for item in dresses if item.id in {entry.id for entry in forced_dress}]
        tops, bottoms = [], []

    candidates: list[tuple[list[WardrobeItem], float, list[str]]] = []

    if dresses and shoes:
        for dress, shoe in product(dresses[:8], shoes[:6]):
            candidates.append(
                _build_candidate(
                    [dress, shoe],
                    available,
                    weather=weather,
                    profile=profile,
                    season=season,
                    forced_ids=active_forced,
                )
            )
    if tops and bottoms and shoes:
        top_pool = sorted(
            tops,
            key=lambda item: _item_score(
                item,
                target_formality=profile.formality,
                target_warmth=_target_warmth(weather.apparent_temp, "top"),
                season=season,
                style_tags=profile.tags,
            ),
            reverse=True,
        )[:8]
        bottom_pool = sorted(
            bottoms,
            key=lambda item: _item_score(
                item,
                target_formality=profile.formality,
                target_warmth=_target_warmth(weather.apparent_temp, "bottom"),
                season=season,
                style_tags=profile.tags,
            ),
            reverse=True,
        )[:8]
        shoe_pool = sorted(
            shoes,
            key=lambda item: _item_score(
                item,
                target_formality=profile.formality,
                target_warmth=_target_warmth(weather.apparent_temp, "shoes"),
                season=season,
                style_tags=profile.tags,
            ),
            reverse=True,
        )[:6]
        for top, bottom, shoe in product(top_pool, bottom_pool, shoe_pool):
            candidates.append(
                _build_candidate(
                    [top, bottom, shoe],
                    available,
                    weather=weather,
                    profile=profile,
                    season=season,
                    forced_ids=active_forced,
                )
            )

    # If there is no complete base, build best-effort partial looks so the UI
    # can name the exact gap instead of failing silently.
    if not candidates:
        base_pool: list[WardrobeItem] = []
        if dresses:
            base_pool = [[dresses[0]]]
        elif tops and bottoms:
            base_pool = [[tops[0], bottoms[0]]]
        elif tops:
            base_pool = [[tops[0]]]
        elif bottoms:
            base_pool = [[bottoms[0]]]
        elif shoes:
            base_pool = [[shoes[0]]]
        base_pool = [entry for entry in base_pool if isinstance(entry, list)]
        for entry in base_pool:
            candidates.append(
                _build_candidate(
                    entry,
                    available,
                    weather=weather,
                    profile=profile,
                    season=season,
                    forced_ids=active_forced,
                )
            )

    if not candidates:
        warnings.append(
            {
                "code": "empty_wardrobe",
                "message": "There isn't a complete combination in your wardrobe yet. Add a top, a bottom and shoes and we can start styling.",
                "severity": "critical",
            }
        )
        shopping = _shopping_gaps(items, weather, profile, ["top", "bottom", "shoes"])
        return PlanResult(
            outfits=[],
            scenario_note=f"Understood “{occasion}” as a {profile.label.lower()} occasion; let's fill the basic gaps in your wardrobe first.",
            warnings=warnings,
            shopping_suggestions=shopping,
            status="wardrobe_gap",
            forced_item_ids=list(active_forced),
        )

    # Greedy selection with a diversity penalty: three near-identical swaps
    # are not three recommendations. Distinct tops, colour stories and
    # silhouettes are preferred over a marginally higher base score.
    candidates.sort(key=lambda candidate: candidate[1], reverse=True)
    remaining = list(candidates)
    chosen: list[tuple[list[WardrobeItem], float, list[str]]] = []
    chosen_color_stories: set[str] = set()
    while remaining and len(chosen) < outfit_count:
        best_index = 0
        best_adjusted = float("-inf")
        for index, candidate in enumerate(remaining):
            candidate_items, base_score, _ = candidate
            candidate_ids = {item.id for item in candidate_items}
            if not candidate_ids:
                continue
            adjusted = base_score
            if chosen:
                max_overlap = max(
                    len(candidate_ids & {item.id for item in existing[0]}) / len(candidate_ids)
                    for existing in chosen
                )
                adjusted -= max_overlap * 58
            color_story = _color_story(candidate_items)
            if color_story in chosen_color_stories:
                adjusted -= 9
            if adjusted > best_adjusted:
                best_adjusted = adjusted
                best_index = index
        candidate = remaining.pop(best_index)
        candidate_ids = {item.id for item in candidate[0]}
        if any(candidate_ids == {item.id for item in existing[0]} for existing in chosen):
            continue
        chosen.append(candidate)
        chosen_color_stories.add(_color_story(candidate[0]))

    outfits: list[OutfitPlan] = []
    for index, (selected, raw_score, outfit_warnings) in enumerate(chosen):
        selected.sort(key=lambda item: CATEGORY_ORDER.index(item.category))
        roles = {item.id: ROLE_LABELS.get(item.category, item.category) for item in selected}
        categories = {item.category for item in selected}
        missing = []
        if not categories & {"top", "dress"}:
            missing.append("top")
        if "dress" not in categories and "bottom" not in categories:
            missing.append("bottom")
        if "shoes" not in categories:
            missing.append("shoes")
        if _needs_outerwear(weather) and "outerwear" not in categories:
            missing.append("outerwear")
        normalized_score = max(
            82, min(95, 82 + max(0, min(13, round((raw_score - 185) / 7))))
        )
        plan_warnings = [
            {"code": "styling_note", "message": message, "severity": "info"}
            for message in outfit_warnings[:2]
        ]
        for missing_category in missing:
            plan_warnings.append(
                {
                    "code": "missing_category",
                    "message": f"This look still needs {CATEGORY_LABELS.get(missing_category, missing_category).lower()}; adding it will make the outfit more complete.",
                    "severity": "warning",
                }
            )
        outfits.append(
            OutfitPlan(
                title=_title_for(index, selected, occasion),
                rationale=_rationale(selected, weather, occasion, profile, user, index),
                styling_note=_styling_note(selected, profile),
                score=normalized_score,
                items=selected,
                roles=roles,
                missing_categories=missing,
                warnings=plan_warnings,
            )
        )

    all_missing = sorted({category for outfit in outfits for category in outfit.missing_categories})
    shopping = _shopping_gaps(items, weather, profile, all_missing)
    if len(outfits) < outfit_count:
        if len(outfits) == 1:
            limited_message = (
                "Your available pieces only form one clearly different complete look. "
                "A few basic additions will open up more options."
            )
        else:
            limited_message = (
                f"Your available pieces only form {len(outfits)} clearly different complete looks. "
                "A few basic additions will open up more options."
            )
        warnings.append(
            {
                "code": "limited_wardrobe",
                "message": limited_message,
                "severity": "info",
            }
        )
    if any(item.force_include for item in items if item.available) and not active_forced:
        warnings.append(
            {
                "code": "forced_not_found",
                "message": "None of the always-wear items are available, so this selection uses everything available in your wardrobe.",
                "severity": "info",
            }
        )

    # A look needs a top/dress, a lower half and shoes to be genuinely
    # wearable. Missing outerwear is a layering caveat, not a broken outfit.
    has_complete_base = any(
        not (set(outfit.missing_categories) - {"outerwear"}) for outfit in outfits
    )
    if outfits and not has_complete_base:
        warnings.append(
            {
                "code": "no_complete_outfit",
                "message": "Your available pieces can't yet form a complete look you could walk out the door in. "
                "Add the key pieces suggested below, then generate again.",
                "severity": "critical",
            }
        )
    if not has_complete_base:
        status = "wardrobe_gap"
    elif any(outfit.missing_categories for outfit in outfits):
        status = "ready_partial"
    else:
        status = "ready"

    scenario_note = (
        f"Understood “{occasion}” as a {profile.label.lower()} occasion. "
        f"Tomorrow: {_weather_phrase(weather)}. "
        f"The styling prioritises {profile.priority} and draws only on items available in your wardrobe."
    )
    return PlanResult(
        outfits=outfits,
        scenario_note=scenario_note,
        warnings=warnings,
        shopping_suggestions=shopping,
        status=status,
        forced_item_ids=list(active_forced),
    )


def outfit_item_snapshot(
    item: WardrobeItem,
    *,
    role: str | None = None,
    media_token: str | None = None,
) -> dict[str, Any]:
    """Persist paths (not expiring URLs); serializers sign them per request."""
    return {
        "id": item.id,
        "name": item.name,
        "category": item.category,
        "category_label": CATEGORY_LABELS.get(item.category, item.category),
        "subcategory": item.subcategory,
        "color_name": item.color_name,
        "color_hex": item.color_hex,
        "image_path": item.image_path,
        "thumbnail_path": item.thumbnail_path,
        "available": item.available,
        "force_include": item.force_include,
        "warmth": item.warmth,
        "formality": item.formality,
        "role": role or ROLE_LABELS.get(item.category, item.category),
    }
