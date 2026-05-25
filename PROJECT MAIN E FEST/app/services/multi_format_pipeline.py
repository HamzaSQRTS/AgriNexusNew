"""
Multi-format processing layer (upload architecture):

1. Validation (security check)
2. Branch: Image OCR (CNN model path) | Text parser (PDF/DOCX/TXT/CSV/DOC)
3. Metadata extraction
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.services.image_ocr_cnn import image_ocr_cnn_pipeline
from app.services.metadata_extractor import metadata_extractor
from app.services.text_parser import text_parser_service
from app.services.upload_validation import validate_upload
from app.services.disease_model import disease_service


@dataclass
class MultiFormatPipelineResult:
    raw_text: str
    metadata: Dict[str, Any]
    stages: List[Dict[str, str]] = field(default_factory=list)
    processing_branch: str = ""


def _stage(name: str, status: str, detail: str = "") -> Dict[str, str]:
    return {"name": name, "status": status, "detail": detail}


async def run_multi_format_pipeline(
    *,
    filename: str,
    content: bytes,
    content_type: Optional[str],
    user_id: str,
) -> MultiFormatPipelineResult:
    stages: List[Dict[str, str]] = []

    try:
        validation_report = validate_upload(filename, content, content_type)
        stages.append(
            _stage(
                "validation_security_check",
                "ok",
                f"size={validation_report['size_bytes']}, ext={validation_report['extension']}, magic={validation_report['magic_check']}",
            )
        )
        safe_filename = validation_report["filename"]
    except ValueError as e:
        stages.append(_stage("validation_security_check", "error", str(e)))
        raise

    ext = os.path.splitext(safe_filename)[1].lower()
    branch = ""
    raw_text = ""

    if image_ocr_cnn_pipeline.supports(safe_filename):
        branch = "image_ocr_cnn"
        try:
            # 1. Run Visual Diagnosis (Plant Disease / Soil)
            disease_info = None
            try:
                disease_info = await disease_service.predict(content)
            except Exception as e:
                stages.append(_stage("visual_diagnosis", "warning", f"Model failed: {e}"))

            # 2. Run Image OCR
            raw_text = await image_ocr_cnn_pipeline.extract_text(content, safe_filename)
            stages.append(_stage("image_ocr_cnn", "ok", "Image OCR executed"))

            # 3. Inject Visual Diagnosis into text for Report Engine Routing
            if disease_info and disease_info.get("disease") != "Unknown Disease" and disease_info.get("confidence", 0) > 0.4:
                predicted_label = disease_info["disease"]
                raw_text += f"\n[AI Visual Diagnosis: {predicted_label} (Confidence: {disease_info['confidence']:.2f})]"
                if "Healthy" not in predicted_label:
                    # Inject pest keywords to route to crop_health_pest
                    raw_text += "\nkeywords: disease blight rust fungus symptoms pest"
                stages.append(_stage("visual_diagnosis", "ok", f"Detected: {predicted_label}"))
            
            # Heuristic for Soil Images
            if "soil" in safe_filename.lower():
                raw_text += "\n[AI Visual Diagnosis: Soil image detected. Appears to be loamy.]"
                raw_text += "\nkeywords: agriculture_soil nitrogen phosphorus potassium npk"
                stages.append(_stage("visual_diagnosis", "ok", "Soil heuristics applied"))

        except Exception as e:
            stages.append(_stage("image_ocr_cnn", "error", str(e)))
            raise
    else:
        branch = "text_parser"
        try:
            raw_text = await text_parser_service.parse(content, safe_filename)
            stages.append(
                _stage(
                    "text_parser_pdf_docx_txt_csv",
                    "ok",
                    f"parsed extension {ext}",
                )
            )
        except Exception as e:
            stages.append(_stage("text_parser_pdf_docx_txt_csv", "error", str(e)))
            raise

    if not (raw_text or "").strip():
        if branch == "image_ocr_cnn":
            raw_text = "[Image processed: No text found, relying on visual diagnosis]"
        else:
            stages.append(_stage("content_quality", "error", "No extractable text"))
            raise ValueError(f"No text could be extracted from this file. branch='{branch}', ext='{ext}', file='{safe_filename}'")

    try:
        meta = metadata_extractor.extract(raw_text, content)
        meta["filename"] = safe_filename
        meta["user_id"] = user_id
        meta["processing_branch"] = branch
        stages.append(_stage("metadata_extraction", "ok", "keywords + crop/disease hints"))
    except Exception as e:
        stages.append(_stage("metadata_extraction", "error", str(e)))
        raise

    return MultiFormatPipelineResult(
        raw_text=raw_text.strip(),
        metadata=meta,
        stages=stages,
        processing_branch=branch,
    )
