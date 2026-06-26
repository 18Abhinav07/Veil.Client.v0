import { spawnSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outDir = join(root, ".test-build");
const tscBin = join(root, "node_modules", "typescript", "bin", "tsc");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function findTests(dir, suffix = ".test.js") {
  const entries = readdirSync(dir);
  const tests = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) tests.push(...findTests(path, suffix));
    if (stat.isFile() && path.endsWith(suffix)) tests.push(path);
  }
  return tests;
}

rmSync(outDir, { recursive: true, force: true });
run(process.execPath, [tscBin, "-p", "tsconfig.test.json"]);

const tests = [
  ...findTests(outDir),
  ...findTests(join(root, "scripts"), ".test.mjs"),
];
if (tests.length === 0) {
  console.error("No compiled tests found in .test-build");
  process.exit(1);
}

run(process.execPath, ["--test", ...tests]);
