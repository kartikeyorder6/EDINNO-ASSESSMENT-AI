from fastapi import APIRouter
from app.api.v1 import upload, assessment, export

api_router = APIRouter()

# API v1 routes
api_router.include_router(upload.router, tags=["Curriculum Upload"])
api_router.include_router(assessment.router, tags=["AI Assessment Generator"])
api_router.include_router(export.router, tags=["PDF Export"])
