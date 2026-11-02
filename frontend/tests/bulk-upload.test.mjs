import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCurriculumFilename, sortChaptersNumerically } from "../src/lib/curriculum-api.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "..");

test("Bulk Upload: Smart Auto-Category Sorting for Curriculum PDFs", async (t) => {
  await t.test("Accurately auto-classifies Activities, Topics, and Projects in bulk files", () => {
    const batchFiles = [
      { name: "1_Activity 1 (Traffic Light Controller).pdf", expectedCat: "Activity", expectedTitle: "Activity 1: Traffic Light Controller" },
      { name: "1_P-4 DefenceTech (Defence Protection System).pdf", expectedCat: "Project", expectedTitle: "Project 4: Defence Protection System" },
      { name: "2_Activity 2 (Automatic Light Control System).pdf", expectedCat: "Activity", expectedTitle: "Activity 2: Automatic Light Control System" },
      { name: "2_P-6 IT&AI (Employee Check-In System).pdf", expectedCat: "Project", expectedTitle: "Project 6: Employee Check-In System" },
      { name: "3_Topic 3 (Introduction to OLED Display ).pdf", expectedCat: "Topic", expectedTitle: "Topic 3: Introduction to OLED Display" },
      { name: "4_Topic 1 (Explore Arduino Development Board).pdf", expectedCat: "Topic", expectedTitle: "Topic 1: Explore Arduino Development Board" },
      { name: "5_Activity 3 (Humidity Alert System).pdf", expectedCat: "Activity", expectedTitle: "Activity 3: Humidity Alert System" },
      { name: "6_P-5 AeroSpaceTech(Space Debris Detection System).pdf", expectedCat: "Project", expectedTitle: "Project 5: Space Debris Detection System" },
      { name: "6_Topic 2(Introduction to Sensors).pdf", expectedCat: "Topic", expectedTitle: "Topic 2: Introduction to Sensors" },
      { name: "7_P-3 Automotive Tech (Emergency Braking System).pdf", expectedCat: "Project", expectedTitle: "Project 3: Emergency Braking System" },
      { name: "6_Activity 2 (Control LED with Switch).pdf", expectedCat: "Activity", expectedTitle: "Activity 2: Control LED with Switch" },
    ];

    const counts = { Topic: 0, Activity: 0, Project: 0 };

    batchFiles.forEach(({ name, expectedCat, expectedTitle }) => {
      const parsed = parseCurriculumFilename(name, {
        currentGrade: 10,
        currentChapter: "Chapter 7 (Arduino)",
      });

      assert.strictEqual(parsed.category, expectedCat, `File ${name} should be categorized as ${expectedCat}`);
      assert.strictEqual(parsed.documentTitle, expectedTitle, `File ${name} should have title ${expectedTitle}`);
      counts[parsed.category]++;
    });

    // Check counts
    assert.strictEqual(counts.Topic, 3, "Should detect 3 Topics");
    assert.strictEqual(counts.Activity, 4, "Should detect 4 Activities");
    assert.strictEqual(counts.Project, 4, "Should detect 4 Projects");
  });

  await t.test("UploadModal component contains Chapter Selector and Auto-Category Sorting", () => {
    const modalPath = path.join(frontendDir, "src/features/studio/components/UploadModal.tsx");
    const content = fs.readFileSync(modalPath, "utf-8");

    // Chapter selector integration
    assert(content.includes("selectedChapterMode"), "UploadModal must manage selectedChapterMode state");
    assert(content.includes("chapterOptions"), "UploadModal must compute chapterOptions with Auto-detect and custom options");
    assert(content.includes("availableChapters"), "UploadModal must accept availableChapters prop");

    // Category sorting integration
    assert(content.includes("categoryMode"), "UploadModal must support categoryMode ('auto' | 'Topic' | 'Activity' | 'Project')");
    assert(content.includes("categoryCounts"), "UploadModal must compute category breakdown counts");
    assert(content.includes("Auto-Sort Categories"), "UploadModal must feature Auto-Sort Categories option");
    assert(content.includes("categoryMap"), "UploadModal must build categoryMap and pass it to backend OCR");

    // Interactive per-file category selector
    assert(content.includes("fileCategoryOverrides"), "UploadModal must support per-file category overrides");
    assert(content.includes("stagedRecords"), "UploadModal must stage records with parsed details");
  });

  await t.test("CurriculumPdfManager integrates UploadModal to unify the upload experience across all entry points", () => {
    const managerPath = path.join(frontendDir, "src/features/curriculum/components/CurriculumPdfManager.tsx");
    const content = fs.readFileSync(managerPath, "utf-8");

    assert(content.includes("UploadModal"), "CurriculumPdfManager must integrate UploadModal");
    assert(content.includes("onUploadSuccess"), "CurriculumPdfManager must handle onUploadSuccess to reload assets");
  });

  await t.test("Curriculum Ingestion Hub (/ingest) shares identical 3-category nomenclature and storage features", () => {
    const ingestPath = path.join(frontendDir, "src/app/ingest/page.tsx");
    const content = fs.readFileSync(ingestPath, "utf-8");

    // Dynamic Grade, Chapter, and Category selectors
    assert(content.includes("selectedGradeMode"), "Ingest Hub must support dynamic Grade selection");
    assert(content.includes("selectedChapterMode"), "Ingest Hub must support dynamic Chapter selection with auto-detection");
    assert(content.includes("categorySortingMode"), "Ingest Hub must support Category Sorting Mode");
    assert(content.includes("Auto-Sort Categories"), "Ingest Hub must feature Auto-Sort Categories option");

    // Exact 3 categories (Topics, Activities, Projects)
    assert(content.includes('["topic", "activity", "project"]'), "Ingest Hub must strictly use 3 standardized categories");

    // Smart Nomenclature & Cloud Storage
    assert(content.includes("parseCurriculumFilename"), "Ingest Hub must run Smart AI Nomenclature parser");
    assert(content.includes("uploadCloudinaryPdf"), "Ingest Hub must support dual save to Cloudinary Storage");
    assert(content.includes("CurriculumPdfManager"), "Ingest Hub must integrate CurriculumPdfManager for browsing stored PDFs");
  });

  await t.test("Numeric natural chapter ordering and complete chapter data", () => {
    const rawChapters = [
      "Chapter 10: Creating Products with 3D Tools",
      "Chapter 11: Intelligent Systems with Machine Learning",
      "Chapter 1: Engineering Design Challenges",
      "Chapter 2: Control Circuits for Robotics",
      "Chapter 4: Programmable Control Systems",
      "Chapter 3: Decision Making with Logic Boards",
    ];

    const sorted = [...rawChapters].sort(sortChaptersNumerically);

    assert.strictEqual(sorted[0], "Chapter 1: Engineering Design Challenges");
    assert.strictEqual(sorted[1], "Chapter 2: Control Circuits for Robotics");
    assert.strictEqual(sorted[2], "Chapter 3: Decision Making with Logic Boards");
    assert.strictEqual(sorted[3], "Chapter 4: Programmable Control Systems");
    assert.strictEqual(sorted[4], "Chapter 10: Creating Products with 3D Tools");
    assert.strictEqual(sorted[5], "Chapter 11: Intelligent Systems with Machine Learning");

    // Modal layout and non-truncating styles check
    const modalPath = path.join(frontendDir, "src/features/studio/components/UploadModal.tsx");
    const modalContent = fs.readFileSync(modalPath, "utf-8");
    assert(modalContent.includes("sortChaptersNumerically"), "UploadModal must sort chapters numerically");
    assert(modalContent.includes("chaptersForGrade"), "UploadModal must compute chaptersForGrade dynamically");
    assert(modalContent.includes("handleGradeChange"), "UploadModal must handle grade changes and resync chapters");

    const selectPath = path.join(frontendDir, "src/components/ui/SelectDropdown.tsx");
    const selectContent = fs.readFileSync(selectPath, "utf-8");
    assert(selectContent.includes("break-words"), "SelectDropdown must support break-words for full option labels");
  });
});

