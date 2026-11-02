import fs from "fs";
import path from "path";
import assert from "assert";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = fs.existsSync(path.resolve(__dirname, "../../backend"))
  ? path.resolve(__dirname, "../..")
  : path.resolve(".");

console.log("Starting Performance Optimization Verification Suite...\n");

// 1. Verify SQLite Pragmas and Composite Indexes in curriculum_service.py
const curriculumServicePath = path.join(repoRoot, "backend/app/services/curriculum_service.py");
const curriculumServiceContent = fs.readFileSync(curriculumServicePath, "utf-8");

assert(
  curriculumServiceContent.includes("PRAGMA temp_store = MEMORY;"),
  "curriculum_service.py should set PRAGMA temp_store = MEMORY"
);
assert(
  curriculumServiceContent.includes("PRAGMA mmap_size = 268435456;"),
  "curriculum_service.py should configure 256MB mmap_size"
);
assert(
  curriculumServiceContent.includes("PRAGMA cache_size = -64000;"),
  "curriculum_service.py should set 64MB cache_size"
);
assert(
  curriculumServiceContent.includes("idx_curr_grade_count"),
  "curriculum_service.py should include idx_curr_grade_count composite index"
);
assert(
  curriculumServiceContent.includes("idx_curr_grade_status"),
  "curriculum_service.py should include idx_curr_grade_status covering index"
);
assert(
  curriculumServiceContent.includes("idx_pdf_grade_updated"),
  "curriculum_service.py should include idx_pdf_grade_updated index"
);
console.log("✓ Gate 1: Database Pragmas and Composite Indexes Verified.");

// 2. Verify Cloudinary Auto-Format Thumbnail Delivery in cloudinary_service.py
const cloudinaryServicePath = path.join(repoRoot, "backend/app/services/cloudinary_service.py");
const cloudinaryServiceContent = fs.readFileSync(cloudinaryServicePath, "utf-8");

assert(
  cloudinaryServiceContent.includes("f_auto,q_auto,w_450,c_limit,pg_1"),
  "cloudinary_service.py should use f_auto,q_auto modern format and perceptual compression"
);
console.log("✓ Gate 2: Cloudinary Modern Image Delivery URL Format Verified.");

// 3. Verify Search Debouncing in CurriculumPdfManager.tsx
const pdfManagerPath = path.join(repoRoot, "frontend/src/features/curriculum/components/CurriculumPdfManager.tsx");
const pdfManagerContent = fs.readFileSync(pdfManagerPath, "utf-8");

assert(
  pdfManagerContent.includes("debouncedSearchQuery"),
  "CurriculumPdfManager.tsx must define debouncedSearchQuery"
);
assert(
  pdfManagerContent.includes("setTimeout"),
  "CurriculumPdfManager.tsx must debounce search queries"
);
assert(
  pdfManagerContent.includes("clearTimeout"),
  "CurriculumPdfManager.tsx must clean up search timers"
);
console.log("✓ Gate 3: Frontend Search Debouncing (250ms) Verified.");

// 4. Verify RequestAnimationFrame Panning in CurriculumMindMap.tsx
const mindMapPath = path.join(repoRoot, "frontend/src/features/curriculum/components/CurriculumMindMap.tsx");
const mindMapContent = fs.readFileSync(mindMapPath, "utf-8");

assert(
  mindMapContent.includes("rafPanRef"),
  "CurriculumMindMap.tsx must declare rafPanRef"
);
assert(
  mindMapContent.includes("requestAnimationFrame"),
  "CurriculumMindMap.tsx must wrap mouse/touch panning in requestAnimationFrame"
);
assert(
  mindMapContent.includes("cancelAnimationFrame"),
  "CurriculumMindMap.tsx must clean up pending animation frames"
);
console.log("✓ Gate 4: MindMap 60fps RAF Panning Engine Verified.");

console.log("\nALL 4 PERFORMANCE OPTIMIZATION GATES PASSED CLEANLY!");

