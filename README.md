# Mini Model Harness

Mini Model Harness is a local-first GUI workbench for small language models. It is built
for the practical 1B-3B model loop: connect a local runtime, choose a model, run prompts
or simple scenarios, inspect the output, adjust, and run again.

This project is intentionally lightweight right now. The priority is to make the product
usable before turning it into a strict benchmark suite.

## What It Does Today

- Connects to local model runtimes:
  - Ollama
  - LM Studio local server
  - llama.cpp server
  - vLLM
  - OpenAI-compatible `/v1/chat/completions` endpoints
- Provides a browser GUI for:
  - dashboard runtime discovery and model selection
  - live generation speed testing
  - prompt testing
  - small-model swarm experiments
  - basic eval scenarios
  - local run history
- Stores recent runs in `data/runs.json`.

## Quick Start

```bash
npm start
```

Open:

```text
http://127.0.0.1:4173
```

Optional port override:

```bash
PORT=4180 npm start
```

## Local Runtime Defaults

| Runtime | Default URL |
| --- | --- |
| Ollama | `http://127.0.0.1:11434` |
| LM Studio | `http://127.0.0.1:1234` |
| llama.cpp server | `http://127.0.0.1:8080` |
| vLLM | `http://127.0.0.1:8000` |
| OpenAI-compatible | `http://127.0.0.1:8000` |

For OpenAI-compatible runtimes, enter the base server URL. If you enter a URL ending in
`/v1`, the server normalizes it so requests do not become `/v1/v1/...`.

The Dashboard is the primary local-model entry point. Select a runtime, edit its address
or port, and click model detection. Ollama is discovered through `/api/tags`; LM Studio,
llama.cpp, vLLM, and other compatible servers are discovered through `/v1/models`. The
selected runtime, endpoint, and model stay synchronized with Settings.

## Live Generation Speed Test

The Dashboard and Device page can run a warmup followed by multiple measured generations.
Each completed measurement is shown immediately with progress, latency, tokens per second,
and current system memory usage.

The streaming endpoint is:

```text
POST /api/benchmark/generate/stream
Content-Type: application/json
Response: application/x-ndjson
```

Events are emitted in this order:

```text
start -> warmup(start) -> warmup(done) -> run... -> done
```

Every `run` event contains that measurement, the partial summary, and a live memory
snapshot. The final `done` event contains the saved benchmark run. The original
`POST /api/benchmark/generate` endpoint remains available for non-streaming integrations.

## Current Screens

- **Dashboard**: connect a local runtime, discover models, select a model, and run a live speed test.
- **Prompt Lab**: run one model with a system prompt and user prompt.
- **Swarm**: run a small serial multi-role workflow for planner/solver/critic style tests.
- **Eval**: run basic JSON-defined cases with simple deterministic assertions.
- **Compare**: compare two eval runs and spot fixed or regressed cases.
- **Device**: inspect the local machine snapshot, runtime process memory, and run generation speed tests.
- **Runs**: inspect recent local runs.
- **Settings**: switch language and configure an optional local or OpenAI-compatible model judge.

## Optional Model Judge

The default scoring path stays deterministic. JSON, schema, enum, exact-match, tool-call,
loop, and boundary checks are scored by code. An optional model judge can add semantic
quality scoring for subjective cases or diagnose rule failures.

Configure the judge in **Settings**, then select **Mixed** scoring in the Eval screen.
Judge API keys are kept in browser `sessionStorage` and are not written into saved run
records. A mixed result stores the rule score, judge score, rubric version, confidence,
evidence, and final weighted score.

Supported judge endpoints use the same runtime adapters as tested models:

- Ollama
- LM Studio
- llama.cpp server
- OpenAI-compatible `/v1/chat/completions`

Cases can opt into semantic judging explicitly:

```json
{
  "id": "summary_quality_001",
  "input": "Summarize the incident in three concise bullets.",
  "check": "llm_rubric",
  "expected": "The summary must cover cause, impact, and next action.",
  "judge": {
    "rubric": "Score factual accuracy, completeness, instruction following, and conciseness.",
    "rubricVersion": "incident-summary-v1",
    "weight": 0.7,
    "threshold": 0.75
  }
}
```

Objective rule failures remain hard failures. A high judge score cannot turn an incorrect
JSON value, invalid tool argument, or failed safety boundary into a passing case.

Standalone integrations can call:

```text
POST /api/judge
```

The V1 endpoint performs absolute rubric scoring. Pairwise A/B judging and multi-judge
consensus are intentionally left for a later version.

## Product Direction

The near-term goal is a usable product loop:

```text
Connect runtime -> choose model -> load a built-in scenario -> run -> inspect result -> adjust prompt -> run again
```

After that loop feels good, the project can grow into stronger eval features:

- JSON/schema checks
- intent routing scenarios
- loop/repetition detection
- simple report export
- run comparison
- device/model fit guidance
- runtime memory monitoring
- generation speed tests with tokens/sec and chars/sec

The project should not become a generic chat UI or a heavyweight benchmark clone. It
should stay focused on helping people quickly understand whether a small local model is
useful for their task.

## Eval Packs

Example packs live in [`examples/eval-packs`](examples/eval-packs):

- `json-extraction.json`
- `intent-routing.json`
- `loop-guard.json`
- `safety-boundary.json`

An eval pack can be either a raw JSON array of cases or an object with metadata and a
`cases` array:

```json
{
  "name": "Intent Routing Gate",
  "version": "0.1.0",
  "system": "Return only one label from the allowed labels.",
  "cases": [
    {
      "id": "route_code_001",
      "input": "Classify this request as refund, billing, technical, write, code, or other: write a Python sort function",
      "check": "enum",
      "expected": "code",
      "choices": ["refund", "billing", "technical", "write", "code", "other"]
    }
  ]
}
```

In the Eval screen, use **导入 Pack** to load a pack and **导出 Pack** to save the
current dataset.

## Development

Static checks:

```bash
npm run check
node --check public/app.js
```

The app currently has no build step and no npm dependencies.

## Smoke Test

Without a local model:

```bash
npm start
```

Then verify:

- `http://127.0.0.1:4173/api/health` returns `ok: true`.
- The Dashboard loads.
- Built-in scenario cards are visible.
- Eval pack import/export buttons are visible.
- Runs, Compare, Device, and Reports pages open.

With a local model:

1. Start Ollama, LM Studio, llama.cpp server, or another compatible runtime.
2. Open the Dashboard.
3. Click **读取模型** and choose a model.
4. Load a built-in scenario.
5. Run Prompt or Eval.
6. Export a Markdown report from Eval, Runs, or Reports.

## Roadmap

- Better built-in scenario packs.
- Stronger JSON/schema diagnostics.
- Side-by-side prompt/model comparison polish.
- Device fit recommendations based on real run history.
- Optional desktop packaging after the web workflow feels solid.

## Limitations

- The app does not download, quantize, or manage model files.
- Runs are stored locally in `data/runs.json`.
- Eval checks are practical and deterministic, not a full academic benchmark.
- Swarm is experimental and should be compared with the single-call baseline before use.
- Device Match uses system memory and runtime process working set. This is useful for
  local fit decisions, but it is not exact model weight or VRAM accounting.
- Live memory shown during a speed test is system memory usage, not exact model-weight,
  runtime allocation, or VRAM accounting.
- Speed tests stream progress per completed generation. They do not currently expose true
  token-by-token TTFT unless the selected runtime reports that timing directly.
