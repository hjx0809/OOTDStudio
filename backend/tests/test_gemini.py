"""Gemini request-shape tests using a local fake client (no network)."""

from __future__ import annotations

from types import SimpleNamespace

from app.core.config import get_settings
from app.services.gemini import GeminiService


class FakeModels:
    def __init__(self, response):
        self.response = response
        self.calls: list[dict] = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


class FakeClient:
    def __init__(self, response):
        self.models = FakeModels(response)


def test_text_planning_passes_json_config_and_parses_output(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "fake-key")
    service = GeminiService()
    response = SimpleNamespace(
        text='{"scenario_note":"x","warnings":[],"shopping_suggestions":[],"outfits":[]}'
    )
    fake = FakeClient(response)
    service._client = fake

    result = service.plan_outfits("brief")
    assert result["scenario_note"] == "x"
    call = fake.models.calls[0]
    assert call["model"] == settings.gemini_text_model
    assert call["contents"] == "brief"
    assert call["config"].response_mime_type == "application/json"
    assert "OUL Studio" in call["config"].system_instruction


def test_image_render_extracts_inline_image(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "fake-key")
    monkeypatch.setattr(settings, "enable_ai_images", True)
    service = GeminiService()
    image_part = SimpleNamespace(
        inline_data=SimpleNamespace(data=b"fake-jpeg-bytes", mime_type="image/jpeg")
    )
    response = SimpleNamespace(
        candidates=[SimpleNamespace(content=SimpleNamespace(parts=[image_part]))],
        prompt_feedback=None,
    )
    fake = FakeClient(response)
    service._client = fake

    data, mime = service.render_outfit(
        person_image=b"person",
        person_mime="image/jpeg",
        garment_images=[(b"shirt", "image/jpeg")],
        prompt="wear it",
    )
    assert data == b"fake-jpeg-bytes"
    assert mime == "image/jpeg"
    call = fake.models.calls[0]
    assert call["model"] == settings.gemini_image_model
    assert call["config"].response_modalities == ["IMAGE", "TEXT"]
    assert call["config"].image_config.aspect_ratio == "3:4"
    assert len(call["contents"]) == 3


def test_garment_analysis_shape(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "fake-key")
    service = GeminiService()
    response = SimpleNamespace(
        text='{"name":"白衬衫","category":"top","subcategory":"衬衫",'
        '"color_name":"白色","color_hex":"#FFFFFF","pattern":"纯色",'
        '"material":"棉","formality":3,"warmth":2,'
        '"seasons":["spring"],"style_tags":["极简"]}'
    )
    fake = FakeClient(response)
    service._client = fake

    result = service.analyze_garment(b"\xff\xd8fake", "image/jpeg")
    assert result["category"] == "top"
    call = fake.models.calls[0]
    assert call["config"].response_mime_type == "application/json"
    assert len(call["contents"]) == 2


def test_local_scene_changes_with_background_prompt():
    from app.services.local_scene import render_scene

    studio = render_scene("studio", None, (420, 560))
    city = render_scene("custom", "傍晚城市屋顶，远处灯光轻微虚化", (420, 560))
    gallery = render_scene("custom", "安静的画廊白墙与自然天光", (420, 560))

    assert studio.size == city.size == gallery.size == (420, 560)
    assert city.tobytes() != gallery.tobytes()
    assert city.tobytes() != studio.tobytes()
    # The custom city scene should be visibly darker than the gallery scene.
    from PIL import ImageStat

    assert ImageStat.Stat(city.convert("L")).mean[0] < ImageStat.Stat(gallery.convert("L")).mean[0]


def test_gemini_sdk_http_roundtrip_for_image_generation(monkeypatch):
    """Exercise the real google-genai HTTP serialization without a live key."""
    import base64
    import io
    import json

    import httpx
    from PIL import Image
    from google import genai

    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "protocol-test-key")
    monkeypatch.setattr(settings, "enable_ai_images", True)

    seen: list[httpx.Request] = []
    png = io.BytesIO()
    Image.new("RGB", (12, 16), (190, 120, 80)).save(png, "PNG")

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if ":generateContent" not in str(request.url):
            return httpx.Response(404)
        payload = {
            "candidates": [
                {
                    "content": {
                        "role": "model",
                        "parts": [
                            {"text": "styled"},
                            {
                                "inlineData": {
                                    "mimeType": "image/png",
                                    "data": base64.b64encode(png.getvalue()).decode(),
                                }
                            },
                        ],
                    },
                    "finishReason": "STOP",
                    "index": 0,
                }
            ],
            "usageMetadata": {
                "promptTokenCount": 20,
                "candidatesTokenCount": 8,
                "totalTokenCount": 28,
            },
            "modelVersion": "gemini-2.5-flash-image",
        }
        return httpx.Response(200, json=payload)

    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    sdk_client = genai.Client(
        api_key="protocol-test-key",
        http_options={"httpx_client": http_client},
    )
    service = GeminiService()
    service._client = sdk_client

    data, mime = service.render_outfit(
        person_image=b"person-jpeg-bytes",
        person_mime="image/jpeg",
        garment_images=[(b"garment-jpeg-bytes", "image/jpeg")],
        prompt="Wear the supplied garment. Preserve identity.",
    )
    assert mime == "image/png"
    assert data == png.getvalue()
    request = seen[0]
    assert "gemini-2.5-flash-image:generateContent" in str(request.url)
    body = json.loads(request.content)
    assert body["generationConfig"]["responseModalities"] == ["IMAGE", "TEXT"]
    assert body["generationConfig"]["imageConfig"]["aspectRatio"] == "3:4"
    parts = body["contents"][0]["parts"]
    assert len(parts) == 3
    inline = parts[0]["inlineData"]
    assert inline.get("mimeType", inline.get("mime_type")) == "image/jpeg"
    assert "Preserve identity" in parts[-1]["text"]


def test_lookboard_rendering_uses_custom_background_prompt():
    from app.db.models import Outfit, Recommendation, User
    from app.services.renderer import _render_lookboard

    user = User(
        id="render-user",
        email="render@example.com",
        password_hash="not-used",
        display_name="Render",
        base_photo_path=None,
        base_photo_thumb_path=None,
    )
    recommendation = Recommendation(
        id="render-rec",
        user_id=user.id,
        occasion="明天去城市里看展",
        occasion_type="date",
        weather={"condition": "多云", "apparent_temp": 19},
        background_mode="studio",
    )
    base = dict(
        recommendation_id=recommendation.id,
        title="城市微光",
        rationale="用于测试渲染的背景。",
        sort_order=0,
        item_ids=[],
        items_snapshot=[],
        missing_categories=[],
        warnings=[],
    )
    studio = Outfit(**base, id="studio", background_mode="studio")
    city = Outfit(
        **base,
        id="city",
        background_mode="custom",
        background_prompt="傍晚城市屋顶，远处灯光轻微虚化",
    )
    gallery = Outfit(
        **base,
        id="gallery",
        background_mode="custom",
        background_prompt="安静的画廊白墙与自然天光",
    )

    studio_bytes = _render_lookboard(studio, recommendation, user, [])
    city_bytes = _render_lookboard(city, recommendation, user, [])
    gallery_bytes = _render_lookboard(gallery, recommendation, user, [])

    assert studio_bytes.startswith(b"\xff\xd8")
    assert city_bytes != studio_bytes
    assert city_bytes != gallery_bytes
