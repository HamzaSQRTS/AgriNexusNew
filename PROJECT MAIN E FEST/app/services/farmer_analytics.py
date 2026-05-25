"""
Aggregate farmer upload records into dashboard payloads.
Matches keys requested by the user: dry_density, silt_clay, etc.
Merges 8-category report engine output into the analytics dashboard.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional


def _charts_from_report_engine(reports: Dict[str, Any]) -> Dict[str, Any]:
    """Build dashboard chart series from generated category reports."""
    charts: Dict[str, Any] = {}

    soil = reports.get("soil_health_nutrient") or {}
    npk = soil.get("npk") or {}
    agri = []
    for label, key in [("Nitrogen", "nitrogen_ppm"), ("Phosphorus", "phosphorus_ppm"), ("Potassium", "potassium_ppm")]:
        val = npk.get(key)
        if val is not None:
            agri.append({"name": label, "value": float(val)})
    if agri:
        charts["agriculture_soil"] = agri

    weather = reports.get("weather_microclimate") or {}
    forecast = (weather.get("daily_forecast") or [])[:7]
    if forecast:
        charts["weather_rainfall"] = [
            {"name": d["date"][5:], "value": float(d.get("rainfall_mm") or 0)} for d in forecast
        ]

    irrigation = reports.get("irrigation_water") or {}
    if irrigation.get("current_soil_moisture_pct") is not None:
        charts["irrigation_moisture"] = [
            {"name": "Current", "value": float(irrigation["current_soil_moisture_pct"])},
            {"name": "Target", "value": float(irrigation.get("target_moisture_pct") or 0)},
        ]

    market = reports.get("market_price_financial") or {}
    costs = market.get("input_costs_usd_per_ha") or {}
    if costs:
        charts["financial_inputs"] = [{"name": k.replace("_", " ").title(), "value": float(v)} for k, v in costs.items()]

    yield_r = reports.get("yield_forecast_harvest") or {}
    if yield_r.get("predicted_yield_t_ha") is not None:
        charts["yield_forecast"] = [
            {"name": "Yield t/ha", "value": float(yield_r["predicted_yield_t_ha"])},
            {"name": "Total tonnes", "value": float(yield_r.get("total_predicted_output_tonnes") or 0)},
        ]

    crop = reports.get("crop_health_pest") or {}
    if crop.get("infection_severity_index") is not None:
        charts["crop_health"] = [
            {"name": "Severity %", "value": float(crop["infection_severity_index"])},
        ]

    return charts


def _category_cards_from_report_engine(reports: Dict[str, Any], categories_meta: List[dict]) -> List[dict]:
    cards = []
    for meta in categories_meta:
        cid = meta.get("id")
        report = reports.get(cid) or {}
        cards.append(
            {
                "id": cid,
                "index": meta.get("index"),
                "title": meta.get("title"),
                "icon": meta.get("icon"),
                "summary": report.get("summary", "No data yet."),
            }
        )
    return cards


def build_farmer_analytics(
    upload_docs: List[dict],
    report_bundle: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if not upload_docs:
        return {"upload_count": 0, "summary": None, "charts": None, "recent_uploads": []}

    all_reports = []
    latest_report = None
    
    for doc in reversed(upload_docs):
        meta = doc.get("metadata") or {}
        extracted = meta.get("extracted_data") or {}
        report_type = meta.get("report_type")
        
        if report_type and report_type != "unknown":
            report_info = {
                "type": report_type,
                "data": extracted,
                "ai_summary": meta.get("ai_summary", ""),
                "confidence": meta.get("confidence", 0),
                "timestamp": meta.get("timestamp"),
                "raw_json": meta.get("raw_json", {})
            }
            all_reports.append(report_info)
            if not latest_report:
                latest_report = report_info

    summary = {
        "latest_report_type": latest_report["type"] if latest_report else "None",
        "latest_confidence": latest_report["confidence"] if latest_report else 0,
        "latest_ai_summary": latest_report["ai_summary"] if latest_report else "No data found."
    }

    charts = {}
    
    if latest_report:
        r_type = latest_report["type"]
        data = latest_report["data"]
        
        # 1. Agriculture Soil
        if r_type == "agriculture_soil":
            agri_data = []
            mapping = {"Nitrogen": "nitrogen", "Phosphorus": "phosphorus", "Potassium": "potassium"}
            for label, key in mapping.items():
                val = data.get(key, {}).get("value")
                if val is not None: agri_data.append({"name": label, "value": val})
            if agri_data: charts["agriculture_soil"] = agri_data

        # 2. Geotechnical Soil (Strict Mapping to User Requirements)
        if r_type == "geotechnical_soil":
            # Bar Chart: Physical Analysis (Moisture, Dry Density, CBR)
            geo_bar = []
            if data.get("moisture"): geo_bar.append({"name": "Moisture %", "value": data["moisture"]["value"]})
            if data.get("dry_density"): geo_bar.append({"name": "Density", "value": data["dry_density"]["value"]})
            if data.get("cbr"): geo_bar.append({"name": "CBR %", "value": data["cbr"]["value"]})
            if geo_bar: charts["geotechnical_bar"] = geo_bar

            # Pie Chart: Grain Size Analysis
            geo_pie = []
            if data.get("gravel"): geo_pie.append({"name": "Gravel", "value": data["gravel"]["value"]})
            if data.get("sand"): geo_pie.append({"name": "Sand", "value": data["sand"]["value"]})
            if data.get("silt_clay"): geo_pie.append({"name": "Silt/Clay", "value": data["silt_clay"]["value"]})
            if geo_pie: charts["geotechnical_composition"] = geo_pie

            # Bar Chart: Atterberg Limits
            geo_limits = []
            if data.get("liquid_limit"): geo_limits.append({"name": "Liquid Limit", "value": data["liquid_limit"]["value"]})
            if data.get("plastic_limit"): geo_limits.append({"name": "Plastic Limit", "value": data["plastic_limit"]["value"]})
            if data.get("free_swell"): geo_limits.append({"name": "Free Swell", "value": data["free_swell"]["value"]})
            if geo_limits: charts["geotechnical_limits"] = geo_limits

    # Recent uploads
    recent_uploads = []
    for doc in list(reversed(upload_docs))[:15]:
        meta = doc.get("metadata") or {}
        recent_uploads.append({
            "filename": doc.get("filename") or "unknown",
            "report_type": meta.get("report_type", "unknown"),
            "confidence": meta.get("confidence", 0),
            "timestamp": meta.get("timestamp"),
            "ai_summary": meta.get("ai_summary", "")
        })

    pipeline_ready = bool(upload_docs) and bool(report_bundle)
    report_engine = None
    category_cards: List[dict] = []

    if report_bundle:
        reports = report_bundle.get("reports") or {}
        categories_meta = report_bundle.get("categories_meta") or []
        report_engine = {
            "generated_at": report_bundle.get("generated_at"),
            "farm_context": report_bundle.get("farm_context"),
            "reports": reports,
        }
        category_cards = _category_cards_from_report_engine(reports, categories_meta)
        engine_charts = _charts_from_report_engine(reports)
        for key, val in engine_charts.items():
            if val and key not in charts:
                charts[key] = val

    if report_bundle and report_bundle.get("reports"):
        summaries = [r.get("summary", "") for r in report_bundle["reports"].values() if r.get("summary")]
        if summaries:
            summary["latest_ai_summary"] = summaries[0]
            summary["report_engine_overview"] = " | ".join(summaries[:3])

    return {
        "upload_count": len(upload_docs),
        "summary": summary,
        "charts": charts if charts else None,
        "recent_uploads": recent_uploads,
        "pipeline_ready": pipeline_ready,
        "report_engine": report_engine,
        "category_cards": category_cards,
    }
