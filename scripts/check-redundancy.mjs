import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const TS_EXT = new Set([".ts", ".tsx", ".vue"]);
const IGNORE_DIRS = new Set(["node_modules", "dist", "target", ".git"]);

/** @returns {string[]} */
function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
      continue;
    }
    if (TS_EXT.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

/** @returns {string} */
function rel(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

/** @returns {Array<{name:string,file:string,kind:string}>} */
function collectExportedTypeLikeSymbols(files) {
  const out = [];
  const re = /^\s*export\s+(type|interface|enum|class)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    let match;
    while ((match = re.exec(content)) !== null) {
      out.push({
        kind: match[1],
        name: match[2],
        file: rel(file),
      });
    }
  }
  return out;
}

/** @returns {Map<string, {rhs:string,file:string}[]>} */
function collectExportedTypeAliases(files) {
  const aliasMap = new Map();
  const re = /^\s*export\s+type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);/gm;
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    let match;
    while ((match = re.exec(content)) !== null) {
      const name = match[1];
      const rhs = match[2].trim().replace(/\s+/g, " ");
      const list = aliasMap.get(name) ?? [];
      list.push({ rhs, file: rel(file) });
      aliasMap.set(name, list);
    }
  }
  return aliasMap;
}

function countWordMatches(files, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "g");
  let total = 0;
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const matches = content.match(re);
    if (matches) total += matches.length;
  }
  return total;
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.log("[redundancy] src/ directory not found, skipped.");
    process.exit(0);
  }

  const files = walkFiles(SRC_DIR);
  const exportedSymbols = collectExportedTypeLikeSymbols(files);
  const typeAliases = collectExportedTypeAliases(files);

  const zeroRef = [];
  for (const symbol of exportedSymbols) {
    const count = countWordMatches(files, symbol.name);
    if (count <= 1) zeroRef.push({ ...symbol, count });
  }

  const duplicateTypeAliases = [];
  for (const [name, defs] of typeAliases.entries()) {
    if (defs.length <= 1) continue;
    const uniqueRhs = new Set(defs.map((d) => d.rhs));
    if (uniqueRhs.size === 1) {
      duplicateTypeAliases.push({ name, defs });
    }
  }

  console.log("[redundancy] scan finished.");
  if (zeroRef.length === 0 && duplicateTypeAliases.length === 0) {
    console.log("[redundancy] no obvious redundancy findings.");
    process.exit(0);
  }

  if (zeroRef.length > 0) {
    console.log(`\n[redundancy] possible zero-reference exported symbols: ${zeroRef.length}`);
    for (const item of zeroRef) {
      console.log(`  - ${item.name} (${item.kind}) in ${item.file}`);
    }
  }

  if (duplicateTypeAliases.length > 0) {
    console.log(`\n[redundancy] duplicated exported type aliases: ${duplicateTypeAliases.length}`);
    for (const item of duplicateTypeAliases) {
      const places = item.defs.map((d) => d.file).join(", ");
      console.log(`  - ${item.name}: ${places}`);
    }
  }

  console.log("\n[redundancy] soft gate only: warnings do not fail CI.");
  process.exit(0);
}

main();
