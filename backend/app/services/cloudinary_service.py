"""
cloudinary_service.py - Secure Cloudinary PDF Asset Storage Service.
Organizes curriculum chapter PDFs by Grade (6-12) and Category (Topic, Activity, Project, Reference).
Provides upload, retrieval, preview, replacement, deduplication, and deletion.
Never exposes API secrets to the client.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import HTTPException

from app.core.config import settings
from app.core.logging import logger
from app.schemas.storage import CloudinaryAsset, CloudinaryConfigStatus
from app.services.curriculum_service import curriculum_service
from app.services.pdf_reader import extract_pdf_text_with_meta


_SLUG_CLEAN_RE = re.compile(r"[^a-zA-Z0-9_\-]+")
_PDF_MAGIC = b"%PDF"


class CloudinaryStorageService:
    """Thread-safe Cloudinary PDF storage and curriculum asset manager."""

    def __init__(self):
        self.local_staging_dir = Path(__file__).resolve().parents[2] / "data" / "curriculum_assets"
        self.local_staging_dir.mkdir(parents=True, exist_ok=True)

    def get_config(self) -> Dict[str, Optional[str]]:
        return settings.get_cloudinary_config()

    def is_configured(self) -> bool:
        cfg = self.get_config()
        return bool(cfg.get("cloud_name") and cfg.get("api_key") and cfg.get("api_secret"))

    def get_status(self) -> CloudinaryConfigStatus:
        cfg = self.get_config()
        return CloudinaryConfigStatus(
            configured=self.is_configured(),
            cloud_name=cfg.get("cloud_name"),
            folder_prefix=cfg.get("folder_prefix") or "edinno_curriculum",
            max_file_size_bytes=settings.PDF_MAX_BYTES,
        )

    def _sanitize_slug(self, text: str) -> str:
        s = _SLUG_CLEAN_RE.sub("_", text).strip("_")
        return s[:60] if s else "pdf_document"

    def get_folder_path(self, grade: int, category: str) -> str:
        prefix = settings.CLOUDINARY_FOLDER_PREFIX or "edinno_curriculum"
        cat_clean = self._sanitize_slug(category).lower() or "general"
        return f"{prefix}/grade_{grade}/{cat_clean}"

    def generate_public_id(self, grade: int, category: str, filename: str) -> str:
        base_name = Path(filename).stem
        slug = self._sanitize_slug(base_name)
        folder = self.get_folder_path(grade, category)
        return f"{folder}/{slug}"

    def compute_signature(self, params: Dict[str, Any], api_secret: str) -> str:
        """
        Cloudinary signature generation:
        Alphabetically sort parameter keys (excluding file, cloud_name, resource_type, api_key),
        join key=value with '&', append api_secret, then calculate SHA-1 hex digest.
        """
        excluded = {"file", "cloud_name", "resource_type", "api_key"}
        sorted_keys = sorted(k for k in params.keys() if k not in excluded and params[k] is not None)
        to_sign = "&".join(f"{k}={params[k]}" for k in sorted_keys)
        to_sign += api_secret
        return hashlib.sha1(to_sign.encode("utf-8")).hexdigest()

    def compress_pdf_for_storage(
        self,
        pdf_bytes: bytes,
        target_max_bytes: int = 9_800_000,
    ) -> bytes:
        """
        Safely compress and optimize PDF bytes to meet Cloudinary's 10MB upload threshold
        while preserving educational text, vectors, diagrams, and formatting.
        """
        if len(pdf_bytes) <= target_max_bytes:
            return pdf_bytes

        try:
            import pymupdf
            doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")

            # Pass 1: Garbage collection & stream deflation
            compressed = doc.tobytes(
                garbage=4,
                deflate=True,
                deflate_images=True,
                deflate_fonts=True,
                clean=True,
            )
            if len(compressed) <= target_max_bytes:
                doc.close()
                logger.info(
                    f"PDF deflated: {len(pdf_bytes):,} -> {len(compressed):,} bytes (-{(1 - len(compressed)/len(pdf_bytes))*100:.1f}%)"
                )
                return compressed

            # Pass 2: Downsample and re-encode high-res raster images if still above limit
            try:
                from PIL import Image
                import io

                for page in doc:
                    img_list = page.get_images(full=True)
                    for img_info in img_list:
                        xref = img_info[0]
                        try:
                            extracted = doc.extract_image(xref)
                            if extracted and len(extracted.get("image", b"")) > 100_000:
                                img_data = extracted["image"]
                                im = Image.open(io.BytesIO(img_data))
                                if im.width > 1200 or im.height > 1200:
                                    im.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
                                out_io = io.BytesIO()
                                im.convert("RGB").save(out_io, format="JPEG", quality=75, optimize=True)
                                new_bytes = out_io.getvalue()
                                if len(new_bytes) < len(img_data):
                                    doc.update_stream(xref, new_bytes)
                        except Exception:
                            continue
            except Exception as img_err:
                logger.warning(f"Image downsampling pass skipped: {img_err}")

            final_compressed = doc.tobytes(
                garbage=4,
                deflate=True,
                deflate_images=True,
                deflate_fonts=True,
                clean=True,
            )
            doc.close()
            logger.info(
                f"PDF multi-pass compressed: {len(pdf_bytes):,} -> {len(final_compressed):,} bytes (-{(1 - len(final_compressed)/len(pdf_bytes))*100:.1f}%)"
            )
            return final_compressed
        except Exception as exc:
            logger.warning(f"PDF compression failed; continuing with original bytes: {exc}")
            return pdf_bytes

    async def upload_pdf(
        self,
        file_bytes: bytes,
        filename: str,
        grade: int,
        chapter: str,
        category: str,
        title: Optional[str] = None,
        overwrite: bool = True,
        existing_asset_id: Optional[str] = None,
    ) -> Tuple[CloudinaryAsset, bool]:
        """
        Validate, hash, upload to Cloudinary (or local staging if credentials missing),
        and store metadata in database.
        Returns: (CloudinaryAsset, duplicate_detected)
        """
        # 1. Validation
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        if len(file_bytes) > settings.PDF_MAX_BYTES:
            max_mb = settings.PDF_MAX_BYTES // (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds maximum allowed size of {max_mb} MB.",
            )
        if not file_bytes.startswith(_PDF_MAGIC):
            raise HTTPException(
                status_code=400,
                detail="Invalid file format. Only authentic PDF documents (%PDF) are accepted.",
            )

        if grade < 6 or grade > 12:
            raise HTTPException(status_code=400, detail="Grade must be between 6 and 12.")

        # 2. SHA-256 Checksum & Duplicate Detection
        sha256_hash = hashlib.sha256(file_bytes).hexdigest()
        existing_duplicate = curriculum_service.get_pdf_asset_by_hash(sha256_hash)
        duplicate_detected = False

        if existing_duplicate and not existing_asset_id and not overwrite:
            return existing_duplicate, True

        # 3. Extract text & page count
        try:
            extracted_text, page_count = extract_pdf_text_with_meta(file_bytes)
        except Exception as e:
            logger.warning(f"PDF text extraction partial failure for {filename}: {e}")
            extracted_text, page_count = "", 1

        clean_title = (title or Path(filename).stem).strip()
        category_clean = category.strip().capitalize() or "Topic"
        public_id = self.generate_public_id(grade, category_clean, filename)

        if existing_asset_id:
            old_asset = curriculum_service.get_pdf_asset(existing_asset_id)
            if old_asset:
                public_id = old_asset.public_id

        cfg = self.get_config()
        cloud_name = cfg.get("cloud_name")
        api_key = cfg.get("api_key")
        api_secret = cfg.get("api_secret")

        secure_url = ""
        preview_url = ""
        asset_id = None
        version = 1

        # 4. Upload to Cloudinary if configured
        if self.is_configured():
            timestamp = int(time.time())
            folder = self.get_folder_path(grade, category_clean)
            tags = f"grade_{grade},{category_clean.lower()},edinno_curriculum"

            upload_params: Dict[str, Any] = {
                "folder": folder,
                "public_id": public_id.split("/")[-1],
                "overwrite": "true" if overwrite else "false",
                "tags": tags,
                "timestamp": timestamp,
            }
            signature = self.compute_signature(upload_params, api_secret)
            upload_params["api_key"] = api_key
            upload_params["signature"] = signature

            # Compress PDF before upload to ensure it stays strictly under Cloudinary 10MB limit
            bytes_to_upload = self.compress_pdf_for_storage(file_bytes, target_max_bytes=9_800_000)

            # Form multipart payload
            url = f"https://api.cloudinary.com/v1_1/{cloud_name}/image/upload"
            files = {"file": (filename, bytes_to_upload, "application/pdf")}

            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(url, data=upload_params, files=files)
                    if resp.status_code >= 400:
                        # Fallback to resource_type="raw" if image upload failed
                        raw_url = f"https://api.cloudinary.com/v1_1/{cloud_name}/raw/upload"
                        raw_resp = await client.post(raw_url, data=upload_params, files=files)
                        if raw_resp.status_code >= 400:
                            err_body = raw_resp.text
                            logger.warning(
                                f"Cloudinary upload rejected ({raw_resp.status_code}: {err_body[:200]}); falling back to resilient local staging storage."
                            )
                            # Graceful local fallback on size limit or quota rejection
                            target_dir = self.local_staging_dir / f"grade_{grade}" / category_clean.lower()
                            target_dir.mkdir(parents=True, exist_ok=True)
                            local_file_path = target_dir / filename
                            local_file_path.write_bytes(bytes_to_upload)

                            secure_url = f"/api/v1/storage/local-files/{grade}/{category_clean.lower()}/{urllib.parse.quote(filename)}"
                            preview_url = secure_url
                            asset_id = f"local-{hashlib.md5(public_id.encode()).hexdigest()[:12]}"
                            data = None
                        else:
                            data = raw_resp.json()
                    else:
                        data = resp.json()

                if data:
                    secure_url = data.get("secure_url") or data.get("url") or ""
                    asset_id = data.get("asset_id")
                    version = data.get("version", 1)
                    public_id = data.get("public_id") or public_id

                    # Cloudinary image transformation gives page 1 thumbnail with modern format (AVIF/WebP) and compression
                    preview_url = (
                        f"https://res.cloudinary.com/{cloud_name}/image/upload/f_auto,q_auto,w_450,c_limit,pg_1/v{version}/{public_id}.jpg"
                    )
            except Exception as exc:
                logger.warning(f"Error communicating with Cloudinary: {exc}. Staging locally to prevent data loss.")
                target_dir = self.local_staging_dir / f"grade_{grade}" / category_clean.lower()
                target_dir.mkdir(parents=True, exist_ok=True)
                local_file_path = target_dir / filename
                local_file_path.write_bytes(bytes_to_upload)

                secure_url = f"/api/v1/storage/local-files/{grade}/{category_clean.lower()}/{urllib.parse.quote(filename)}"
                preview_url = secure_url
                asset_id = f"local-{hashlib.md5(public_id.encode()).hexdigest()[:12]}"
        else:
            # Local Staging Mode (Graceful development fallback when credentials are not yet populated)
            target_dir = self.local_staging_dir / f"grade_{grade}" / category_clean.lower()
            target_dir.mkdir(parents=True, exist_ok=True)
            local_file_path = target_dir / filename
            local_file_path.write_bytes(file_bytes)

            secure_url = f"/api/v1/storage/local-files/{grade}/{category_clean.lower()}/{urllib.parse.quote(filename)}"
            preview_url = secure_url
            asset_id = f"local-{hashlib.md5(public_id.encode()).hexdigest()[:12]}"
            logger.info(f"Cloudinary not configured; staged curriculum PDF locally at {local_file_path}")

        # 5. Persist Asset Metadata in SQLite
        stored_bytes = bytes_to_upload if "bytes_to_upload" in locals() else file_bytes
        asset_metadata = {
            "page_count": page_count,
            "preview_text": extracted_text[:300].replace("\n", " ").strip() + "...",
            "extracted_text": extracted_text[:40000],
            "extracted_chars": len(extracted_text),
            "cloud_storage": "cloudinary" if (self.is_configured() and not str(asset_id).startswith("local-")) else "local_staging",
            "original_size_bytes": len(file_bytes),
            "stored_size_bytes": len(stored_bytes),
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }

        asset = curriculum_service.save_pdf_asset(
            public_id=public_id,
            grade=grade,
            chapter=chapter,
            category=category_clean,
            title=clean_title,
            original_filename=filename,
            file_size_bytes=len(stored_bytes),
            secure_url=secure_url,
            preview_url=preview_url,
            asset_id=asset_id,
            sha256_hash=sha256_hash,
            metadata=asset_metadata,
            asset_uuid=existing_asset_id,
        )

        return asset, duplicate_detected

    async def replace_pdf(
        self,
        asset_id: str,
        file_bytes: bytes,
        filename: str,
    ) -> CloudinaryAsset:
        """Replace existing PDF while maintaining its public ID and updating version."""
        existing = curriculum_service.get_pdf_asset(asset_id)
        if not existing:
            raise HTTPException(status_code=404, detail="PDF asset not found.")

        updated_asset, _ = await self.upload_pdf(
            file_bytes=file_bytes,
            filename=filename,
            grade=existing.grade,
            chapter=existing.chapter,
            category=existing.category,
            title=existing.title,
            overwrite=True,
            existing_asset_id=existing.id,
        )
        return updated_asset

    async def delete_pdf(self, asset_id: str) -> bool:
        """Delete from Cloudinary and remove record from database."""
        existing = curriculum_service.get_pdf_asset(asset_id)
        if not existing:
            raise HTTPException(status_code=404, detail="PDF asset not found.")

        if self.is_configured():
            cfg = self.get_config()
            cloud_name = cfg.get("cloud_name")
            api_key = cfg.get("api_key")
            api_secret = cfg.get("api_secret")

            timestamp = int(time.time())
            destroy_params = {
                "public_id": existing.public_id,
                "timestamp": timestamp,
            }
            signature = self.compute_signature(destroy_params, api_secret)
            destroy_params["api_key"] = api_key
            destroy_params["signature"] = signature

            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    # Attempt image destroy then raw destroy
                    img_url = f"https://api.cloudinary.com/v1_1/{cloud_name}/image/destroy"
                    raw_url = f"https://api.cloudinary.com/v1_1/{cloud_name}/raw/destroy"
                    resp = await client.post(img_url, data=destroy_params)
                    if resp.status_code >= 400:
                        await client.post(raw_url, data=destroy_params)
            except Exception as e:
                logger.warning(f"Cloudinary destroy call failed (continuing DB removal): {e}")

        return curriculum_service.delete_pdf_asset(existing.id)


cloudinary_storage_service = CloudinaryStorageService()

