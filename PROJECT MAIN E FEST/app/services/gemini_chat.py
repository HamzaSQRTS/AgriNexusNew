import asyncio
import json
import re
from typing import Any, Dict

from app.config import settings

SYSTEM_INSTRUCTION = """You are AgriNexus AI, a concise agricultural advisor (crops, soil, pests, nutrients, irrigation).
Reply with ONE JSON object only (no markdown fences), keys exactly:
- "diagnosis": string (2-4 sentences)
- "confidence": number from 0.0 to 1.0
- "recommendations": array of 2-5 short actionable strings
- "citations": array of 2-4 short source labels (e.g. "IPM extension guidance", "Soil science basics")

If the question is not agriculture-related, set diagnosis to a brief polite redirect and still fill all keys."""


def _strip_json_fences(text: str) -> str:
    t = text.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", t, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return t


def _normalize_payload(data: Any) -> Dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("Model response is not a JSON object")
    diagnosis = str(data.get("diagnosis", "")).strip() or "No diagnosis returned."
    recs = data.get("recommendations") or []
    cites = data.get("citations") or []
    if not isinstance(recs, list):
        recs = [str(recs)]
    if not isinstance(cites, list):
        cites = [str(cites)]
    recs = [str(x) for x in recs if str(x).strip()]
    cites = [str(x) for x in cites if str(x).strip()]
    try:
        conf = float(data.get("confidence", 0.7))
    except (TypeError, ValueError):
        conf = 0.7
    conf = max(0.0, min(1.0, conf))
    return {
        "diagnosis": diagnosis,
        "confidence": conf,
        "recommendations": recs or ["Review field conditions and local extension advice."],
        "citations": cites or ["Agronomy reasoning"],
    }


def _generate_sync(user_query: str) -> Dict[str, Any]:
    import google.generativeai as genai

    genai.configure(api_key=settings.GEMINI_API_KEY)
    generation_config = {
        "temperature": 0.35,
        "response_mime_type": "application/json",
    }

    model = genai.GenerativeModel(
        model_name=settings.GEMINI_MODEL,
        system_instruction=SYSTEM_INSTRUCTION,
    )
    response = model.generate_content(
        user_query,
        generation_config=generation_config,
    )
    try:
        text = (response.text or "").strip()
    except ValueError as e:
        fb = getattr(response, "prompt_feedback", None)
        raise ValueError(f"Gemini returned no text (blocked or empty). {fb}") from e
    if not text:
        raise ValueError("Empty response from Gemini")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = json.loads(_strip_json_fences(text))
    return _normalize_payload(data)


async def gemini_agri_response(user_query: str) -> Dict[str, Any]:
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set")
    return await asyncio.to_thread(_generate_sync, user_query)
