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
    "top": "上装",
    "bottom": "下装",
    "dress": "连衣裙 / 连体",
    "outerwear": "外套",
    "shoes": "鞋履",
    "bag": "包袋",
    "accessory": "配饰",
}

CATEGORY_ORDER = ["outerwear", "dress", "top", "bottom", "shoes", "bag", "accessory"]

OCCASION_LABELS = {
    "everyday": "日常",
    "work": "通勤",
    "interview": "面试",
    "date": "约会",
    "dinner": "晚餐",
    "party": "派对",
    "formal": "正式场合",
    "travel": "旅行",
    "outdoor": "户外",
    "sport": "运动",
    "study": "校园",
    "lounge": "居家",
}


@dataclass(frozen=True)
class OccasionProfile:
    label: str
    formality: float
    tags: tuple[str, ...]
    outdoor: bool = False
    active: bool = False
    priority: str = "整体比例与舒适度"


OCCASIONS: dict[str, OccasionProfile] = {
    "everyday": OccasionProfile("日常", 2.6, ("休闲", "极简", "日常"), priority="轻松但完整"),
    "work": OccasionProfile("通勤", 3.5, ("通勤", "利落", "极简", "商务"), priority="利落轮廓"),
    "interview": OccasionProfile("面试", 4.1, ("商务", "利落", "极简", "正式"), priority="可信赖的第一印象"),
    "date": OccasionProfile("约会", 3.1, ("优雅", "浪漫", "极简", "法式"), priority="松弛的精致感"),
    "dinner": OccasionProfile("晚餐", 3.6, ("优雅", "精致", "极简", "法式"), priority="晚间光线下的质感"),
    "party": OccasionProfile("派对", 3.9, ("吸睛", "派对", "优雅", "前卫"), priority="有记忆点的轮廓"),
    "formal": OccasionProfile("正式典礼", 4.6, ("正式", "优雅", "经典", "商务"), priority="庄重与合身"),
    "travel": OccasionProfile("旅行", 2.2, ("休闲", "舒适", "机能", "运动"), priority="长时间移动的舒适"),
    "outdoor": OccasionProfile(
        "户外", 1.8, ("户外", "机能", "运动", "休闲"), outdoor=True, active=True, priority="防护与活动自由"
    ),
    "sport": OccasionProfile(
        "运动", 1.3, ("运动", "机能", "休闲"), active=True, priority="透气与活动幅度"
    ),
    "study": OccasionProfile("校园", 2.2, ("休闲", "极简", "学院"), priority="自在、耐穿"),
    "lounge": OccasionProfile("居家", 1.2, ("居家", "舒适", "休闲"), priority="柔软与放松"),
}

KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("面试", "面谈", "求职", "复试"), "interview"),
    (("婚礼", "典礼", "颁奖", "葬礼", "晚宴", "正式", "年会"), "formal"),
    (("上班", "通勤", "会议", "汇报", "商务", "办公", "见客户"), "work"),
    (("约会", "date", "咖啡", "看展", "见面"), "date"),
    (("晚餐", "dinner", "餐厅", "小酒馆", "聚餐"), "dinner"),
    (("派对", "party", "生日", "酒吧", "livehouse", "音乐节"), "party"),
    (("徒步", "露营", "爬山", "户外", "郊游", "公园", "海边"), "outdoor"),
    (("跑步", "健身", "运动", "瑜伽", "球", "骑行"), "sport"),
    (("出差", "旅行", "旅游", "度假", "飞机", "高铁", "机场"), "travel"),
    (("上课", "校园", "图书馆", "自习", "学校"), "study"),
    (("居家", "在家", "宅", "楼下"), "lounge"),
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
            return item.color_name or "中性色"
    return "中性色"


TITLE_PATTERNS = (
    ("留白", "序曲", "轮廓"),
    ("静默", "层次", "切片"),
    ("城市", "微光", "行走"),
    ("柔和", "结构", "日常"),
    ("低声", "线条", "时刻"),
    ("晨间", "节奏", "提案"),
)


def _title_for(index: int, items: list[WardrobeItem], occasion: str) -> str:
    color = _color_story(items)
    color_token = (
        color.replace("色", "").replace("纯", "").replace("雾", "").strip()[:2] or "中性"
    )
    first, second, third = TITLE_PATTERNS[index % len(TITLE_PATTERNS)]
    if index == 0:
        return f"{color_token}{second}"
    if index == 1:
        return f"{first}{third}"
    return f"{second}{color_token}"


def _fit_note(user: dict[str, Any]) -> str:
    fit = user.get("fit_preference") or "regular"
    height = user.get("height_cm") or 0
    shape = user.get("body_shape") or ""
    notes: list[str] = []
    if fit == "tailored":
        notes.append("用清晰肩线和合身腰线提气")
    elif fit == "relaxed":
        notes.append("松弛廓形里留一处收束，避免整体拖沓")
    else:
        notes.append("保留适度余量，动作和比例都更自然")

    if height and height < 165:
        notes.append("高腰下装和露出的脚踝把重心向上提")
    elif height and height >= 180:
        notes.append("同色系叠穿延展纵向比例")
    if "梨" in shape:
        notes.append("上装加一点结构、下装保持直线，平衡肩胯")
    elif "苹果" in shape or "圆" in shape:
        notes.append("V 领与纵向敞穿的外套会更轻盈")
    elif "倒三角" in shape:
        notes.append("下装保留一点量感，上装线条保持简洁")
    elif "沙漏" in shape:
        notes.append("收腰但不紧绷，突出天然腰线")
    return "；".join(notes) + "。"


def _weather_phrase(weather: WeatherSnapshot) -> str:
    feel, _, _ = temperature_band(weather.apparent_temp)
    return f"{weather.condition}，体感约 {weather.apparent_temp:.0f}°C，{feel}"


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
    lead = f"明天{_weather_phrase(weather)}。"
    if base and shoes:
        core = f"以{base.color_name}{base.name}配{shoes.color_name}{shoes.name}，"
    elif base:
        core = f"以{base.color_name}{base.name}为核心，"
    else:
        core = ""
    occasion_line = (
        f"把{profile.label}需要的{profile.priority}放在第一位。"
        if index == 0
        else f"换一种方式回应当天的{profile.priority}。"
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
            f"鞋履保持{shoes.color_name}的干净，"
            if shoes
            else ""
        )
        return f"{dress.name}的轮廓已经有足够分量，{shoe_line}包袋只做一处小亮点，不再叠加更多配饰。"
    if outer and top:
        return f"{outer.name}敞开穿，让{top.name}的领口形成一条纵向线；袖口露出半厘米更轻。"
    if top and bottom:
        if bag:
            return f"把{top.name}前端轻塞进{bottom.name}，让{bag.name}做唯一亮色，其他单品保持克制。"
        return f"把{top.name}前端轻塞进{bottom.name}，腰线出来但不用勒紧。"
    if bag and shoes:
        return f"让{bag.name}做唯一亮色，{shoes.color_name}的鞋履保持克制。"
    if bag:
        return f"让{bag.name}成为造型里唯一的视觉重点。"
    if accessory:
        return f"用{accessory.name}收住全身的最后一笔，其他部分不要再抢。"
    if profile.active:
        return "优先保证活动幅度，裤脚和袖口不堆叠，鞋带系紧。"
    return "全身颜色控制在三种以内，用材质差异代替更多装饰。"


def _weather_warnings(weather: WeatherSnapshot, profile: OccasionProfile) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    if weather.apparent_temp <= 2:
        warnings.append(
            {
                "code": "severe_cold",
                "message": f"体感只有 {weather.apparent_temp:.0f}°C，优先保暖：加一层贴身打底并选择覆盖脚踝的鞋履。",
                "severity": "warning",
            }
        )
    elif weather.apparent_temp >= 33:
        warnings.append(
            {
                "code": "severe_heat",
                "message": f"体感约 {weather.apparent_temp:.0f}°C，避开厚重面料，优先透气、浅色与宽松廓形。",
                "severity": "warning",
            }
        )
    if weather.precipitation_probability >= 55:
        warnings.append(
            {
                "code": "rain",
                "message": f"降水概率 {weather.precipitation_probability}%，避开麂皮与帆布鞋，随身带一把轻量伞。",
                "severity": "warning" if weather.precipitation_probability >= 75 else "info",
            }
        )
    if weather.wind_speed >= 35:
        warnings.append(
            {
                "code": "wind",
                "message": f"阵风最高约 {weather.wind_speed:.0f} km/h，裙装或宽檐帽需要备用方案，外套选有领型或可收口的款式。",
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
                "message": "这个户外场景与明天天气并不合适，建议准备室内备选或调整时间；下方造型仍按可防护的方式准备。",
                "severity": "critical",
            }
        )
    if profile.formality >= 4.2 and weather.apparent_temp >= 30:
        warnings.append(
            {
                "code": "formal_heat",
                "message": "正式着装遇上高温，优先无里衬西装、真丝或高支棉衬衫，并减少配饰厚度。",
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
            "一件剪裁干净的基础上装",
            f"「{profile.label}」需要一件可以直接作为造型起点的上装，"
            "白色、奶油或炭灰最容易与现有单品组合。",
            "high",
            "基础款 剪裁 衬衫 上装 中性色",
        )
    if "bottom" in missing_categories and "bottom" not in categories and "dress" not in categories:
        add(
            "bottom",
            "一条垂坠感直筒长裤",
            "直筒裤能补齐下半身线条，也最容易和现有上装、鞋履连成完整造型。",
            "high",
            "垂坠感 高腰 直筒 长裤 通勤",
        )
    if "dress" in missing_categories and "dress" not in categories:
        add(
            "dress",
            "一条剪裁简洁的连衣裙",
            f"「{profile.label}」需要一件一件式单品，减少搭配负担。",
            "medium",
            "剪裁 简洁 连衣裙 正式",
        )
    if "shoes" in missing_categories or "shoes" not in categories:
        add(
            "shoes",
            "一双可全天行走的皮质乐福鞋",
            "鞋履是完整造型的支点；中性色皮革能覆盖通勤与周末。",
            "high",
            "中性色 真皮 乐福鞋 通勤",
        )
    if profile.formality >= 4 and not any(
        item.formality >= 4 for item in available
    ):
        add(
            "outerwear",
            "深色无里衬西装外套",
            f"「{profile.label}」需要更清晰的正式度，这件能立刻拉齐上半身结构。",
            "high",
            "深色 无里衬 西装外套 面试",
        )
        add(
            "bottom",
            "垂坠感直筒西裤",
            "和现有上装组合即可达到正式场合需要的一条干净纵向线。",
            "medium",
            "高腰 垂坠 直筒 西裤",
        )
    if _needs_outerwear(weather) and "outerwear" not in categories:
        add(
            "outerwear",
            "轻薄防风层次外套",
            f"体感 {weather.apparent_temp:.0f}°C，加一层可收口的薄外套能覆盖早晚温差。",
            "high",
            "轻薄 防风 层次 外套",
        )
    available_shoes = [item for item in available if item.category == "shoes"]
    if (
        profile.formality >= 3.8
        and available_shoes
        and max(item.formality for item in available_shoes) < 3
    ):
        add(
            "shoes",
            "一双正式场合的皮鞋或细带高跟鞋",
            f"现有鞋履的正式度不足以支撑「{profile.label}」，换一双线条干净的皮鞋就能立刻拉齐。",
            "high",
            "正式 皮鞋 细带高跟鞋 典礼",
        )
    if _needs_rain_shoes(weather):
        add(
            "shoes",
            "防水短靴或橡胶底乐福鞋",
            f"降水概率 {weather.precipitation_probability}%，防水鞋底比换整套衣服更有效。",
            "medium",
            "防水 短靴 橡胶底 通勤",
        )
    if weather.apparent_temp >= 30 and not any(
        item.warmth <= 2 for item in available
    ):
        add(
            "top",
            "亚麻或高支棉宽松衬衫",
            "高温天需要一件真正透气的上装，和现有下装都能直接组合。",
            "high",
            "亚麻 高支棉 宽松 衬衫",
        )
    if weather.apparent_temp <= 5 and not any(item.warmth >= 4 for item in available):
        add(
            "outerwear",
            "羊毛混纺长大衣",
            "现有衣橱缺少真正抵御低温的外层，长大衣能同时保证温度和线条。",
            "high",
            "羊毛混纺 长大衣 冬季",
        )
    if profile.active and not any(
        {"运动", "机能", "户外"} & set(item.style_tags or []) for item in available
    ):
        add(
            "shoes",
            "有抓地力的轻量运动鞋",
            "活动场景优先考虑鞋底支撑和防滑，不能只看外观。",
            "medium",
            "轻量 防滑 运动鞋 户外",
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
                f"{item.name}的正式度与「{profile.label}」有一点距离，靠配色和配饰收束。"
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
                    "message": f"「{item.name}」已标记为不可用，本次没有强制加入。恢复可用后再试即可。",
                    "severity": "warning",
                }
            )
            continue
        active_forced.add(item_id)
        if abs(item.formality - profile.formality) >= 1.8:
            warnings.append(
                {
                    "code": "forced_formality_conflict",
                    "message": f"你指定必穿的「{item.name}」与「{profile.label}」正式度不太一致，造型会用配色和层次尽量中和。",
                    "severity": "warning",
                }
            )
        if item.warmth >= 4 and weather.apparent_temp >= 27:
            warnings.append(
                {
                    "code": "forced_heat_conflict",
                    "message": f"「{item.name}」偏厚，明天体感约 {weather.apparent_temp:.0f}°C，建议只作短时外层或换一件轻薄款。",
                    "severity": "warning",
                }
            )
        if item.warmth <= 2 and weather.apparent_temp <= 6:
            warnings.append(
                {
                    "code": "forced_cold_conflict",
                    "message": f"「{item.name}」较薄，低温下需要叠穿打底，否则体感会冷。",
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
                "message": "你同时指定了连衣裙与上下装必穿。它们很难作为一套完整造型同时成立，本次优先采用连衣裙方案。",
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
                "message": "衣橱里还没有可用的完整搭配。先添加一件上装、下装和鞋履，我们就能开始造型。",
                "severity": "critical",
            }
        )
        shopping = _shopping_gaps(items, weather, profile, ["top", "bottom", "shoes"])
        return PlanResult(
            outfits=[],
            scenario_note=f"把「{occasion}」理解为{profile.label}场合；先补齐衣橱的基础骨架。",
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
                    "message": f"这套造型还缺{CATEGORY_LABELS.get(missing_category, missing_category)}，补上后完整度会更高。",
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
        warnings.append(
            {
                "code": "limited_wardrobe",
                "message": f"现有可用单品只能组合出 {len(outfits)} 套明显不同的完整造型。适当添置基础款，选择会更丰富。",
                "severity": "info",
            }
        )
    if any(item.force_include for item in items if item.available) and not active_forced:
        warnings.append(
            {
                "code": "forced_not_found",
                "message": "必穿清单里没有可用的单品，本次按衣橱全部可用单品推荐。",
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
                "message": "现有可用单品还组合不出一套可以直接出门的完整造型。"
                "先按下面的建议补齐关键单品，再生成一次。",
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
        f"把「{occasion}」理解为{profile.label}场合，明天{_weather_phrase(weather)}。"
        f"造型优先{profile.priority}，只从你衣橱中可用的单品出发。"
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
