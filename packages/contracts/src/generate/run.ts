// Writes src/case.ts from schemas/case.schema.json and formats it: node src/generate/run.ts
import { readFileSync, writeFileSync } from "node:fs";
import { formatCaseSource } from "./format.ts";
import { generateCaseSource } from "./case-zod.ts";

const schemaPath = new URL("../../../../schemas/case.schema.json", import.meta.url);
const outputPath = new URL("../case.ts", import.meta.url);
const source = await formatCaseSource(
  generateCaseSource(JSON.parse(readFileSync(schemaPath, "utf8"))),
);
writeFileSync(outputPath, source);
console.log(`Wrote ${outputPath.pathname}`);
