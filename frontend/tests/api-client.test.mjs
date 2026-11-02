import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Extracted logic identical to frontend/src/lib/api.ts
function extractErrorMessage(err, fallback = "An unexpected error occurred.") {
  if (!err) return fallback;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const errorObj = err;
    if (typeof errorObj.detail === "string") return errorObj.detail;
    if (Array.isArray(errorObj.detail) && errorObj.detail.length > 0) {
      const first = errorObj.detail[0];
      if (typeof first?.msg === "string") return first.msg;
    }
    if (typeof errorObj.message === "string") return errorObj.message;
  }
  return fallback;
}

describe("API Client Error Extraction", () => {
  test("Extracts message from standard Error instance", () => {
    const err = new Error("Connection timed out to backend.");
    assert.strictEqual(extractErrorMessage(err), "Connection timed out to backend.");
  });

  test("Extracts string error directly", () => {
    assert.strictEqual(extractErrorMessage("Invalid blueprint parameter"), "Invalid blueprint parameter");
  });

  test("Extracts detail from FastAPI HTTPException payload", () => {
    const fastapiErr = { detail: "Chapter PDF exceeds 100MB limit." };
    assert.strictEqual(extractErrorMessage(fastapiErr), "Chapter PDF exceeds 100MB limit.");
  });

  test("Extracts first validation message from FastAPI 422 pydantic validation errors", () => {
    const pydanticErr = {
      detail: [
        { loc: ["body", "question_count"], msg: "Ensure this value is greater than 0", type: "value_error" },
      ],
    };
    assert.strictEqual(extractErrorMessage(pydanticErr), "Ensure this value is greater than 0");
  });

  test("Returns fallback message when error is null or undefined", () => {
    assert.strictEqual(extractErrorMessage(null, "Server down"), "Server down");
    assert.strictEqual(extractErrorMessage(undefined, "Default error"), "Default error");
  });
});
