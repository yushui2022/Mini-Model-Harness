const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
let source = fs.readFileSync(path.join(root, "server.js"), "utf8");
source = source.replace(/server\.listen\(PORT, HOST,[\s\S]*?\n\}\);\s*$/m, "");

const context = {
  require,
  console,
  process,
  Buffer,
  URL,
  setTimeout,
  clearTimeout,
  __dirname: root,
  __filename: path.join(root, "server.js")
};
vm.createContext(context);
vm.runInContext(source, context);

const cases = [
  {
    id: "json_case",
    suite: "json_extraction",
    set: "业务抽取",
    difficulty: "medium",
    family: "JSON 结构",
    check: "json_schema",
    input: "只返回 JSON",
    expected: { status: "ok" },
    output: "{\"status\":\"bad\"}",
    parsedOutput: { status: "bad" },
    passed: false,
    score: 0.5,
    latencyMs: 120,
    failureTags: ["INVALID_ENUM"],
    diagnostics: { rawLength: 16, jsonParseable: true }
  },
  {
    id: "tool_case",
    suite: "tool_calling",
    set: "工具选择",
    difficulty: "medium",
    family: "工具选择",
    check: "tool_call",
    input: "查订单",
    expected: { tool: "search_order", arguments: { order_id: "A1029" } },
    output: "{\"tool\":\"search_order\",\"arguments\":{\"order_id\":\"A1029\"}}",
    parsedOutput: { tool: "search_order", arguments: { order_id: "A1029" } },
    passed: true,
    score: 1,
    latencyMs: 88,
    failureTags: [],
    diagnostics: { rawLength: 58, jsonParseable: true }
  }
];

const summary = context.summarizeEvalCases(cases, Date.now() - 300);
summary.runMode = "standard";
summary.configLabel = "标准 · 2 类 · 2 题";
summary.benchmarkClasses = ["JSON 抽取", "工具调用"];

const markdown = context.generateMarkdownReport({
  id: "run_report_check",
  createdAt: new Date().toISOString(),
  type: "eval",
  title: "Eval 1/2",
  profile: { provider: "mock", baseUrl: "http://127.0.0.1", model: "mock-3b" },
  params: {},
  summary,
  result: {
    runConfig: { runMode: "standard", configLabel: "标准 · 2 类 · 2 题" },
    cases
  }
});

const required = [
  "Run mode: standard",
  "## Per-Class Score",
  "JSON / 结构化输出",
  "工具调用",
  "## Per-Case Score",
  "json_case",
  "INVALID_ENUM",
  "#### Raw Output",
  "#### Parsed Output",
  "#### Diagnostics"
];

for (const text of required) {
  if (!markdown.includes(text)) {
    throw new Error(`Report missing: ${text}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  lines: markdown.split(/\r?\n/).length,
  contains: required
}, null, 2));
