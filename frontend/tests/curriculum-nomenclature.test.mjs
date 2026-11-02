import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Mirror of the pure TypeScript helper functions for testing in Node.js ESM environment
function extractChapterNumber(chapter, existingChapters = []) {
  if (!chapter) return 1;
  const match = String(chapter).match(/\d+/);
  if (match) return parseInt(match[0], 10);

  if (existingChapters && existingChapters.length > 0) {
    const idx = existingChapters.indexOf(chapter);
    if (idx !== -1) return idx + 1;
  }
  return 1;
}

function getCategoryCode(category) {
  const cat = (category || "").trim().toUpperCase();
  if (cat.startsWith("ACT")) return "A";
  if (cat.startsWith("PROJ")) return "P";
  return "T";
}

function generateCurriculumVideoId(
  grade,
  chapter,
  category,
  existingRecords = []
) {
  const gNum = grade || 6;
  const knownChapters = Array.from(
    new Set(
      existingRecords
        .filter((r) => r.grade === gNum && r.chapter)
        .map((r) => r.chapter)
    )
  );
  const chNum = extractChapterNumber(chapter, knownChapters);
  const catCode = getCategoryCode(category);
  const prefix = `G${gNum}-C${chNum}-${catCode}`;

  const foundSeqs = [];
  const existingIdSet = new Set();

  for (const r of existingRecords) {
    if (r.video_id) {
      existingIdSet.add(r.video_id.toUpperCase());
      const regex = new RegExp(`^G${gNum}-C${chNum}-${catCode}(\\d+)`, "i");
      const match = r.video_id.match(regex);
      if (match) {
        foundSeqs.push(parseInt(match[1], 10));
      }
    }
  }

  if (foundSeqs.length === 0) {
    const matchingRecords = existingRecords.filter((r) => {
      if (r.grade !== gNum) return false;
      const rChNum = extractChapterNumber(r.chapter || "");
      if (rChNum !== chNum) return false;
      return getCategoryCode(r.category || "") === catCode;
    });
    if (matchingRecords.length > 0) {
      foundSeqs.push(matchingRecords.length);
    }
  }

  let nextSeq = foundSeqs.length > 0 ? Math.max(...foundSeqs) + 1 : 1;
  let candidate = `${prefix}${String(nextSeq).padStart(2, "0")}`;

  while (existingIdSet.has(candidate.toUpperCase())) {
    nextSeq += 1;
    candidate = `${prefix}${String(nextSeq).padStart(2, "0")}`;
  }

  return candidate;
}

function parseCurriculumFilename(filename, context = {}) {
  const rawBase = filename.replace(/\.pdf$/i, "").trim();
  const normalized = rawBase.replace(/[_\-]+/g, " ").trim();

  let grade = context.currentGrade && context.currentGrade >= 6 && context.currentGrade <= 12
    ? context.currentGrade
    : 6;

  const gradeMatch = normalized.match(/\b(?:Grade|G)\s*(\d{1,2})\b/i) || rawBase.match(/^(\d{1,2})[_\-\s]/);
  if (gradeMatch) {
    const parsedG = parseInt(gradeMatch[1], 10);
    if (parsedG >= 6 && parsedG <= 12) {
      grade = parsedG;
    }
  }

  let category = "Topic";
  let categoryCode = "T";

  if (/\b(?:activity|act|lab)\b/i.test(normalized)) {
    category = "Activity";
    categoryCode = "A";
  } else if (/\b(?:project|proj)\b/i.test(normalized) || /\bP\s*\d+/i.test(normalized)) {
    category = "Project";
    categoryCode = "P";
  } else if (/\b(?:topic|top|lesson|theory)\b/i.test(normalized)) {
    category = "Topic";
    categoryCode = "T";
  }

  let sequence = 1;
  const seqMatch =
    normalized.match(/(?:Activity|Act|Topic|Top|Project|Proj|P)\s*[\-:]?\s*(\d+)/i) ||
    rawBase.match(/^(\d+)[_\-\s]/);
  if (seqMatch) {
    sequence = parseInt(seqMatch[1], 10) || 1;
  }

  let meaningfulTitle = "";
  const bracketMatch = rawBase.match(/[\(\[](.*?)[\)\]]/);
  if (bracketMatch && bracketMatch[1].trim().length >= 2) {
    meaningfulTitle = bracketMatch[1].trim();
  } else {
    const stripped = rawBase
      .replace(/^[\d._\-]+\s*/, "")
      .replace(/^(?:Grade\s*\d+|G\d+)[_\-\s]*/i, "")
      .replace(/^(?:Activity|Topic|Project|P)\s*[\-:]?\s*\d+\s*[\-:]?\s*/i, "")
      .replace(/^[_\-\s]+|[_\-\s]+$/g, "")
      .replace(/[_-]/g, " ")
      .trim();
    meaningfulTitle = stripped || rawBase;
  }

  meaningfulTitle = meaningfulTitle.replace(/\s+/g, " ").trim();

  let documentTitle = "";
  if (category === "Activity") {
    documentTitle = meaningfulTitle
      ? `Activity ${sequence}: ${meaningfulTitle}`
      : `Activity ${sequence}`;
  } else if (category === "Topic") {
    documentTitle = meaningfulTitle
      ? `Topic ${sequence}: ${meaningfulTitle}`
      : `Topic ${sequence}`;
  } else if (category === "Project") {
    documentTitle = meaningfulTitle
      ? `Project ${sequence}: ${meaningfulTitle}`
      : `Project ${sequence}`;
  } else {
    documentTitle = meaningfulTitle || rawBase;
  }

  let chapter = context.currentChapter || "";
  let chapterNumber = 1;

  const chMatch = normalized.match(/\b(?:Chapter|Ch|C)\s*[\-:]?\s*(\d+)\b/i);
  if (chMatch) {
    chapterNumber = parseInt(chMatch[1], 10) || 1;
    chapter = `Chapter ${chapterNumber}`;
  } else if (context.availableChapters && context.availableChapters.length > 0) {
    const matchedCh =
      context.availableChapters.find((ch) => {
        const num = ch.match(/\d+/);
        return num && normalized.includes(num[0]);
      }) || context.availableChapters[0];
    chapter = matchedCh;
    const num = chapter.match(/\d+/);
    if (num) chapterNumber = parseInt(num[0], 10);
  } else if (!chapter || chapter.includes("Curriculum Chapter")) {
    chapter = `Chapter 1`;
  }

  const seqPadded = String(sequence).padStart(2, "0");
  const nomenclatureId = `G${grade}-C${chapterNumber}-${categoryCode}${seqPadded}`;

  return {
    originalFilename: filename,
    grade,
    chapter,
    chapterNumber,
    category,
    categoryCode,
    sequence,
    meaningfulTitle,
    documentTitle,
    nomenclatureId,
  };
}

describe("Curriculum Video ID Nomenclature System", () => {
  test("Generates standard G[Grade]-C[Chapter]-[Category][Seq] for Grade 6, Chapter 1, Topic 1", () => {
    const id = generateCurriculumVideoId(6, "Chapter 1: Components of Food", "Topic", []);
    assert.strictEqual(id, "G6-C1-T01");
  });

  test("Generates Activity code 'A' and Project code 'P' correctly", () => {
    const activityId = generateCurriculumVideoId(6, "Chapter 1", "Activity", []);
    assert.strictEqual(activityId, "G6-C1-A01");

    const projectId = generateCurriculumVideoId(6, "Chapter 1", "Project", []);
    assert.strictEqual(projectId, "G6-C1-P01");
  });

  test("Increments sequence number based on existing records under the same category", () => {
    const records = [
      { grade: 6, chapter: "Chapter 1", category: "Topic", video_id: "G6-C1-T01" },
      { grade: 6, chapter: "Chapter 1", category: "Topic", video_id: "G6-C1-T02" },
    ];
    const nextTopicId = generateCurriculumVideoId(6, "Chapter 1", "Topic", records);
    assert.strictEqual(nextTopicId, "G6-C1-T03");

    // Activity under same chapter should start at A01
    const nextActivityId = generateCurriculumVideoId(6, "Chapter 1", "Activity", records);
    assert.strictEqual(nextActivityId, "G6-C1-A01");
  });

  test("Correctly extracts chapter numbers from various formats", () => {
    assert.strictEqual(extractChapterNumber("Chapter 4"), 4);
    assert.strictEqual(extractChapterNumber("Ch. 12: Electricity and Circuits"), 12);
    assert.strictEqual(extractChapterNumber("7"), 7);
    assert.strictEqual(extractChapterNumber("Unit 9 - Motion"), 9);
    assert.strictEqual(extractChapterNumber(""), 1);
  });

  test("Resolves chapter position index for chapters without numbers", () => {
    const knownChapters = ["Photosynthesis", "Cellular Respiration", "Genetics"];
    assert.strictEqual(extractChapterNumber("Cellular Respiration", knownChapters), 2);
    assert.strictEqual(extractChapterNumber("Genetics", knownChapters), 3);
  });

  test("Handles higher grades (Grades 7–12) accurately", () => {
    const g7 = generateCurriculumVideoId(7, "Chapter 2: Acids, Bases, and Salts", "Topic", []);
    assert.strictEqual(g7, "G7-C2-T01");

    const g10 = generateCurriculumVideoId(10, "Chapter 15: Our Environment", "Activity", []);
    assert.strictEqual(g10, "G10-C15-A01");

    const g12 = generateCurriculumVideoId(12, "Chapter 8: Electromagnetic Waves", "Project", []);
    assert.strictEqual(g12, "G12-C8-P01");
  });

  test("Avoids collision when candidate ID already exists in records", () => {
    const records = [
      { grade: 6, chapter: "Chapter 1", category: "Topic", video_id: "G6-C1-T01" },
      { grade: 6, chapter: "Chapter 1", category: "Topic", video_id: "G6-C1-T02" },
      { grade: 6, chapter: "Chapter 1", category: "Topic", video_id: "G6-C1-T03" },
    ];
    const id = generateCurriculumVideoId(6, "Chapter 1", "Topic", records);
    assert.strictEqual(id, "G6-C1-T04");
  });
});

describe("Smart Curriculum Filename Extraction & Nomenclature", () => {
  test("Extracts user file '6_Activity 2 (Control LED with Switch).pdf' smartly", () => {
    const parsed = parseCurriculumFilename("6_Activity 2 (Control LED with Switch).pdf");
    assert.strictEqual(parsed.grade, 6);
    assert.strictEqual(parsed.category, "Activity");
    assert.strictEqual(parsed.sequence, 2);
    assert.strictEqual(parsed.meaningfulTitle, "Control LED with Switch");
    assert.strictEqual(parsed.documentTitle, "Activity 2: Control LED with Switch");
    assert.strictEqual(parsed.nomenclatureId, "G6-C1-A02");
  });

  test("Extracts '1_Activity 1 (Traffic Light Controller).pdf' with chapter association", () => {
    const parsed = parseCurriculumFilename("1_Activity 1 (Traffic Light Controller).pdf", {
      currentGrade: 7,
      availableChapters: ["Chapter 7: Arduino"],
    });
    assert.strictEqual(parsed.grade, 7);
    assert.strictEqual(parsed.category, "Activity");
    assert.strictEqual(parsed.sequence, 1);
    assert.strictEqual(parsed.meaningfulTitle, "Traffic Light Controller");
    assert.strictEqual(parsed.documentTitle, "Activity 1: Traffic Light Controller");
    assert.strictEqual(parsed.nomenclatureId, "G7-C7-A01");
  });

  test("Extracts '3_Topic 3 (Introduction to OLED Display ).pdf'", () => {
    const parsed = parseCurriculumFilename("3_Topic 3 (Introduction to OLED Display ).pdf", {
      currentGrade: 7,
      availableChapters: ["Chapter 7: Arduino"],
    });
    assert.strictEqual(parsed.category, "Topic");
    assert.strictEqual(parsed.sequence, 3);
    assert.strictEqual(parsed.meaningfulTitle, "Introduction to OLED Display");
    assert.strictEqual(parsed.documentTitle, "Topic 3: Introduction to OLED Display");
    assert.strictEqual(parsed.nomenclatureId, "G7-C7-T03");
  });

  test("Extracts Project '1_P-4 DefenceTech (Defence Protection System).pdf'", () => {
    const parsed = parseCurriculumFilename("1_P-4 DefenceTech (Defence Protection System).pdf", {
      currentGrade: 7,
      availableChapters: ["Chapter 7: Arduino"],
    });
    assert.strictEqual(parsed.category, "Project");
    assert.strictEqual(parsed.sequence, 4);
    assert.strictEqual(parsed.meaningfulTitle, "Defence Protection System");
    assert.strictEqual(parsed.documentTitle, "Project 4: Defence Protection System");
    assert.strictEqual(parsed.nomenclatureId, "G7-C7-P04");
  });
});

