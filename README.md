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
  - OpenAI-compatible `/v1/chat/completions` endpoints
- Provides a browser GUI for:
  - runtime/model setup
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
| OpenAI-compatible | `http://127.0.0.1:8000` |

For OpenAI-compatible runtimes, enter the base server URL. If you enter a URL ending in
`/v1`, the server normalizes it so requests do not become `/v1/v1/...`.

## Current Screens

- **Control**: configure provider, base URL, model, and generation parameters.
- **Prompt Lab**: run one model with a system prompt and user prompt.
- **Swarm**: run a small serial multi-role workflow for planner/solver/critic style tests.
- **Eval**: run basic JSON-defined cases with simple deterministic assertions.
- **Compare**: compare two eval runs and spot fixed or regressed cases.
- **Device**: inspect the local machine snapshot, runtime process memory, and run generation speed tests.
- **Runs**: inspect recent local runs.

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
- Generation speed tests are non-streaming in this version, so TTFT is not measured yet.
