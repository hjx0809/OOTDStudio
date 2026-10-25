"""End-to-end API tests for the core product flow."""

from __future__ import annotations

import time
import uuid
from io import BytesIO

from PIL import Image, ImageDraw


def make_image(color: tuple[int, int, int], size: tuple[int, int] = (600, 800)) -> bytes:
    image = Image.new("RGB", size, color)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (size[0] * 0.22, size[1] * 0.14, size[0] * 0.78, size[1] * 0.86),
        radius=30,
        fill=(245, 241, 232),
    )
    buffer = BytesIO()
    image.save(buffer, "JPEG", quality=88)
    return buffer.getvalue()


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def unique_email(prefix: str = "user") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"


def register(client, email: str | None = None) -> tuple[str, dict]:
    email = email or unique_email()
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery",
            "display_name": "Test Person",
            "accept_terms": True,
        },
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    return payload["access_token"], payload["user"]


def complete_profile(client, token: str) -> None:
    headers = auth_headers(token)
    photo = client.post(
        "/api/users/me/base-photo",
        headers=headers,
        files={"photo": ("full-body.jpg", make_image((91, 96, 81)), "image/jpeg")},
    )
    assert photo.status_code == 200, photo.text
    profile = client.patch(
        "/api/users/me",
        headers=headers,
        json={
            "height_cm": 172,
            "weight_kg": 64,
            "chest_cm": 90,
            "waist_cm": 72,
            "hip_cm": 95,
            "inseam_cm": 79,
            "shoe_size": 39,
            "fit_preference": "regular",
            "style_preferences": ["极简", "通勤"],
            "body_shape": "沙漏形",
            "skin_tone": "自然",
            "city": "上海",
            "latitude": 31.2304,
            "longitude": 121.4737,
        },
    )
    assert profile.status_code == 200, profile.text
    complete = client.post("/api/users/me/complete-onboarding", headers=headers)
    assert complete.status_code == 200, complete.text
    assert complete.json()["onboarding_completed"] is True


def add_item(client, token: str, name: str, category: str, color=(130, 120, 100)) -> dict:
    response = client.post(
        "/api/wardrobe",
        headers=auth_headers(token),
        data={
            "name": name,
            "category": category,
            "formality": "3",
            "warmth": "2",
            "seasons": "spring,autumn",
            "style_tags": "极简,通勤",
            "color_name": "测试色",
        },
        files={"image": (f"{category}.jpg", make_image(color), "image/jpeg")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def wardrobe(client, token: str) -> list[dict]:
    response = client.get("/api/wardrobe", headers=auth_headers(token))
    assert response.status_code == 200
    return response.json()


def build_wardrobe(client, token: str) -> list[dict]:
    specs = [
        ("白衬衫", "top", (210, 208, 196)),
        ("奶油针织衫", "top", (219, 203, 174)),
        ("黑直筒西裤", "bottom", (35, 35, 32)),
        ("灰西裤", "bottom", (125, 125, 118)),
        ("白球鞋", "shoes", (235, 233, 226)),
        ("黑乐福鞋", "shoes", (23, 23, 21)),
        ("灰风衣", "outerwear", (137, 134, 124)),
        ("红手袋", "bag", (176, 65, 52)),
    ]
    return [
        add_item(client, token, name, category, color)
        for name, category, color in specs
    ]


def recommendation_payload(forced_ids: list[str] | None = None) -> dict:
    return {
        "occasion": "明天去客户公司做提案，下午和团队喝咖啡",
        "occasion_type": "work",
        "weather": {
            "city": "上海",
            "date": "2026-10-25",
            "temp_min": 16,
            "temp_max": 23,
            "apparent_temp": 19,
            "precipitation_probability": 30,
            "wind_speed": 12,
            "condition": "多云",
            "icon": "⛅",
            "source": "manual",
        },
        "forced_item_ids": forced_ids or [],
        "outfit_count": 3,
    }


def test_auth_and_onboarding(client):
    email = unique_email("auth")
    token, user = register(client, email)
    assert user["onboarding_completed"] is False
    headers = auth_headers(token)

    duplicate = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery",
            "display_name": "Duplicate",
            "accept_terms": True,
        },
    )
    assert duplicate.status_code == 409

    wrong = client.post(
        "/api/auth/login", json={"email": email, "password": "wrong-password"}
    )
    assert wrong.status_code == 401

    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["user"]["email"] == email

    blocked = client.post(
        "/api/recommendations", headers=headers, json=recommendation_payload()
    )
    assert blocked.status_code == 409

    incomplete = client.post("/api/users/me/complete-onboarding", headers=headers)
    assert incomplete.status_code == 422
    assert "full-body base photo" in incomplete.json()["detail"]

    complete_profile(client, token)
    me = client.get("/api/users/me", headers=headers)
    assert me.json()["height_cm"] == 172
    assert me.json()["base_photo_url"].startswith("/api/media/")

    no_auth = client.get("/api/users/me")
    assert no_auth.status_code == 401


def test_wardrobe_and_recommendation_flow(client):
    token, _user = register(client)
    complete_profile(client, token)
    headers = auth_headers(token)
    items = build_wardrobe(client, token)
    assert len(items) == 8

    summary = client.get("/api/wardrobe/summary", headers=headers)
    assert summary.status_code == 200
    assert summary.json()["total"] == 8
    assert summary.json()["available"] == 8

    top = next(item for item in items if item["name"] == "白衬衫")
    forced = client.patch(
        f"/api/wardrobe/{top['id']}/force",
        headers=headers,
        json={"force_include": True},
    )
    assert forced.status_code == 200
    assert forced.json()["force_include"] is True

    response = client.post(
        "/api/recommendations", headers=headers, json=recommendation_payload([top["id"]])
    )
    assert response.status_code == 201, response.text
    recommendation = response.json()
    assert recommendation["status"] in {"ready", "ready_partial"}
    assert len(recommendation["outfits"]) == 3
    for outfit in recommendation["outfits"]:
        assert top["id"] in [item["id"] for item in outfit["items"]]

    # Background rendering runs after response. Re-fetch to see final images.
    detail = client.get(f"/api/recommendations/{recommendation['id']}", headers=headers)
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["is_complete"] is True
    for outfit in detail_payload["outfits"]:
        assert outfit["image_status"] == "ready"
        assert outfit["image_url"]
        image = client.get(outfit["image_url"])
        assert image.status_code == 200
        assert image.headers["content-type"] == "image/jpeg"
        assert len(image.content) > 10_000

    # Private media cannot be read without a token or by another user.
    media_path = detail_payload["outfits"][0]["image_url"].split("?")[0]
    assert client.get(media_path).status_code == 401
    other_token, _ = register(client)
    cross_user = client.get(f"{media_path}?token={other_token}")
    assert cross_user.status_code == 403

    # Availability changes persist, and a reroll honours them.
    unavailable = client.patch(
        f"/api/wardrobe/{top['id']}/availability",
        headers=headers,
        json={"available": False},
    )
    assert unavailable.status_code == 200
    assert unavailable.json()["available"] is False
    assert unavailable.json()["force_include"] is False

    rerolled = client.post(
        f"/api/recommendations/{recommendation['id']}/reroll", headers=headers
    )
    assert rerolled.status_code == 201, rerolled.text
    reroll_payload = rerolled.json()
    assert reroll_payload["id"] != recommendation["id"]
    for outfit in reroll_payload["outfits"]:
        assert top["id"] not in [item["id"] for item in outfit["items"]]
    assert not any(
        warning["code"] == "forced_unavailable"
        for warning in reroll_payload["warnings"]
    )

    history = client.get("/api/recommendations", headers=headers)
    assert history.status_code == 200
    assert len(history.json()) >= 2


def test_generation_runs_in_background_without_polling(client, monkeypatch):
    """Generation is not tied to the request or to the looks page.

    The POST returns a pending recommendation immediately. Planning and
    rendering continue on worker threads even if the client never polls
    again (the user navigated to the wardrobe or closed the tab).
    """
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "environment", "development")

    token, _user = register(client)
    complete_profile(client, token)
    build_wardrobe(client, token)
    headers = auth_headers(token)

    started = time.perf_counter()
    response = client.post(
        "/api/recommendations", headers=headers, json=recommendation_payload()
    )
    elapsed = time.perf_counter() - started
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["status"] == "planning"
    assert payload["is_complete"] is False
    assert payload["outfits"] == []
    assert elapsed < 2, f"POST blocked for {elapsed:.1f}s"

    # Simulate leaving the page: no polling for a few seconds, then check that
    # the work moved on by itself.
    time.sleep(3)
    detail = payload
    deadline = time.time() + 60
    while time.time() < deadline:
        detail = client.get(f"/api/recommendations/{payload['id']}", headers=headers).json()
        if detail["is_complete"]:
            break
        time.sleep(0.5)

    assert detail["is_complete"] is True
    assert detail["status"] in {"ready", "ready_partial"}
    assert len(detail["outfits"]) == 3
    assert all(outfit["image_status"] == "ready" for outfit in detail["outfits"])


def test_input_validation_and_item_lifecycle(client):
    token, _user = register(client)
    complete_profile(client, token)
    headers = auth_headers(token)

    bad_type = client.post(
        "/api/wardrobe",
        headers=headers,
        data={"category": "top"},
        files={"image": ("notes.txt", b"not an image", "text/plain")},
    )
    assert bad_type.status_code == 415

    corrupt = client.post(
        "/api/wardrobe",
        headers=headers,
        data={"category": "top"},
        files={"image": ("broken.jpg", b"definitely not a jpeg", "image/jpeg")},
    )
    assert corrupt.status_code == 422

    item = add_item(client, token, "待删除单品", "accessory")
    update = client.patch(
        f"/api/wardrobe/{item['id']}",
        headers=headers,
        json={"name": "更新后的配饰", "formality": 4, "favorite": True},
    )
    assert update.status_code == 200
    assert update.json()["name"] == "更新后的配饰"
    image_path = update.json()["full_image_url"].split("?")[0]
    assert client.get(update.json()["full_image_url"]).status_code == 200

    deleted = client.delete(f"/api/wardrobe/{item['id']}", headers=headers)
    assert deleted.status_code == 204
    assert client.get(update.json()["full_image_url"]).status_code == 404
    assert client.get(f"{image_path}?token={token}").status_code == 404
    assert client.get(f"/api/wardrobe/{item['id']}", headers=headers).status_code == 404

    invalid = client.post(
        "/api/recommendations",
        headers=headers,
        json={
            **recommendation_payload(),
            "weather": {
                **recommendation_payload()["weather"],
                "temp_min": 30,
                "temp_max": 10,
            },
        },
    )
    assert invalid.status_code == 422
    assert "maximum temperature" in invalid.json()["detail"]


def test_garment_analysis_without_gemini(client):
    token, _user = register(client)
    response = client.post(
        "/api/wardrobe/analyze",
        headers=auth_headers(token),
        files={"image": ("garment.jpg", make_image((44, 88, 150)), "image/jpeg")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is False
    assert payload["color_hex"].startswith("#")
    assert "AI" in payload["reason"]


def test_account_deletion_removes_identity_and_media(client):
    token, _user = register(client)
    headers = auth_headers(token)
    photo = client.post(
        "/api/users/me/base-photo",
        headers=headers,
        files={"photo": ("body.jpg", make_image((110, 98, 84)), "image/jpeg")},
    )
    assert photo.status_code == 200
    media_url = photo.json()["base_photo_url"]

    wrong = client.request(
        "DELETE",
        "/api/users/me",
        headers=headers,
        json={"password": "wrong-password"},
    )
    assert wrong.status_code == 400

    deleted = client.request(
        "DELETE",
        "/api/users/me",
        headers=headers,
        json={"password": "correct-horse-battery"},
    )
    assert deleted.status_code == 204
    assert client.get("/api/users/me", headers=headers).status_code == 401
    assert client.get(media_url).status_code == 401


def test_wardrobe_gap_suggests_all_missing_foundations(client):
    token, _user = register(client)
    complete_profile(client, token)
    response = client.post(
        "/api/recommendations",
        headers=auth_headers(token),
        json=recommendation_payload(),
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["status"] == "wardrobe_gap"
    categories = {suggestion["category"] for suggestion in payload["shopping_suggestions"]}
    assert {"top", "bottom", "shoes"}.issubset(categories)
    assert any(
        warning["code"] in {"no_complete_outfit", "empty_wardrobe"}
        for warning in payload["warnings"]
    )


def test_gemini_planning_path_and_fallback(client, monkeypatch):
    from app.core.config import get_settings
    from app.services.gemini import GeminiError, gemini_service

    token, _user = register(client)
    complete_profile(client, token)
    items = build_wardrobe(client, token)
    by_name = {item["name"]: item for item in items}
    top = by_name["白衬衫"]
    bottom = by_name["黑直筒西裤"]
    shoes = by_name["白球鞋"]

    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "test-fake-key")

    captured: dict[str, str] = {}

    def fake_plan(prompt: str) -> dict:
        captured["prompt"] = prompt
        return {
            "scenario_note": "AI 把这次场景理解为一次需要可信度的客户会议。",
            "warnings": [],
            "shopping_suggestions": [],
            "outfits": [
                {
                    "title": "AI 剪影",
                    "rationale": "用白色上装和黑色下装建立清晰的纵向比例，适合客户会议。",
                    "styling_note": "保持鞋面干净，袖口露出一厘米。",
                    "score": 90,
                    "item_ids": [top["id"], bottom["id"], shoes["id"]],
                    "roles": {top["id"]: "上装", bottom["id"]: "下装", shoes["id"]: "鞋履"},
                }
            ],
        }

    monkeypatch.setattr(gemini_service, "plan_outfits", fake_plan)
    response = client.post(
        "/api/recommendations",
        headers=auth_headers(token),
        json=recommendation_payload(),
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["ai_source"] == "gemini"
    assert payload["outfits"][0]["title"] == "AI 剪影"
    assert "WARDROBE" in captured["prompt"]
    assert top["id"] in captured["prompt"]

    def failing_plan(_prompt: str) -> dict:
        raise GeminiError("upstream unavailable")

    monkeypatch.setattr(gemini_service, "plan_outfits", failing_plan)
    fallback = client.post(
        "/api/recommendations",
        headers=auth_headers(token),
        json=recommendation_payload(),
    )
    assert fallback.status_code == 201
    assert fallback.json()["ai_source"] == "atelier"
    assert fallback.json()["outfits"]
