"""api.py - Aggregates all v1 routers."""

from fastapi import APIRouter

from app.api.v1 import assessment, export, upload

api_router = APIRouter()

# API v1 routes (order is the order shown in the OpenAPI docs)
_ROUTES = (
    (upload.router, "Curriculum Upload"),
    (assessment.router, "AI Assessment Generator"),
    (export.router, "PDF Export"),
)

for _router, _tag in _ROUTES:
    api_router.include_router(_router, tags=[_tag])