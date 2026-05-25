from fastapi import APIRouter, Depends
from app.dependencies import check_admin
from app.db.mongodb import get_db
from motor.motor_asyncio import AsyncIOMotorDatabase

router = APIRouter()

@router.get("/system")
async def get_system_analytics(
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin=Depends(check_admin)
):
    """Fetch system-wide analytics for admin dashboard."""
    user_count = await db.users.count_documents({})
    upload_count = await db.uploads.count_documents({})
    feedback_count = await db.feedback.count_documents({})
    
    # Mocking some trend data for charts
    activity_trend = [
        {"day": "Mon", "queries": 45},
        {"day": "Tue", "queries": 62},
        {"day": "Wed", "queries": 88},
        {"day": "Thu", "queries": 75},
        {"day": "Fri", "queries": 110}
    ]

    return {
        "summary": {
            "total_users": user_count,
            "total_uploads": upload_count,
            "total_feedback": feedback_count,
            "ai_accuracy": "94.2%"
        },
        "trends": activity_trend
    }
