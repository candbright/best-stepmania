import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";

const root = join(process.cwd(), "src");

/** Optional one-off codemod pairs for legacy paths (FSD layout). */
const pairs = [
  ["@/screens/", "@/pages/"],
  ["@/utils/api", "@/shared/api"],
  ["@/utils/platform", "@/shared/lib/platform"],
  ["@/utils/devLog", "@/shared/lib/devLog"],
  ["@/utils/chartPlayMode", "@/shared/lib/chartPlayMode"],
  ["@/utils/applyPlayModeSelection", "@/shared/lib/applyPlayModeSelection"],
  ["@/utils/loadingGate", "@/shared/lib/loadingGate"],
  ["@/utils/themeCssBridge", "@/shared/lib/themeCssBridge"],
  ["@/constants/", "@/shared/constants/"],
  ["@/engine/", "@/shared/lib/engine/"],
  ["@/api/", "@/shared/api/"],
  ["@/router/", "@/app/router/"],
];

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

function migrateText(text) {
  let c = text;
  for (const [a, b] of pairs) {
    c = c.split(a).join(b);
  }
  c = c.replace(/from ["']@\/engine["']/g, 'from "@/shared/lib/engine"');
  c = c.replace(/from ["']@\/api["']/g, 'from "@/shared/api"');
  return c;
}

async function main() {
  const files = (await walk(root)).filter((f) => {
    const ext = extname(f);
    return ext === ".ts" || ext === ".vue" || ext === ".tsx";
  });
  let n = 0;
  for (const f of files) {
    const raw = await readFile(f, "utf8");
    const next = migrateText(raw);
    if (next !== raw) {
      await writeFile(f, next, "utf8");
      n++;
    }
  }
  console.log(`Updated ${n} files`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
