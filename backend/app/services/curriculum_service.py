"""
curriculum_service.py - Thread-safe SQLite persistence & real-time sync service for the Curriculum Workspace.
Enforces the 6-field data structure: count, video_id, grade, chapter, category, status.
"""

from __future__ import annotations

import csv
import io
import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from app.core.logging import logger
from app.schemas.storage import CloudinaryAsset
from app.schemas.curriculum import (
    CurriculumAuditLogItem,
    CurriculumHierarchyNode,
    CurriculumHierarchyResponse,
    CurriculumImportCommitResponse,
    CurriculumImportPreviewResponse,
    CurriculumImportRowValidation,
    CurriculumRecord,
    CurriculumRecordBase,
    CurriculumRecordCreate,
    CurriculumRecordUpdate,
    CurriculumStatus,
    CurriculumSummaryResponse,
    normalize_status,
)

# Obsolete fields that must be ignored or reported from legacy datasets
OBSOLETE_FIELDS = {
    "video/content name",
    "video name",
    "content name",
    "related from same class",
    "related from another class",
    "final video",
    "hls url",
    "direct play url",
    "script link",
    "date",
    "remarks/resources",
    "remarks",
    "resources",
}


class CurriculumConflictError(Exception):
    """Raised when an update encounters an optimistic concurrency version collision."""
    def __init__(self, current_record: CurriculumRecord, message: str = "Record was modified by another user."):
        super().__init__(message)
        self.current_record = current_record


class CurriculumNotFoundError(Exception):
    """Raised when a requested video_id does not exist."""
    pass


class CurriculumService:
    """Thread-safe SQLite-backed curriculum management service with WAL mode and audit tracking."""

    def __init__(self, db_path: Optional[Path] = None):
        if db_path:
            self.db_path = db_path
        else:
            data_dir = Path(__file__).resolve().parents[2] / "data"
            data_dir.mkdir(parents=True, exist_ok=True)
            self.db_path = data_dir / "curriculum.db"

        self._lock = threading.RLock()
        self._change_listeners: Set[Callable[[Dict[str, Any]], None]] = set()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        """Create a connection with WAL mode, memory cache, and foreign keys enabled."""
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA temp_store = MEMORY;")
        conn.execute("PRAGMA mmap_size = 268435456;")
        conn.execute("PRAGMA cache_size = -64000;")
        return conn

    def _init_db(self) -> None:
        """Create tables and indexes if they do not exist."""
        with self._lock, self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS curriculum_records (
                    video_id TEXT PRIMARY KEY,
                    count INTEGER NOT NULL,
                    grade INTEGER NOT NULL,
                    chapter TEXT NOT NULL,
                    category TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'Not Started',
                    version INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS curriculum_audit_logs (
                    id TEXT PRIMARY KEY,
                    video_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    user_id TEXT,
                    previous_values TEXT,
                    new_values TEXT,
                    timestamp TEXT NOT NULL
                );
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS curriculum_pdf_assets (
                    id TEXT PRIMARY KEY,
                    public_id TEXT NOT NULL UNIQUE,
                    asset_id TEXT,
                    grade INTEGER NOT NULL,
                    chapter TEXT NOT NULL,
                    category TEXT NOT NULL,
                    title TEXT NOT NULL,
                    original_filename TEXT NOT NULL,
                    file_size_bytes INTEGER NOT NULL,
                    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
                    secure_url TEXT NOT NULL,
                    preview_url TEXT,
                    version INTEGER NOT NULL DEFAULT 1,
                    sha256_hash TEXT,
                    metadata TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)

            # Query performance indexes
            conn.execute("CREATE INDEX IF NOT EXISTS idx_curr_grade ON curriculum_records(grade);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_curr_chapter ON curriculum_records(chapter);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_curr_category ON curriculum_records(category);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_curr_status ON curriculum_records(status);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_curr_count ON curriculum_records(count);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_curr_grade_count ON curriculum_records(grade, count ASC);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_curr_grade_status ON curriculum_records(grade, status);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_curr_audit_vid ON curriculum_audit_logs(video_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_curr_audit_time ON curriculum_audit_logs(timestamp DESC);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pdf_grade ON curriculum_pdf_assets(grade);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pdf_category ON curriculum_pdf_assets(category);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pdf_chapter ON curriculum_pdf_assets(chapter);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pdf_grade_cat ON curriculum_pdf_assets(grade, category);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pdf_grade_updated ON curriculum_pdf_assets(grade, updated_at DESC);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pdf_updated ON curriculum_pdf_assets(updated_at DESC);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pdf_grade_cat_updated ON curriculum_pdf_assets(grade, category, updated_at DESC);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pdf_hash ON curriculum_pdf_assets(sha256_hash);")
            conn.commit()

        # Auto-seed from Final Curriculum Skeleton.xlsx if database is newly initialized and empty
        try:
            with self._get_connection() as conn:
                count = conn.execute("SELECT COUNT(*) FROM curriculum_records;").fetchone()[0]
                if count == 0:
                    self.import_skeleton_excel()
        except Exception as seed_err:
            logger.warning("Auto-seed from Final Curriculum Skeleton.xlsx skipped or failed: %s", seed_err)

    # ---------------------------------------------------------------------------
    # Real-Time Event Subscription
    # ---------------------------------------------------------------------------

    def add_listener(self, listener: Callable[[Dict[str, Any]], None]) -> None:
        """Register a callback for real-time change notifications."""
        self._change_listeners.add(listener)

    def remove_listener(self, listener: Callable[[Dict[str, Any]], None]) -> None:
        """Unregister a real-time change listener."""
        self._change_listeners.discard(listener)

    def _notify(self, event_type: str, payload: Dict[str, Any]) -> None:
        """Broadcast mutation event to all active SSE listeners."""
        event = {
            "event": event_type,
            "data": payload,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        for cb in list(self._change_listeners):
            try:
                cb(event)
            except Exception as e:
                logger.debug(f"Failed delivering event to listener: {e}")

    # ---------------------------------------------------------------------------
    # CRUD Operations
    # ---------------------------------------------------------------------------

    def _row_to_record(self, row: sqlite3.Row) -> CurriculumRecord:
        """Convert database row to CurriculumRecord model."""
        return CurriculumRecord(
            count=row["count"],
            video_id=row["video_id"],
            grade=row["grade"],
            chapter=row["chapter"],
            category=row["category"],
            status=CurriculumStatus(row["status"]),
            version=row["version"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def list_records(
        self,
        grade: Optional[int] = None,
        chapter: Optional[str] = None,
        category: Optional[str] = None,
        status: Optional[CurriculumStatus] = None,
        search: Optional[str] = None,
        sort_by: str = "count",
        sort_order: str = "asc",
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[List[CurriculumRecord], int]:
        """List records with multi-field filtering, search, sorting, and pagination."""
        page = max(1, page)
        page_size = max(1, min(page_size, 2000))
        offset = (page - 1) * page_size

        allowed_sort = {"count", "video_id", "grade", "chapter", "category", "status", "version", "updated_at"}
        clean_sort = sort_by if sort_by in allowed_sort else "count"
        clean_order = "DESC" if sort_order.lower() == "desc" else "ASC"

        where_clauses: List[str] = []
        params: List[Any] = []

        if grade is not None:
            where_clauses.append("grade = ?")
            params.append(grade)
        if chapter:
            where_clauses.append("chapter = ?")
            params.append(chapter)
        if category:
            where_clauses.append("category = ?")
            params.append(category)
        if status:
            where_clauses.append("status = ?")
            params.append(status.value if isinstance(status, CurriculumStatus) else status)
        if search and search.strip():
            q = f"%{search.strip().lower()}%"
            where_clauses.append("(LOWER(video_id) LIKE ? OR LOWER(chapter) LIKE ? OR LOWER(category) LIKE ? OR LOWER(status) LIKE ?)")
            params.extend([q, q, q, q])

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Count query
            cursor.execute(f"SELECT COUNT(*) FROM curriculum_records {where_sql};", params)
            total = cursor.fetchone()[0]

            # Data query
            query = f"""
                SELECT count, video_id, grade, chapter, category, status, version, created_at, updated_at
                FROM curriculum_records
                {where_sql}
                ORDER BY {clean_sort} {clean_order}
                LIMIT ? OFFSET ?;
            """
            cursor.execute(query, params + [page_size, offset])
            rows = cursor.fetchall()
            records = [self._row_to_record(r) for r in rows]

        return records, total

    def get_record(self, video_id: str) -> CurriculumRecord:
        """Fetch a single record by unique video_id."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT count, video_id, grade, chapter, category, status, version, created_at, updated_at
                FROM curriculum_records
                WHERE video_id = ?;
            """, (video_id.strip(),))
            row = cursor.fetchone()
            if not row:
                raise CurriculumNotFoundError(f"Curriculum record '{video_id}' not found.")
            return self._row_to_record(row)

    def create_record(self, payload: CurriculumRecordCreate, user_id: Optional[str] = None) -> CurriculumRecord:
        """Create a new curriculum record with duplicate protection and audit logging."""
        now = datetime.now(timezone.utc).isoformat()
        clean_vid = payload.video_id.strip()

        with self._lock, self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1 FROM curriculum_records WHERE video_id = ?;", (clean_vid,))
            if cursor.fetchone():
                raise ValueError(f"Record with video_id '{clean_vid}' already exists.")

            cursor.execute("""
                INSERT INTO curriculum_records (count, video_id, grade, chapter, category, status, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?);
            """, (
                payload.count,
                clean_vid,
                payload.grade,
                payload.chapter.strip(),
                payload.category.strip(),
                payload.status.value,
                now,
                now,
            ))

            # Audit log
            audit_id = str(uuid.uuid4())
            new_data = {
                "count": payload.count,
                "video_id": clean_vid,
                "grade": payload.grade,
                "chapter": payload.chapter,
                "category": payload.category,
                "status": payload.status.value,
            }
            cursor.execute("""
                INSERT INTO curriculum_audit_logs (id, video_id, action, user_id, previous_values, new_values, timestamp)
                VALUES (?, ?, 'CREATE', ?, NULL, ?, ?);
            """, (audit_id, clean_vid, user_id, json.dumps(new_data), now))
            conn.commit()

        rec = self.get_record(clean_vid)
        self._notify("RECORD_CREATED", {"record": rec.model_dump()})
        return rec

    def update_record(
        self,
        video_id: str,
        payload: CurriculumRecordUpdate,
        user_id: Optional[str] = None,
    ) -> CurriculumRecord:
        """Update an existing record with optimistic concurrency checking."""
        clean_vid = video_id.strip()
        now = datetime.now(timezone.utc).isoformat()

        with self._lock, self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT count, video_id, grade, chapter, category, status, version, created_at, updated_at
                FROM curriculum_records
                WHERE video_id = ?;
            """, (clean_vid,))
            row = cursor.fetchone()
            if not row:
                raise CurriculumNotFoundError(f"Record '{clean_vid}' not found.")

            current_rec = self._row_to_record(row)

            # Optimistic concurrency check
            if payload.expected_version is not None and payload.expected_version != current_rec.version:
                raise CurriculumConflictError(
                    current_record=current_rec,
                    message=f"Conflict: Record '{clean_vid}' was updated by another process (current version: {current_rec.version})."
                )

            # Prepare update values
            new_count = payload.count if payload.count is not None else current_rec.count
            new_grade = payload.grade if payload.grade is not None else current_rec.grade
            new_chapter = payload.chapter.strip() if payload.chapter is not None else current_rec.chapter
            new_category = payload.category.strip() if payload.category is not None else current_rec.category
            new_status = payload.status.value if payload.status is not None else current_rec.status.value
            new_version = current_rec.version + 1

            cursor.execute("""
                UPDATE curriculum_records
                SET count = ?, grade = ?, chapter = ?, category = ?, status = ?, version = ?, updated_at = ?
                WHERE video_id = ?;
            """, (new_count, new_grade, new_chapter, new_category, new_status, new_version, now, clean_vid))

            # Audit log
            prev_data = current_rec.model_dump()
            updated_data = {
                "count": new_count,
                "video_id": clean_vid,
                "grade": new_grade,
                "chapter": new_chapter,
                "category": new_category,
                "status": new_status,
                "version": new_version,
            }
            cursor.execute("""
                INSERT INTO curriculum_audit_logs (id, video_id, action, user_id, previous_values, new_values, timestamp)
                VALUES (?, ?, 'UPDATE', ?, ?, ?, ?);
            """, (str(uuid.uuid4()), clean_vid, user_id, json.dumps(prev_data), json.dumps(updated_data), now))
            conn.commit()

        rec = self.get_record(clean_vid)
        self._notify("RECORD_UPDATED", {"record": rec.model_dump()})
        return rec

    def delete_record(self, video_id: str, user_id: Optional[str] = None) -> bool:
        """Delete a record by video_id with audit preservation."""
        clean_vid = video_id.strip()
        now = datetime.now(timezone.utc).isoformat()

        with self._lock, self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT count, video_id, grade, chapter, category, status, version, created_at, updated_at
                FROM curriculum_records
                WHERE video_id = ?;
            """, (clean_vid,))
            row = cursor.fetchone()
            if not row:
                raise CurriculumNotFoundError(f"Record '{clean_vid}' not found.")

            prev_data = self._row_to_record(row).model_dump()

            cursor.execute("DELETE FROM curriculum_records WHERE video_id = ?;", (clean_vid,))
            cursor.execute("""
                INSERT INTO curriculum_audit_logs (id, video_id, action, user_id, previous_values, new_values, timestamp)
                VALUES (?, ?, 'DELETE', ?, ?, NULL, ?);
            """, (str(uuid.uuid4()), clean_vid, user_id, json.dumps(prev_data), now))
            conn.commit()

        self._notify("RECORD_DELETED", {"video_id": clean_vid})
        return True

    def bulk_update_status(
        self,
        video_ids: List[str],
        status: CurriculumStatus,
        user_id: Optional[str] = None,
    ) -> int:
        """Atomically update status across multiple video_ids."""
        if not video_ids:
            return 0

        now = datetime.now(timezone.utc).isoformat()
        status_val = status.value if isinstance(status, CurriculumStatus) else status
        updated_records: List[CurriculumRecord] = []

        with self._lock, self._get_connection() as conn:
            cursor = conn.cursor()
            for vid in video_ids:
                clean_vid = vid.strip()
                cursor.execute("""
                    SELECT count, video_id, grade, chapter, category, status, version, created_at, updated_at
                    FROM curriculum_records WHERE video_id = ?;
                """, (clean_vid,))
                row = cursor.fetchone()
                if not row:
                    continue

                prev_rec = self._row_to_record(row)
                new_version = prev_rec.version + 1

                cursor.execute("""
                    UPDATE curriculum_records
                    SET status = ?, version = ?, updated_at = ?
                    WHERE video_id = ?;
                """, (status_val, new_version, now, clean_vid))

                cursor.execute("""
                    INSERT INTO curriculum_audit_logs (id, video_id, action, user_id, previous_values, new_values, timestamp)
                    VALUES (?, ?, 'BULK_STATUS', ?, ?, ?, ?);
                """, (
                    str(uuid.uuid4()),
                    clean_vid,
                    user_id,
                    json.dumps({"status": prev_rec.status.value}),
                    json.dumps({"status": status_val, "version": new_version}),
                    now,
                ))

                cursor.execute("""
                    SELECT count, video_id, grade, chapter, category, status, version, created_at, updated_at
                    FROM curriculum_records WHERE video_id = ?;
                """, (clean_vid,))
                updated_row = cursor.fetchone()
                if updated_row:
                    updated_records.append(self._row_to_record(updated_row))

            conn.commit()

        if updated_records:
            self._notify("BULK_STATUS_UPDATED", {
                "records": [r.model_dump() for r in updated_records],
                "status": status_val,
            })

        return len(updated_records)

    def bulk_delete(self, video_ids: List[str], user_id: Optional[str] = None) -> int:
        """Atomically delete multiple records by ID."""
        if not video_ids:
            return 0

        now = datetime.now(timezone.utc).isoformat()
        deleted_ids: List[str] = []

        with self._lock, self._get_connection() as conn:
            cursor = conn.cursor()
            for vid in video_ids:
                clean_vid = vid.strip()
                cursor.execute("""
                    SELECT count, video_id, grade, chapter, category, status, version, created_at, updated_at
                    FROM curriculum_records WHERE video_id = ?;
                """, (clean_vid,))
                row = cursor.fetchone()
                if not row:
                    continue

                prev_data = self._row_to_record(row).model_dump()
                cursor.execute("DELETE FROM curriculum_records WHERE video_id = ?;", (clean_vid,))
                cursor.execute("""
                    INSERT INTO curriculum_audit_logs (id, video_id, action, user_id, previous_values, new_values, timestamp)
                    VALUES (?, ?, 'DELETE', ?, ?, NULL, ?);
                """, (str(uuid.uuid4()), clean_vid, user_id, json.dumps(prev_data), now))
                deleted_ids.append(clean_vid)

            conn.commit()

        if deleted_ids:
            self._notify("BULK_DELETED", {"video_ids": deleted_ids})

        return len(deleted_ids)

    # ---------------------------------------------------------------------------
    # CSV Import & Export (Strictly 6 Fields)
    # ---------------------------------------------------------------------------

    def preview_csv_import(self, csv_text: str) -> CurriculumImportPreviewResponse:
        """Parse and validate CSV content for import preview, filtering out obsolete fields."""
        reader = csv.reader(io.StringIO(csv_text.strip()))
        rows = list(reader)
        if not rows:
            return CurriculumImportPreviewResponse(total_rows=0, valid_count=0, error_count=0, previews=[])

        # Header detection
        raw_headers = [h.strip() for h in rows[0]]
        headers_lower = [h.lower() for h in raw_headers]

        # Field index mapping
        def find_col(*aliases: str) -> int:
            for a in aliases:
                for idx, h in enumerate(headers_lower):
                    if h == a or a in h:
                        return idx
            return -1

        col_count = find_col("count", "sr no", "sl no", "index", "#")
        col_vid = find_col("video_id", "video id", "id", "record id")
        col_grade = find_col("grade", "class", "standard")
        col_chapter = find_col("chapter", "module", "unit")
        col_category = find_col("category", "type", "classification")
        col_status = find_col("status", "workflow status", "state")

        # Identify obsolete fields in header
        ignored_obsolete = [h for h in raw_headers if h.lower() in OBSOLETE_FIELDS]

        previews: List[CurriculumImportRowValidation] = []
        valid_count = 0
        error_count = 0

        for r_idx, row in enumerate(rows[1:], start=2):
            if not row or not any(cell.strip() for cell in row):
                continue  # skip blank lines

            errors: List[str] = []

            # 1. Count
            count_val = None
            if col_count >= 0 and col_count < len(row) and row[col_count].strip():
                try:
                    count_val = int(row[col_count].strip())
                    if count_val < 1:
                        errors.append("Count must be >= 1")
                except ValueError:
                    errors.append(f"Invalid numeric count: '{row[col_count]}'")
            else:
                count_val = r_idx - 1  # auto sequence default

            # 2. Video ID
            vid_val = ""
            if col_vid >= 0 and col_vid < len(row):
                vid_val = row[col_vid].strip()
            if not vid_val:
                errors.append("Missing required 'video_id'")

            # 3. Grade
            grade_val = 7
            if col_grade >= 0 and col_grade < len(row) and row[col_grade].strip():
                raw_g = row[col_grade].strip()
                import re
                m = re.search(r"\d+", raw_g)
                if m:
                    grade_val = int(m.group(0))
                    if grade_val < 1 or grade_val > 12:
                        errors.append(f"Grade {grade_val} out of bounds (1-12)")
                else:
                    errors.append(f"Could not parse grade number from '{raw_g}'")
            else:
                errors.append("Missing required 'grade'")

            # 4. Chapter
            chap_val = ""
            if col_chapter >= 0 and col_chapter < len(row):
                chap_val = row[col_chapter].strip()
            if not chap_val:
                errors.append("Missing required 'chapter'")

            # 5. Category
            cat_val = ""
            if col_category >= 0 and col_category < len(row):
                cat_val = row[col_category].strip()
            if not cat_val:
                errors.append("Missing required 'category'")

            # 6. Status
            status_val = CurriculumStatus.NOT_STARTED
            if col_status >= 0 and col_status < len(row) and row[col_status].strip():
                norm = normalize_status(row[col_status].strip())
                if norm:
                    status_val = norm
                else:
                    errors.append(f"Invalid status '{row[col_status]}'. Must be one of: Not Started, In Progress, Done, On Hold")

            is_valid = len(errors) == 0
            if is_valid:
                valid_count += 1
                rec_preview = CurriculumRecordBase(
                    count=count_val or 1,
                    video_id=vid_val,
                    grade=grade_val,
                    chapter=chap_val,
                    category=cat_val,
                    status=status_val,
                )
            else:
                error_count += 1
                rec_preview = None

            previews.append(CurriculumImportRowValidation(
                row_number=r_idx,
                is_valid=is_valid,
                record=rec_preview,
                errors=errors,
                ignored_obsolete_fields=ignored_obsolete,
            ))

        return CurriculumImportPreviewResponse(
            total_rows=len(previews),
            valid_count=valid_count,
            error_count=error_count,
            previews=previews,
        )

    def commit_csv_import(
        self,
        records: List[CurriculumRecordCreate],
        mode: str = "upsert",
        user_id: Optional[str] = None,
    ) -> CurriculumImportCommitResponse:
        """Commit validated records into database transactionally."""
        created = 0
        updated = 0
        skipped = 0
        errors: List[str] = []
        now = datetime.now(timezone.utc).isoformat()

        with self._lock, self._get_connection() as conn:
            cursor = conn.cursor()
            for rec in records:
                try:
                    cursor.execute("""
                        SELECT count, video_id, grade, chapter, category, status, version, created_at, updated_at
                        FROM curriculum_records WHERE video_id = ?;
                    """, (rec.video_id,))
                    existing = cursor.fetchone()

                    if existing:
                        if mode == "skip":
                            skipped += 1
                            continue
                        # Upsert update
                        new_version = existing["version"] + 1
                        cursor.execute("""
                            UPDATE curriculum_records
                            SET count = ?, grade = ?, chapter = ?, category = ?, status = ?, version = ?, updated_at = ?
                            WHERE video_id = ?;
                        """, (rec.count, rec.grade, rec.chapter, rec.category, rec.status.value, new_version, now, rec.video_id))
                        cursor.execute("""
                            INSERT INTO curriculum_audit_logs (id, video_id, action, user_id, previous_values, new_values, timestamp)
                            VALUES (?, ?, 'IMPORT_UPDATE', ?, ?, ?, ?);
                        """, (
                            str(uuid.uuid4()),
                            rec.video_id,
                            user_id,
                            json.dumps(self._row_to_record(existing).model_dump()),
                            json.dumps(rec.model_dump()),
                            now,
                        ))
                        updated += 1
                    else:
                        cursor.execute("""
                            INSERT INTO curriculum_records (count, video_id, grade, chapter, category, status, version, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?);
                        """, (rec.count, rec.video_id, rec.grade, rec.chapter, rec.category, rec.status.value, now, now))
                        cursor.execute("""
                            INSERT INTO curriculum_audit_logs (id, video_id, action, user_id, previous_values, new_values, timestamp)
                            VALUES (?, ?, 'IMPORT_CREATE', ?, NULL, ?, ?);
                        """, (str(uuid.uuid4()), rec.video_id, user_id, json.dumps(rec.model_dump()), now))
                        created += 1
                except Exception as exc:
                    errors.append(f"Error on {rec.video_id}: {exc}")

            conn.commit()

        self._notify("IMPORT_COMMITTED", {
            "created": created,
            "updated": updated,
            "skipped": skipped,
        })

        return CurriculumImportCommitResponse(
            created_count=created,
            updated_count=updated,
            skipped_count=skipped,
            error_count=len(errors),
            errors=errors,
        )

    def import_skeleton_excel(
        self, file_path: Optional[Path | str] = None
    ) -> Tuple[int, int]:
        """
        Parse Final Curriculum Skeleton.xlsx (or provided path) using the zero-dependency OpenXML parser,
        clean the topics, activities, and projects across Grades 6–12, and commit into the database.
        Also persists structured curriculum knowledge for AI question generation and Mind Map.
        """
        if not file_path:
            # Check project root directory
            root_dir = Path(__file__).resolve().parents[3]
            candidate = root_dir / "Final Curriculum Skeleton.xlsx"
            if candidate.is_file():
                file_path = candidate
            else:
                logger.warning("Final Curriculum Skeleton.xlsx not found at %s", candidate)
                return 0, 0

        from app.services.curriculum_excel_parser import parse_curriculum_excel

        logger.info("Importing and cleaning curriculum records from %s...", file_path)
        records, knowledge = parse_curriculum_excel(file_path)

        commit_res = self.commit_csv_import(
            records=records, mode="upsert", user_id="system-excel-importer"
        )

        knowledge_file = self.db_path.parent / "curriculum_knowledge.json"
        try:
            with open(knowledge_file, "w", encoding="utf-8") as f:
                json.dump(knowledge, f, indent=2, ensure_ascii=False)
            logger.info("Saved curriculum knowledge base with %d chapters to %s", len(knowledge), knowledge_file)
        except Exception as k_err:
            logger.error("Failed to write curriculum_knowledge.json: %s", k_err)

        total_imported = commit_res.created_count + commit_res.updated_count
        logger.info("Successfully imported %d curriculum records across Grades 6-12", total_imported)
        return total_imported, len(knowledge)

    def get_curriculum_knowledge(
        self, grade: Optional[int] = None, chapter: Optional[str] = None
    ) -> Dict[str, Any]:
        """Fetch cached curriculum knowledge metadata (domains, kits, competencies, learning outcomes)."""
        knowledge_file = self.db_path.parent / "curriculum_knowledge.json"
        if not knowledge_file.is_file():
            self.import_skeleton_excel()

        try:
            with open(knowledge_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            return {}

        if grade is not None:
            data = {k: v for k, v in data.items() if v.get("grade") == grade}
        if chapter:
            chap_lower = chapter.lower()
            data = {
                k: v
                for k, v in data.items()
                if chap_lower in v.get("chapter_title", "").lower()
            }
        return data

    def export_csv(
        self,
        grade: Optional[int] = None,
        chapter: Optional[str] = None,
        category: Optional[str] = None,
        status: Optional[CurriculumStatus] = None,
        video_ids: Optional[List[str]] = None,
    ) -> str:
        """Export records strictly with the 6 mandatory fields."""
        output = io.StringIO()
        writer = csv.writer(output)
        # Exactly six columns
        writer.writerow(["Count", "Video ID", "Grade", "Chapter", "Category", "Status"])

        where_clauses: List[str] = []
        params: List[Any] = []

        if video_ids:
            placeholders = ",".join(["?"] * len(video_ids))
            where_clauses.append(f"video_id IN ({placeholders})")
            params.extend([v.strip() for v in video_ids])
        else:
            if grade is not None:
                where_clauses.append("grade = ?")
                params.append(grade)
            if chapter:
                where_clauses.append("chapter = ?")
                params.append(chapter)
            if category:
                where_clauses.append("category = ?")
                params.append(category)
            if status:
                where_clauses.append("status = ?")
                params.append(status.value if isinstance(status, CurriculumStatus) else status)

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f"""
                SELECT count, video_id, grade, chapter, category, status
                FROM curriculum_records
                {where_sql}
                ORDER BY count ASC;
            """, params)

            for row in cursor.fetchall():
                writer.writerow([
                    row["count"],
                    row["video_id"],
                    row["grade"],
                    row["chapter"],
                    row["category"],
                    row["status"],
                ])

        return output.getvalue()

    # ---------------------------------------------------------------------------
    # Mind Map Hierarchy & Summaries
    # ---------------------------------------------------------------------------

    def get_hierarchy(
        self,
        grade: Optional[int] = None,
        chapter: Optional[str] = None,
        category: Optional[str] = None,
        status: Optional[CurriculumStatus] = None,
        search: Optional[str] = None,
    ) -> CurriculumHierarchyResponse:
        """Construct the 4-level hierarchy: Root -> Grade -> Chapter -> Category -> Record."""
        records, total = self.list_records(
            grade=grade,
            chapter=chapter,
            category=category,
            status=status,
            search=search,
            sort_by="count",
            sort_order="asc",
            page=1,
            page_size=2000,
        )

        # Build tree structure
        grades_map: Dict[int, Dict[str, Dict[str, List[CurriculumRecord]]]] = {}
        status_counts_root: Dict[str, int] = {}

        for rec in records:
            g = rec.grade
            ch = rec.chapter
            cat = rec.category
            s = rec.status.value

            status_counts_root[s] = status_counts_root.get(s, 0) + 1

            if g not in grades_map:
                grades_map[g] = {}
            if ch not in grades_map[g]:
                grades_map[g][ch] = {}
            if cat not in grades_map[g][ch]:
                grades_map[g][ch][cat] = []
            grades_map[g][ch][cat].append(rec)

        grade_nodes: List[CurriculumHierarchyNode] = []
        for g_num in sorted(grades_map.keys()):
            chapter_nodes: List[CurriculumHierarchyNode] = []
            g_status_counts: Dict[str, int] = {}
            g_total = 0

            for ch_name in sorted(grades_map[g_num].keys()):
                category_nodes: List[CurriculumHierarchyNode] = []
                ch_status_counts: Dict[str, int] = {}
                ch_total = 0

                for cat_name in sorted(grades_map[g_num][ch_name].keys()):
                    recs = grades_map[g_num][ch_name][cat_name]
                    cat_status_counts: Dict[str, int] = {}

                    rec_nodes: List[CurriculumHierarchyNode] = []
                    for r in recs:
                        s_val = r.status.value
                        cat_status_counts[s_val] = cat_status_counts.get(s_val, 0) + 1
                        ch_status_counts[s_val] = ch_status_counts.get(s_val, 0) + 1
                        g_status_counts[s_val] = g_status_counts.get(s_val, 0) + 1

                        rec_nodes.append(CurriculumHierarchyNode(
                            id=f"rec-{r.video_id}",
                            name=r.video_id,
                            node_type="record",
                            count=r.count,
                            status=r.status,
                            status_counts={s_val: 1},
                            record=r,
                            children=[],
                        ))

                    category_nodes.append(CurriculumHierarchyNode(
                        id=f"cat-{g_num}-{ch_name}-{cat_name}",
                        name=cat_name,
                        node_type="category",
                        count=len(rec_nodes),
                        status=None,
                        status_counts=cat_status_counts,
                        children=rec_nodes,
                    ))
                    ch_total += len(rec_nodes)

                chapter_nodes.append(CurriculumHierarchyNode(
                    id=f"ch-{g_num}-{ch_name}",
                    name=ch_name,
                    node_type="chapter",
                    count=ch_total,
                    status=None,
                    status_counts=ch_status_counts,
                    children=category_nodes,
                ))
                g_total += ch_total

            grade_nodes.append(CurriculumHierarchyNode(
                id=f"grade-{g_num}",
                name=f"Grade {g_num}",
                node_type="grade",
                count=g_total,
                status=None,
                status_counts=g_status_counts,
                children=chapter_nodes,
            ))

        root_node = CurriculumHierarchyNode(
            id="curriculum-root",
            name="Curriculum Architecture",
            node_type="root",
            count=total,
            status=None,
            status_counts=status_counts_root,
            children=grade_nodes,
        )

        return CurriculumHierarchyResponse(root=root_node, total_records=total)

    def get_summary(self) -> CurriculumSummaryResponse:
        """Aggregated status counts, grade breakdowns, and totals."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM curriculum_records;")
            total = cursor.fetchone()[0]

            cursor.execute("SELECT status, COUNT(*) FROM curriculum_records GROUP BY status;")
            by_status = {row[0]: row[1] for row in cursor.fetchall()}

            cursor.execute("SELECT grade, COUNT(*) FROM curriculum_records GROUP BY grade ORDER BY grade;")
            by_grade = {str(row[0]): row[1] for row in cursor.fetchall()}

            cursor.execute("SELECT category, COUNT(*) FROM curriculum_records GROUP BY category ORDER BY category;")
            by_category = {row[0]: row[1] for row in cursor.fetchall()}

        return CurriculumSummaryResponse(
            total_records=total,
            by_status=by_status,
            by_grade=by_grade,
            by_category=by_category,
        )

    def get_audit_logs(self, video_id: Optional[str] = None, limit: int = 50) -> List[CurriculumAuditLogItem]:
        """Query audit history for compliance and rollback tracking."""
        where_sql = "WHERE video_id = ?" if video_id else ""
        params = [video_id] if video_id else []

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f"""
                SELECT id, video_id, action, user_id, previous_values, new_values, timestamp
                FROM curriculum_audit_logs
                {where_sql}
                ORDER BY timestamp DESC
                LIMIT ?;
            """, params + [max(1, min(limit, 200))])

            items: List[CurriculumAuditLogItem] = []
            for row in cursor.fetchall():
                prev_val = json.loads(row["previous_values"]) if row["previous_values"] else None
                new_val = json.loads(row["new_values"]) if row["new_values"] else None
                items.append(CurriculumAuditLogItem(
                    id=row["id"],
                    video_id=row["video_id"],
                    action=row["action"],
                    user_id=row["user_id"],
                    previous_values=prev_val,
                    new_values=new_val,
                    timestamp=row["timestamp"],
                ))
            return items

    # ---------------------------------------------------------------------------
    # Cloudinary Curriculum PDF Asset Management
    # ---------------------------------------------------------------------------

    def _row_to_asset(self, row: sqlite3.Row) -> CloudinaryAsset:
        meta = json.loads(row["metadata"]) if row["metadata"] else {}
        return CloudinaryAsset(
            id=row["id"],
            public_id=row["public_id"],
            asset_id=row["asset_id"],
            grade=row["grade"],
            chapter=row["chapter"],
            category=row["category"],
            title=row["title"],
            original_filename=row["original_filename"],
            file_size_bytes=row["file_size_bytes"],
            mime_type=row["mime_type"],
            secure_url=row["secure_url"],
            preview_url=row["preview_url"],
            version=row["version"],
            sha256_hash=row["sha256_hash"],
            metadata=meta,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def save_pdf_asset(
        self,
        public_id: str,
        grade: int,
        chapter: str,
        category: str,
        title: str,
        original_filename: str,
        file_size_bytes: int,
        secure_url: str,
        preview_url: Optional[str] = None,
        asset_id: Optional[str] = None,
        sha256_hash: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        asset_uuid: Optional[str] = None,
    ) -> CloudinaryAsset:
        now = datetime.now(timezone.utc).isoformat()
        new_id = asset_uuid or str(uuid.uuid4())
        meta_str = json.dumps(metadata or {})

        with self._lock, self._get_connection() as conn:
            conn.execute("""
                INSERT INTO curriculum_pdf_assets (
                    id, public_id, asset_id, grade, chapter, category, title,
                    original_filename, file_size_bytes, mime_type, secure_url, preview_url,
                    version, sha256_hash, metadata, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'application/pdf', ?, ?, 1, ?, ?, ?, ?)
                ON CONFLICT(public_id) DO UPDATE SET
                    asset_id = excluded.asset_id,
                    title = excluded.title,
                    original_filename = excluded.original_filename,
                    file_size_bytes = excluded.file_size_bytes,
                    secure_url = excluded.secure_url,
                    preview_url = excluded.preview_url,
                    version = curriculum_pdf_assets.version + 1,
                    sha256_hash = excluded.sha256_hash,
                    metadata = excluded.metadata,
                    updated_at = excluded.updated_at;
            """, (
                new_id, public_id, asset_id, grade, chapter, category, title,
                original_filename, file_size_bytes, secure_url, preview_url,
                sha256_hash, meta_str, now, now
            ))
            conn.commit()

            cursor = conn.cursor()
            cursor.execute("SELECT * FROM curriculum_pdf_assets WHERE public_id = ?;", (public_id,))
            row = cursor.fetchone()
            asset = self._row_to_asset(row)

        self._notify("PDF_ASSET_SAVED", asset.model_dump())
        self._notify("pdf_asset_saved", asset.model_dump())
        return asset

    def list_pdf_assets(
        self,
        grade: Optional[int] = None,
        category: Optional[str] = None,
        chapter: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[List[CloudinaryAsset], int]:
        where_clauses: List[str] = []
        params: List[Any] = []

        if grade is not None:
            where_clauses.append("grade = ?")
            params.append(grade)
        if category and category.lower() != "all":
            where_clauses.append("LOWER(category) = LOWER(?)")
            params.append(category.strip())
        if chapter:
            where_clauses.append("LOWER(chapter) LIKE LOWER(?)")
            params.append(f"%{chapter.strip()}%")
        if search:
            where_clauses.append("(LOWER(title) LIKE LOWER(?) OR LOWER(original_filename) LIKE LOWER(?) OR LOWER(chapter) LIKE LOWER(?))")
            term = f"%{search.strip()}%"
            params.extend([term, term, term])

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        offset = (max(1, page) - 1) * max(1, page_size)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f"SELECT COUNT(*) AS total FROM curriculum_pdf_assets {where_sql};", params)
            total = cursor.fetchone()["total"]

            cursor.execute(f"""
                SELECT * FROM curriculum_pdf_assets
                {where_sql}
                ORDER BY updated_at DESC
                LIMIT ? OFFSET ?;
            """, params + [page_size, offset])

            items = [self._row_to_asset(row) for row in cursor.fetchall()]
            return items, total

    def get_pdf_asset(self, asset_id: str) -> Optional[CloudinaryAsset]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM curriculum_pdf_assets WHERE id = ? OR public_id = ?;", (asset_id, asset_id))
            row = cursor.fetchone()
            return self._row_to_asset(row) if row else None

    def get_pdf_asset_by_hash(self, sha256_hash: str) -> Optional[CloudinaryAsset]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM curriculum_pdf_assets WHERE sha256_hash = ? LIMIT 1;", (sha256_hash,))
            row = cursor.fetchone()
            return self._row_to_asset(row) if row else None

    def update_pdf_asset(self, asset_id: str, updates: Dict[str, Any]) -> Optional[CloudinaryAsset]:
        now = datetime.now(timezone.utc).isoformat()
        allowed = {"title", "chapter", "category", "grade", "preview_url", "secure_url", "metadata"}
        set_clauses: List[str] = ["updated_at = ?"]
        params: List[Any] = [now]

        for k, v in updates.items():
            if k in allowed:
                set_clauses.append(f"{k} = ?")
                params.append(json.dumps(v) if k == "metadata" and isinstance(v, dict) else v)

        params.append(asset_id)
        params.append(asset_id)
        with self._lock, self._get_connection() as conn:
            conn.execute(f"""
                UPDATE curriculum_pdf_assets
                SET {', '.join(set_clauses)}
                WHERE id = ? OR public_id = ?;
            """, params)
            conn.commit()

            cursor = conn.cursor()
            cursor.execute("SELECT * FROM curriculum_pdf_assets WHERE id = ? OR public_id = ?;", (asset_id, asset_id))
            row = cursor.fetchone()
            if not row:
                return None
            asset = self._row_to_asset(row)

        self._notify("PDF_ASSET_UPDATED", asset.model_dump())
        self._notify("pdf_asset_updated", asset.model_dump())
        return asset

    def delete_pdf_asset(self, asset_id: str) -> bool:
        with self._lock, self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM curriculum_pdf_assets WHERE id = ? OR public_id = ?;", (asset_id, asset_id))
            row = cursor.fetchone()
            if not row:
                return False
            public_id = row["public_id"]
            conn.execute("DELETE FROM curriculum_pdf_assets WHERE id = ? OR public_id = ?;", (asset_id, asset_id))
            conn.commit()

        self._notify("PDF_ASSET_DELETED", {"id": asset_id, "public_id": public_id})
        self._notify("pdf_asset_deleted", {"id": asset_id, "public_id": public_id})
        return True


# Singleton instance
curriculum_service = CurriculumService()

