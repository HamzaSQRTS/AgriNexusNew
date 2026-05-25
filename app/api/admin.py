from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies import check_admin
from app.services.admin_status import build_admin_status
from app.services.api_control import set_chat_enabled

router = APIRouter()


@router.get("/ping")
async def admin_ping(_admin=Depends(check_admin)):
    return {"status": "ok", "role": "admin"}


@router.get("/status")
async def admin_status(_admin=Depends(check_admin)):
    """System health: API, database, API key, chatbot, token usage."""
    return await build_admin_status()


class ApiControlUpdate(BaseModel):
    chat_api_enabled: bool


@router.post("/api-control")
async def update_api_control(
    body: ApiControlUpdate,
    _admin=Depends(check_admin),
):
    """Enable or disable the chat API at runtime."""
    enabled = set_chat_enabled(body.chat_api_enabled)
    status = await build_admin_status()
    return {"chat_api_enabled": enabled, "status": status}
