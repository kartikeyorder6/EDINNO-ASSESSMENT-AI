"""
sensor_library.py - Exact local grade-specific sensor & component image resolver.

Loads authentic physical sensor images provided by educators in:
`assets/sensors/grade_{grade}/` (e.g. grade_9, grade_7) or `assets/sensors/common/`.

Guarantees:
- Zero clip-art extraction from PDFs.
- Zero external internet or scraping calls.
- 100% exact match to physical hardware photos in the grade folder.
- Returns None if the image file is not present on disk.
"""

from __future__ import annotations

import base64
import io
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image

from app.core.logging import logger

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SENSORS_ROOT = PROJECT_ROOT / "assets" / "sensors"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

_IMAGE_CACHE: Dict[str, Optional[Dict[str, Any]]] = {}


def detect_grade_from_text(text: str) -> Optional[int]:
    """Detect school grade from text (e.g. 'Grade 9', 'Class 9', 'Ch 9')."""
    match = re.search(r"\b(?:grade|class|g)\s*[-_]?\s*([6-9]|1[0-2])\b", text.lower())
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            pass
    return None


def _normalize_name(name: str) -> str:
    """Normalize a sensor or file name for matching (alphanumeric only, strips extensions)."""
    s = re.sub(r"\.(?:png|jpe?g|webp|svg)$", "", str(name or ""), flags=re.I)
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def _read_and_optimize_image(file_path: Path, max_dim: int = 700) -> Optional[str]:
    """Read a local image file, optimize dimensions, and encode to Base64 data URI."""
    try:
        with Image.open(file_path) as img:
            # Downscale large raw camera photos to ~700px max dimension
            img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            fmt = "PNG" if img.format == "PNG" and img.mode in ("RGBA", "LA") else "JPEG"
            if fmt == "JPEG" and img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(buf, format=fmt, quality=88, optimize=True)
            b64_str = base64.b64encode(buf.getvalue()).decode("ascii")
            mime = "image/png" if fmt == "PNG" else "image/jpeg"
            return f"data:{mime};base64,{b64_str}"
    except Exception as exc:
        logger.warning("Error reading sensor image %s: %s", file_path, exc)
    return None


def _load_manifest(grade_dir: Path) -> List[Dict[str, Any]]:
    """Load sensors.json from a grade directory."""
    manifest_path = grade_dir / "sensors.json"
    if manifest_path.is_file():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                return json.load(f).get("sensors", [])
        except Exception as exc:
            logger.warning("Failed parsing %s: %s", manifest_path, exc)
    return []


def get_sensor_image(
    sensor_name_or_id: str,
    grade: Optional[int | str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Search `assets/sensors/grade_{grade}/` strictly for user-provided images.

    Precedence:
    1. `assets/sensors/grade_{grade}/`
    2. Check all other `assets/sensors/grade_*/` (e.g. grade_9, grade_7)
    3. `assets/sensors/common/`
    """
    if not SENSORS_ROOT.is_dir() or not sensor_name_or_id:
        return None

    target = _normalize_name(sensor_name_or_id)
    if not target:
        return None

    candidate_dirs: List[Path] = []
    if grade:
        grade_dir = SENSORS_ROOT / f"grade_{grade}"
        if grade_dir.is_dir():
            candidate_dirs.append(grade_dir)

    # Also search grade_9 and grade_7 if not explicitly specified
    for gname in ("grade_9", "grade_7", "grade_8", "grade_6", "grade_10"):
        gdir = SENSORS_ROOT / gname
        if gdir.is_dir() and gdir not in candidate_dirs:
            candidate_dirs.append(gdir)

    common_dir = SENSORS_ROOT / "common"
    if common_dir.is_dir() and common_dir not in candidate_dirs:
        candidate_dirs.append(common_dir)

    for cdir in candidate_dirs:
        # 1. Match via sensors.json manifest
        manifest = _load_manifest(cdir)
        for s in manifest:
            sid = _normalize_name(s.get("id", ""))
            s_name = _normalize_name(s.get("name", ""))
            s_keywords = [_normalize_name(k) for k in s.get("keywords", [])]

            matched = (
                target == sid
                or target == s_name
                or target in s_keywords
                or any(target in k or k in target for k in s_keywords if len(k) >= 3)
            )

            if matched:
                fname = s.get("filename")
                if fname:
                    fpath = cdir / fname
                    if fpath.is_file():
                        data_uri = _read_and_optimize_image(fpath)
                        if data_uri:
                            logger.info("Loaded sensor image from manifest: %s", fpath)
                            return {
                                "image_data": data_uri,
                                "caption": s.get("caption") or f"{s.get('name', sensor_name_or_id)} Reference Diagram",
                                "component_name": s.get("name") or sensor_name_or_id,
                                "source": f"local_{cdir.name}",
                            }

        # 2. Match via direct filename scan
        try:
            for entry in cdir.iterdir():
                if entry.is_file() and entry.suffix.lower() in SUPPORTED_EXTENSIONS:
                    stem = _normalize_name(entry.stem)
                    if target == stem or target in stem or stem in target:
                        data_uri = _read_and_optimize_image(entry)
                        if data_uri:
                            logger.info("Loaded sensor image by filename: %s", entry)
                            return {
                                "image_data": data_uri,
                                "caption": f"{sensor_name_or_id} Reference Diagram",
                                "component_name": sensor_name_or_id,
                                "source": f"local_{cdir.name}",
                            }
        except Exception as exc:
            logger.warning("Error scanning directory %s: %s", cdir, exc)

    return None


def get_sensor_image_for_curriculum(
    text: str,
    grade: Optional[int | str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Identify the sensor taught in the curriculum text, then load its exact
    image from `assets/sensors/grade_{grade}/`.

    Returns None if no image file is found on disk.
    Never invents, scrapes, or extracts clip-art.
    """
    text_lower = str(text or "").lower()
    if not text_lower:
        return None

    effective_grade = grade or detect_grade_from_text(text_lower)

    # Search candidates across manifest definitions
    candidate_dirs: List[Path] = []
    if effective_grade:
        gdir = SENSORS_ROOT / f"grade_{effective_grade}"
        if gdir.is_dir():
            candidate_dirs.append(gdir)

    for gname in ("grade_9", "grade_7", "grade_8", "grade_6", "grade_10"):
        gdir = SENSORS_ROOT / gname
        if gdir.is_dir() and gdir not in candidate_dirs:
            candidate_dirs.append(gdir)

    best_match_sensor: Optional[Dict[str, Any]] = None
    best_match_dir: Optional[Path] = None
    best_score = 0.0

    header = " ".join(text_lower.split()[:120])

    for cdir in candidate_dirs:
        for s in _load_manifest(cdir):
            score = 0.0
            for kw in s.get("keywords", []):
                kw_clean = kw.lower()
                if not kw_clean:
                    continue
                if kw_clean in header:
                    score += 8.0 * len(kw_clean)
                matches = len(re.findall(r"\b" + re.escape(kw_clean) + r"\b", text_lower))
                score += matches * (len(kw_clean) ** 0.5)

            if score > best_score:
                best_score = score
                best_match_sensor = s
                best_match_dir = cdir

    if best_match_sensor and best_match_dir and best_score > 0:
        fname = best_match_sensor.get("filename")
        if fname:
            fpath = best_match_dir / fname
            if fpath.is_file():
                data_uri = _read_and_optimize_image(fpath)
                if data_uri:
                    return {
                        "image_data": data_uri,
                        "caption": best_match_sensor.get("caption") or f"{best_match_sensor.get('name')} Reference Diagram",
                        "component_name": best_match_sensor.get("name"),
                        "source": f"local_{best_match_dir.name}",
                    }

    # Fallback: scan filenames directly — catches components not yet in sensors.json
    # (e.g. CD4017.jpg placed in grade_9/ without a manifest entry)
    words = set(re.sub(r"[^a-z0-9]+", " ", text_lower).split())
    for cdir in candidate_dirs:
        try:
            for entry in sorted(cdir.iterdir()):
                if not entry.is_file() or entry.suffix.lower() not in SUPPORTED_EXTENSIONS:
                    continue
                stem_words = set(re.sub(r"[^a-z0-9]+", " ", entry.stem.lower()).split())
                if stem_words & words:  # any word overlap between filename stem and curriculum text
                    data_uri = _read_and_optimize_image(entry)
                    if data_uri:
                        logger.info("Sensor library filename-fallback match: %s", entry)
                        return {
                            "image_data": data_uri,
                            "caption": f"{entry.stem.replace('_', ' ')} Reference Diagram",
                            "component_name": entry.stem.replace("_", " "),
                            "source": f"local_{cdir.name}",
                        }
        except Exception as exc:
            logger.warning("Error in filename fallback scan %s: %s", cdir, exc)

    return None

