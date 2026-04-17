import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const SRC_ROOT = path.join(PROJECT_ROOT, "src");
const VALID_EXTS = new Set([".ts", ".tsx", ".vue"]);

/** Bottom = 1 (shared); top = 6 (app). Import allowed only if rank(from) >= rank(to). */
const LAYER_RANK = {
  shared: 1,
  entities: 2,
  features: 3,
  widgets: 4,
  pages: 5,
  app: 6,
};

const ALLOWED_TOP_LEVEL_DIRS = new Set(["app", "pages", "widgets", "features", "entities", "shared", "assets"]);
const ALLOWED_TOP_LEVEL_FILES = new Set(["vite-env.d.ts"]);

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

/** Map resolved path under src/ to FSD layer, or null for whitelisted / non-slice paths. */
function getTargetLayer(resolvedAbs) {
  const rel = path.relative(SRC_ROOT, resolvedAbs).replaceAll("\\", "/");
  if (rel.startsWith("..")) return null;
  const [top] = rel.split("/");
  if (top === "assets") return null;
  if (LAYER_RANK[top]) return top;
  return "__unclassified__";
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

async function checkTopLevelLayout() {
  const violations = [];
  const entries = await fs.readdir(SRC_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(SRC_ROOT, entry.name);
    if (entry.isDirectory()) {
      if (!ALLOWED_TOP_LEVEL_DIRS.has(entry.name)) {
        violations.push(`Disallowed top-level directory under src/: ${entry.name}`);
      }
      continue;
    }
    if (!VALID_EXTS.has(path.extname(entry.name))) continue;
    if (!ALLOWED_TOP_LEVEL_FILES.has(entry.name)) {
      violations.push(`Disallowed top-level file under src/: ${entry.name}`);
    }
  }
  return violations;
}

async function main() {
  const layoutViolations = await checkTopLevelLayout();
  const files = await listSourceFiles(SRC_ROOT);
  const violations = [...layoutViolations];

  for (const file of files) {
    const fromLayer = getLayerFromAbsPath(file);
    if (!fromLayer) continue;
    const fromRank = LAYER_RANK[fromLayer];
    const content = await fs.readFile(file, "utf8");
    const specs = collectSpecifiers(content);
    for (const spec of specs) {
      const targetAbs = normalizeImportTarget(file, spec);
      if (!targetAbs) continue;
      const toLayer = getTargetLayer(targetAbs);
      if (toLayer === null || toLayer === "__unclassified__") {
        if (toLayer === "__unclassified__") {
          const relFile = path.relative(PROJECT_ROOT, file).replaceAll("\\", "/");
          violations.push(`${relFile}: import resolves outside FSD slices (${spec})`);
        }
        continue;
      }
      const toRank = LAYER_RANK[toLayer];
      if (fromRank < toRank) {
        const relFile = path.relative(PROJECT_ROOT, file).replaceAll("\\", "/");
        violations.push(`${relFile}: ${fromLayer} (rank ${fromRank}) -> ${toLayer} (rank ${toRank}) (${spec})`);
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
