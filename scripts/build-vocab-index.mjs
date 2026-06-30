#!/usr/bin/env node
/**
 * Build vocab.index.json from specifications/vocabularies/*.vocab.toml
 * @deprecated Prefer scripts/codegen-from-specs.mjs
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildVocabIndexFromDir } from "./lib/spec-toml.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

export function buildVocabIndex(specsDir, outFile) {
  const vocabDir = path.join(specsDir, "vocabularies");
  const merged = buildVocabIndexFromDir(vocabDir);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(
    `Wrote vocab index (${Object.keys(merged).length} vocabs) → ${outFile}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const specsDir = process.argv[2] ?? path.resolve(ROOT, "../specifications");
  const outFile =
    process.argv[3] ?? path.join(ROOT, "public/data/vocab.index.json");
  buildVocabIndex(specsDir, outFile);
}
