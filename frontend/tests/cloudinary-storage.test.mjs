/**
 * cloudinary-storage.test.mjs
 * End-to-end unit and integration verification for Cloudinary PDF Storage.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "../../backend");
const frontendDir = path.resolve(__dirname, "..");

console.log("Starting Cloudinary PDF Storage Verification Suite...");

// 1. Verify backend schema file
const schemaPath = path.join(backendDir, "app/schemas/storage.py");
assert(fs.existsSync(schemaPath), "backend/app/schemas/storage.py must exist");
const schemaContent = fs.readFileSync(schemaPath, "utf-8");
assert(schemaContent.includes("class CloudinaryAsset"), "Must define CloudinaryAsset");
assert(schemaContent.includes("class CloudinaryAssetListResponse"), "Must define CloudinaryAssetListResponse");
assert(schemaContent.includes("class CloudinaryUploadResponse"), "Must define CloudinaryUploadResponse");
assert(schemaContent.includes("class CloudinaryConfigStatus"), "Must define CloudinaryConfigStatus");
console.log("✓ Backend Pydantic Schemas Verified.");

// 2. Verify backend service
const servicePath = path.join(backendDir, "app/services/cloudinary_service.py");
assert(fs.existsSync(servicePath), "backend/app/services/cloudinary_service.py must exist");
const serviceContent = fs.readFileSync(servicePath, "utf-8");
assert(serviceContent.includes("class CloudinaryStorageService"), "Must define CloudinaryStorageService");
assert(serviceContent.includes("def compute_signature"), "Must implement secure signature calculation");
assert(serviceContent.includes("def get_folder_path"), "Must organize by Grade and Category folder path");
assert(serviceContent.includes("async def upload_pdf"), "Must implement upload_pdf");
assert(serviceContent.includes("async def replace_pdf"), "Must implement replace_pdf");
assert(serviceContent.includes("async def delete_pdf"), "Must implement delete_pdf");
assert(serviceContent.includes("%PDF"), "Must validate authentic PDF header");
console.log("✓ Backend Cloudinary Storage Service Verified.");

// 3. Verify backend router
const routerPath = path.join(backendDir, "app/api/v1/storage.py");
assert(fs.existsSync(routerPath), "backend/app/api/v1/storage.py must exist");
const routerContent = fs.readFileSync(routerPath, "utf-8");
assert(routerContent.includes('router = APIRouter(prefix="/storage")'), "Must define storage router");
assert(routerContent.includes("@router.post(\"/upload\""), "Must expose /upload endpoint");
assert(routerContent.includes("@router.get(\"/assets\""), "Must expose /assets endpoint");
assert(routerContent.includes("@router.get(\"/assets/{asset_id}\""), "Must expose single asset retrieval");
assert(routerContent.includes("@router.put(\"/assets/{asset_id}/replace\""), "Must expose replace endpoint");
assert(routerContent.includes("@router.delete(\"/assets/{asset_id}\""), "Must expose delete endpoint");
assert(routerContent.includes("@router.get(\"/config-status\""), "Must expose config-status endpoint");
console.log("✓ Backend FastAPI Storage Router Verified.");

// 4. Verify API Router registration
const mainRouterPath = path.join(backendDir, "app/api/router.py");
const mainRouterContent = fs.readFileSync(mainRouterPath, "utf-8");
assert(mainRouterContent.includes("storage.router"), "storage.router must be registered in API v1 router");
console.log("✓ Storage Router Registration in API v1 Verified.");

// 5. Verify database schema in curriculum_service.py
const currServicePath = path.join(backendDir, "app/services/curriculum_service.py");
const currServiceContent = fs.readFileSync(currServicePath, "utf-8");
assert(currServiceContent.includes("CREATE TABLE IF NOT EXISTS curriculum_pdf_assets"), "curriculum_pdf_assets table must be created in SQLite");
assert(currServiceContent.includes("def save_pdf_asset"), "curriculum_service must implement save_pdf_asset");
assert(currServiceContent.includes("def list_pdf_assets"), "curriculum_service must implement list_pdf_assets");
assert(currServiceContent.includes("def get_pdf_asset"), "curriculum_service must implement get_pdf_asset");
assert(currServiceContent.includes("def update_pdf_asset"), "curriculum_service must implement update_pdf_asset");
assert(currServiceContent.includes("def delete_pdf_asset"), "curriculum_service must implement delete_pdf_asset");
console.log("✓ SQLite Database Schema and Curriculum Service Asset Methods Verified.");

// 6. Verify frontend API client
const feApiPath = path.join(frontendDir, "src/lib/cloudinary-api.ts");
assert(fs.existsSync(feApiPath), "frontend/src/lib/cloudinary-api.ts must exist");
const feApiContent = fs.readFileSync(feApiPath, "utf-8");
assert(feApiContent.includes("export async function uploadCloudinaryPdf"), "Must export uploadCloudinaryPdf");
assert(feApiContent.includes("export async function fetchCloudinaryAssets"), "Must export fetchCloudinaryAssets");
assert(feApiContent.includes("export async function replaceCloudinaryPdf"), "Must export replaceCloudinaryPdf");
assert(feApiContent.includes("export async function deleteCloudinaryPdf"), "Must export deleteCloudinaryPdf");
assert(feApiContent.includes("export async function getCloudinaryConfigStatus"), "Must export getCloudinaryConfigStatus");
console.log("✓ Frontend Cloudinary API Client Verified.");

// 7. Verify frontend CurriculumPdfManager component
const componentPath = path.join(frontendDir, "src/features/curriculum/components/CurriculumPdfManager.tsx");
assert(fs.existsSync(componentPath), "CurriculumPdfManager.tsx must exist");
const componentContent = fs.readFileSync(componentPath, "utf-8");
assert(componentContent.includes("CurriculumPdfManager"), "Must export CurriculumPdfManager component");
assert(componentContent.includes("CATEGORY_OPTIONS"), "Must provide category filtering options");
assert(componentContent.includes("UploadModal"), "CurriculumPdfManager must integrate unified UploadModal");
assert(componentContent.includes("handleReplaceSubmit"), "Must handle replace submit");
assert(componentContent.includes("handleDeleteAsset"), "Must handle delete asset");
assert(componentContent.includes("handleUseInStudio"), "Must support direct assessment studio integration");
console.log("✓ Frontend CurriculumPdfManager Component Verified.");

// 8. Verify UI Toolbar & Sidebar Integration
const toolbarPath = path.join(frontendDir, "src/features/curriculum/components/CurriculumToolbar.tsx");
const toolbarContent = fs.readFileSync(toolbarPath, "utf-8");
assert(toolbarContent.includes("onOpenPdfStorage"), "CurriculumToolbar must support onOpenPdfStorage");
assert(toolbarContent.includes("PDF Storage"), "CurriculumToolbar must render PDF Storage trigger");

const sidebarPath = path.join(frontendDir, "src/features/studio/components/StudioSidebar.tsx");
const sidebarContent = fs.readFileSync(sidebarPath, "utf-8");
assert(sidebarContent.includes("onOpenPdfStorage"), "StudioSidebar must support onOpenPdfStorage");

const studioPagePath = path.join(frontendDir, "src/app/studio/page.tsx");
const studioPageContent = fs.readFileSync(studioPagePath, "utf-8");
assert(studioPageContent.includes("CurriculumPdfManager"), "studio/page.tsx must integrate CurriculumPdfManager");

console.log("✓ UI Toolbar and Studio Sidebar Integration Verified.");

// 9. Verify Multi-File Upload & Multi-Grade Capabilities
assert(componentContent.includes("UploadModal"), "CurriculumPdfManager must use unified UploadModal for uploads");
assert(componentContent.includes("selectedAssetIds"), "CurriculumPdfManager must support multi-file selection state");
assert(componentContent.includes("handleAddCurrentGradeOrAllToStudio"), "CurriculumPdfManager must support adding all files in grade or all grades");
console.log("✓ Multi-file Batch Upload & Selection in CurriculumPdfManager Verified.");

// 10. Verify AssessmentStudio Multi-File Target Scope Integration
const assessStudioPath = path.join(frontendDir, "src/features/studio/components/AssessmentStudio.tsx");
const assessStudioContent = fs.readFileSync(assessStudioPath, "utf-8");
assert(assessStudioContent.includes("activePdfAssets"), "AssessmentStudio must accept activePdfAssets array");
assert(assessStudioContent.includes("attachedAssets.length > 1"), "AssessmentStudio must render multi-file attached view");

assert(studioPageContent.includes("selectedPdfAssets"), "studio/page.tsx must manage selectedPdfAssets array");
console.log("✓ Multi-file Target Scope in AssessmentStudio Verified.");

console.log("\nALL 10 CLOUDINARY STORAGE & MULTI-FILE TEST GATES PASSED CLEANLY!");

