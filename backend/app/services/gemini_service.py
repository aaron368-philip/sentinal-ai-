import os
import json
import logging
from typing import Dict, Any, Optional
import cv2
import numpy as np
from app.core.config import settings

logger = logging.getLogger(__name__)

class GeminiVisionClassifier:
    """
    Google Gemini Multimodal Vision Classifier for CCTV forensic analysis.
    Classifies persons (man, woman, child, clothing, carried items) and
    bags (backpack, handbag, tote bag, duffel bag, luggage, shopping bag).
    Uses the new official google.genai SDK (v1.75+).
    """

    def _get_key(self) -> str:
        key = (settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "")).strip()
        if key:
            return key
        # Read directly from backend/.env if changed at runtime without server restart
        env_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
        if os.path.exists(env_file):
            try:
                with open(env_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("GEMINI_API_KEY="):
                            val = line.split("=", 1)[1].strip().strip('"').strip("'")
                            if val:
                                return val
            except Exception:
                pass
        return ""

    def is_available(self) -> bool:
        """Check if Gemini API key is configured."""
        return bool(self._get_key())

    def classify_crop(self, image_path: str, base_class: str = "person") -> Dict[str, Any]:
        """
        Takes a file path to a cropped entity image and runs multimodal classification.
        Returns detailed structured forensics data (gender, age group, bag sub-type, clothing).
        """
        if not self.is_available():
            return {
                "available": False,
                "error": "Google Gemini API key not configured. Add GEMINI_API_KEY in backend/.env",
                "sub_class": base_class
            }

        if not os.path.exists(image_path):
            return {
                "available": False,
                "error": f"Image file not found: {image_path}",
                "sub_class": base_class
            }

        try:
            from google import genai
            from google.genai import types

            api_key = self._get_key()
            client = genai.Client(api_key=api_key)

            with open(image_path, "rb") as f:
                image_bytes = f.read()

            if base_class.lower() == "person":
                prompt = (
                    "You are a forensic CCTV analyst. Analyze this cropped CCTV image of a person. "
                    "Respond with ONLY a raw JSON object (no markdown, no backticks, no extra text) with the following keys:\n"
                    "{\n"
                    '  "sub_class": "man" | "woman" | "boy" | "girl" | "person",\n'
                    '  "gender": "male" | "female" | "undetermined",\n'
                    '  "estimated_age_group": "child" | "young_adult" | "adult" | "senior",\n'
                    '  "clothing_upper": "description of upper body clothing and color",\n'
                    '  "clothing_lower": "description of lower body clothing and color",\n'
                    '  "carried_items": ["list of visible carried items like backpack, handbag, umbrella, phone"],\n'
                    '  "confidence": 0.0 to 1.0\n'
                    "}"
                )
            else:
                prompt = (
                    "You are a forensic CCTV analyst. Analyze this cropped CCTV image of a carried bag or luggage. "
                    "Respond with ONLY a raw JSON object (no markdown, no backticks, no extra text) with the following keys:\n"
                    "{\n"
                    '  "sub_class": "backpack" | "handbag" | "tote_bag" | "duffel_bag" | "suitcase" | "shopping_bag" | "crossbody_bag" | "bag",\n'
                    '  "color": "primary colors",\n'
                    '  "material_or_style": "brief description of material, texture, or pattern",\n'
                    '  "confidence": 0.0 to 1.0\n'
                    "}"
                )

            # Generate classification using gemini-2.0-flash
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    prompt
                ]
            )

            raw_text = response.text.strip()
            # Strip potential code block formatting
            if raw_text.startswith("```"):
                lines = raw_text.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                raw_text = "\n".join(lines).strip()

            parsed = json.loads(raw_text)
            parsed["available"] = True
            return parsed

        except Exception as e:
            logger.warning(f"Gemini classification failed: {e}")
            return {
                "available": True,
                "error": str(e),
                "sub_class": base_class
            }

gemini_classifier = GeminiVisionClassifier()
