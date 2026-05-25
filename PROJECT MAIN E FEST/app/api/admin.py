from fastapi import APIRouter, Depends

from app.dependencies import check_admin

router = APIRouter()


@router.get("/ping")
async def admin_ping(_admin=Depends(check_admin)):
    return {"status": "ok", "role": "admin"}
