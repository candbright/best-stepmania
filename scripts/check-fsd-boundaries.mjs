import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const SRC_ROOT = path.join(PROJECT_ROOT, "src");
const VALID_EXTS = new Set([".ts", ".tsx", ".vue"]);

const LAYER_RANK = {
  shared: 1,
  entities: 2,
  features: 3,
  widgets: 4,
  pages: 5,
  app: 6,
};

function getLayerFromAbsPath(absPath) {
  const rel = path.relative(SRC_ROOT, absPath).replaceAll("\\", "/");
  const [top] = rel.split("/");
  return LAYER_RANK[top] ? top : null;
}

function normalizeImportTarget(fromFile, specifier) {
  if (specifier.startsWith("@/")) {
    return path.join(SRC_ROOT, specifier.slice(2));
  }
  if (specifier.startsWith(".")) {
    return path.resolve(path.dirname(fromFile), specifier);
  }
  return null;
}

async function listSourceFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listSourceFiles(full)));
      continue;
    }
    if (VALID_EXTS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function collectSpecifiers(content) {
  const matches = [];
  const patterns = [
    /import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /export\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      matches.push(m[1]);
    }
  }
  return matches;
}

async function main() {
  const files = await listSourceFiles(SRC_ROOT);
  const violations = [];

  for (const file of files) {
    const fromLayer = getLayerFromAbsPath(file);
    if (!fromLayer) continue;
    const content = await fs.readFile(file, "utf8");
    const specs = collectSpecifiers(content);
    for (const spec of specs) {
      const targetAbs = normalizeImportTarget(file, spec);
      if (!targetAbs) continue;
      const toLayer = getLayerFromAbsPath(targetAbs);
      if (!toLayer) continue;
      const isImportingAppFromNonApp = fromLayer !== "app" && toLayer === "app";
      if (isImportingAppFromNonApp) {
        const relFile = path.relative(PROJECT_ROOT, file).replaceAll("\\", "/");
        violations.push(`${relFile}: ${fromLayer} -> ${toLayer} (${spec})`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("FSD boundary violations found:");
    for (const item of violations) {
      console.error(`- ${item}`);
    }
    process.exit(1);
  }

  console.log("FSD boundary check passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
