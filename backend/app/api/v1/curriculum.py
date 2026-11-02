"""
curriculum.py - FastAPI router for Curriculum Workspace: Mind Map, Table Editor & Real-Time Sync.
Operates strictly on the 6 fields: count, video_id, grade, chapter, category, status.
"""

from __future__ import annotations

import asyncio
import json
import urllib.parse
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response, StreamingResponse

from app.core.logging import logger
from app.schemas.curriculum import (
    CurriculumAuditLogItem,
    CurriculumBulkDeleteRequest,
    CurriculumBulkStatusRequest,
    CurriculumHierarchyResponse,
    CurriculumImportCommitRequest,
    CurriculumImportCommitResponse,
    CurriculumImportPreviewResponse,
    CurriculumListResponse,
    CurriculumRecord,
    CurriculumRecordCreate,
    CurriculumRecordUpdate,
    CurriculumStatus,
    CurriculumSummaryResponse,
)
from app.services.curriculum_service import (
    CurriculumConflictError,
    CurriculumNotFoundError,
    curriculum_service,
)

router = APIRouter(prefix="/curriculum", tags=["Curriculum Workspace"])


@router.get("/records", response_model=CurriculumListResponse)
async def list_curriculum_records(
    grade: Optional[int] = Query(None, description="Filter by grade (6-12)"),
    chapter: Optional[str] = Query(None, description="Filter by chapter name"),
    category: Optional[str] = Query(None, description="Filter by category (Topic, Activity, Project, etc.)"),
    status: Optional[CurriculumStatus] = Query(None, description="Filter by workflow status"),
    search: Optional[str] = Query(None, description="Search keyword across video_id, chapter, category"),
    sort_by: str = Query("count", description="Field to sort by (count, video_id, grade, status)"),
    sort_order: str = Query("asc", description="'asc' or 'desc'"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=2000),
):
    """Retrieve paginated curriculum records with multi-dimensional filtering."""
    records, total = curriculum_service.list_records(
        grade=grade,
        chapter=chapter,
        category=category,
        status=status,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
    )
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    return CurriculumListResponse(
        records=records,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ---------------------------------------------------------------------------
# Static Sub-Paths Under /records (MUST precede /{video_id} parameterized route)
# ---------------------------------------------------------------------------


@router.get("/records/export")
async def export_curriculum_csv(
    grade: Optional[int] = Query(None),
    chapter: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status: Optional[CurriculumStatus] = Query(None),
    video_ids: Optional[str] = Query(None, description="Comma-separated video_ids to export"),
):
    """
    Download curriculum records as a CSV strictly containing the six allowed fields:
    Count, Video ID, Grade, Chapter, Category, Status.
    """
    ids_list = [v.strip() for v in video_ids.split(",") if v.strip()] if video_ids else None
    csv_text = curriculum_service.export_csv(
        grade=grade,
        chapter=chapter,
        category=category,
        status=status,
        video_ids=ids_list,
    )
    encoded_fn = urllib.parse.quote("curriculum_export.csv")
    headers = {
        "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_fn}",
        "Access-Control-Expose-Headers": "Content-Disposition",
    }
    return Response(content=csv_text, media_type="text/csv", headers=headers)


@router.post("/records/bulk-status")
async def bulk_update_curriculum_status(payload: CurriculumBulkStatusRequest):
    """Batch update workflow status across multiple selected curriculum records."""
    updated = curriculum_service.bulk_update_status(
        video_ids=payload.video_ids,
        status=payload.status,
    )
    return {"updated_count": updated, "status": payload.status.value}


@router.post("/records/bulk-delete")
async def bulk_delete_curriculum_records(payload: CurriculumBulkDeleteRequest):
    """Batch delete multiple curriculum records."""
    deleted = curriculum_service.bulk_delete(video_ids=payload.video_ids)
    return {"deleted_count": deleted}


@router.post("/records/import/preview", response_model=CurriculumImportPreviewResponse)
async def preview_csv_import(file: UploadFile = File(...)):
    """
    Parse an uploaded CSV file, validate rows against the 6 required fields,
    and return an actionable preview. Obsolete columns are detected and ignored.
    """
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1", errors="replace")

    return curriculum_service.preview_csv_import(text)


@router.post("/records/import/commit", response_model=CurriculumImportCommitResponse)
async def commit_csv_import(payload: CurriculumImportCommitRequest):
    """Commit pre-validated curriculum records into the database transactionally."""
    return curriculum_service.commit_csv_import(
        records=payload.records,
        mode=payload.mode,
    )


@router.post("/sync-skeleton")
async def sync_curriculum_skeleton():
    """
    Parse and sync Final Curriculum Skeleton.xlsx directly into the Curriculum Engine database,
    populating all Grades 6–12 chapters, topics, activities, and projects.
    """
    imported_count, chapters_count = curriculum_service.import_skeleton_excel()
    return {
        "success": True,
        "imported_records": imported_count,
        "total_chapters": chapters_count,
        "message": f"Successfully synced {imported_count} curriculum records across {chapters_count} chapters into the Curriculum Engine.",
    }


@router.post("/import-excel")
async def import_curriculum_excel(file: UploadFile = File(...)):
    """
    Upload and parse an Excel (.xlsx) file, clean records, and commit them to the Curriculum Engine.
    """
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be a valid Excel (.xlsx) workbook.",
        )

    # Save to temp file
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        from app.services.curriculum_excel_parser import parse_curriculum_excel
        records, knowledge = parse_curriculum_excel(tmp_path)
        commit_res = curriculum_service.commit_csv_import(
            records=records, mode="upsert", user_id="excel-upload"
        )
        return {
            "success": True,
            "created": commit_res.created_count,
            "updated": commit_res.updated_count,
            "total_records": len(records),
            "total_chapters": len(knowledge),
        }
    finally:
        import os
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.get("/knowledge")
async def get_curriculum_knowledge(
    grade: Optional[int] = Query(None, description="Filter by grade (6-12)"),
    chapter: Optional[str] = Query(None, description="Filter by chapter name"),
):
    """
    Retrieve structured curriculum knowledge: domains, kit platforms, competencies,
    learning outcomes, and curriculum topics.
    """
    return curriculum_service.get_curriculum_knowledge(grade=grade, chapter=chapter)


# ---------------------------------------------------------------------------
# Individual Record CRUD (/records and /records/{video_id})
# ---------------------------------------------------------------------------


@router.post("/records", response_model=CurriculumRecord, status_code=status.HTTP_201_CREATED)
async def create_curriculum_record(payload: CurriculumRecordCreate):
    """Create a new curriculum record with duplicate protection."""
    try:
        return curriculum_service.create_record(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/records/{video_id}", response_model=CurriculumRecord)
async def get_curriculum_record(video_id: str):
    """Retrieve an individual curriculum record by unique video_id."""
    try:
        return curriculum_service.get_record(video_id)
    except CurriculumNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/records/{video_id}", response_model=CurriculumRecord)
async def update_curriculum_record(video_id: str, payload: CurriculumRecordUpdate):
    """Update a curriculum record with optimistic concurrency checking."""
    try:
        return curriculum_service.update_record(video_id=video_id, payload=payload)
    except CurriculumNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except CurriculumConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": str(exc),
                "current_record": exc.current_record.model_dump(),
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/records/{video_id}")
async def delete_curriculum_record(video_id: str):
    """Delete a curriculum record with audit log preservation."""
    try:
        success = curriculum_service.delete_record(video_id)
        return {"success": success, "video_id": video_id}
    except CurriculumNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/hierarchy", response_model=CurriculumHierarchyResponse)
async def get_curriculum_hierarchy(
    grade: Optional[int] = Query(None, description="Filter hierarchy by grade"),
    chapter: Optional[str] = Query(None, description="Filter hierarchy by chapter"),
    category: Optional[str] = Query(None, description="Filter hierarchy by category"),
    status: Optional[CurriculumStatus] = Query(None, description="Filter hierarchy by status"),
    search: Optional[str] = Query(None, description="Search keyword in hierarchy"),
):
    """Retrieve full hierarchical structure for interactive Mind Map (Grade -> Chapter -> Category -> Record)."""
    return curriculum_service.get_hierarchy(
        grade=grade,
        chapter=chapter,
        category=category,
        status=status,
        search=search,
    )


@router.get("/summary", response_model=CurriculumSummaryResponse)
async def get_curriculum_summary():
    """Retrieve aggregated status metrics, grade counts, and total curriculum volume."""
    return curriculum_service.get_summary()


@router.get("/audit-logs", response_model=List[CurriculumAuditLogItem])
async def get_curriculum_audit_logs(
    video_id: Optional[str] = Query(None, description="Filter audit logs by video_id"),
    limit: int = Query(50, ge=1, le=200),
):
    """Retrieve change history and audit trail."""
    return curriculum_service.get_audit_logs(video_id=video_id, limit=limit)


# ---------------------------------------------------------------------------
# Real-Time SSE Stream (Cross-Session Synchronization)
# ---------------------------------------------------------------------------


@router.get("/events")
async def curriculum_sse_stream():
    """
    Server-Sent Events (SSE) stream for live bi-directional real-time updates.
    Broadcasts RECORD_CREATED, RECORD_UPDATED, RECORD_DELETED, and BULK_STATUS_UPDATED events.
    """
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
    loop = asyncio.get_running_loop()

    def sync_listener(event: dict):
        try:
            line = f"data: {json.dumps(event)}\n\n"
            loop.call_soon_threadsafe(queue.put_nowait, line)
        except Exception:
            pass  # queue full or loop closed

    curriculum_service.add_listener(sync_listener)

    async def event_generator():
        try:
            # Initial handshake event
            yield f"data: {json.dumps({'event': 'CONNECTED', 'message': 'Curriculum real-time sync active'})}\n\n"
            while True:
                msg = await queue.get()
                yield msg
        except asyncio.CancelledError:
            pass
        finally:
            curriculum_service.remove_listener(sync_listener)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
