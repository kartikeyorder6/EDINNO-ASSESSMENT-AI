import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.resolve(__dirname, "../src/components/ui");

// 1. Verify files exist
const checkboxFile = path.join(uiDir, "Checkbox.tsx");
const dropdownFile = path.join(uiDir, "DropdownMenu.tsx");
const statusBadgeFile = path.join(uiDir, "CurriculumStatusBadge.tsx");
const selectDropdownFile = path.join(uiDir, "SelectDropdown.tsx");
const indexFile = path.join(uiDir, "index.ts");

assert.ok(fs.existsSync(checkboxFile), "Checkbox.tsx must exist");
assert.ok(fs.existsSync(dropdownFile), "DropdownMenu.tsx must exist");
assert.ok(fs.existsSync(statusBadgeFile), "CurriculumStatusBadge.tsx must exist");
assert.ok(fs.existsSync(selectDropdownFile), "SelectDropdown.tsx must exist");
assert.ok(fs.existsSync(indexFile), "index.ts must exist");

// 2. Verify Checkbox contract
const checkboxCode = fs.readFileSync(checkboxFile, "utf8");
assert.ok(checkboxCode.includes("export const Checkbox"), "Checkbox component must be exported");
assert.ok(checkboxCode.includes("indeterminate"), "Checkbox must support indeterminate state");
assert.ok(checkboxCode.includes("sizeBoxMap"), "Checkbox must support size variants");

// 3. Verify DropdownMenu contract
const dropdownCode = fs.readFileSync(dropdownFile, "utf8");
assert.ok(dropdownCode.includes("export function DropdownMenu"), "DropdownMenu root must be exported");
assert.ok(dropdownCode.includes("export function DropdownMenuTrigger"), "DropdownMenuTrigger must be exported");
assert.ok(dropdownCode.includes("export function DropdownMenuContent"), "DropdownMenuContent must be exported");
assert.ok(dropdownCode.includes("export function DropdownMenuItem"), "DropdownMenuItem must be exported");
assert.ok(dropdownCode.includes("export function DropdownMenuCheckboxItem"), "DropdownMenuCheckboxItem must be exported");

// 4. Verify CurriculumStatusBadge contract
const statusBadgeCode = fs.readFileSync(statusBadgeFile, "utf8");
assert.ok(statusBadgeCode.includes("export function CurriculumStatusBadge"), "CurriculumStatusBadge must be exported");
assert.ok(statusBadgeCode.includes("CheckCircle2"), "CurriculumStatusBadge must include Done status");
assert.ok(statusBadgeCode.includes("In Progress"), "CurriculumStatusBadge must include In Progress status");

// 5. Verify index exports
const indexCode = fs.readFileSync(indexFile, "utf8");
assert.ok(indexCode.includes('export * from "./Checkbox";'), "index.ts must export Checkbox");
assert.ok(indexCode.includes('export * from "./DropdownMenu";'), "index.ts must export DropdownMenu");
assert.ok(indexCode.includes('export * from "./CurriculumStatusBadge";'), "index.ts must export CurriculumStatusBadge");

console.log("✓ All UI components (Checkbox, DropdownMenu, CurriculumStatusBadge, SelectDropdown) integrity checks passed!");

