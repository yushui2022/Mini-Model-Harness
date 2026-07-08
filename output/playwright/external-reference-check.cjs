const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const appPath = path.join(root, "public", "app.js");
const examplePath = path.join(root, "examples", "eval-packs", "external-reference-lite.json");
const app = fs.readFileSync(appPath, "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  /external_reference:\s*\{\s*sets:\s*\[/s.test(app),
  "EVAL_PACKS.external_reference is missing"
);
assert(
  /external_reference:\s*\[\s*"scenarioExternalTitle"/.test(app),
  "SCENARIO_TEXT_KEYS.external_reference is missing"
);
assert(
  !/CORE_BENCHMARK_SUITES[\s\S]*"external_reference"[\s\S]*\]/.test(app),
  "external_reference should not be in core suites"
);
assert(
  !/P1_BENCHMARK_SUITES[\s\S]*"external_reference"[\s\S]*\]/.test(app),
  "external_reference should not be in P1 suites"
);
assert(fs.existsSync(examplePath), "external reference example pack is missing");

const pack = JSON.parse(fs.readFileSync(examplePath, "utf8"));
assert(pack.taskProfile === "external_reference", "example pack taskProfile mismatch");
assert(Array.isArray(pack.cases) && pack.cases.length >= 6, "example pack needs at least 6 cases");
assert(pack.cases.some((item) => item.source === "MMLU-Pro-lite"), "MMLU-Pro-lite case missing");
assert(pack.cases.some((item) => item.source === "GSM8K-lite"), "GSM8K-lite case missing");
assert(pack.cases.some((item) => item.source === "BBH-lite"), "BBH-lite case missing");
assert(pack.cases.some((item) => item.source === "HumanEval-lite"), "HumanEval-lite case missing");
assert(pack.cases.some((item) => item.source === "MBPP-lite"), "MBPP-lite case missing");
assert(pack.cases.some((item) => item.source === "WildBench-lite"), "WildBench-lite case missing");

console.log("external reference pack wiring OK");
