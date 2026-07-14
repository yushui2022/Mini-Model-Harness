# Mini Model Harness Benchmark Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation tasks, or `superpowers:executing-plans` for inline execution. Work task-by-task. Update every `Status:` field and the Progress Log before moving to the next milestone.

Goal-mode instruction:
Read `benchmark-plan.md`, start from the first milestone whose `Status:` is `pending` or `in_progress`, implement it end to end, run the listed verification, update the Progress Log, then continue to the next milestone until blocked.
Do not skip milestones.
Do not redesign the stack unless a milestone explicitly requires it.
Do not migrate to React, Tauri, FastAPI, SQLite, or another package manager.
Keep this as a local vanilla Node + HTML/CSS/JS product first.

## Goal

Build a local benchmark harness for 1B-3B models that answers one product question:

Can this local small model reliably act as a structured output node, routing node, tool node, boundary node, or short controlled assistant on this computer?

The product must show results while the benchmark is running. As soon as one case finishes, the user must see that case's score, pass/fail status, failure tags, latency, output, parsed result, and diagnostics. The user must not wait until the whole benchmark run is complete to see what is happening.

## Current Project Snapshot

Date: 2026-07-08

Workspace: `C:\Users\xiaoy\Desktop\mini-model-harness`

Current stack:
- Backend: `server.js`, Node built-in `http`
- Frontend: `public/index.html`, `public/app.js`, `public/styles.css`
- Persistence: `data/runs.json`
- No framework migration
- No database migration

Current relevant files:
- `server.js`: local API server, chat/eval/swarm/device/benchmark endpoints
- `public/app.js`: frontend state, eval packs, run handling, result rendering
- `public/index.html`: GUI shell and eval controls
- `public/styles.css`: product UI styling
- `plan.md`: long-running project plan
- `benchmark-plan.md`: this benchmark execution protocol

Current uncommitted work may include:
- Chinese-first UI and settings language switch
- Left nav icon system, no numbered 1/2/3/4 badges
- Eval controls for test, question set, case count, difficulty
- Built-in eval packs for JSON extraction, intent routing, loop stress, safety boundary
- Score-style eval result panel
- A partial or in-progress streaming eval implementation in `server.js` and `public/app.js`
- Playwright screenshots under `output/`

Before implementation resumes, inspect `git status --short`, `node --check server.js`, and `node --check public/app.js`.

## Global Constraints

- Product first, avoid over-engineering.
- The GUI must stay Chinese-first.
- English is available only through Settings language switch.
- No unnecessary small explanatory copy in the app.
- The eval page should show useful controls and results, not a landing-page explanation.
- Do not create `AGENTS.md`.
- Do not delete `data/runs.json`.
- Do not revert user changes or unrelated working tree changes.
- Do not add heavy dependencies unless a milestone explicitly requires it.
- Do not implement full public benchmark replicas before the local practical benchmark flow works.
- Use real browser verification for frontend changes when possible.
- Treat screenshots as first-class QA artifacts under `output/playwright/`.

## Status Values

Use exactly one of:

```text
pending / in_progress / complete / blocked
```

Update the status directly in this file after completing or blocking a milestone.

## Final Benchmark Taxonomy

Final model-capability benchmark classes: 8

1. 指令跟随 / IFEval-lite
   - Goal: does the model follow constraints, formats, language, length, and "no explanation" instructions?
   - Main pain: 不听话、不守格式、输出废话

2. JSON / 结构化输出
   - Goal: can the model produce valid business JSON against a schema?
   - Main pain: JSON parse error, markdown wrapper, missing fields, invalid enum

3. 工具调用 / 工具路由 / BFCL-lite
   - Goal: can the model choose the correct tool and produce legal arguments?
   - Main pain: 工具乱调、参数缺失、参数类型错、缺信息乱编

4. 意图路由 / 分类
   - Goal: can the model output stable labels for customer service, workflow, and agent routing?
   - Main pain: 分类边界不稳、近义标签、非法枚举

5. 边界处理 / 安全升级
   - Goal: can the model choose OK, ASK_INFO, ESCALATE, or REFUSE correctly?
   - Main pain: 该拒绝不拒绝、该升级不升级、缺信息乱答

6. 循环压力 / 稳定性
   - Goal: does the model avoid repetition, drift, over-explaining, and truncation?
   - Main pain: 重复、跑飞、废话、短输出失败

7. 真实性 / 幻觉风险 / TruthfulQA-lite
   - Goal: does the model avoid confident fabrication and ask for missing context?
   - Main pain: 编造 API、编造事实、错误前提不纠正

8. 多轮对话 / 记忆保持 / MT-Bench-lite
   - Goal: can the model preserve constraints and update outputs across turns?
   - Main pain: 第二轮忘格式、乱改字段、角色漂移

Separate non-model-quality benchmark:

9. 本机性能 / 速度与内存
   - Goal: measure tok/s, latency, P50/P95, runtime memory, and system fit.
   - Location: Device / benchmark page, not inside model capability eval classes.

## Benchmark Tiers

Default product modes:

```text
快速: current category, 3-5 cases, expected 30 seconds to 3 minutes
标准: core 6 classes, 30-60 cases, expected 5 to 20 minutes
完整: all 8 classes, 80-160 cases, expected 20 to 60 minutes
外部包: public benchmark subsets, expected 1 hour+
```

Initial implementation should support case count and difficulty first. Full "quick/standard/full" mode buttons can come after streaming results are stable.

## MVP Critical Path

1. Stabilize current eval UI and streaming run state.
2. Ensure every completed case appears immediately while benchmark is running.
3. Finalize the 6 core benchmark classes:
   - JSON / 结构化输出
   - 意图路由
   - 指令跟随
   - 工具调用
   - 边界处理
   - 循环压力
4. Add failure tags and score breakdowns for the new benchmark types.
5. Add quick / standard / full run modes.
6. Add report export that includes per-case details and streaming-final summary.
7. Add P1 classes:
   - 真实性 / 幻觉风险
   - 多轮对话 / 记忆保持
8. Add optional external benchmark subset import later.

## Core Data Contract

### Eval Case

Each case should normalize to this shape:

```json
{
  "id": "case_id",
  "suite": "json_structured",
  "set": "business_extraction",
  "family": "JSON 结构",
  "difficulty": "medium",
  "input": "只返回 JSON...",
  "system": "Return only JSON. No markdown.",
  "check": "json_schema",
  "expected": {},
  "schema": {},
  "choices": [],
  "regex": "",
  "maxReasonableChars": 120
}
```

Allowed `check` values for the first implementation:

```text
exact
regex
enum
contains_all
contains_any
not_contains
json_parse
json_schema
numeric_range
tool_call
instruction_following
multi_turn
llm_rubric
```

Do not implement every value at once. Add only what the current milestone needs.

### Case Result

```json
{
  "id": "case_id",
  "family": "JSON 结构",
  "check": "json_schema",
  "input": "case prompt",
  "expected": {},
  "output": "raw model output",
  "parsedOutput": {},
  "passed": false,
  "score": 0.42,
  "latencyMs": 5120,
  "failureTags": ["JSON_PARSE_ERROR", "INVALID_ENUM"],
  "scoreBreakdown": {
    "format": 0,
    "schema": 0,
    "content": 0.6,
    "loop": 1,
    "instruction": 0.5,
    "tool": 0
  },
  "diagnostics": {
    "rawLength": 512,
    "jsonParseable": false,
    "repeatedLineCount": 0,
    "maxTokenLikelyHit": false,
    "jsonTextLeakage": true
  },
  "reason": "schema mismatch"
}
```

### Run Summary

```json
{
  "total": 30,
  "completed": 30,
  "passed": 21,
  "failed": 9,
  "passRate": 0.7,
  "avgScore": 0.77,
  "latencyMs": 410000,
  "failureTagCounts": {
    "INVALID_ENUM": 3,
    "MARKDOWN_WRAPPER": 2
  }
}
```

### Streaming Events

The streaming endpoint should return NDJSON, one JSON object per line.

`start`:

```json
{
  "type": "start",
  "total": 30,
  "startedAt": "2026-07-08T00:00:00.000Z",
  "profile": {
    "provider": "ollama",
    "model": "qwen2.5:3b"
  }
}
```

`case`:

```json
{
  "type": "case",
  "index": 7,
  "total": 30,
  "case": {},
  "summary": {}
}
```

`done`:

```json
{
  "type": "done",
  "runId": "run_...",
  "summary": {},
  "cases": []
}
```

`error`:

```json
{
  "type": "error",
  "error": "message",
  "summary": {},
  "cases": []
}
```

## Failure Tags

Use stable tags. Do not invent many one-off strings.

Core tags:

```text
JSON_PARSE_ERROR
MARKDOWN_WRAPPER
TEXT_LEAKAGE
SCHEMA_MISMATCH
SCHEMA_REQUIRED_MISSING
SCHEMA_TYPE_ERROR
INVALID_ENUM
EXTRA_FIELD
EXACT_MISMATCH
REGEX_MISS
KEYWORD_MISS
BANNED_TEXT
LINE_REPEAT
MAX_TOKEN_LIKELY
OVER_VERBOSE
LENGTH_VIOLATION
LANGUAGE_MISMATCH
TOOL_NAME_INVALID
TOOL_ARGUMENT_MISSING
TOOL_ARGUMENT_TYPE_ERROR
TOOL_SHOULD_ASK_INFO
TOOL_SHOULD_NOT_CALL
SHOULD_ASK_INFO
SHOULD_ESCALATE
SHOULD_REFUSE
HALLUCINATION_RISK
CONSTRAINT_FORGOTTEN
MULTI_TURN_DRIFT
```

## Milestones

### Milestone 0: Stabilize Current Workspace

Status: complete

Depends on: none

Primary files:
- `server.js`
- `public/app.js`
- `public/index.html`
- `public/styles.css`
- `benchmark-plan.md`

Do not touch:
- stack migration
- package manager migration
- `data/runs.json` deletion
- unrelated refactors

Definition of done:
- `node --check server.js` passes.
- `node --check public/app.js` passes.
- `npm run check` passes.
- `git status --short` is understood and no accidental 0-byte files exist.
- Local server responds at `http://127.0.0.1:4173/api/health`.
- Existing eval page still opens.
- Existing final score panel still renders.

Implementation notes:
- Previous work may have partially added `/api/eval/stream`.
- Verify that endpoint exists and returns a 400 JSON error for an empty dataset, not `Unknown API route`.
- Verify that any helper extracted from `runEval()` returns its summary.
- If the streaming implementation is broken, fix it before adding new benchmark classes.

Verification commands:

```powershell
node --check server.js
node --check public\app.js
npm run check
try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4173/api/health -TimeoutSec 5).Content } catch { $_.Exception.Message }
```

### Milestone 1: Per-Case Streaming Eval

Status: complete

Depends on: Milestone 0

Primary files:
- `server.js`
- `public/app.js`
- `public/styles.css`

Backend requirement:
- Add or stabilize `POST /api/eval/stream`.
- Return NDJSON.
- Send `start` before the first model call.
- Send one `case` event immediately after each case is scored.
- Send `done` with `runId`, final `summary`, and all `cases`.
- Persist the final eval run to `data/runs.json` only once at the end.
- Keep existing `POST /api/eval` compatible for fallback.

Frontend requirement:
- `runEval()` should prefer `/api/eval/stream`.
- The right result panel must update after every `case` event.
- Each completed case must show:
  - case id
  - pass/fail
  - score
  - latency
  - failure tags
  - raw output
  - parsed output
  - diagnostics
  - reason
- The latest completed case should be visually distinguishable.
- The summary panel should show `completed/total` while running.
- Final `done` should replace running state with final score and export links.

Definition of done:
- A simulated stream with two cases updates UI twice before final summary.
- No browser console errors except known password-field form warning.
- Desktop 1366px and mobile 390px have no horizontal overflow.
- If streaming is unavailable, frontend falls back to `/api/eval`.

Manual visual test:
- Open `http://127.0.0.1:4173`.
- Go to `输出验收`.
- Select 3 cases.
- Start eval.
- Confirm each completed case appears before the full run ends.

### Milestone 2: Benchmark Class Taxonomy in UI

Status: complete

Depends on: Milestone 1

Primary files:
- `public/app.js`
- `public/index.html`
- `public/styles.css`

Requirement:
- Rename and organize current test selection around the final benchmark taxonomy.
- The first visible set should be the core 6:
  - 指令跟随
  - JSON / 结构化输出
  - 工具调用
  - 意图路由
  - 边界处理
  - 循环压力
- P1 classes can exist as disabled or pending packs only after core 6 work:
  - 真实性 / 幻觉风险
  - 多轮对话 / 记忆保持

Definition of done:
- Eval test dropdown contains the core 6 classes.
- Existing JSON, intent, loop, and boundary packs continue to work.
- No benchmark label is shown as a raw implementation key.
- No long explanatory copy is added to the app surface.

### Milestone 3: IFEval-lite / 指令跟随

Status: complete

Depends on: Milestone 2

Primary files:
- `server.js`
- `public/app.js`

Benchmark sets:
- 格式遵守
- 长度遵守
- 语言遵守
- 禁止解释
- 多条件约束

Difficulty:
- 低: one constraint
- 中: two constraints
- 高: three or more constraints with distracting text

Checks to support:
- `exact`
- `regex`
- `not_contains`
- `instruction_following`

Failure tags:
- `OVER_VERBOSE`
- `LENGTH_VIOLATION`
- `LANGUAGE_MISMATCH`
- `MARKDOWN_WRAPPER`
- `CONSTRAINT_FORGOTTEN`

Example cases:

```json
{
  "id": "ifeval_easy_yes_no",
  "family": "禁止解释",
  "input": "只输出 YES 或 NO，不要解释。问题：2 是偶数吗？",
  "check": "exact",
  "expected": "YES",
  "maxReasonableChars": 12
}
```

```json
{
  "id": "ifeval_mid_no_markdown_json",
  "family": "格式遵守",
  "input": "只返回 JSON，不要 markdown，不要解释。字段 status 必须是 ok。",
  "check": "json_schema",
  "expected": {
    "status": "ok"
  },
  "schema": {
    "type": "object",
    "required": ["status"],
    "properties": {
      "status": {
        "type": "string",
        "enum": ["ok"]
      }
    },
    "additionalProperties": false
  },
  "maxReasonableChars": 40
}
```

Definition of done:
- 指令跟随 pack has at least 2 sets and 9 total cases.
- Low/medium/high selection changes case ordering.
- Failed cases clearly show which instruction was violated.

### Milestone 4: BFCL-lite / 工具调用

Status: complete

Depends on: Milestone 2

Primary files:
- `server.js`
- `public/app.js`

Benchmark sets:
- 工具选择
- 参数生成
- 缺参数追问
- 禁止误调用
- 多工具选择

Target output format:

```json
{
  "tool": "search_order",
  "arguments": {
    "order_id": "A1029"
  }
}
```

Special non-call labels:

```text
ASK_INFO
NO_CALL
ESCALATE
```

Checks to support:
- `tool_call`
- `json_schema`
- `enum`

Failure tags:
- `TOOL_NAME_INVALID`
- `TOOL_ARGUMENT_MISSING`
- `TOOL_ARGUMENT_TYPE_ERROR`
- `TOOL_SHOULD_ASK_INFO`
- `TOOL_SHOULD_NOT_CALL`
- `INVALID_ENUM`
- `JSON_PARSE_ERROR`

Example case:

```json
{
  "id": "tool_easy_search_order",
  "family": "工具选择",
  "input": "查一下订单 A1029 的状态。只返回 JSON：tool 和 arguments。",
  "check": "tool_call",
  "tools": [
    {
      "name": "search_order",
      "parameters": {
        "type": "object",
        "required": ["order_id"],
        "properties": {
          "order_id": {
            "type": "string"
          }
        },
        "additionalProperties": false
      }
    }
  ],
  "expected": {
    "tool": "search_order",
    "arguments": {
      "order_id": "A1029"
    }
  }
}
```

Definition of done:
- 工具调用 pack has at least 2 sets and 9 total cases.
- Valid tool call can score 100.
- Wrong tool name, missing argument, wrong type, and should-ask-info are distinguishable in failure tags.

### Milestone 5: Run Modes

Status: complete

Depends on: Milestone 4

Primary files:
- `public/index.html`
- `public/app.js`
- `public/styles.css`

Requirement:
- Add run mode control:
  - 快速
  - 标准
  - 完整
- Keep existing case count control.
- Mode should affect default selected packs and planned total, not hide manual controls.

Expected mode behavior:

```text
快速: current selected class, 3-5 cases
标准: core 6 classes, 30-60 cases
完整: all 8 classes, 80-160 cases after P1 classes exist
```

Definition of done:
- Before run, UI shows planned class count, case count, and rough duration hint.
- During run, UI shows completed/total and average case latency.
- No modal required.

### Milestone 6: P1 Risk Benchmarks

Status: complete

Depends on: Milestone 5

Primary files:
- `server.js`
- `public/app.js`

Add:
- 真实性 / 幻觉风险 / TruthfulQA-lite
- 多轮对话 / 记忆保持 / MT-Bench-lite

Truthfulness-lite checks:
- 不知道就说不知道
- 不编造不存在 API
- 不把错误前提当事实
- 缺上下文时要求补充信息

Multi-turn-lite checks:
- second turn preserves first-turn format
- user field update changes only requested field
- JSON stays JSON after multiple turns
- role and constraints do not drift

Definition of done:
- 8 benchmark classes are available.
- 完整 mode can include all 8 classes.
- Multi-turn cases expose turn transcripts in case details.

### Milestone 7: Report and Compare Upgrade

Status: complete

Depends on: Milestone 6

Primary files:
- `server.js`
- `public/app.js`
- `public/styles.css`

Requirement:
- Markdown report includes:
  - run mode
  - benchmark classes
  - per-class score
  - per-case score
  - failure tags
  - raw output
  - parsed output
  - diagnostics
- Compare view should show:
  - total score delta
  - per-class score delta
  - fixed cases
  - regressed cases
  - new failure tags

Definition of done:
- User can run before/after prompt changes and export a report explaining improvement or regression.

### Milestone 8: Optional External Benchmark Packs

Status: complete

Depends on: Milestone 7

Primary files:
- `examples/`
- `public/app.js`
- `server.js`

Do not start before core product works.

Optional packs:
- MMLU-Pro-lite
- GSM8K-lite
- BBH-lite
- HumanEval-lite
- MBPP-lite
- WildBench-lite

Definition of done:
- External packs are imported as subsets.
- They do not become primary navigation.
- UI labels them as external/reference packs.

### Milestone 9: Optional Model Judge V1

Status: complete

Depends on: Milestone 8

Primary files:
- `server.js`
- `public/app.js`
- `public/index.html`
- `public/styles.css`
- `README.md`

Requirement:
- Keep deterministic scoring as the default.
- Add `POST /api/judge` for absolute rubric scoring through Ollama or OpenAI-compatible endpoints.
- Add Rules / Mixed scoring in Eval.
- Support judge scope: subjective cases, rule failures, or all cases.
- Persist judge model, rubric version, weight, threshold, evidence, and confidence without persisting the API key.
- A judge score must not override an objective rule failure.
- `json_schema` and multi-turn JSON checks must compare expected field values, not schema alone.

Definition of done:
- A local mock judge returns a structured score and evidence.
- A wrong JSON field emits `EXPECTED_VALUE_MISMATCH` even when schema passes.
- Mixed scoring shows rule, judge, and final scores per case.
- Desktop 1366px and mobile 390px have no horizontal overflow.
- Markdown, JSON, and CSV exports include judge data.

## UX Acceptance Criteria

- A case result appears immediately after that case finishes.
- A failed JSON case shows raw output, parsed result, schema reason, and fix direction.
- A tool-call failure distinguishes wrong tool, missing argument, wrong argument type, and should-ask-info.
- The user can tell if a model is usable without opening raw JSON.
- Desktop 1366px and mobile 390px have no text overlap and no horizontal overflow.
- No section reads like a landing page.
- No generic AI slogans inside the app.
- No unnecessary explanatory small text.
- The UI remains Chinese-first.

## Final Acceptance Story

A user opens the app, connects Ollama, selects `qwen2.5:3b`, chooses 标准模式, and runs the core 6 benchmark classes.

While the run is still in progress, each completed case appears immediately with score, pass/fail, latency, failure tags, output, parsed output, diagnostics, and reason.

After the run, the user sees:

```text
总分: 77 分
JSON / 结构化输出: 84 分
工具调用: 62 分
意图路由: 90 分
边界处理: 70 分
循环压力: 82 分
指令跟随: 74 分
```

The user changes the prompt, runs again, compares before/after, exports a Markdown report, and can say:

This model is usable for low-risk JSON extraction and intent routing, but not yet usable for tool calling because missing arguments and invalid enums fail the gate.

## Recovery Procedure After Context Compression

1. Read this file first.
2. Run:

```powershell
git status --short
node --check server.js
node --check public\app.js
npm run check
```

3. Inspect the first milestone with `Status: in_progress`.
4. If code and plan disagree, trust the code only after verifying it in the browser.
5. Do not jump to adding new benchmark packs until Milestone 1 is verified complete.
6. Update `Status:` and Progress Log before ending the turn.

## Progress Log

- 2026-07-08: Created `benchmark-plan.md` as the execution protocol for benchmark expansion and streaming per-case results.
- 2026-07-08: Current priority is Milestone 0 and Milestone 1: stabilize current workspace and verify per-case streaming eval before adding new benchmark classes.
- 2026-07-08: Completed Milestone 0. Verified `node --check server.js`, `node --check public\app.js`, `npm run check`, no 0-byte files, health endpoint, and `/api/eval/stream` empty-dataset 400 behavior.
- 2026-07-08: Completed Milestone 1. Added stable `completed` in eval summaries, stream-unavailable fallback to `/api/eval`, and browser-verified two-case NDJSON streaming: first case renders before final summary, latest case is highlighted while running, final summary/export links render, desktop 1366px and mobile 390px have no horizontal overflow.
- 2026-07-08: Next execution starts at Milestone 2: organize the eval UI around the core 6 benchmark classes before adding IFEval-lite and BFCL-lite.
- 2026-07-08: Completed Milestone 2. Eval test dropdown now exposes the core 6 classes: JSON / 结构化输出, 意图路由, 指令跟随, 工具调用, 边界处理, 循环压力. Existing JSON, intent, loop, and boundary packs remain available.
- 2026-07-08: Completed Milestone 3. Added IFEval-lite / 指令跟随 with 2 sets and 10 total cases across format, language, length, no-explanation, and multi-constraint checks. Browser-verified low/medium/high difficulty changes case selection and ordering.
- 2026-07-08: Completed Milestone 4. Added BFCL-lite / 工具调用 with 2 sets and 9 total cases across tool choice, argument generation, missing-info handling, no-call, escalation, type checks, and multi-tool choice. Backend scoring now emits stable tool failure tags such as `TOOL_NAME_INVALID`, `TOOL_ARGUMENT_MISSING`, `TOOL_ARGUMENT_TYPE_ERROR`, `TOOL_SHOULD_ASK_INFO`, and `TOOL_SHOULD_NOT_CALL`.
- 2026-07-08: Next execution starts at Milestone 5: add quick / standard / full run modes while keeping manual controls visible.
- 2026-07-08: Completed Milestone 5. Added 快速 / 标准 / 完整 run modes. 快速 runs the current set, 标准 runs the core 6 classes with 30 planned cases by default, and 完整 runs all currently available core 6 cases until P1 classes are added. Browser-verified planned class count, case count, duration hint, and running average case latency.
- 2026-07-08: Next execution starts at Milestone 6: add P1 risk benchmarks, 真实性 / 幻觉风险 and 多轮对话 / 记忆保持.
- 2026-07-08: Completed Milestone 6. Added 真实性 / 幻觉风险 and 多轮对话 / 记忆保持 as P1 lite benchmark classes. 完整 mode now includes all 8 classes and 66 current cases. Backend supports `multi_turn` cases with turn transcripts and emits `MULTI_TURN_DRIFT` / `CONSTRAINT_FORGOTTEN` when follow-up constraints fail.
- 2026-07-08: Next execution starts at Milestone 7: upgrade Markdown report and Compare view to summarize per-class score, per-case score, fixed/regressed cases, and failure tag deltas.
- 2026-07-08: Completed Milestone 7. Markdown reports now include run mode, benchmark classes, per-class score table, per-case score table, failure tags, raw output, parsed output, and diagnostics. Compare view now shows total score delta, pass delta, per-class deltas, fixed cases, regressed cases, new failure tags, changed outputs, and can export a comparison Markdown report.
- 2026-07-08: Next execution starts at Milestone 8: optional external/reference benchmark packs, kept secondary to the core product UI.
- 2026-07-08: Completed Milestone 8. Added manual-only 外部参考包 with MMLU-Pro-lite, GSM8K-lite, BBH-lite, HumanEval-lite, MBPP-lite, and WildBench-lite sets. Added `examples/eval-packs/external-reference-lite.json` for importable subset format. Verified external packs stay out of 标准 and 完整 default run modes, with Playwright desktop/mobile checks and no horizontal overflow.
- 2026-07-11: Completed Milestone 9. Added optional absolute model judging through `/api/judge`, Rules / Mixed Eval scoring, configurable judge scope/weight/threshold/rubric, session-only judge API keys, per-case judge evidence, and judge-aware exports. Fixed JSON and multi-turn expected-value scoring so schema-valid but incorrect business values fail with `EXPECTED_VALUE_MISMATCH`. Verified with a local mock judge and Playwright desktop/mobile checks.
- 2026-07-11: Completed an enterprise UI restructuring without changing benchmark scoring contracts. Benchmark classes now live in a dedicated Benchmark Library, Eval defaults to product-level configuration controls with raw JSON under Advanced Configuration, the dashboard reads real runs and failure tags, and runtime settings no longer occupy the first page. Reverified the mixed Judge flow, `EXPECTED_VALUE_MISMATCH`, per-case Judge details, session-only API keys, desktop layout, and the 390px mobile drawer.
- 2026-07-11: Promoted local runtime connection back into the Dashboard as the first operational workflow without restoring the old settings-heavy layout. Users can select Ollama, LM Studio, llama.cpp, vLLM, or OpenAI-compatible runtimes, edit the endpoint, detect exposed models, and select one in place. Added NDJSON generation benchmark streaming so warmup, every completed speed sample, partial TPS/latency, progress, and live system memory appear before the final run is saved. The Device benchmark uses the same stream. Verified an intermediate `1/3` UI state before completion, final `3/3`, saved model selection, desktop 1440px, and mobile 390px.
