"""Google Gemini integration for styling, garment tagging and try-on imagery."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from google import genai
from google.genai import types

from app.core.config import get_settings

logger = logging.getLogger(__name__)
PROMPTS = Path(__file__).resolve().parent.parent / "prompts"


class GeminiError(RuntimeError):
    """A user-safe wrapper around upstream Gemini failures."""


class GeminiService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._client: genai.Client | None = None

    @property
    def enabled(self) -> bool:
        return bool(self.settings.gemini_api_key)

    @property
    def client(self) -> genai.Client:
        if not self.enabled:
            raise GeminiError("Gemini API key is not configured")
        if self._client is None:
            self._client = genai.Client(
                api_key=self.settings.gemini_api_key,
                http_options={
                    "timeout": int(self.settings.gemini_timeout_seconds * 1000)
                },
            )
        return self._client

    @staticmethod
    def _load_prompt(name: str) -> str:
        return (PROMPTS / name).read_text(encoding="utf-8")

    @staticmethod
    def _parse_json(text: str | None) -> dict[str, Any]:
        if not text:
            raise GeminiError("Gemini returned an empty response")
        cleaned = text.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start == -1 or end <= start:
            raise GeminiError("Gemini response did not contain a JSON object")
        payload = cleaned[start : end + 1]
        result: Any = None
        last_error: json.JSONDecodeError | None = None
        for candidate in (
            payload,
            re.sub(r",\s*([}\]])", r"\1", payload),
        ):
            try:
                # strict=False tolerates literal newlines/control characters
                # inside strings, which Gemini occasionally emits in Chinese copy.
                result = json.loads(candidate, strict=False)
                break
            except json.JSONDecodeError as exc:
                last_error = exc
                continue
        if result is None:
            logger.warning(
                "Gemini JSON parse failed (chars=%d, error=%s)",
                len(payload),
                last_error,
            )
            raise GeminiError("Gemini returned malformed JSON")
        if not isinstance(result, dict):
            raise GeminiError("Gemini returned an unexpected JSON shape")
        return result

    def _generate_text(
        self,
        prompt: str,
        *,
        system_instruction: str | None = None,
        json_mode: bool = False,
        temperature: float = 0.6,
        max_output_tokens: int = 5000,
    ) -> str | None:
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            system_instruction=system_instruction,
            response_mime_type="application/json" if json_mode else "text/plain",
        )
        try:
            response = self.client.models.generate_content(
                model=self.settings.gemini_text_model,
                contents=prompt,
                config=config,
            )
        except Exception as exc:  # SDK surfaces many transport/HTTP exceptions
            logger.warning("Gemini text request failed: %s", type(exc).__name__)
            raise GeminiError("AI 造型服务暂时不可用") from exc
        return response.text

    def plan_outfits(self, prompt: str) -> dict[str, Any]:
        system = self._load_prompt("stylist_system.txt")
        last_error: GeminiError | None = None
        for temperature in (0.72, 0.3):
            text = self._generate_text(
                prompt,
                system_instruction=system,
                json_mode=True,
                temperature=temperature,
                max_output_tokens=6000,
            )
            try:
                return self._parse_json(text)
            except GeminiError as exc:
                if "malformed JSON" not in str(exc) and "did not contain" not in str(exc):
                    raise
                last_error = exc
                logger.info("Gemini plan JSON invalid, retrying with tighter sampling")
        raise last_error or GeminiError("Gemini returned malformed JSON")

    def analyze_garment(self, image_bytes: bytes, mime_type: str) -> dict[str, Any]:
        prompt = self._load_prompt("garment_analysis.txt")
        contents = [
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            types.Part.from_text(text=prompt),
        ]
        config = types.GenerateContentConfig(
            temperature=0.25,
            max_output_tokens=1200,
            response_mime_type="application/json",
        )
        try:
            response = self.client.models.generate_content(
                model=self.settings.gemini_text_model,
                contents=contents,
                config=config,
            )
        except Exception as exc:
            logger.warning("Gemini garment analysis failed: %s", type(exc).__name__)
            raise GeminiError("暂时无法识别这件单品") from exc
        return self._parse_json(response.text)

    def render_outfit(
        self,
        *,
        person_image: bytes,
        person_mime: str,
        garment_images: list[tuple[bytes, str]],
        prompt: str,
    ) -> tuple[bytes, str]:
        if not self.settings.enable_ai_images:
            raise GeminiError("AI 试穿图像生成已关闭")
        models_to_try = [self.settings.gemini_image_model]
        if "preview" not in self.settings.gemini_image_model:
            models_to_try.append(f"{self.settings.gemini_image_model}-preview")

        last_error: Exception | None = None
        for model in models_to_try:
            contents: list[Any] = [
                types.Part.from_bytes(data=person_image, mime_type=person_mime),
            ]
            contents.extend(
                types.Part.from_bytes(data=data, mime_type=mime)
                for data, mime in garment_images
            )
            contents.append(types.Part.from_text(text=prompt))
            config = types.GenerateContentConfig(
                temperature=0.45,
                response_modalities=["IMAGE", "TEXT"],
                image_config=types.ImageConfig(aspect_ratio="3:4"),
            )
            try:
                response = self.client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config,
                )
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Gemini image request failed (%s): %s", model, type(exc).__name__
                )
                continue

            for candidate in getattr(response, "candidates", None) or []:
                content = getattr(candidate, "content", None)
                for part in getattr(content, "parts", None) or []:
                    inline = getattr(part, "inline_data", None)
                    data = getattr(inline, "data", None) if inline else None
                    if data:
                        mime = getattr(inline, "mime_type", None) or "image/png"
                        if isinstance(data, str):
                            import base64

                            data = base64.b64decode(data)
                        return bytes(data), mime
            block = getattr(response, "prompt_feedback", None)
            if block is not None and getattr(block, "block_reason", None):
                last_error = GeminiError(f"Image blocked: {block.block_reason}")
                break

        raise GeminiError("AI 试穿图像生成失败") from last_error


gemini_service = GeminiService()


def require_gemini() -> None:
    if not gemini_service.enabled:
        raise HTTPException(
            status_code=503,
            detail="AI 服务尚未配置，请在 .env 中设置 GEMINI_API_KEY",
        )
