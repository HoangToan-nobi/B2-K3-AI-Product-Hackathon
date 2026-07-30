import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const shared = path.resolve(root, "..", "shared");
const packPath = path.join(shared, "review-pack-day1-foundation.json");
const pack = JSON.parse(await readFile(packPath, "utf8"));

assert.equal(pack.schema_version, "1.0");
assert.equal(pack.lesson.id, "day1-foundation");
assert.ok(Array.isArray(pack.summary));
assert.ok(Array.isArray(pack.class_insights));
assert.ok(Array.isArray(pack.review_questions));
assert.ok(Array.isArray(pack.warnings));
assert.ok(pack.class_insights.every((item) => typeof item.unique_user_count === "number"));
assert.ok(pack.summary.every((item) => item.source_excerpt && item.source_pages.length > 0));
assert.ok(pack.review_questions.every((item) => item.options.length === 4));

const flaggedIds = new Set(
  [...pack.summary, ...pack.class_insights, ...pack.review_questions]
    .filter((item) => item.status === "needs_review")
    .map((item) => item.id),
);
for (const warning of pack.warnings) {
  assert.ok(warning.item_ids.every((id) => flaggedIds.has(id)), `warning references non-flagged item: ${warning.message}`);
}

const pdfPath = path.join("/tmp", `${pack.pack_id}.test.pdf`);
await mkdir(path.dirname(pdfPath), { recursive: true });
const pdfBody = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF
`;
await writeFile(pdfPath, pdfBody);
const pdfBytes = await readFile(pdfPath);
assert.equal(pdfBytes.subarray(0, 5).toString("ascii"), "%PDF-");

console.log("review-pack regression checks passed");
