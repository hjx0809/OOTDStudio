"""Unit tests for the deterministic styling floor and AI plan validation."""

from __future__ import annotations

from app.db.models import WardrobeItem
from app.schemas.recommendation import WeatherSnapshot
from app.services.recommendation_service import _merge_ai_plan, _valid_ai_outfits
from app.services.stylist import plan_outfits


def item(
    item_id: str,
    category: str,
    *,
    name: str | None = None,
    formality: int = 3,
    warmth: int = 3,
    color: str = "雾灰",
    available: bool = True,
    force_include: bool = False,
) -> WardrobeItem:
    return WardrobeItem(
        id=item_id,
        user_id="user-1",
        name=name or f"{color}{category}",
        category=category,
        color_name=color,
        formality=formality,
        warmth=warmth,
        seasons=["spring", "autumn"],
        style_tags=["极简", "通勤"],
        image_path=f"user-1/items/{item_id}.jpg",
        thumbnail_path=f"user-1/items/{item_id}_thumb.jpg",
        available=available,
        force_include=force_include,
        favorite=False,
    )


def weather(apparent: float = 18, rain: int = 0) -> WeatherSnapshot:
    return WeatherSnapshot(
        city="上海",
        date="2026-10-25",
        temp_min=apparent - 3,
        temp_max=apparent + 4,
        apparent_temp=apparent,
        precipitation_probability=rain,
        wind_speed=10,
        condition="多云",
        icon="⛅",
    )


def basic_items() -> list[WardrobeItem]:
    return [
        item("top-1", "top", formality=3, warmth=2, color="白色"),
        item("top-2", "top", formality=3, warmth=3, color="奶油"),
        item("bottom-1", "bottom", formality=3, warmth=2, color="黑色"),
        item("bottom-2", "bottom", formality=2, warmth=2, color="牛仔蓝"),
        item("shoe-1", "shoes", formality=3, warmth=2, color="黑色"),
        item("shoe-2", "shoes", formality=2, warmth=2, color="白色"),
        item("coat-1", "outerwear", formality=3, warmth=4, color="驼色"),
    ]


def test_plan_produces_distinct_complete_outfits():
    plan = plan_outfits(
        basic_items(),
        {"fit_preference": "regular", "height_cm": 170, "body_shape": "沙漏形"},
        weather(18),
        "明天去公司汇报",
        "work",
        [],
        3,
    )
    assert plan.status == "ready"
    assert len(plan.outfits) == 3
    seen = {frozenset(entry.id for entry in outfit.items) for outfit in plan.outfits}
    assert len(seen) == 3
    for outfit in plan.outfits:
        categories = {entry.category for entry in outfit.items}
        assert "shoes" in categories
        assert categories & {"top", "dress"}
        assert "bottom" in categories
        assert 82 <= outfit.score <= 95


def test_forced_item_is_in_every_outfit_and_conflicts_are_surfaced():
    items = basic_items()
    items[5].force_include = True  # white shoes
    plan = plan_outfits(
        items,
        {"fit_preference": "regular", "height_cm": 170, "body_shape": "沙漏形"},
        weather(18),
        "参加面试",
        "interview",
        ["shoe-2"],
        3,
    )
    assert plan.outfits
    for outfit in plan.outfits:
        assert "shoe-2" in {entry.id for entry in outfit.items}


def test_cold_and_rain_add_warnings_and_outerwear():
    plan = plan_outfits(
        basic_items(),
        {"fit_preference": "regular", "height_cm": 170, "body_shape": "沙漏形"},
        weather(2, rain=85),
        "周末去公园",
        "outdoor",
        [],
        2,
    )
    codes = {warning["code"] for warning in plan.warnings}
    assert "rain" in codes
    assert "severe_cold" in codes
    assert all("coat-1" in {entry.id for entry in outfit.items} for outfit in plan.outfits)


def test_wardrobe_gap_returns_actionable_shopping_suggestions():
    only_tops = [
        item("top-1", "top"),
        item("top-2", "top", color="黑色"),
    ]
    plan = plan_outfits(
        only_tops,
        {"fit_preference": "regular", "height_cm": 170, "body_shape": "直筒形"},
        weather(20),
        "明天去面试",
        "interview",
        [],
        3,
    )
    assert plan.status == "wardrobe_gap"
    assert all(outfit.missing_categories for outfit in plan.outfits)
    assert {"top", "bottom", "shoes"}.issubset(
        {suggestion["category"] for suggestion in plan.shopping_suggestions}
    ) or {"bottom", "shoes"}.issubset(
        {suggestion["category"] for suggestion in plan.shopping_suggestions}
    )
    assert any(warning["severity"] == "critical" for warning in plan.warnings)


def test_ai_plan_rejects_hallucinations_and_incomplete_looks():
    items = basic_items()
    wardrobe_ids = {entry.id for entry in items}
    ai_data = {
        "outfits": [
            {
                "title": "好造型",
                "rationale": "这套造型符合天气与通勤场景，比例也很清楚。",
                "item_ids": ["top-1", "bottom-1", "shoe-1"],
            },
            {
                "title": "幻觉单品",
                "rationale": "包含不存在的单品编号，应该被拒绝。",
                "item_ids": ["top-1", "made-up-id", "shoe-1"],
            },
            {
                "title": "没有鞋",
                "rationale": "缺少鞋履，无法构成完整可穿造型。",
                "item_ids": ["top-1", "bottom-1"],
            },
        ]
    }
    valid = _valid_ai_outfits(ai_data, items, set(), 3)
    assert len(valid) == 1
    assert valid[0].title == "好造型"
    assert {entry.id for entry in valid[0].items}.issubset(wardrobe_ids)


def test_ai_plan_requires_forced_items():
    items = basic_items()
    ai_data = {
        "outfits": [
            {
                "title": "好造型",
                "rationale": "这套造型符合天气与通勤场景，比例也很清楚。",
                "item_ids": ["top-1", "bottom-1", "shoe-1"],
            }
        ]
    }
    assert not _valid_ai_outfits(ai_data, items, {"shoe-2"}, 1)


def test_merge_ai_plan_fills_shortfall_and_keeps_valid_ai_copy():
    items = basic_items()
    local = plan_outfits(
        items,
        {"fit_preference": "regular", "height_cm": 170, "body_shape": "沙漏形"},
        weather(18),
        "明天去公司汇报",
        "work",
        [],
        3,
    )
    ai_data = {
        "scenario_note": "明天是通勤场景，保持利落但不过度正式。",
        "warnings": [
            {"code": "weather", "message": "早晚有温差，建议带一件薄外套。", "severity": "info"}
        ],
        "shopping_suggestions": [],
        "outfits": [
            {
                "title": "AI 造型",
                "rationale": "这套搭配把蓝灰色上装与深色下装放在一起，适合客户会议。",
                "styling_note": "袖口露出一点，显得更轻。",
                "score": 88,
                "item_ids": ["top-1", "bottom-1", "shoe-1"],
                "roles": {"top-1": "上装"},
            }
        ],
    }
    merged, used_ai = _merge_ai_plan(local, ai_data, items, set(), 3)
    assert used_ai is True
    assert len(merged.outfits) == 3
    assert merged.outfits[0].title == "AI 造型"
    assert any(warning["message"].startswith("早晚有温差") for warning in merged.warnings)
