# Mini Model Harness Long-Run Product Plan

> This file is the durable execution guide for long goal-mode runs. If the conversation
> gets compacted, resume from this document first, then inspect the current files before
> editing. The project must end as a polished local small-model evaluation product, not
> just a demo UI.

## Goal-Mode Instruction

Use this when starting a long autonomous run:

```text
Read plan.md, start from the first incomplete milestone, implement it end to end,
run a lightweight smoke check, update Progress Log, then continue to the next milestone until blocked.
Do not skip milestones. Do not redesign the stack unless the milestone requires it.
Bias toward shipping visible product workflows before deep validation, testing, or evidence systems.
```

## Product-First Execution Bias

The current priority is to make the product real and usable, not to perfect the evaluation
science. Build the screens, flows, presets, and local-model loop first. Keep checks light:
syntax checks, server health, page load, and one happy-path API call where possible.

Until the main product loop exists, avoid getting stuck on:

- exhaustive benchmarks
- formal scoring theory
- deep evidence storage
- heavy report rigor
- framework rewrites
- long test harnesses

The product loop to optimize first is:

```text
Connect runtime -> choose model -> load a built-in scenario -> run -> see result -> adjust prompt -> run again
```

## 0. How To Resume After Context Compression

When a future agent resumes work with little context, do this in order:

1. Read this `plan.md` completely.
2. Inspect the current repository state:
   - `package.json`
   - `server.js`
   - `public/index.html`
   - `public/app.js`
   - `public/styles.css`
   - `README.md`
   - `data/runs.json` if it exists
3. Run the fastest static check:
   - `npm run check`
4. Identify the first incomplete milestone in this file.
5. Work only on the next milestone unless the user redirects.
6. Before ending a long run, update the Progress Log section at the bottom of this file.
7. Do not rewrite user changes. If files changed since the last read, work with them.

The project is currently a small Node.js app with a static frontend. It already has:

- Local runtime connection: Ollama, LM Studio, llama.cpp, vLLM/OpenAI-compatible.
- Prompt Lab.
- Serial Swarm.
- Basic Eval with `keywords`, `regex`, and `exact`.
- Run history in `data/runs.json`.

Known current issues:

- Chinese text in `README.md`, `public/index.html`, and `public/app.js` is currently clean.
- Eval has practical assertions, simple exports, and a front-end Compare view.
- Device page and run-level device snapshots exist in V0.1 form.
- Runs are still stored in JSON, but the UI now uses searchable summary cards and keeps up to 500 runs.

## 1. Product Thesis

Mini Model Harness is not a chat UI and not a large-model benchmark clone.

It is a **local small-model quality gate**:

> A GUI-first workbench for validating whether 1B-7B local models can safely and reliably
> perform specific business tasks on specific local hardware.

The product should answer:

- Can this small model reliably output strict JSON?
- Does it loop, repeat, drift, or hit max tokens?
- Can it finish a concrete business task, not merely produce plausible text?
- Can it classify, extract, route, and maintain a small state machine?
- Does it fail safely when it should refuse, escalate, or abstain?
- Does it still work under latency, memory, context, and local-device limits?
- Is this model-device-runtime-task combination actually usable on a laptop?

The product is a "quality inspection station" for small local models.

## 2. North Star

The north-star workflow:

> In 15 minutes, a user can connect a local 1B-7B model, create or import 10-50 task
> examples, run deterministic evaluations, inspect failures, compare two model/prompt
> variants, and export a credible report showing whether the model is usable.

North-star success output:

```text
Model: qwen2.5:3b-instruct-q4
Device: 16GB laptop, CPU-only
Task profile: customer-intent JSON classification

Verdict: B / usable for low-risk routing with fallback
JSON schema pass: 96%
Invalid label rate: 1.8%
High-risk recall: 88% - below production threshold
Loop/truncation rate: 0.9%
P95 latency: 1.9s
Recommended context: 4K
Not recommended for: high-risk autonomous action, long multi-turn state
```

### 2.1 MVP Critical Path

This is the shortest path to a demonstrable product. The first public-feeling version
should prioritize usable screens and a smooth local workflow over deep validation.

1. Fix mojibake and product copy.
2. Add a dashboard/connect flow that makes the next action obvious.
3. Add built-in scenarios users can run immediately.
4. Make Prompt Lab, Eval, Swarm, and Runs feel like one product, not separate demos.
5. Add a simple Markdown/JSON export for runs.
6. Add Compare for two eval runs.
7. Add a high-end UI pass.

The MVP is acceptable when a user can connect a local model, load a built-in scenario,
run it, adjust a prompt, run again, compare the two runs, and export a simple result.

## 3. Positioning Boundaries

Do not drift into these product categories:

- Do not become a general chat UI.
- Do not build model download/quantization management as the main feature.
- Do not build a RAG knowledge-base product.
- Do not clone OpenCompass/lm-eval-harness with a smaller UI.
- Do not make autonomous agent demos the center of the product.
- Do not make LLM-as-judge the default scoring path for small models.

The wedge is:

```text
Local small models
+ GUI-first harness
+ task-level eval
+ deterministic assertions
+ device/runtime profiling
+ failure taxonomy
+ exportable audit reports
```

## 4. Target Users And Pain Points

### 4.1 University Labs And Students

Pain:

- No expensive GPU cluster.
- Many small fine-tuned or from-scratch models need validation.
- Heavy benchmark stacks are hard to set up.
- Chat demos are not rigorous enough for papers or course projects.

Product promise:

- "Without a heavyweight evaluation stack, make small-model experiments reproducible."
- Provide eval packs, report export, run metadata, and model/device notes.

### 4.2 Enterprise Local Deployment Teams

Pain:

- Local privacy requirements.
- Need to know whether a small model can enter an internal workflow.
- Need failures and boundaries before deployment.
- Need proof for acceptance, not a pretty chat answer.

Product promise:

- "Before a model enters a business chain, prove where it is stable and where it fails."
- Provide JSON/schema pass, failure tags, latency, fallback recommendation, and audit logs.

### 4.3 Small-Model Developers And Fine-Tuning Teams

Pain:

- Need regression tests across prompt/model/quantization versions.
- Need to detect format degradation and safety regressions.

Product promise:

- "Turn prompts into regression tests."
- Compare baseline vs tuned model, prompt A vs prompt B, Q4 vs Q8, CPU vs GPU.

### 4.4 Hardware And Edge AI Users

Pain:

- Tokens/s alone is misleading.
- Need to know if a device-model-runtime combination is actually usable.

Product promise:

- "Not just whether it runs, but whether it is worth running."
- Provide recommended context, concurrency, backend, and warning boundaries.

## 5. Product Shape

The product should feel like a serious local lab instrument:

- Dense but readable.
- Trustworthy.
- High signal.
- Audit-oriented.
- Operational, not playful.
- Focused on evidence, failures, thresholds, and recommendations.

Primary navigation target:

1. Dashboard
2. Connect
3. Prompt Lab
4. Eval Workbench
5. Compare
6. Device Match
7. Swarm Lab
8. Runs
9. Reports

The current app has Control, Prompt Lab, Swarm, Eval, Runs. Keep that simplicity in the
short term, but evolve toward the target navigation once core evaluation is stronger.

## 6. UX And Visual Direction

The final product must look like a high-end professional tool, not a generated demo page.

Design principles:

- Use restrained contrast and precise spacing.
- Use compact information architecture.
- Avoid hero sections and marketing copy inside the app.
- Avoid decorative gradients, blobs, and generic cards.
- Use full-width work surfaces and data tables.
- Use cards only for repeated run items, reports, or contained panels.
- Use icons in buttons when a proper icon system is introduced.
- Keep button text short and action-oriented.
- Make failures visible and searchable.
- Make summary verdicts decisive.

Suggested visual identity:

```text
Mood: local lab instrument + quality-control console
Palette: off-white/charcoal base, teal for pass, red for fail, amber for warning, blue for info
Typography: compact system sans, monospace for prompts/logs/JSON
Layout: left navigation, top status strip, dense workbench panels, result tables
```

Product copy style:

- Replace vague labels with operational labels.
- Prefer "Schema Pass", "Loop Risk", "P95 Latency", "Device Fit" over "Score".
- Avoid saying "AI assistant" too much. This is a harness.
- Every screen should answer "what should I do next?".

Example dashboard first viewport:

```text
Verdict strip:
Connected runtime | Selected model | Last run status | Device memory | Recommended next action

Main panels:
1. Latest Eval Summary
2. Failure Hotspots
3. Model/Prompt Compare
4. Device Fit Recommendation
```

High-end UI Definition of Done:

- First viewport shows selected runtime, selected model, latest eval verdict, failure
  hotspots, and next action.
- No section reads like a landing page.
- No generic AI slogans inside the app.
- Failure tags are visible within 1 click after a run.
- A failed JSON case clearly shows raw output, parsed result, schema reason, and fix direction.
- A user can understand whether the model is usable without opening raw JSON.
- Desktop 1366px and mobile 390px have no text overlap.

## 7. Evaluation Philosophy

Small models should be assumed to fail. The harness exists to make failure observable,
bounded, and recoverable.

Core principles:

```text
Test stability before intelligence.
Test hard failures before average scores.
Test business action before prose quality.
Test boundaries before normal samples.
Preserve raw output before parsing or repairing.
```

Default stance:

- Deterministic assertions first.
- Strict JSON first.
- LLM-as-judge optional, never default for MVP.
- Always keep raw output.
- Always classify failures.
- Always show latency and reliability next to quality.

### 7.1 Built-In Demo Scenarios

The product should not open to a blank editor. Built-in scenarios should express the
pain points directly and give users an immediate useful run.

1. JSON extraction gate: "Can the model consistently output business JSON?"
2. Intent routing gate: "Can it route customer/tool intents without invalid labels?"
3. Loop stress gate: "Does it repeat, drift, or hit max tokens?"
4. Safety boundary gate: "Does it refuse, abstain, or escalate when required?"
5. Device fit quick test: "Is this model smooth enough on this local machine?"

## 8. Evaluation Dimensions

The eval engine should grow from basic assertions into these dimensions.

### 8.1 JSON Stability

Metrics:

- Parse rate.
- Schema pass rate.
- Required key rate.
- Extra key rate.
- Enum validity.
- Type validity.
- No-text-leakage rate.
- Repair cost, if recoverable mode is enabled.
- Multi-run structure consistency.

Failure tags:

- `JSON_PARSE_ERROR`
- `SCHEMA_MISMATCH`
- `INVALID_ENUM`
- `TEXT_LEAKAGE`
- `MULTI_JSON`
- `PARTIAL_JSON`
- `UNSTABLE_KEYS`

### 8.2 Loop And Termination

Metrics:

- Max-token hit rate.
- N-gram repetition.
- Repeated-line count.
- Output length ratio.
- Stop compliance.
- No-progress generation.

Failure tags:

- `NGRAM_LOOP`
- `LINE_REPEAT`
- `SECTION_REPEAT`
- `JSON_ARRAY_RUNAWAY`
- `ROLE_LOOP`
- `MAX_TOKEN_TRUNCATION`
- `RUNAWAY_GENERATION`

### 8.3 Business Task Completion

Metrics:

- Critical step pass rate.
- Final action accuracy.
- Constraint satisfaction.
- Escalation accuracy.
- Factual support from input.

Failure tags:

- `MISSING_CRITICAL_FACT`
- `WRONG_FINAL_ACTION`
- `CONSTRAINT_VIOLATION`
- `OVER_CONFIDENT`
- `UNDER_SPECIFIED`
- `MIS_ESCALATION`
- `FABRICATED_DETAIL`

### 8.4 Extraction, Classification, Routing

Metrics:

- Field exact match.
- Field F1.
- Macro F1.
- Minority/high-risk recall.
- Invalid label rate.
- Route accuracy.
- Unauthorized route rate.

Failure tags:

- `FIELD_MISS`
- `FIELD_HALLUCINATION`
- `NORMALIZATION_ERROR`
- `NEGATION_ERROR`
- `LABEL_CONFUSION`
- `INVALID_LABEL`
- `WRONG_ROUTE`
- `UNAUTHORIZED_TOOL_ROUTE`
- `MISSED_ESCALATION`

### 8.5 Multi-Turn State Machine

Metrics:

- State accuracy.
- Transition accuracy.
- Slot F1.
- Ask-when-missing accuracy.
- No-repeat-question rate.
- Recovery accuracy after correction.

Failure tags:

- `STATE_DRIFT`
- `ILLEGAL_TRANSITION`
- `SLOT_FORGET`
- `SLOT_CONTAMINATION`
- `REPEAT_ASK`
- `PREMATURE_ACTION`
- `FAILED_CORRECTION`
- `TERMINAL_TOO_EARLY`

### 8.6 Safety And Permission Boundary

Metrics:

- Appropriate refusal rate.
- Unsafe compliance rate.
- Over-refusal rate.
- Privilege boundary accuracy.
- Prompt injection resistance.
- Safe alternative rate.

Failure tags:

- `UNSAFE_COMPLIANCE`
- `OVER_REFUSAL`
- `POLICY_LEAKAGE`
- `PRIVILEGE_ESCALATION`
- `DATA_EXFILTRATION`
- `PROMPT_INJECTION_SUCCESS`
- `FAKE_CAPABILITY`
- `UNHELPFUL_REFUSAL`

### 8.7 Robustness

Perturbations:

- Typos.
- Colloquial phrasing.
- Chinese-English mixed text.
- Punctuation noise.
- Field order changes.
- Irrelevant inserted text.
- Long-context dilution.
- Prompt injection.
- Empty or very short input.
- Boundary values.

Failure tags:

- `TYPO_SENSITIVE`
- `ORDER_SENSITIVE`
- `NOISE_DISTRACTION`
- `LONG_CONTEXT_LOSS`
- `CONFLICT_CONFUSION`
- `BOUNDARY_VALUE_ERROR`
- `EMPTY_INPUT_FAILURE`

### 8.8 Performance Under Constraint

Metrics:

- End-to-end latency.
- TTFT when streaming is available.
- Prefill tokens/s when runtime exposes it.
- Decode tokens/s.
- Timeout rate.
- Crash/OOM rate.
- P50/P95/P99 latency.
- Output tokens.
- Input tokens.
- Max token hit.

Failure tags:

- `TIMEOUT`
- `OOM`
- `CRASH`
- `LOW_TPS`
- `HIGH_TTFT`
- `HIGH_P95_LATENCY`
- `UNSTABLE_RUN`

## 9. Scoring Model

Do not ship a single universal score as the only result. Ship profile-based scores.

### 9.1 General Raw Quality

```text
raw_quality =
0.15 * json_score
+ 0.10 * loop_score
+ 0.20 * business_score
+ 0.15 * extraction_classification_routing_score
+ 0.15 * fsm_score
+ 0.15 * safety_score
+ 0.10 * robustness_score
```

### 9.2 Effective Quality

```text
effective_quality =
raw_quality
* latency_multiplier
* throughput_multiplier
* reliability_multiplier
```

Where:

```text
latency_multiplier = min(1, target_p95_latency / observed_p95_latency)
throughput_multiplier = min(1, observed_tps / target_tps)
reliability_multiplier = max(0, 1 - timeout_rate - oom_rate - crash_rate)
```

### 9.3 Hard Gates

Examples:

```text
Strict JSON task: json_score must be >= 0.95
Safety-sensitive task: safety_score must be >= 0.90
High-risk route task: high-risk recall must be >= 0.90
Loop gate: max_token_hit_rate must be <= 0.05
Reliability gate: timeout_rate must be <= 0.02
```

### 9.4 Profile Scores

Structured tool-call profile:

```text
JSON 35%
Extraction/routing 25%
Loop control 15%
Latency 15%
Robustness 10%
```

Classification/routing profile:

```text
Classification/routing 45%
High-risk recall 20%
Format validity 15%
Latency 10%
Robustness 10%
```

Customer service / office workflow profile:

```text
Business completion 30%
Multi-turn FSM 25%
Safety boundary 20%
Robustness 10%
JSON 10%
Latency 5%
```

Safety front-gate profile:

```text
Safety boundary 50%
Over-refusal control 15%
Robustness 15%
Latency 10%
Format stability 10%
```

## 10. Device-Model Matching

This is a major differentiator. Do not reduce it to tokens/s.

The question is:

```text
Is this model-device-runtime-task combination usable?
```

Required dimensions:

- Loadability.
- TTFT and responsiveness.
- Sustained throughput.
- Memory and KV cache pressure.
- Thermal and power stability.
- Backend acceleration effectiveness.
- Concurrency.
- Swarm model residency and switching cost.
- Task quality under those constraints.

Recommended output:

```text
Verdict: Recommended / Usable / Marginal / Not Recommended / Unusable
Recommended backend: CPU-only / GPU full offload / GPU partial offload / NPU / mixed
Recommended context: 4K / 8K / 16K
Maximum stable context: ...
Recommended concurrency: ...
Main bottleneck: ...
Risk boundary: ...
```

Important rule:

> A fast unusable model is still unusable. Quality gates limit performance scores.

## 11. Data And Run Evidence

Every evaluation case should eventually save:

- `run_id`
- `case_id`
- `dataset_version`
- `model_id`
- `runtime_backend`
- `hardware_info`
- `prompt_template_version`
- `system_prompt`
- `rendered_prompt`
- `input_payload`
- `expected_output`
- `raw_model_output`
- `parsed_output`
- `score_breakdown`
- `failure_tags`
- `latency_ms`
- `ttft_ms` if available
- `input_tokens`
- `output_tokens`
- `tokens_per_second`
- `finish_reason`
- `max_tokens_hit`
- `decoding_params`
- `timestamp`

Raw output must be preserved. It is often the only place where leakage, looping, and
format drift are visible.

### 11.1 Core Data Contract

New features should converge on these stable fields. Compare, Report, Runs, Device, and
future storage migrations should consume this contract instead of inventing parallel
field shapes.

Eval case result:

```json
{
  "id": "case_id",
  "family": "json_schema",
  "passed": false,
  "score": 0.42,
  "failureTags": ["JSON_PARSE_ERROR", "INVALID_ENUM"],
  "scoreBreakdown": {
    "format": 0,
    "schema": 0,
    "content": 0.6,
    "loop": 1,
    "latency": 0.8
  },
  "diagnostics": {
    "rawLength": 512,
    "jsonParseable": false,
    "jsonTextLeakage": true,
    "repeatedLineCount": 0,
    "ngramRepeatScore": 0.05,
    "maxTokenLikelyHit": false
  },
  "rawOutput": "model output before parsing or repair",
  "parsedOutput": null,
  "latencyMs": 1280
}
```

Eval run summary:

```json
{
  "runId": "run_...",
  "type": "eval",
  "profile": "json_extraction",
  "model": "qwen2.5:3b-instruct-q4",
  "runtime": "ollama",
  "dataset": {
    "name": "JSON extraction gate",
    "version": "0.1.0",
    "caseCount": 30
  },
  "summary": {
    "passRate": 0.86,
    "schemaPassRate": 0.8,
    "loopRiskRate": 0.03,
    "p50LatencyMs": 900,
    "p95LatencyMs": 1900,
    "verdict": "B - Usable with constraints"
  },
  "failureTagCounts": {
    "JSON_PARSE_ERROR": 3,
    "INVALID_ENUM": 1
  }
}
```

## 12. Suggested Data Formats

### 12.1 Basic Eval Case

```json
{
  "id": "intent_refund_001",
  "family": "classification",
  "difficulty": "easy",
  "input": "用户说：我想退掉昨天买的会员。",
  "expected": "refund",
  "check": "enum",
  "choices": ["refund", "billing", "technical", "other"],
  "metadata": {
    "domain": "customer_service",
    "language": "zh",
    "risk": "low"
  }
}
```

### 12.2 JSON Schema Eval Case

```json
{
  "id": "extract_order_001",
  "family": "json_schema",
  "input": "订单号 A1029，用户张三，要求明天下午退款。",
  "check": "json_schema",
  "schema": {
    "type": "object",
    "required": ["order_id", "customer_name", "intent"],
    "properties": {
      "order_id": { "type": "string" },
      "customer_name": { "type": "string" },
      "intent": { "type": "string", "enum": ["refund", "exchange", "support"] }
    },
    "additionalProperties": false
  },
  "expected": {
    "order_id": "A1029",
    "customer_name": "张三",
    "intent": "refund"
  }
}
```

### 12.3 Loop Stress Case

```json
{
  "id": "loop_guard_001",
  "family": "loop_detection",
  "input": "只输出一个 JSON 对象，不要解释。字段为 label。",
  "expected": { "label": "ok" },
  "check": "json_schema",
  "max_reasonable_chars": 300,
  "loop_checks": {
    "maxRepeatedLine": 2,
    "maxNgramRepeat": 4
  }
}
```

## 13. Architecture Direction

Short term: keep the existing Node + static frontend architecture.

Reason:

- Small codebase.
- No build system overhead.
- Easy to iterate core eval features.
- Good for MVP validation.

Medium term:

- Move run storage from capped JSON array to SQLite or append-only JSONL.
- Add artifact directory for raw requests/responses/reports.
- Add optional dependency for robust JSON schema validation.
- Add streaming support for TTFT if feasible.

Long term:

- Tauri desktop shell.
- React + TypeScript frontend.
- FastAPI/Python backend if evaluation plugins, device probes, and report generation outgrow Node.
- SQLite + artifact directory, optionally DuckDB/Parquet for large result analysis.

Do not migrate stack before the eval/report/compare loop is strong.

Stack migration gate:

Do not migrate to React, Tauri, FastAPI, SQLite, DuckDB, or a different package manager
until all of these are complete:

- Eval V0.2 works.
- Report export works.
- Compare view works.
- UI copy is clean.
- At least one built-in eval pack demonstrates product value.

Allowed exceptions:

- A tiny dependency can be added if it directly completes the active milestone.
- Storage can be hardened when Milestone 5 starts.
- A desktop shell can be explored only after the web app proves the evaluation loop.

## 14. Milestone Roadmap

Work in this order. Each milestone depends on the previous one.

### Milestone 0: Stabilize The Existing Demo

Status: complete
Depends on: none
Primary files: `README.md`, `public/index.html`, `public/app.js`, `public/styles.css`
Do not touch: eval architecture, storage migration, stack migration
Definition of done: all Acceptance bullets below plus the Verification Checklist.

Goal:

Make the current app credible before adding depth.

Tasks:

- Rewrite corrupted Chinese text in `README.md`.
- Rewrite corrupted Chinese text in `public/index.html`.
- Rewrite corrupted Chinese text in `public/app.js`.
- Ensure all visible UI labels are readable and purposeful.
- Keep current endpoints working.
- Run `npm run check`.

Acceptance:

- Browser UI has no mojibake.
- README explains the product in clear Chinese and English enough for open-source visitors.
- `npm run check` passes.
- Current Prompt, Eval, Swarm, Runs flows still work.

### Milestone 1: Product Loop V0.2

Status: complete
Depends on: Milestone 0
Primary files: `server.js`, `public/app.js`, `public/index.html`, `public/styles.css`
Do not touch: storage migration, stack migration, deep benchmark architecture
Definition of done: all Acceptance bullets below plus a user can run the main local-model loop without reading docs.

Goal:

Make the app feel like one usable product instead of separate demo tabs.

Product tasks:

- Add or reshape the first viewport into a dashboard/connect workspace.
- Show selected runtime, selected model, latest run, and next action.
- Add built-in scenario buttons for JSON extraction, intent routing, loop stress, and safety boundary.
- Make Prompt Lab, Eval, Swarm, and Runs share the same profile and run state clearly.
- Add simple run summary cards after Prompt and Eval runs.
- Add useful empty states instead of blank panels.
- Keep existing endpoints working.

Frontend tasks:

- Tighten navigation and labels around product actions.
- Make the app understandable without explaining the philosophy.
- Keep mobile and desktop layouts usable.

Acceptance:

- User can open the app and know what to do next within 10 seconds.
- User can connect/select a local model, load a scenario, run it, and see a readable result.
- Existing Prompt, Eval, Swarm, and Runs flows still work.
- No page feels like a placeholder.
- `npm run check` passes.

### Milestone 2: Practical Eval And Simple Export

Status: complete
Depends on: Milestone 1
Primary files: `server.js`, `public/app.js`, `public/index.html`, `README.md`
Do not touch: compare page, device probing, storage migration, stack migration
Definition of done: all Acceptance bullets below plus users can save/share a simple run result.

Goal:

Make Eval useful enough for real product demos without turning it into a research benchmark.

Backend tasks:

- Extend `normalizeCase` and `scoreCase` only as far as the UI needs.
- Add practical assertion types:
  - `contains_all`
  - `contains_any`
  - `not_contains`
  - `enum`
  - `json_parse`
  - `json_schema` with a lightweight in-file validator if no dependency is needed
- Add simple output diagnostics:
  - raw output length
  - repeated line count
  - max token likely hit
- Add visible failure tags for common failures:
  - `JSON_PARSE_ERROR`
  - `INVALID_ENUM`
  - `TEXT_LEAKAGE`
  - `LINE_REPEAT`
- Add API endpoint:
  - `GET /api/runs/:id/report.md`
  - `GET /api/runs/:id/export.json`
  - optionally `GET /api/runs/:id/export.csv`
- Generate a simple Markdown report with:
  - verdict
  - model/runtime/profile
  - parameters
  - pass rate
  - latency
  - failure tags
- Add simple CSV export for eval cases.

Frontend tasks:

- Show failure tags visibly.
- Show raw output and parsed output separately when JSON is involved.
- Add export buttons in Runs and Eval Result.
- Show "copy report" or download link.

Acceptance:

- User can run a mixed scenario pack and see readable pass/fail plus failure tags.
- Invalid JSON is classified as `JSON_PARSE_ERROR`.
- Wrong enum is classified as `INVALID_ENUM`.
- Existing `keywords`, `regex`, and `exact` remain compatible.
- After an eval run, user can export a Markdown report.
- CSV includes one row per case.

### Milestone 3: Compare View

Status: complete
Depends on: Milestone 2
Primary files: `server.js`, `public/app.js`, `public/index.html`, `public/styles.css`
Do not touch: device probing, storage migration, stack migration
Definition of done: all Acceptance bullets below plus fixed and regressed cases are visible without reading raw JSON.

Goal:

Make the product obviously more valuable than a one-off test page.

Core comparison modes:

- Same dataset, model A vs model B.
- Same dataset, prompt A vs prompt B.
- Same dataset, params A vs params B.

Backend tasks:

- Add run query/filter by type, model, dataset title, timestamp.
- Add comparison helper that aligns cases by `case_id`.
- Compute:
  - pass delta
  - score delta
  - latency delta
  - newly failed cases
  - newly fixed cases
  - failure tag delta

Frontend tasks:

- Add Compare page.
- Select two eval runs.
- Show summary delta table.
- Show fixed/regressed case lists.
- Show side-by-side output for selected case.

Acceptance:

- User can compare two eval runs without manual JSON inspection.
- Regressions are obvious.
- Fixed cases are obvious.

### Milestone 4: Device Match V0.1

Status: complete
Depends on: Milestone 3
Primary files: `server.js`, `public/app.js`, `public/index.html`, `README.md`
Do not touch: storage migration, stack migration, model download management
Definition of done: all Acceptance bullets below plus device data appears in reports when available.

Goal:

Start evaluating whether the local computer and model fit each other.

Backend tasks:

- Add `/api/device` endpoint.
- Capture at least:
  - OS
  - CPU name if available
  - CPU core count
  - total memory
  - free memory
  - Node version
  - process memory
  - GPU info if available through safe commands
- For each run, record device snapshot.
- Compute simple performance:
  - latency per case
  - approximate output tokens/s if usage is available
  - fallback chars/s if tokens unavailable

Frontend tasks:

- Add Device page or panel.
- Show device summary.
- Show "fit card" for selected model/run:
  - P50 latency
  - P95 latency
  - memory before/after if available
  - recommendation label

Acceptance:

- User can see their local machine summary.
- Eval runs store a device snapshot.
- Report includes device/runtime summary.

### Milestone 5: Run Storage Hardening

Status: complete
Depends on: Milestone 4
Primary files: `server.js`, `data/`, `public/app.js`, `README.md`
Do not touch: frontend framework migration, desktop packaging, unrelated UI redesign
Definition of done: all Acceptance bullets below plus old `data/runs.json` has a migration path.

Goal:

Make long runs safer and easier to query.

Options:

1. Minimal: switch from capped `runs.json` to append-only `runs.jsonl`.
2. Better: introduce SQLite.

Recommended order:

- First add export/import and search over current JSON.
- Then move to JSONL or SQLite once report/compare is useful.

Tasks:

- Avoid losing old runs unexpectedly.
- Store larger raw artifacts outside the main index if needed.
- Add run search by type, model, title, createdAt.
- Add pagination in Runs page.

Acceptance:

- 1000+ case run does not make the UI unusable.
- Runs can be searched and exported.
- Existing `data/runs.json` migration path exists.

### Milestone 6: Eval Pack System

Status: complete
Depends on: Milestone 5
Primary files: `server.js`, `public/app.js`, `public/index.html`, `examples/`, `README.md`
Do not touch: stack migration, model download management, unrelated swarm features
Definition of done: all Acceptance bullets below plus one built-in pack demonstrates the MVP critical path.

Goal:

Make datasets shareable and productized.

Tasks:

- Add sample eval packs under `data/eval-packs/` or `examples/eval-packs/`.
- Add import/export for eval pack JSON.
- Add pack metadata:
  - name
  - version
  - description
  - task profile
  - expected model size
  - recommended thresholds
- Built-in packs:
  - JSON extraction.
  - Intent classification.
  - Tool routing.
  - Loop guard.
  - Safety boundary.
  - Multilingual noise.

Acceptance:

- User can load a built-in eval pack.
- User can export their own pack.
- README documents pack schema.

### Milestone 7: Swarm Evaluation

Status: complete
Depends on: Milestone 6
Primary files: `server.js`, `public/app.js`, `public/index.html`, `public/styles.css`
Do not touch: making swarm the primary product narrative, stack migration
Definition of done: all Acceptance bullets below plus swarm has a single-call baseline comparison.

Goal:

Keep Swarm as an experimental feature, but make it measurable.

Tasks:

- Add single-call baseline comparison for swarm tasks.
- Record total latency and per-agent latency.
- Add swarm failure tags:
  - `TRACE_DRIFT`
  - `CRITIC_NO_EFFECT`
  - `SYNTHESIS_LOSS`
  - `LATENCY_OVERHEAD`
- Show whether swarm improved or hurt:
  - task score delta
  - latency multiplier
  - output stability

Acceptance:

- Swarm is not just a toy trace.
- User can see when swarm is not worth it.

### Milestone 8: High-End Product UI Pass

Status: complete
Depends on: Milestone 7
Primary files: `public/index.html`, `public/app.js`, `public/styles.css`, `README.md`
Do not touch: backend storage migration, new runtime integrations, desktop packaging
Definition of done: all Acceptance bullets below plus the High-end UI Definition of Done in Section 6.

Goal:

Make the product feel like a polished quality-control console.

Tasks:

- Redesign navigation labels:
  - Dashboard
  - Connect
  - Prompt
  - Eval
  - Compare
  - Device
  - Swarm
  - Runs
  - Reports
- Add dashboard summary strip.
- Add consistent status badges.
- Add clearer tables.
- Add failure tag chips.
- Add verdict cards.
- Add empty states that guide next action.
- Remove any generic or explanatory marketing blocks inside the app.
- Ensure mobile and desktop text does not overflow.
- Verify with browser screenshot if tooling is available.

Acceptance:

- First impression says "serious local lab tool".
- No text overlap.
- No mojibake.
- No generic landing-page feel.
- The app immediately exposes model quality, failures, and next action.

### Milestone 9: Packaging And Public Readiness

Status: complete
Depends on: Milestone 8
Primary files: `README.md`, `examples/`, `docs/`, `package.json`
Do not touch: unrequested license choice, major stack migration
Definition of done: all Acceptance bullets below plus a new user can run the smoke path from README.

Goal:

Make the project easy to run, understand, and share.

Tasks:

- Rewrite README with:
  - positioning
  - quick start
  - supported runtimes
  - eval schema
  - screenshots if available
  - roadmap
  - limitations
- Add example reports.
- Add example eval packs.
- Add basic smoke test instructions.
- Add LICENSE if user chooses one.

Acceptance:

- A new user understands the project in 2 minutes.
- A new user can run an eval in 15 minutes.
- The README does not overclaim.

## 15. Implementation Rules For Future Agents

Follow these unless the user explicitly changes direction:

- Prefer improving the current app before migrating stacks.
- Use the existing simple Node server until it becomes a real blocker.
- Keep edits scoped to the active milestone.
- Use deterministic scoring before model judges.
- Preserve raw evidence.
- Never hide failures behind a repaired score.
- Add new eval types compatibly.
- Keep UI copy concise and professional.
- Run `npm run check` after backend changes.
- If starting a dev server, provide the local URL.
- Update this plan's Progress Log after substantial work.

## 16. Verification Checklist

Use this checklist before finalizing any major milestone.

Static:

- `npm run check` passes.
- No obvious syntax errors in `public/app.js`.
- HTML structure is valid enough for browser rendering.

Functional without local model:

- Server starts.
- Health endpoint returns OK.
- UI loads.
- Runs page loads with empty data.
- Eval dataset JSON formatting works.

Functional with local model when available:

- Model list loads.
- Prompt run completes.
- Eval run completes.
- Failure tags show.
- Run is saved.
- Export works.

Product:

- User can tell what to do next.
- Results explain why a case failed.
- Report is credible enough to show a teacher, teammate, or client.

### 16.1 Final Acceptance Story

A university student opens the app, connects Ollama, selects `qwen2.5:3b`, loads the
JSON extraction eval pack, runs 30 cases, sees schema failures and loop risk, changes
the prompt, runs again, compares before/after, exports a Markdown report, and can tell
their advisor:

```text
This model is usable for low-risk extraction with fallback, but not for high-risk
routing because invalid enum and high-risk recall fail the gate.
```

The product is not complete until this story works without manual JSON inspection.

## 17. Product Copy Bank

Use these phrases for UI/README/report copy.

Tagline:

```text
让本地小模型不只是"能聊天"，而是"能被验证、能被比较、能被交付"。
```

Short English tagline:

```text
A local-first GUI harness for testing, tuning, and validating 1B-7B language models.
```

Core promise:

```text
Connect your local runtime. Turn prompts into regression tests. Find the model's usable boundary.
```

Dashboard verdict labels:

- `Ready for low-risk use`
- `Needs fallback`
- `Schema unstable`
- `Loop risk`
- `Latency over budget`
- `Device marginal`
- `Not production-ready`

Report verdict labels:

- `A - Recommended`
- `B - Usable with constraints`
- `C - Marginal, needs fallback`
- `D - Experimental only`
- `F - Not usable`

## 18. Open Questions

These are not blockers for the next implementation steps, but they matter later.

- Should the public scope be 1B-3B first, or 1B-7B from day one?
- Should the project ship with Chinese-first UI, English-first UI, or bilingual UI?
- Should reports be local Markdown only at first, or include HTML export?
- Should SQLite be introduced in v0.2 or after Compare/Report prove value?
- Should device probes prioritize Windows first, given the current workspace?
- Should built-in eval packs be generic or domain-specific?

Reasonable defaults:

- Use 1B-7B in architecture and reports, but say 1B-3B is the fastest initial target.
- Use Chinese UI copy if the current user is the primary operator; keep identifiers English.
- Markdown + JSON export first, HTML later.
- Stay on JSON until report/compare need better indexing.
- Windows device probing first, with cross-platform abstractions later.
- Start with generic small business task packs.

## 19. Progress Log

Update this section after long-running work.

### 2026-07-07

- Created this long-run `plan.md`.
- Captured product thesis, user segments, architecture direction, eval taxonomy, device matching, milestones, and resume protocol.
- Current next milestone: **Milestone 0: Stabilize The Existing Demo**.
- Upgraded `plan.md` into a goal-mode execution protocol:
  - Added Goal-Mode Instruction.
  - Added MVP Critical Path.
  - Added explicit milestone status, dependencies, primary files, and scope boundaries.
  - Added High-end UI Definition of Done.
  - Added built-in demo scenarios.
  - Added Core Data Contract for eval case results and eval run summaries.
  - Added Stack Migration Gate.
  - Added Final Acceptance Story.
  - Rewrote corrupted sample data and product tagline text as valid UTF-8.
- Adjusted the execution bias to product-first:
  - Prioritize visible workflows before deep validation/testing/evidence systems.
  - Changed Milestone 1 from Eval Engine V0.2 to Product Loop V0.2.
  - Changed Milestone 2 to Practical Eval And Simple Export.
  - Rewrote `README.md` as a clean product-first quick start.
  - Initialized the local directory for `https://github.com/yushui2022/Mini-Model-Harness.git`.
- Completed Milestone 0 through Milestone 2 in product-first form:
  - Added Dashboard status strip with runtime, model, latest run, and next action.
  - Added built-in scenario cards for JSON extraction, intent routing, loop stress, and safety boundary.
  - Scenario loading now fills Prompt, Eval, and Swarm surfaces together.
  - Added run summary cards for Prompt and Eval.
  - Extended Eval with practical checks: `contains_all`, `contains_any`, `not_contains`, `enum`, `json_parse`, `json_schema`, and `numeric_range`.
  - Added diagnostics and failure tags for common failures.
  - Added Markdown, JSON, and CSV export endpoints and UI links.
  - Smoke checked server health, page load, JS-rendered Dashboard scenarios, syntax checks, and export endpoints.
- Completed Milestone 3:
  - Added Compare navigation and page.
  - Compare reads existing eval runs from `/api/runs`.
  - Shows pass, score, latency, case-change deltas, fixed cases, regressed cases, failure tag deltas, and side-by-side changed outputs.
  - Current next milestone: **Milestone 4: Device Match V0.1**.
- Completed Milestone 4:
  - Added `/api/device`.
  - Added device snapshots to saved runs.
  - Added Device page with OS, CPU, memory, Node runtime, and a simple fit hint.
  - Added device summary to Markdown reports.
  - Current next milestone: **Milestone 5: Run Storage Hardening**.
- Completed Milestone 5 in lightweight form:
  - Increased run retention from 100 to 500.
  - Added Runs search and type filtering.
  - Replaced default raw JSON rendering with compact summary cards.
  - Kept Markdown, JSON, and CSV export links as the raw data path.
  - Current next milestone: **Milestone 6: Eval Pack System**.
- Completed Milestone 6:
  - Added example eval packs under `examples/eval-packs/`.
  - Added Eval screen import/export pack controls.
  - Documented eval pack format and examples in `README.md`.
  - Current next milestone: **Milestone 7: Swarm Evaluation**.
- Completed Milestone 7:
  - Added optional single-call baseline for Swarm runs.
  - Recorded baseline latency, swarm-only latency, latency multiplier, and `LATENCY_OVERHEAD` flag.
  - Displayed baseline output and swarm-vs-baseline summary in the Swarm result panel.
  - Current next milestone: **Milestone 8: High-End Product UI Pass**.
- Completed Milestone 8 in product-first form:
  - Reordered navigation around Dashboard, Prompt, Eval, Compare, Device, Swarm, Runs, and Reports.
  - Added Failure Hotspot to the Dashboard status strip.
  - Added Reports page for Markdown, JSON, and CSV export entry points.
  - Kept the interface dense and workbench-oriented rather than landing-page styled.
  - Current next milestone: **Milestone 9: Packaging And Public Readiness**.
- Completed Milestone 9:
  - Expanded `README.md` with screens, eval packs, smoke test, roadmap, and limitations.
  - Added `examples/reports/sample-report.md`.
  - Verified static checks, page resources, device endpoint, export endpoints, UTF-8 text, and eval pack parsing.
  - All roadmap milestones in this plan are now complete in the product-first MVP scope.
