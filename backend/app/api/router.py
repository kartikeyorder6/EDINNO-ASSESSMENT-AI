"""api.py - Aggregates all v1 routers."""

from fastapi import APIRouter

from app.api.v1 import assessment, curriculum, drive, export, storage, upload

api_router = APIRouter()

# API v1 routes (order is the order shown in the OpenAPI docs)
_ROUTES = (
    (upload.router, "Curriculum Upload"),
    (storage.router, "Cloudinary PDF Storage"),
    (assessment.router, "AI Assessment Generator"),
    (curriculum.router, "Curriculum Workspace"),
    (export.router, "PDF Export"),
    (drive.router, "Google Drive Workspace"),
)

for _router, _tag in _ROUTES:
    api_router.include_router(_router, tags=[_tag])