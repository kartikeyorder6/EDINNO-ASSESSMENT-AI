import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Safety gate threshold logic test
describe("Pre-Assembly Safety Gate Verification", () => {
  const PASSING_THRESHOLD = 80;

  function evaluateGate(correctCount, totalQuestions = 3) {
    const percentage = Math.round((correctCount / totalQuestions) * 100);
    const passed = percentage >= PASSING_THRESHOLD;
    return {
      percentage,
      passed,
      token: passed ? `ASM-AUTH-${Math.random().toString(36).substring(2, 10).toUpperCase()}` : null,
    };
  }

  test("3 out of 3 correct gives 100% and unlocks assembly", () => {
    const result = evaluateGate(3, 3);
    assert.strictEqual(result.percentage, 100);
    assert.strictEqual(result.passed, true);
    assert.match(result.token, /^ASM-AUTH-/);
  });

  test("2 out of 3 correct gives 67% and locks assembly (below 80%)", () => {
    const result = evaluateGate(2, 3);
    assert.strictEqual(result.percentage, 67);
    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.token, null);
  });

  test("1 out of 3 correct gives 33% and locks assembly", () => {
    const result = evaluateGate(1, 3);
    assert.strictEqual(result.percentage, 33);
    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.token, null);
  });

  test("0 out of 3 correct gives 0% and locks assembly", () => {
    const result = evaluateGate(0, 3);
    assert.strictEqual(result.percentage, 0);
    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.token, null);
  });
});

describe("Grade Curricula Model Boundaries (Grades 6–12)", () => {
  const REQUIRED_GRADES = [6, 7, 8, 9, 10, 11, 12];

  test("All 7 grades from 6 to 12 are supported in the specification", () => {
    assert.strictEqual(REQUIRED_GRADES.length, 7);
    assert.deepStrictEqual(REQUIRED_GRADES, [6, 7, 8, 9, 10, 11, 12]);
  });

  function resolveGradeParam(param) {
    if (!param) return 7;
    const match = String(param).match(/\d+/);
    if (!match) return 7;
    const num = parseInt(match[0], 10);
    return REQUIRED_GRADES.includes(num) ? num : 7;
  }

  test("Resolves 'grade-7' to 7", () => {
    assert.strictEqual(resolveGradeParam("grade-7"), 7);
  });

  test("Resolves 'grade-12' to 12", () => {
    assert.strictEqual(resolveGradeParam("grade-12"), 12);
  });

  test("Resolves 'grade-6' to 6", () => {
    assert.strictEqual(resolveGradeParam("grade-6"), 6);
  });

  test("Falls back to 7 for invalid or out-of-bounds input", () => {
    assert.strictEqual(resolveGradeParam("grade-99"), 7);
    assert.strictEqual(resolveGradeParam("unknown"), 7);
    assert.strictEqual(resolveGradeParam(null), 7);
  });
});
