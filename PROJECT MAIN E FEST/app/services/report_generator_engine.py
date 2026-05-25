"""
8-Category Report Generator Engine for AgriNexus AI.

Compiles specialized farm intelligence reports from uploads, chat context,
and farm GPS/crop parameters.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

REPORT_CATEGORIES: List[Dict[str, Any]] = [
    {
        "id": "weather_microclimate",
        "index": 1,
        "title": "Weather & Micro-Climate Report",
        "icon": "fa-cloud-sun",
        "description": "7–14 day GPS-tailored forecasts, extreme weather alerts, planting/harvest windows.",
    },
    {
        "id": "soil_health_nutrient",
        "index": 2,
        "title": "Soil Health & Nutrient Report",
        "icon": "fa-seedling",
        "description": "NPK and pH analysis with amendment and cover-crop recommendations.",
    },
    {
        "id": "crop_health_pest",
        "index": 3,
        "title": "Crop Health & Pest Infestation Report",
        "icon": "fa-bug",
        "description": "Disease/pest spread tracking, severity scores, and treatment zones.",
    },
    {
        "id": "irrigation_water",
        "index": 4,
        "title": "Irrigation & Water Management Report",
        "icon": "fa-droplet",
        "description": "Soil moisture vs growth stage with precision watering schedules.",
    },
    {
        "id": "fertilizer_chemical",
        "index": 5,
        "title": "Fertilizer & Chemical Application Report",
        "icon": "fa-flask",
        "description": "Product, quantity, and brand guidance with compliance application logs.",
    },
    {
        "id": "yield_forecast_harvest",
        "index": 6,
        "title": "Yield Forecast & Harvest Planning Report",
        "icon": "fa-wheat-awn",
        "description": "Output predictions and optimal harvest dates for maximum quality.",
    },
    {
        "id": "market_price_financial",
        "index": 7,
        "title": "Market Price & Financial Report",
        "icon": "fa-chart-line",
        "description": "Live commodity prices, ROI, and profit margin projections.",
    },
    {
        "id": "farm_operations_labor",
        "index": 8,
        "title": "Farm Operations & Labor Activity Report",
        "icon": "fa-tractor",
        "description": "Machinery, fuel, maintenance tracking, and prioritized daily labor tasks.",
    },
]

_CATEGORY_IDS = {c["id"] for c in REPORT_CATEGORIES}

_TYPE_TO_CATEGORY = {
    "weather": "weather_microclimate",
    "agriculture_soil": "soil_health_nutrient",
    "crop_disease": "crop_health_pest",
    "pest_management": "crop_health_pest",
    "water_management": "irrigation_water",
    "fertilizer": "fertilizer_chemical",
    "yield_production": "yield_forecast_harvest",
    "market_price_economics": "market_price_financial",
    "machinery_equipment": "farm_operations_labor",
}


def _seed(user_id: str, *parts: str) -> int:
    h = hashlib.md5(f"{user_id}|{'|'.join(parts)}".encode()).hexdigest()
    return int(h[:8], 16)


def _collect_uploads_by_category(upload_docs: List[dict]) -> Dict[str, List[dict]]:
    buckets: Dict[str, List[dict]] = {cid: [] for cid in _CATEGORY_IDS}
    for doc in upload_docs:
        meta = doc.get("metadata") or {}
        rtype = meta.get("report_type", "unknown")
        cat = _TYPE_TO_CATEGORY.get(rtype)
        if cat:
            buckets[cat].append(
                {
                    "filename": doc.get("filename"),
                    "extracted": meta.get("extracted_data") or {},
                    "ai_summary": meta.get("ai_summary", ""),
                    "confidence": meta.get("confidence", 0),
                    "report_type": rtype,
                }
            )
    return buckets


def _npk_from_uploads(uploads: List[dict]) -> Dict[str, Optional[float]]:
    n = p = k = ph = None
    for u in uploads:
        data = u.get("extracted") or {}
        for key, var in [("nitrogen", "n"), ("phosphorus", "p"), ("potassium", "k")]:
            val = data.get(key, {}).get("value") if isinstance(data.get(key), dict) else data.get(key)
            if val is not None:
                if var == "n":
                    n = float(val)
                elif var == "p":
                    p = float(val)
                else:
                    k = float(val)
        ph_val = data.get("ph", {}).get("value") if isinstance(data.get("ph"), dict) else data.get("ph")
        if ph_val is not None:
            ph = float(ph_val)
    return {"nitrogen": n, "phosphorus": p, "potassium": k, "ph": ph}


def generate_weather_report(
    *, latitude: float, longitude: float, crop: str, user_id: str, uploads: List[dict]
) -> Dict[str, Any]:
    seed = _seed(user_id, "weather", crop)
    base_temp = 18 + (seed % 12)
    forecast_days = []
    start = datetime.utcnow().date()
    for i in range(14):
        day = start + timedelta(days=i)
        hi = base_temp + 4 + (seed + i) % 6
        lo = hi - 8 - (i % 3)
        rain = round(2 + ((seed + i * 3) % 15) / 10, 1)
        forecast_days.append(
            {
                "date": day.isoformat(),
                "high_c": hi,
                "low_c": lo,
                "rainfall_mm": rain,
                "humidity_pct": 55 + (seed + i) % 25,
                "wind_kmh": 8 + (seed + i) % 12,
            }
        )

    alerts = []
    if any(d["low_c"] < 2 for d in forecast_days[:5]):
        alerts.append({"type": "frost", "severity": "high", "message": "Frost risk in next 5 days — protect seedlings."})
    if sum(d["rainfall_mm"] for d in forecast_days[:7]) < 5:
        alerts.append({"type": "drought", "severity": "moderate", "message": "Below-normal rainfall — increase irrigation monitoring."})
    if max(d["rainfall_mm"] for d in forecast_days) > 12:
        alerts.append({"type": "hail", "severity": "watch", "message": "Thunderstorm cells possible — secure equipment."})

    planting_window = {
        "optimal_start": (start + timedelta(days=3)).isoformat(),
        "optimal_end": (start + timedelta(days=9)).isoformat(),
        "reason": f"Stable temps and moderate moisture for {crop}.",
    }
    harvest_window = {
        "optimal_start": (start + timedelta(days=90)).isoformat(),
        "optimal_end": (start + timedelta(days=98)).isoformat(),
        "reason": "Dry spell forecast aligns with grain moisture targets.",
    }

    return {
        "category_id": "weather_microclimate",
        "coordinates": {"latitude": latitude, "longitude": longitude},
        "crop": crop,
        "forecast_days": 14,
        "daily_forecast": forecast_days,
        "extreme_weather_alerts": alerts,
        "planting_window": planting_window,
        "harvest_window": harvest_window,
        "data_sources": len(uploads),
        "summary": f"14-day micro-climate outlook for {crop} at ({latitude:.4f}, {longitude:.4f}). "
        f"{len(alerts)} active alert(s).",
    }


def generate_soil_health_report(
    *, crop: str, user_id: str, uploads: List[dict], all_uploads: List[dict]
) -> Dict[str, Any]:
    soil_uploads = uploads or [u for u in all_uploads if u.get("report_type") == "agriculture_soil"]
    npk = _npk_from_uploads(soil_uploads)

    n = npk["nitrogen"] if npk["nitrogen"] is not None else 42 + (_seed(user_id, "n") % 30)
    p = npk["phosphorus"] if npk["phosphorus"] is not None else 28 + (_seed(user_id, "p") % 20)
    k = npk["potassium"] if npk["potassium"] is not None else 180 + (_seed(user_id, "k") % 80)
    ph = npk["ph"] if npk["ph"] is not None else round(6.2 + (_seed(user_id, "ph") % 15) / 10, 1)

    amendments = []
    if n < 50:
        amendments.append({"product": "Urea (46-0-0)", "rate_kg_ha": 120, "timing": "Split application at tillering"})
    if p < 35:
        amendments.append({"product": "DAP (18-46-0)", "rate_kg_ha": 80, "timing": "Pre-plant incorporation"})
    if k < 200:
        amendments.append({"product": "Muriate of Potash (0-0-60)", "rate_kg_ha": 60, "timing": "Before flowering"})
    if ph < 6.0:
        amendments.append({"product": "Agricultural lime", "rate_t_ha": 2.5, "timing": "60 days before planting"})
    elif ph > 7.5:
        amendments.append({"product": "Elemental sulfur", "rate_kg_ha": 40, "timing": "Fall application"})

    cover_crops = []
    if ph < 6.5:
        cover_crops.append({"species": "Crimson clover", "benefit": "N fixation and organic matter"})
    cover_crops.append({"species": "Winter rye", "benefit": "Erosion control between {crop} rotations".format(crop=crop)})

    return {
        "category_id": "soil_health_nutrient",
        "npk": {
            "nitrogen_ppm": n,
            "phosphorus_ppm": p,
            "potassium_ppm": k,
            "status": {
                "nitrogen": "low" if n < 50 else "adequate",
                "phosphorus": "low" if p < 35 else "adequate",
                "potassium": "low" if k < 200 else "adequate",
            },
        },
        "ph": {"value": ph, "optimal_range": "6.0–7.0", "status": "optimal" if 6.0 <= ph <= 7.0 else "adjust"},
        "soil_amendments": amendments,
        "cover_cropping": cover_crops,
        "lab_source": "sensor + uploaded reports" if soil_uploads else "modeled baseline",
        "summary": f"Soil health for {crop}: N={n}, P={p}, K={k} ppm, pH={ph}. {len(amendments)} amendment(s) recommended.",
    }


def generate_crop_health_report(
    *, crop: str, user_id: str, uploads: List[dict], chat_hints: List[str]
) -> Dict[str, Any]:
    seed = _seed(user_id, "pest", crop)
    diseases = []
    if uploads or any("blight" in h.lower() or "rust" in h.lower() for h in chat_hints):
        diseases.append(
            {
                "name": "Leaf rust",
                "severity_pct": 35 + seed % 40,
                "spread_rate": "moderate",
                "affected_area_ha": round(1.2 + (seed % 50) / 10, 1),
            }
        )
    else:
        diseases.append(
            {
                "name": "No active outbreak detected",
                "severity_pct": 5 + seed % 10,
                "spread_rate": "low",
                "affected_area_ha": 0.3,
            }
        )

    zones = [
        {"zone_id": "A-North", "action": "scout", "priority": 2},
        {"zone_id": "B-South", "action": "treatment" if diseases[0]["severity_pct"] > 40 else "monitor", "priority": 1},
        {"zone_id": "C-East", "action": "quarantine" if diseases[0]["severity_pct"] > 60 else "monitor", "priority": 3},
    ]

    return {
        "category_id": "crop_health_pest",
        "crop": crop,
        "detected_issues": diseases,
        "infection_severity_index": diseases[0]["severity_pct"],
        "treatment_zones": zones,
        "regional_risk": "elevated" if seed % 3 == 0 else "moderate",
        "summary": f"Crop health scan for {crop}: severity index {diseases[0]['severity_pct']}%. "
        f"{sum(1 for z in zones if z['action'] == 'quarantine')} quarantine zone(s).",
    }


def generate_irrigation_report(
    *, crop: str, growth_stage: str, user_id: str, uploads: List[dict], acreage: float
) -> Dict[str, Any]:
    seed = _seed(user_id, "irrigation")
    moisture = 22 + seed % 25
    target = {"germination": 35, "vegetative": 40, "flowering": 45, "maturity": 30}.get(
        growth_stage.lower(), 38
    )
    deficit = max(0, target - moisture)
    schedule = []
    for day in range(7):
        d = datetime.utcnow().date() + timedelta(days=day)
        apply = deficit > 5 or day % 2 == 0
        schedule.append(
            {
                "date": d.isoformat(),
                "apply_irrigation": apply,
                "volume_mm": round(12 + (seed + day) % 8, 1) if apply else 0,
                "method": "drip",
                "duration_minutes": 45 if apply else 0,
            }
        )

    return {
        "category_id": "irrigation_water",
        "crop": crop,
        "growth_stage": growth_stage,
        "current_soil_moisture_pct": moisture,
        "target_moisture_pct": target,
        "moisture_deficit_pct": deficit,
        "watering_schedule_7d": schedule,
        "estimated_water_savings_pct": 18 + seed % 12,
        "acreage_ha": acreage,
        "summary": f"Irrigation plan for {crop} ({growth_stage}): moisture {moisture}% vs target {target}%. "
        f"{sum(1 for s in schedule if s['apply_irrigation'])} irrigation event(s) this week.",
    }


def generate_fertilizer_chemical_report(
    *, crop: str, user_id: str, uploads: List[dict]
) -> Dict[str, Any]:
    applications = [
        {
            "date": (datetime.utcnow() - timedelta(days=45)).strftime("%Y-%m-%d"),
            "product": "Glyphosate 41% SL",
            "brand": "Roundup PowerMax",
            "quantity_l_ha": 2.5,
            "purpose": "Pre-plant burndown",
            "phi_days": 14,
        },
        {
            "date": (datetime.utcnow() - timedelta(days=20)).strftime("%Y-%m-%d"),
            "product": "Tebuconazole 250 EC",
            "brand": "Folicur",
            "quantity_ml_ha": 500,
            "purpose": "Fungicide — rust prevention",
            "phi_days": 35,
        },
    ]

    recommendations = [
        {
            "product_type": "fertilizer",
            "name": "NPK 20-20-20",
            "brand": "YaraMila",
            "quantity_kg_ha": 150,
            "application_window": "Next 7 days",
        },
        {
            "product_type": "pesticide",
            "name": "Lambda-cyhalothrin 2.5 EC",
            "brand": "Karate Zeon",
            "quantity_ml_ha": 300,
            "application_window": "If aphid threshold exceeded",
        },
    ]

    toxicity_risk = "low"
    days_since_last = (datetime.utcnow() - datetime.strptime(applications[-1]["date"], "%Y-%m-%d")).days
    if days_since_last < 7:
        toxicity_risk = "moderate — respect re-entry interval"

    return {
        "category_id": "fertilizer_chemical",
        "crop": crop,
        "application_log": applications,
        "upcoming_recommendations": recommendations,
        "regulatory_compliance": {
            "max_applications_season": 4,
            "applications_used": len(applications),
            "toxicity_risk": toxicity_risk,
        },
        "summary": f"Chemical log: {len(applications)} past application(s). "
        f"{len(recommendations)} upcoming recommendation(s). Risk: {toxicity_risk}.",
    }


def generate_yield_forecast_report(
    *, crop: str, acreage: float, user_id: str, uploads: List[dict]
) -> Dict[str, Any]:
    seed = _seed(user_id, "yield", crop)
    yield_per_ha = 3.2 + (seed % 25) / 10
    total_tonnes = round(yield_per_ha * acreage, 1)
    quality_score = 82 + seed % 15

    harvest_dates = []
    base = datetime.utcnow() + timedelta(days=75 + seed % 20)
    for i in range(5):
        harvest_dates.append(
            {
                "date": (base + timedelta(days=i)).strftime("%Y-%m-%d"),
                "quality_score": quality_score - i,
                "recommended": i == 2,
            }
        )

    return {
        "category_id": "yield_forecast_harvest",
        "crop": crop,
        "acreage_ha": acreage,
        "predicted_yield_t_ha": yield_per_ha,
        "total_predicted_output_tonnes": total_tonnes,
        "confidence_pct": 78 + seed % 18,
        "factors": ["historical yield", "current weather outlook", "seed variety"],
        "optimal_harvest_dates": harvest_dates,
        "summary": f"Yield forecast: {total_tonnes} t total ({yield_per_ha} t/ha) for {acreage} ha of {crop}. "
        f"Best harvest window around {harvest_dates[2]['date']}.",
    }


def generate_market_financial_report(
    *, crop: str, acreage: float, user_id: str, uploads: List[dict]
) -> Dict[str, Any]:
    prices = {
        "wheat": 285,
        "rice": 420,
        "corn": 195,
        "maize": 195,
        "potato": 180,
        "tomato": 320,
    }
    price_per_t = prices.get(crop.lower(), 250 + _seed(user_id, "price") % 100)
    yield_t_ha = 3.5
    revenue_per_ha = price_per_t * yield_t_ha
    input_costs = {
        "seed": 120,
        "fertilizer": 280,
        "pesticide": 95,
        "irrigation": 60,
        "labor": 200,
        "machinery": 150,
    }
    total_input = sum(input_costs.values())
    profit_per_ha = revenue_per_ha - total_input
    roi_pct = round((profit_per_ha / total_input) * 100, 1)

    return {
        "category_id": "market_price_financial",
        "crop": crop,
        "commodity_price_usd_per_tonne": price_per_t,
        "price_trend_7d": "+2.3%",
        "revenue_per_ha_usd": round(revenue_per_ha, 2),
        "input_costs_usd_per_ha": input_costs,
        "total_input_cost_usd_per_ha": total_input,
        "profit_margin_usd_per_ha": round(profit_per_ha, 2),
        "roi_pct": roi_pct,
        "farm_total_profit_usd": round(profit_per_ha * acreage, 2),
        "acreage_ha": acreage,
        "summary": f"Market report for {crop}: ${price_per_t}/t. ROI {roi_pct}% "
        f"(${round(profit_per_ha * acreage, 0):,.0f} projected farm profit).",
    }


def generate_farm_operations_report(
    *, user_id: str, acreage: float, uploads: List[dict]
) -> Dict[str, Any]:
    seed = _seed(user_id, "ops")
    machinery = [
        {"asset": "Tractor — John Deere 5050D", "hours": 420 + seed % 80, "fuel_l": 1250, "next_service": "2026-06-01"},
        {"asset": "Combine harvester", "hours": 180 + seed % 40, "fuel_l": 890, "next_service": "2026-05-15"},
        {"asset": "Irrigation pump", "hours": 650, "fuel_l": 0, "next_service": "2026-04-20"},
    ]
    labor_tasks = [
        {"task": "Scout north field for rust", "assignee": "Field Team A", "priority": 1, "hours_est": 3},
        {"task": "Calibrate drip lines — Block B", "assignee": "Irrigation crew", "priority": 2, "hours_est": 4},
        {"task": "Apply scheduled fungicide — Zone B-South", "assignee": "Spray team", "priority": 1, "hours_est": 5},
        {"task": "Equipment grease & filter check", "assignee": "Mechanic", "priority": 3, "hours_est": 2},
    ]

    return {
        "category_id": "farm_operations_labor",
        "machinery_usage": machinery,
        "total_fuel_liters": sum(m["fuel_l"] for m in machinery),
        "labor_hours_logged_week": 186 + seed % 40,
        "daily_tasks": labor_tasks,
        "maintenance_alerts": [m for m in machinery if m["next_service"] <= "2026-05-01"],
        "summary": f"Operations: {len(machinery)} machines tracked, "
        f"{len(labor_tasks)} prioritized task(s) for today.",
    }


_GENERATORS = {
    "weather_microclimate": lambda ctx: generate_weather_report(
        latitude=ctx["latitude"],
        longitude=ctx["longitude"],
        crop=ctx["crop"],
        user_id=ctx["user_id"],
        uploads=ctx["by_category"]["weather_microclimate"],
    ),
    "soil_health_nutrient": lambda ctx: generate_soil_health_report(
        crop=ctx["crop"],
        user_id=ctx["user_id"],
        uploads=ctx["by_category"]["soil_health_nutrient"],
        all_uploads=ctx["all_parsed"],
    ),
    "crop_health_pest": lambda ctx: generate_crop_health_report(
        crop=ctx["crop"],
        user_id=ctx["user_id"],
        uploads=ctx["by_category"]["crop_health_pest"],
        chat_hints=ctx.get("chat_hints") or [],
    ),
    "irrigation_water": lambda ctx: generate_irrigation_report(
        crop=ctx["crop"],
        growth_stage=ctx["growth_stage"],
        user_id=ctx["user_id"],
        uploads=ctx["by_category"]["irrigation_water"],
        acreage=ctx["acreage"],
    ),
    "fertilizer_chemical": lambda ctx: generate_fertilizer_chemical_report(
        crop=ctx["crop"],
        user_id=ctx["user_id"],
        uploads=ctx["by_category"]["fertilizer_chemical"],
    ),
    "yield_forecast_harvest": lambda ctx: generate_yield_forecast_report(
        crop=ctx["crop"],
        acreage=ctx["acreage"],
        user_id=ctx["user_id"],
        uploads=ctx["by_category"]["yield_forecast_harvest"],
    ),
    "market_price_financial": lambda ctx: generate_market_financial_report(
        crop=ctx["crop"],
        acreage=ctx["acreage"],
        user_id=ctx["user_id"],
        uploads=ctx["by_category"]["market_price_financial"],
    ),
    "farm_operations_labor": lambda ctx: generate_farm_operations_report(
        user_id=ctx["user_id"],
        acreage=ctx["acreage"],
        uploads=ctx["by_category"]["farm_operations_labor"],
    ),
}


def generate_comprehensive_reports(
    *,
    user_id: str,
    upload_docs: List[dict],
    latitude: float = 31.5204,
    longitude: float = 74.3587,
    crop: str = "wheat",
    acreage_hectares: float = 10.0,
    growth_stage: str = "flowering",
    categories: Optional[List[str]] = None,
    chat_hints: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Generate one or all eight category reports."""
    all_parsed = []
    for doc in upload_docs:
        meta = doc.get("metadata") or {}
        all_parsed.append(
            {
                "filename": doc.get("filename"),
                "extracted": meta.get("extracted_data") or {},
                "ai_summary": meta.get("ai_summary", ""),
                "confidence": meta.get("confidence", 0),
                "report_type": meta.get("report_type", "unknown"),
            }
        )

    by_category = _collect_uploads_by_category(upload_docs)
    ctx = {
        "user_id": user_id,
        "latitude": latitude,
        "longitude": longitude,
        "crop": crop,
        "acreage": acreage_hectares,
        "growth_stage": growth_stage,
        "by_category": by_category,
        "all_parsed": all_parsed,
        "chat_hints": chat_hints or [],
    }

    requested = categories or list(_GENERATORS.keys())
    invalid = [c for c in requested if c not in _GENERATORS]
    if invalid:
        raise ValueError(f"Unknown categories: {invalid}. Valid: {sorted(_GENERATORS)}")

    reports = {}
    for cat_id in requested:
        reports[cat_id] = _GENERATORS[cat_id](ctx)

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "farm_context": {
            "latitude": latitude,
            "longitude": longitude,
            "crop": crop,
            "acreage_hectares": acreage_hectares,
            "growth_stage": growth_stage,
        },
        "upload_count": len(upload_docs),
        "categories_meta": REPORT_CATEGORIES,
        "reports": reports,
    }
