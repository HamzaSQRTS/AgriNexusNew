import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List

from app.config import settings
from app.dependencies import get_current_user
from app.models.user import UserOut

router = APIRouter()
logger = logging.getLogger(__name__)


class ChatQuery(BaseModel):
    query: str


class ChatResponse(BaseModel):
    diagnosis: str
    confidence: float
    recommendations: List[str]
    citations: List[str]


@router.post("/query", response_model=ChatResponse)
async def chat_query(
    query_in: ChatQuery,
    current_user: UserOut = Depends(get_current_user),
):
    """Agricultural Q&A via OpenRouter (OpenAI-compatible API)."""
    query = (query_in.query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    if not (settings.OPENROUTER_API_KEY or "").strip():
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_API_KEY is not set. Add it to your .env (see .env.example).",
        )

    from app.services.api_control import is_chat_enabled
    from app.services.token_usage import get_usage_snapshot

    if not is_chat_enabled():
        raise HTTPException(status_code=503, detail="Chat API is disabled by administrator.")

    usage = get_usage_snapshot(settings.DAILY_TOKEN_LIMIT)
    if usage["limit_reached"]:
        raise HTTPException(
            status_code=429,
            detail=f"Daily token limit reached ({usage['tokens_used']}/{usage['daily_limit']}).",
        )

    try:
        from app.services.openrouter_chat import openrouter_agri_response

        return await openrouter_agri_response(query)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("OpenRouter chat failed")
        msg = str(e).strip() or repr(e)
        typ = type(e).__name__
        raise HTTPException(
            status_code=502,
            detail=(
                f"Chat provider error ({typ}): {msg}. "
                f"Model={settings.OPENROUTER_MODEL!r}. "
                "Confirm OPENROUTER_API_KEY at https://openrouter.ai/keys and pick a model from https://openrouter.ai/models"
            ),
        ) from e
