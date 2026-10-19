import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "fixtures/generated");

export default function generateFixtures() {
  mkdirSync(output, { recursive: true });
  const contracts = [
    "TemplateAssert",
    "TEALScriptTemplates",
    "ARC56Test",
    "Readonly",
    "Assert42",
    "BareCreateError",
    "ResourcePopulation",
  ];
  for (const name of contracts) {
    rmSync(resolve(output, `${name}.arc56.json`), { force: true });
  }
  for (const args of [
    [
      "puya-ts",
      "fixtures/contracts/puya",
      "--out-dir",
      output,
      "--target-avm-version",
      "11",
    ],
    ["tealscript", "fixtures/contracts/tealscript/templates.algo.ts", output],
  ]) {
    execFileSync("pnpm", ["exec", ...args], { cwd: root, stdio: "inherit" });
  }

  // Fail setup if a compiler did not emit a valid ARC56 artifact.
  for (const name of contracts) {
    JSON.parse(readFileSync(resolve(output, `${name}.arc56.json`), "utf8"));
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  generateFixtures();
}
