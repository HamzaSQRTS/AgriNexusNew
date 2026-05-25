import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.dependencies import get_current_user
from app.db.mongodb import get_db
from app.models.user import UserOut
from app.services.farmer_analytics import build_farmer_analytics
from app.services.report_generator_engine import generate_comprehensive_reports

router = APIRouter()


class FarmContextIn(BaseModel):
    latitude: float = 31.5204
    longitude: float = 74.3587
    crop: str = "wheat"
    acreage_hectares: float = Field(10.0, gt=0)
    growth_stage: str = "flowering"


class PipelineProcessIn(BaseModel):
    farm: FarmContextIn = Field(default_factory=FarmContextIn)
    chat_hints: Optional[List[str]] = None


async def _latest_report_bundle(db: AsyncIOMotorDatabase, user_id: str) -> Optional[dict]:
    cursor = db.reports.find({"user_id": user_id})
    docs = await cursor.to_list(length=50)
    if not docs:
        return None
    return docs[-1].get("bundle")


@router.get("/analytics")
async def get_farmer_analytics(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """
    Dashboard metrics: uploads + latest 8-category report engine output.
    """
    uid = current_user.id
    cursor = db.uploads.find({"user_id": uid})
    docs = await cursor.to_list(length=200)
    bundle = await _latest_report_bundle(db, uid)
    return build_farmer_analytics(docs, bundle)


@router.post("/pipeline/process")
async def run_farm_pipeline(
    body: PipelineProcessIn,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserOut = Depends(get_current_user),
):
    """
    Step 2 after upload: run report engine on all user files, save bundle, return full dashboard.
    Flow: Upload → Report Engine → Analytics Dashboard
    """
    uid = current_user.id
    cursor = db.uploads.find({"user_id": uid})
    docs = await cursor.to_list(length=200)
    if not docs:
        raise HTTPException(
            status_code=400,
            detail="Upload at least one farm data file before running the report engine.",
        )

    try:
        bundle = generate_comprehensive_reports(
            user_id=uid,
            upload_docs=docs,
            latitude=body.farm.latitude,
            longitude=body.farm.longitude,
            crop=body.farm.crop,
            acreage_hectares=body.farm.acreage_hectares,
            growth_stage=body.farm.growth_stage,
            chat_hints=body.chat_hints,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    await db.reports.insert_one(
        {
            "user_id": uid,
            "bundle": bundle,
            "created_at": datetime.datetime.utcnow().isoformat(),
        }
    )

    analytics = build_farmer_analytics(docs, bundle)
    return {
        "pipeline": {
            "steps_completed": ["upload", "report_engine", "analytics_dashboard"],
            "status": "complete",
        },
        "report_bundle": bundle,
        "analytics": analytics,
    }
