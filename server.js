const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const RUNS_PATH = path.join(DATA_DIR, "runs.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

const DEFAULT_TIMEOUT_MS = 120000;
const MAX_RUNS = 500;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(RUNS_PATH)) {
    fs.writeFileSync(RUNS_PATH, "[]\n", "utf8");
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(Object.assign(new Error("Invalid JSON body"), { statusCode: 400, cause: error }));
      }
    });
    req.on("error", reject);
  });
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeProvider(value) {
  const provider = String(value || "ollama").toLowerCase();
  if (["ollama", "openai", "lmstudio", "llamacpp", "vllm"].includes(provider)) {
    return provider;
  }
  return "openai";
}

function getProfile(input = {}) {
  const provider = normalizeProvider(input.provider);
  let baseUrl = normalizeBaseUrl(input.baseUrl || defaultBaseUrl(provider));
  if (provider !== "ollama" && baseUrl.toLowerCase().endsWith("/v1")) {
    baseUrl = baseUrl.slice(0, -3);
  }
  return {
    provider,
    baseUrl,
    apiKey: String(input.apiKey || "").trim(),
    model: String(input.model || "").trim()
  };
}

function defaultBaseUrl(provider) {
  if (provider === "ollama") return "http://127.0.0.1:11434";
  if (provider === "lmstudio") return "http://127.0.0.1:1234";
  if (provider === "llamacpp") return "http://127.0.0.1:8080";
  return "http://127.0.0.1:8000";
}

function providerProcessNames(provider) {
  const normalized = normalizeProvider(provider);
  if (normalized === "ollama") return ["ollama", "ollama app"];
  if (normalized === "lmstudio") return ["lm studio", "lmstudio", "llama-server", "llama"];
  if (normalized === "llamacpp") return ["llama-server", "llama", "server"];
  if (normalized === "vllm") return ["python", "vllm"];
  return ["python", "node", "server"];
}

function execFilePromise(command, args, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stderr }));
        return;
      }
      resolve(stdout);
    });
  });
}

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let json = null;
    if (text.trim()) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
    }
    if (!response.ok) {
      const detail = json && (json.error?.message || json.message || json.raw);
      throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
    }
    return json || {};
  } finally {
    clearTimeout(timer);
  }
}

function openAiHeaders(profile) {
  return profile.apiKey ? { authorization: `Bearer ${profile.apiKey}` } : {};
}

function cleanParams(input = {}) {
  const params = input.params || input;
  return {
    temperature: clampNumber(params.temperature, 0, 2, 0.3),
    top_p: clampNumber(params.top_p ?? params.topP, 0, 1, 0.9),
    max_tokens: clampInteger(params.max_tokens ?? params.maxTokens, 16, 8192, 512),
    num_ctx: clampInteger(params.num_ctx ?? params.contextTokens, 512, 32768, 4096)
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampInteger(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function normalizeMessages(input) {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  return messages
    .filter((message) => message && message.content)
    .map((message) => ({
      role: ["system", "assistant", "user"].includes(message.role) ? message.role : "user",
      content: String(message.content)
    }));
}

async function listModels(profileInput) {
  const profile = getProfile(profileInput);
  if (!profile.baseUrl) throw badRequest("Missing base URL");

  if (profile.provider === "ollama") {
    const data = await fetchJson(`${profile.baseUrl}/api/tags`, { method: "GET" }, 20000);
    return {
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      models: (data.models || []).map((model) => ({
        id: model.name,
        name: model.name,
        size: model.size,
        modified: model.modified_at
      }))
    };
  }

  const data = await fetchJson(
    `${profile.baseUrl}/v1/models`,
    { method: "GET", headers: openAiHeaders(profile) },
    20000
  );
  const models = Array.isArray(data.data) ? data.data : [];
  return {
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    models: models.map((model) => ({
      id: model.id || model.name,
      name: model.id || model.name
    }))
  };
}

async function chatCompletion(input) {
  const profile = getProfile(input.profile || input);
  if (!profile.baseUrl) throw badRequest("Missing base URL");
  if (!profile.model) throw badRequest("Select a model before running");

  const params = cleanParams(input.params || {});
  const messages = normalizeMessages(input);
  const startedAt = Date.now();

  if (profile.provider === "ollama") {
    const data = await fetchJson(`${profile.baseUrl}/api/chat`, {
      method: "POST",
      body: JSON.stringify({
        model: profile.model,
        messages,
        stream: false,
        options: {
          temperature: params.temperature,
          top_p: params.top_p,
          num_predict: params.max_tokens,
          num_ctx: params.num_ctx
        }
      })
    });
    return {
      text: data.message?.content || data.response || "",
      provider: profile.provider,
      model: profile.model,
      latencyMs: Date.now() - startedAt,
      usage: {
        prompt_tokens: data.prompt_eval_count,
        completion_tokens: data.eval_count,
        total_duration_ms: data.total_duration ? Math.round(data.total_duration / 1000000) : undefined,
        prompt_eval_duration_ms: data.prompt_eval_duration ? Math.round(data.prompt_eval_duration / 1000000) : undefined,
        eval_duration_ms: data.eval_duration ? Math.round(data.eval_duration / 1000000) : undefined,
        decode_tokens_per_second:
          data.eval_count && data.eval_duration
            ? Number((data.eval_count / (data.eval_duration / 1000000000)).toFixed(2))
            : undefined
      },
      raw: compactRaw(data)
    };
  }

  const data = await fetchJson(`${profile.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: openAiHeaders(profile),
    body: JSON.stringify({
      model: profile.model,
      messages,
      temperature: params.temperature,
      top_p: params.top_p,
      max_tokens: params.max_tokens,
      stream: false
    })
  });

  return {
    text: data.choices?.[0]?.message?.content || data.choices?.[0]?.text || "",
    provider: profile.provider,
    model: profile.model,
    latencyMs: Date.now() - startedAt,
    usage: data.usage || {},
    raw: compactRaw(data)
  };
}

function compactRaw(data) {
  const copy = { ...data };
  delete copy.context;
  delete copy.choices;
  delete copy.message;
  delete copy.response;
  return copy;
}

function readRuns() {
  ensureDataFiles();
  try {
    const runs = JSON.parse(fs.readFileSync(RUNS_PATH, "utf8"));
    return Array.isArray(runs) ? runs : [];
  } catch {
    return [];
  }
}

function writeRuns(runs) {
  ensureDataFiles();
  fs.writeFileSync(RUNS_PATH, `${JSON.stringify(runs.slice(0, MAX_RUNS), null, 2)}\n`, "utf8");
}

function deviceSnapshot() {
  const cpus = os.cpus() || [];
  const memory = process.memoryUsage();
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  return {
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch()
    },
    cpu: {
      model: cpus[0]?.model || "unknown",
      cores: cpus.length || os.availableParallelism?.() || 1
    },
    memory: {
      totalBytes,
      freeBytes,
      usedBytes,
      usedPct: totalBytes ? Number(((usedBytes / totalBytes) * 100).toFixed(1)) : 0,
      processRssBytes: memory.rss,
      processHeapUsedBytes: memory.heapUsed,
      processMemoryPct: totalBytes ? Number(((memory.rss / totalBytes) * 100).toFixed(2)) : 0
    },
    runtime: {
      node: process.version,
      pid: process.pid
    },
    capturedAt: new Date().toISOString()
  };
}

async function detectRuntimeProcesses(provider) {
  const totalBytes = os.totalmem();
  const names = providerProcessNames(provider);
  if (process.platform !== "win32") {
    return {
      provider: normalizeProvider(provider),
      processNames: names,
      processes: [],
      totalWorkingSetBytes: 0,
      memoryPct: 0,
      note: "Runtime process memory detection is currently implemented for Windows first."
    };
  }

  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "$items = Get-Process | Select-Object Id,ProcessName,Path,WorkingSet64,PrivateMemorySize64,CPU",
    "$items | ConvertTo-Json -Compress -Depth 3"
  ].join("; ");
  const stdout = await execFilePromise("powershell.exe", ["-NoProfile", "-Command", script], 15000);
  const parsed = stdout.trim() ? JSON.parse(stdout) : [];
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const processes = rows
    .filter((item) => {
      const name = String(item.ProcessName || "").toLowerCase();
      const fullPath = String(item.Path || "").toLowerCase();
      return names.some((needle) => name.includes(needle) || fullPath.includes(needle));
    })
    .map((item) => ({
      pid: item.Id,
      name: item.ProcessName,
      path: item.Path || "",
      workingSetBytes: Number(item.WorkingSet64 || 0),
      privateMemoryBytes: Number(item.PrivateMemorySize64 || 0),
      memoryPct: totalBytes ? Number(((Number(item.WorkingSet64 || 0) / totalBytes) * 100).toFixed(2)) : 0,
      cpuSeconds: Number(item.CPU || 0)
    }))
    .sort((a, b) => b.workingSetBytes - a.workingSetBytes)
    .slice(0, 12);
  const totalWorkingSetBytes = processes.reduce((sum, item) => sum + item.workingSetBytes, 0);
  const totalPrivateMemoryBytes = processes.reduce((sum, item) => sum + item.privateMemoryBytes, 0);
  return {
    provider: normalizeProvider(provider),
    processNames: names,
    processes,
    totalWorkingSetBytes,
    totalPrivateMemoryBytes,
    memoryPct: totalBytes ? Number(((totalWorkingSetBytes / totalBytes) * 100).toFixed(2)) : 0,
    privateMemoryPct: totalBytes ? Number(((totalPrivateMemoryBytes / totalBytes) * 100).toFixed(2)) : 0,
    note: processes.length ? "Runtime process memory is process working set, not exact model weight memory." : "No matching runtime process detected."
  };
}

function appendRun(run) {
  const runs = readRuns();
  const saved = {
    id: `run_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    device: deviceSnapshot(),
    ...run
  };
  runs.unshift(saved);
  writeRuns(runs);
  return saved;
}

function compactText(value, limit = 6000) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.round(limit * 0.65))}\n\n[...trimmed ${text.length - limit} chars...]\n\n${text.slice(-Math.round(limit * 0.35))}`;
}

function buildAgentPrompt(task, round, memory, agent) {
  const memoryText = memory.length
    ? memory.map((item) => `[R${item.round} ${item.agentName}]\n${item.output}`).join("\n\n")
    : "No previous agent output.";
  return [
    `Task:\n${task}`,
    `Round: ${round}`,
    `Previous compact memory:\n${compactText(memoryText, 5000)}`,
    "Instructions:",
    "- Answer in concise, operational language.",
    "- Prefer checklists, decisions, and concrete edits over broad advice.",
    "- For 1B-3B models, keep output short and avoid long chains of thought.",
    `Your role: ${agent.name || agent.id}`
  ].join("\n\n");
}

async function runSwarm(input) {
  const profile = getProfile(input.profile || {});
  const params = cleanParams(input.params || {});
  const task = String(input.task || "").trim();
  const rounds = clampInteger(input.rounds, 1, 5, 2);
  const memoryWindow = input.memory === "minimal" ? 3 : 10;
  const compareBaseline = Boolean(input.compareBaseline);
  const agents = (Array.isArray(input.agents) ? input.agents : [])
    .filter((agent) => agent && agent.enabled !== false)
    .slice(0, 8)
    .map((agent, index) => ({
      id: String(agent.id || `agent_${index + 1}`),
      name: String(agent.name || `Agent ${index + 1}`),
      system: String(agent.system || "You are a concise local-model assistant.")
    }));

  if (!task) throw badRequest("Missing swarm task");
  if (!agents.length) throw badRequest("Enable at least one swarm agent");

  const trace = [];
  const startedAt = Date.now();
  let baseline = null;

  if (compareBaseline) {
    const baselineStarted = Date.now();
    const result = await chatCompletion({
      profile,
      params,
      messages: [
        { role: "system", content: "You are a concise single-call baseline for a local small-model harness." },
        { role: "user", content: task }
      ]
    });
    baseline = {
      output: result.text,
      latencyMs: Date.now() - baselineStarted,
      outputLength: result.text.length
    };
  }

  for (let round = 1; round <= rounds; round += 1) {
    for (const agent of agents) {
      const result = await chatCompletion({
        profile,
        params,
        messages: [
          { role: "system", content: agent.system },
          { role: "user", content: buildAgentPrompt(task, round, trace.slice(-memoryWindow), agent) }
        ]
      });
      trace.push({
        round,
        agentId: agent.id,
        agentName: agent.name,
        output: result.text,
        latencyMs: result.latencyMs,
        usage: result.usage
      });
    }
  }

  const synthesisPrompt = [
    `Original task:\n${task}`,
    "Agent trace:",
    compactText(trace.map((item) => `[R${item.round} ${item.agentName}]\n${item.output}`).join("\n\n"), 9000),
    "Produce the final answer. Be decisive, concise, and include unresolved risks if any."
  ].join("\n\n");

  const final = await chatCompletion({
    profile,
    params: { ...params, temperature: Math.min(params.temperature, 0.4) },
    messages: [
      {
        role: "system",
        content: "You are the swarm coordinator. Merge local-agent outputs into a practical final answer. Do not invent unsupported facts."
      },
      { role: "user", content: synthesisPrompt }
    ]
  });

  const totalLatencyMs = Date.now() - startedAt;
  const swarmOnlyLatencyMs = baseline ? totalLatencyMs - baseline.latencyMs : totalLatencyMs;
  const swarmFailureTags = [];
  if (baseline && swarmOnlyLatencyMs > baseline.latencyMs * 2) {
    swarmFailureTags.push("LATENCY_OVERHEAD");
  }

  const run = appendRun({
    type: "swarm",
    title: task.slice(0, 90),
    profile: publicProfile(profile),
    params,
    summary: {
      agents: agents.map((agent) => agent.name),
      rounds,
      latencyMs: totalLatencyMs,
      swarmOnlyLatencyMs,
      baselineLatencyMs: baseline?.latencyMs,
      latencyMultiplier: baseline ? Number((swarmOnlyLatencyMs / Math.max(1, baseline.latencyMs)).toFixed(2)) : undefined,
      failureTags: swarmFailureTags
    },
    result: {
      final: final.text,
      trace,
      baseline
    }
  });

  return {
    runId: run.id,
    final: final.text,
    baseline,
    comparison: {
      swarmOnlyLatencyMs,
      baselineLatencyMs: baseline?.latencyMs,
      latencyMultiplier: baseline ? Number((swarmOnlyLatencyMs / Math.max(1, baseline.latencyMs)).toFixed(2)) : undefined,
      failureTags: swarmFailureTags
    },
    trace,
    latencyMs: totalLatencyMs
  };
}

function publicProfile(profile) {
  return {
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    model: profile.model
  };
}

function normalizeCase(testCase, index) {
  const expected = testCase.expected ?? testCase.answer ?? "";
  const keywords = Array.isArray(testCase.keywords)
    ? testCase.keywords
    : String(expected)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  return {
    id: String(testCase.id || `case_${index + 1}`),
    suite: String(testCase.suite || ""),
    set: String(testCase.set || ""),
    difficulty: String(testCase.difficulty || ""),
    family: String(testCase.family || "general"),
    input: String(testCase.input || testCase.prompt || ""),
    turns: Array.isArray(testCase.turns)
      ? testCase.turns
          .filter((turn) => turn && typeof turn === "object")
          .map((turn) => ({
            role: ["system", "user", "assistant"].includes(turn.role) ? turn.role : "user",
            content: String(turn.content || "")
          }))
      : [],
    system: String(testCase.system || ""),
    expected,
    check: String(testCase.check || testCase.checkType || "keywords"),
    keywords,
    notContains: Array.isArray(testCase.notContains) ? testCase.notContains : [],
    choices: Array.isArray(testCase.choices) ? testCase.choices : [],
    regex: String(testCase.regex || ""),
    schema: testCase.schema || null,
    tools: Array.isArray(testCase.tools) ? testCase.tools : [],
    min: testCase.min ?? testCase.minimum,
    max: testCase.max ?? testCase.maximum,
    maxReasonableChars: testCase.max_reasonable_chars ?? testCase.maxReasonableChars
  };
}

function turnTranscript(turns) {
  return (turns || []).map((turn) => `${turn.role}: ${turn.content}`).join("\n");
}

function cleanForExact(value) {
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function extractJsonCandidate(output) {
  const text = String(output || "").trim();
  if (!text) return "";
  if (text.startsWith("{") || text.startsWith("[")) return text;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) return text.slice(objectStart, objectEnd + 1);
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) return text.slice(arrayStart, arrayEnd + 1);
  return text;
}

function parseJsonOutput(output) {
  const candidate = extractJsonCandidate(output);
  try {
    return { ok: true, value: JSON.parse(candidate), candidate };
  } catch (error) {
    return { ok: false, value: null, candidate, error: error.message };
  }
}

function countRepeatedLines(output) {
  const lines = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const counts = new Map();
  let repeats = 0;
  for (const line of lines) {
    const count = (counts.get(line) || 0) + 1;
    counts.set(line, count);
    if (count > 1) repeats += 1;
  }
  return repeats;
}

function validateSimpleSchema(value, schema, pathName = "$") {
  if (!schema || typeof schema !== "object") return [];
  const errors = [];
  const type = schema.type;
  if (type) {
    const actualType = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    if (actualType !== type) {
      errors.push(`${pathName} expected ${type}, got ${actualType}`);
      return errors;
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${pathName} invalid enum value`);
  }
  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${pathName}.${key} is required`);
      }
    }
    const properties = schema.properties || {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...validateSimpleSchema(value[key], childSchema, `${pathName}.${key}`));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(`${pathName}.${key} is not allowed`);
        }
      }
    }
  }
  return errors;
}

function schemaFailureTags(errors) {
  const tags = new Set();
  for (const error of errors || []) {
    if (error.includes(" is required")) tags.add("SCHEMA_REQUIRED_MISSING");
    if (error.includes(" expected ")) tags.add("SCHEMA_TYPE_ERROR");
    if (error.includes(" invalid enum value")) tags.add("INVALID_ENUM");
    if (error.includes(" is not allowed")) tags.add("EXTRA_FIELD");
  }
  if (errors?.length && !tags.size) tags.add("SCHEMA_MISMATCH");
  return Array.from(tags);
}

function toolSchemaFailureTags(errors) {
  const tags = new Set();
  for (const error of errors || []) {
    if (error.includes(" is required")) tags.add("TOOL_ARGUMENT_MISSING");
    if (error.includes(" expected ")) tags.add("TOOL_ARGUMENT_TYPE_ERROR");
    if (error.includes(" invalid enum value")) tags.add("INVALID_ENUM");
    if (error.includes(" is not allowed")) tags.add("EXTRA_FIELD");
  }
  if (errors?.length && !tags.size) tags.add("SCHEMA_MISMATCH");
  return Array.from(tags);
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function expectedToolLabelTag(label) {
  if (label === "ASK_INFO") return "TOOL_SHOULD_ASK_INFO";
  if (label === "NO_CALL") return "TOOL_SHOULD_NOT_CALL";
  if (label === "ESCALATE") return "SHOULD_ESCALATE";
  return "INVALID_ENUM";
}

function outputDiagnostics(testCase, output, parsed) {
  const rawLength = String(output || "").length;
  const repeatedLineCount = countRepeatedLines(output);
  return {
    rawLength,
    jsonParseable: Boolean(parsed?.ok),
    repeatedLineCount,
    maxTokenLikelyHit: Boolean(testCase.maxReasonableChars && rawLength > Number(testCase.maxReasonableChars)),
    jsonTextLeakage: Boolean(parsed?.ok && extractJsonCandidate(output).trim() !== String(output || "").trim())
  };
}

function scoreCase(testCase, output) {
  const normalizedOutput = output.toLowerCase();
  const check = testCase.check === "keywords" ? "contains_all" : testCase.check;
  const parsed = check.startsWith("json") || check === "tool_call" || check === "multi_turn" ? parseJsonOutput(output) : null;
  const diagnostics = outputDiagnostics(testCase, output, parsed);
  const failureTags = [];
  const breakdown = { format: 1, content: 1, loop: diagnostics.repeatedLineCount ? 0.6 : 1 };

  if (diagnostics.repeatedLineCount > 0) failureTags.push("LINE_REPEAT");
  if (diagnostics.maxTokenLikelyHit) failureTags.push("MAX_TOKEN_LIKELY");

  if (testCase.check === "regex" && testCase.regex) {
    try {
      const passed = new RegExp(testCase.regex, "i").test(output);
      if (!passed) failureTags.push("REGEX_MISS");
      return {
        passed,
        score: passed ? 1 : 0,
        reason: `regex: ${testCase.regex}`,
        failureTags,
        scoreBreakdown: { ...breakdown, content: passed ? 1 : 0 },
        diagnostics
      };
    } catch (error) {
      failureTags.push("INVALID_ASSERTION");
      return {
        passed: false,
        score: 0,
        reason: `invalid regex: ${error.message}`,
        failureTags,
        scoreBreakdown: { ...breakdown, content: 0 },
        diagnostics
      };
    }
  }

  if (testCase.check === "exact") {
    const passed = cleanForExact(output) === cleanForExact(testCase.expected);
    if (!passed) failureTags.push("EXACT_MISMATCH");
    return {
      passed,
      score: passed ? 1 : 0,
      reason: "exact match",
      failureTags,
      scoreBreakdown: { ...breakdown, content: passed ? 1 : 0 },
      diagnostics
    };
  }

  if (check === "enum") {
    const choices = testCase.choices.length ? testCase.choices : String(testCase.expected).split(",").map((item) => item.trim());
    const cleanOutput = String(output).trim().replace(/^["']|["']$/g, "");
    const passed = choices.some((choice) => cleanForExact(cleanOutput) === cleanForExact(choice));
    if (!passed) failureTags.push("INVALID_ENUM");
    return {
      passed,
      score: passed ? 1 : 0,
      reason: `enum: ${choices.join(", ")}`,
      failureTags,
      scoreBreakdown: { ...breakdown, content: passed ? 1 : 0 },
      diagnostics
    };
  }

  if (check === "json_parse" || check === "json_schema") {
    if (!parsed.ok) {
      failureTags.push("JSON_PARSE_ERROR");
      return {
        passed: false,
        score: 0,
        reason: `json parse: ${parsed.error}`,
        failureTags,
        scoreBreakdown: { ...breakdown, format: 0, content: 0 },
        diagnostics,
        parsedOutput: null
      };
    }
    const schemaErrors = check === "json_schema" ? validateSimpleSchema(parsed.value, testCase.schema) : [];
    const passed = schemaErrors.length === 0;
    if (!passed) failureTags.push("SCHEMA_MISMATCH", ...schemaFailureTags(schemaErrors));
    if (diagnostics.jsonTextLeakage) failureTags.push("TEXT_LEAKAGE");
    return {
      passed,
      score: passed ? 1 : 0.5,
      reason: passed ? "json valid" : schemaErrors.join("; "),
      failureTags,
      scoreBreakdown: { ...breakdown, format: 1, content: passed ? 1 : 0.5 },
      diagnostics,
      parsedOutput: parsed.value
    };
  }

  if (check === "tool_call") {
    const specialLabels = ["ASK_INFO", "NO_CALL", "ESCALATE"];
    const expectedLabel = typeof testCase.expected === "string" && specialLabels.includes(testCase.expected)
      ? testCase.expected
      : "";

    if (expectedLabel) {
      const passed = cleanForExact(output) === cleanForExact(expectedLabel);
      if (!passed) failureTags.push(expectedToolLabelTag(expectedLabel));
      return {
        passed,
        score: passed ? 1 : parsed?.ok ? 0.2 : 0,
        reason: passed ? `tool label: ${expectedLabel}` : `expected ${expectedLabel}`,
        failureTags,
        scoreBreakdown: { ...breakdown, tool: passed ? 1 : 0, content: passed ? 1 : 0 },
        diagnostics,
        parsedOutput: parsed?.ok ? parsed.value : null
      };
    }

    if (!parsed.ok) {
      failureTags.push("JSON_PARSE_ERROR");
      return {
        passed: false,
        score: 0,
        reason: `tool json parse: ${parsed.error}`,
        failureTags,
        scoreBreakdown: { ...breakdown, format: 0, tool: 0, content: 0 },
        diagnostics,
        parsedOutput: null
      };
    }

    const value = parsed.value;
    const expectedTool = String(testCase.expected?.tool || "");
    const expectedArguments = testCase.expected?.arguments || {};
    const actualTool = String(value?.tool || "");
    const actualArguments = value?.arguments;
    const toolSpec = testCase.tools.find((tool) => tool.name === expectedTool);
    const toolErrors = [];

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      failureTags.push("SCHEMA_MISMATCH");
      toolErrors.push("tool output must be an object");
    }
    if (actualTool !== expectedTool) {
      failureTags.push("TOOL_NAME_INVALID");
      toolErrors.push(`expected tool ${expectedTool}, got ${actualTool || "missing"}`);
    }
    if (!actualArguments || typeof actualArguments !== "object" || Array.isArray(actualArguments)) {
      failureTags.push("TOOL_ARGUMENT_TYPE_ERROR");
      toolErrors.push("arguments must be an object");
    } else {
      const schemaErrors = validateSimpleSchema(actualArguments, toolSpec?.parameters);
      failureTags.push(...toolSchemaFailureTags(schemaErrors));
      toolErrors.push(...schemaErrors);
      for (const [key, expectedValue] of Object.entries(expectedArguments)) {
        if (!Object.prototype.hasOwnProperty.call(actualArguments, key)) {
          failureTags.push("TOOL_ARGUMENT_MISSING");
          toolErrors.push(`arguments.${key} is required`);
        } else if (!valuesEqual(actualArguments[key], expectedValue)) {
          failureTags.push("SCHEMA_MISMATCH");
          toolErrors.push(`arguments.${key} expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualArguments[key])}`);
        }
      }
    }
    if (diagnostics.jsonTextLeakage) failureTags.push("TEXT_LEAKAGE");

    const uniqueTags = Array.from(new Set(failureTags));
    const passed = uniqueTags.length === 0;
    const score = passed ? 1 : Math.max(0, Number((1 - uniqueTags.length * 0.2).toFixed(2)));
    return {
      passed,
      score,
      reason: passed ? "tool call valid" : toolErrors.join("; "),
      failureTags: uniqueTags,
      scoreBreakdown: { ...breakdown, format: 1, tool: passed ? 1 : score, content: passed ? 1 : score },
      diagnostics,
      parsedOutput: value
    };
  }

  if (check === "multi_turn") {
    if (testCase.schema) {
      if (!parsed.ok) {
        failureTags.push("JSON_PARSE_ERROR", "MULTI_TURN_DRIFT");
        return {
          passed: false,
          score: 0,
          reason: `multi-turn json parse: ${parsed.error}`,
          failureTags,
          scoreBreakdown: { ...breakdown, format: 0, content: 0, instruction: 0 },
          diagnostics,
          parsedOutput: null
        };
      }
      const schemaErrors = validateSimpleSchema(parsed.value, testCase.schema);
      const passed = schemaErrors.length === 0;
      if (!passed) failureTags.push("MULTI_TURN_DRIFT", "CONSTRAINT_FORGOTTEN", ...schemaFailureTags(schemaErrors));
      if (diagnostics.jsonTextLeakage) failureTags.push("TEXT_LEAKAGE");
      return {
        passed,
        score: passed ? 1 : 0.4,
        reason: passed ? "multi-turn constraints kept" : schemaErrors.join("; "),
        failureTags: Array.from(new Set(failureTags)),
        scoreBreakdown: { ...breakdown, format: parsed.ok ? 1 : 0, content: passed ? 1 : 0.4, instruction: passed ? 1 : 0 },
        diagnostics,
        parsedOutput: parsed.value
      };
    }

    const choices = testCase.choices.length ? testCase.choices : [];
    const cleanOutput = String(output).trim().replace(/^["']|["']$/g, "");
    const passed = choices.length
      ? choices.some((choice) => cleanForExact(cleanOutput) === cleanForExact(choice)) &&
          cleanForExact(cleanOutput) === cleanForExact(testCase.expected)
      : cleanForExact(cleanOutput) === cleanForExact(testCase.expected);
    if (!passed) failureTags.push("MULTI_TURN_DRIFT", "CONSTRAINT_FORGOTTEN");
    return {
      passed,
      score: passed ? 1 : 0,
      reason: choices.length ? `multi-turn enum: ${choices.join(", ")}` : "multi-turn exact match",
      failureTags: Array.from(new Set(failureTags)),
      scoreBreakdown: { ...breakdown, content: passed ? 1 : 0, instruction: passed ? 1 : 0 },
      diagnostics
    };
  }

  if (check === "numeric_range") {
    const number = Number(String(output).match(/-?\d+(?:\.\d+)?/)?.[0]);
    const min = Number(testCase.min);
    const max = Number(testCase.max);
    const passed = Number.isFinite(number) && number >= min && number <= max;
    if (!passed) failureTags.push("NUMERIC_RANGE_FAIL");
    return {
      passed,
      score: passed ? 1 : 0,
      reason: `numeric range: ${min}..${max}`,
      failureTags,
      scoreBreakdown: { ...breakdown, content: passed ? 1 : 0 },
      diagnostics
    };
  }

  if (check === "not_contains") {
    const banned = testCase.notContains.filter(Boolean);
    const hits = banned.filter((item) => normalizedOutput.includes(String(item).toLowerCase()));
    const passed = hits.length === 0;
    if (!passed) failureTags.push("BANNED_TEXT");
    return {
      passed,
      score: passed ? 1 : 0,
      reason: `not contains hits: ${hits.length}/${banned.length}`,
      hits,
      failureTags,
      scoreBreakdown: { ...breakdown, content: passed ? 1 : 0 },
      diagnostics
    };
  }

  const keywords = testCase.keywords.filter(Boolean);
  if (!keywords.length) {
    return {
      passed: true,
      score: 1,
      reason: "no assertion configured",
      failureTags,
      scoreBreakdown: breakdown,
      diagnostics
    };
  }
  const hits = keywords.filter((keyword) => normalizedOutput.includes(keyword.toLowerCase()));
  const passed = check === "contains_any" ? hits.length > 0 : hits.length === keywords.length;
  if (!passed) failureTags.push(check === "contains_any" ? "KEYWORD_ANY_MISS" : "KEYWORD_MISS");
  return {
    passed,
    score: check === "contains_any" ? (hits.length ? 1 : 0) : hits.length / keywords.length,
    reason: `keyword hits: ${hits.length}/${keywords.length}`,
    hits,
    failureTags,
    scoreBreakdown: { ...breakdown, content: check === "contains_any" ? (hits.length ? 1 : 0) : hits.length / keywords.length },
    diagnostics
  };
}

function percentile(values, p) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function benchmarkMetrics(result) {
  const latencySeconds = Math.max(0.001, result.latencyMs / 1000);
  const completionTokens = Number(result.usage?.completion_tokens || 0);
  const outputChars = result.text.length;
  const runtimeTps = Number(result.usage?.decode_tokens_per_second || 0);
  const approxTokens = completionTokens || Math.max(1, Math.round(outputChars / 4));
  return {
    latencyMs: result.latencyMs,
    outputChars,
    completionTokens: completionTokens || undefined,
    tokensPerSecond: runtimeTps || Number((approxTokens / latencySeconds).toFixed(2)),
    tokensPerSecondSource: runtimeTps ? "runtime" : completionTokens ? "usage" : "estimated_chars",
    charsPerSecond: Number((outputChars / latencySeconds).toFixed(2)),
    usage: result.usage || {}
  };
}

async function runBenchmark(input) {
  const profile = getProfile(input.profile || {});
  const params = cleanParams(input.params || {});
  const runs = clampInteger(input.runs, 1, 10, 3);
  const warmup = Boolean(input.warmup);
  const prompt = String(input.prompt || "Write a concise 200-word note about local small model evaluation.").trim();
  if (!prompt) throw badRequest("Missing benchmark prompt");

  const memoryBefore = deviceSnapshot();
  const runtimeBefore = await detectRuntimeProcesses(profile.provider).catch((error) => ({
    provider: profile.provider,
    processes: [],
    totalWorkingSetBytes: 0,
    memoryPct: 0,
    note: error.message
  }));

  if (warmup) {
    await chatCompletion({
      profile,
      params: { ...params, max_tokens: Math.min(params.max_tokens, 64) },
      messages: [
        { role: "system", content: "You are warming up a local model benchmark. Answer briefly." },
        { role: "user", content: "Return OK." }
      ]
    });
  }

  const results = [];
  for (let index = 0; index < runs; index += 1) {
    const result = await chatCompletion({
      profile,
      params,
      messages: [
        { role: "system", content: "You are running a local model generation speed test. Follow the prompt directly." },
        { role: "user", content: prompt }
      ]
    });
    results.push({
      index: index + 1,
      text: result.text,
      ...benchmarkMetrics(result)
    });
  }

  const memoryAfter = deviceSnapshot();
  const runtimeAfter = await detectRuntimeProcesses(profile.provider).catch((error) => ({
    provider: profile.provider,
    processes: [],
    totalWorkingSetBytes: 0,
    memoryPct: 0,
    note: error.message
  }));
  const latencies = results.map((item) => item.latencyMs);
  const tps = results.map((item) => item.tokensPerSecond);
  const charsPerSecond = results.map((item) => item.charsPerSecond);
  const summary = {
    runs,
    warmup,
    avgLatencyMs: Math.round(average(latencies)),
    p50LatencyMs: Math.round(percentile(latencies, 50)),
    p95LatencyMs: Math.round(percentile(latencies, 95)),
    avgTokensPerSecond: Number(average(tps).toFixed(2)),
    avgCharsPerSecond: Number(average(charsPerSecond).toFixed(2)),
    memoryBefore: memoryBefore.memory,
    memoryAfter: memoryAfter.memory,
    runtimeBefore,
    runtimeAfter,
    runtimeMemoryDeltaBytes: runtimeAfter.totalWorkingSetBytes - runtimeBefore.totalWorkingSetBytes,
    runtimePrivateMemoryDeltaBytes:
      (runtimeAfter.totalPrivateMemoryBytes || 0) - (runtimeBefore.totalPrivateMemoryBytes || 0)
  };

  const run = appendRun({
    type: "benchmark",
    title: `Benchmark ${profile.model || profile.provider}`,
    profile: publicProfile(profile),
    params,
    summary,
    result: {
      prompt,
      runs: results
    }
  });

  return {
    runId: run.id,
    profile: publicProfile(profile),
    summary,
    results
  };
}

async function runEval(input) {
  const profile = getProfile(input.profile || {});
  const params = cleanParams(input.params || {});
  const dataset = normalizeEvalDataset(input.dataset);
  const defaultSystem = String(input.system || "You are a precise assistant. Keep answers short.");
  const runConfig = normalizeRunConfig(input.runConfig || {});
  if (!dataset.length) throw badRequest("Dataset is empty");

  const startedAt = Date.now();
  const cases = [];
  for (const [index, item] of dataset.entries()) {
    cases.push(await runEvalCase({ profile, params, defaultSystem, item, index }));
  }

  const summary = withRunConfig(summarizeEvalCases(cases, startedAt), runConfig);

  const run = appendRun({
    type: "eval",
    title: `Eval ${summary.passed}/${summary.total}`,
    profile: publicProfile(profile),
    params,
    summary,
    result: { cases, runConfig }
  });

  return { runId: run.id, summary, cases };
}

function normalizeEvalDataset(dataset) {
  return (Array.isArray(dataset) ? dataset : [])
    .map(normalizeCase)
    .filter((item) => item.input.trim() || item.turns.length);
}

function normalizeRunConfig(config) {
  return {
    runMode: String(config?.runMode || ""),
    configLabel: String(config?.configLabel || ""),
    benchmarkClasses: Array.isArray(config?.benchmarkClasses)
      ? config.benchmarkClasses.map((item) => String(item)).filter(Boolean)
      : []
  };
}

function withRunConfig(summary, runConfig) {
  if (!runConfig?.runMode && !runConfig?.configLabel && !runConfig?.benchmarkClasses?.length) return summary;
  return {
    ...summary,
    runMode: runConfig.runMode || summary.runMode,
    configLabel: runConfig.configLabel || summary.configLabel,
    benchmarkClasses: runConfig.benchmarkClasses?.length ? runConfig.benchmarkClasses : summary.benchmarkClasses
  };
}

function caseClassKey(item) {
  return item.suite || item.family || item.check || "general";
}

function caseClassLabel(key) {
  return SUITE_LABELS[key] || key;
}

function caseClassSummaries(cases) {
  const groups = new Map();
  for (const item of cases || []) {
    const key = caseClassKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return Array.from(groups.entries()).map(([key, items]) => {
    const total = items.length;
    const passed = items.filter((item) => item.passed).length;
    const avgScore = total ? items.reduce((sum, item) => sum + Number(item.score || 0), 0) / total : 0;
    const failureTagCounts = {};
    for (const item of items) {
      for (const tag of item.failureTags || []) {
        failureTagCounts[tag] = (failureTagCounts[tag] || 0) + 1;
      }
    }
    return {
      key,
      label: caseClassLabel(key),
      total,
      passed,
      failed: total - passed,
      passRate: total ? passed / total : 0,
      avgScore,
      failureTagCounts
    };
  });
}

async function runEvalCase({ profile, params, defaultSystem, item, index }) {
  const testCase = normalizeCase(item, index);
  const messages = testCase.turns.length
    ? [
        { role: "system", content: testCase.system || defaultSystem },
        ...testCase.turns
      ]
    : [
        { role: "system", content: testCase.system || defaultSystem },
        { role: "user", content: testCase.input }
      ];
  const result = await chatCompletion({
    profile,
    params,
    messages
  });
  const score = scoreCase(testCase, result.text);
  return {
    id: testCase.id,
    suite: testCase.suite,
    set: testCase.set,
    difficulty: testCase.difficulty,
    family: testCase.family,
    check: testCase.check,
    input: testCase.turns.length ? turnTranscript(testCase.turns) : testCase.input,
    turns: testCase.turns,
    expected: testCase.expected,
    output: result.text,
    latencyMs: result.latencyMs,
    ...score
  };
}

function summarizeEvalCases(cases, startedAt) {
  const total = cases.length;
  const passed = cases.filter((item) => item.passed).length;
  const avgScore = total ? cases.reduce((sum, item) => sum + item.score, 0) / total : 0;
  const avgCaseLatencyMs = total ? Math.round(cases.reduce((sum, item) => sum + Number(item.latencyMs || 0), 0) / total) : 0;
  const failureTagCounts = {};
  for (const item of cases) {
    for (const tag of item.failureTags || []) {
      failureTagCounts[tag] = (failureTagCounts[tag] || 0) + 1;
    }
  }
  const summary = {
    total,
    completed: total,
    passed,
    failed: total - passed,
    passRate: total ? passed / total : 0,
    avgScore,
    avgCaseLatencyMs,
    classScores: caseClassSummaries(cases),
    failureTagCounts,
    latencyMs: Date.now() - startedAt
  };
  return summary;
}

async function streamEval(input, res) {
  const profile = getProfile(input.profile || {});
  const params = cleanParams(input.params || {});
  const dataset = normalizeEvalDataset(input.dataset);
  const defaultSystem = String(input.system || "You are a precise assistant. Keep answers short.");
  const runConfig = normalizeRunConfig(input.runConfig || {});
  if (!dataset.length) throw badRequest("Dataset is empty");

  const startedAt = Date.now();
  const cases = [];
  const writeEvent = (payload) => {
    res.write(`${JSON.stringify(payload)}\n`);
  };

  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    "x-accel-buffering": "no"
  });
  writeEvent({
    type: "start",
    total: dataset.length,
    startedAt: new Date(startedAt).toISOString(),
    profile: publicProfile(profile)
  });

  try {
    for (const [index, item] of dataset.entries()) {
      const caseResult = await runEvalCase({ profile, params, defaultSystem, item, index });
      cases.push(caseResult);
      writeEvent({
        type: "case",
        index: cases.length,
        total: dataset.length,
        case: caseResult,
        summary: summarizeEvalCases(cases, startedAt)
      });
    }

    const summary = withRunConfig(summarizeEvalCases(cases, startedAt), runConfig);
    const run = appendRun({
      type: "eval",
      title: `Eval ${summary.passed}/${summary.total}`,
      profile: publicProfile(profile),
      params,
      summary,
      result: { cases, runConfig }
    });

    writeEvent({ type: "done", runId: run.id, summary, cases });
    res.end();
  } catch (error) {
    writeEvent({
      type: "error",
      error: error.message || "Eval failed",
      summary: summarizeEvalCases(cases, startedAt),
      cases
    });
    res.end();
  }
}

function serveStatic(req, res, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(PUBLIC_DIR, relativePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  fs.readFile(resolved, (error, data) => {
    if (error) {
      if (pathname !== "/") {
        fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallbackData) => {
          if (fallbackError) {
            sendText(res, 404, "Not found");
            return;
          }
          res.writeHead(200, { "content-type": MIME_TYPES[".html"] });
          res.end(fallbackData);
        });
        return;
      }
      sendText(res, 404, "Not found");
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(data);
  });
}

function findRun(runId) {
  return readRuns().find((run) => run.id === runId);
}

function sendDownload(res, status, body, contentType, filename) {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-disposition": `attachment; filename="${filename}"`
  });
  res.end(body);
}

function stringifyExpected(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

const SUITE_LABELS = {
  json_extraction: "JSON / 结构化输出",
  intent_routing: "意图路由",
  instruction_following: "指令跟随",
  tool_calling: "工具调用",
  safety_boundary: "边界处理",
  loop_stress: "循环压力",
  truthfulness: "真实性 / 幻觉风险",
  multi_turn: "多轮对话 / 记忆保持"
};

function markdownValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function markdownCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replace(/\r?\n/g, " ");
}

function markdownFence(value, lang = "text") {
  return [`\`\`\`${lang}`, markdownValue(value), "```"].join("\n");
}

function scorePercent(value) {
  return Math.round(Number(value || 0) * 100);
}

function generateMarkdownReport(run) {
  const summary = run.summary || {};
  const profile = run.profile || {};
  const device = run.device || {};
  const cases = run.result?.cases || [];
  const benchmarkRuns = run.result?.runs || [];
  const runConfig = run.result?.runConfig || {};
  const classScores = summary.classScores?.length ? summary.classScores : caseClassSummaries(cases);
  const benchmarkClasses = summary.benchmarkClasses?.length
    ? summary.benchmarkClasses
    : runConfig.benchmarkClasses?.length
      ? runConfig.benchmarkClasses
      : classScores.map((item) => item.label);
  const runMode = summary.runMode || runConfig.runMode || "n/a";
  const configLabel = summary.configLabel || runConfig.configLabel || "";
  const benchmarkSection = run.type === "benchmark"
    ? [
        "## Benchmark",
        "",
        `- Runs: ${summary.runs || benchmarkRuns.length || 0}`,
        `- Warmup: ${summary.warmup ? "yes" : "no"}`,
        `- Avg latency: ${summary.avgLatencyMs || 0}ms`,
        `- P50 latency: ${summary.p50LatencyMs || 0}ms`,
        `- P95 latency: ${summary.p95LatencyMs || 0}ms`,
        `- Avg tokens/s: ${summary.avgTokensPerSecond || 0}`,
        `- Avg chars/s: ${summary.avgCharsPerSecond || 0}`,
        `- Runtime memory delta: ${summary.runtimeMemoryDeltaBytes || 0} bytes`,
        `- Runtime private memory delta: ${summary.runtimePrivateMemoryDeltaBytes || 0} bytes`,
        ""
      ].join("\n")
    : "";
  const tags = Object.entries(summary.failureTagCounts || {})
    .map(([tag, count]) => `- ${tag}: ${count}`)
    .join("\n") || "- None";
  const classTable = classScores.length
    ? [
        "| Class | Score | Passed | Failure tags |",
        "| --- | ---: | ---: | --- |",
        ...classScores.map((item) => {
          const topTags = Object.entries(item.failureTagCounts || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([tag, count]) => `${tag} ${count}`)
            .join(", ") || "none";
          return `| ${markdownCell(item.label)} | ${scorePercent(item.avgScore)} | ${item.passed}/${item.total} | ${markdownCell(topTags)} |`;
        })
      ].join("\n")
    : "No class summary.";
  const caseTable = cases.length
    ? [
        "| Case | Class | Family | Score | Result | Tags |",
        "| --- | --- | --- | ---: | --- | --- |",
        ...cases.map((item) => `| ${markdownCell(item.id)} | ${markdownCell(caseClassLabel(caseClassKey(item)))} | ${markdownCell(item.family)} | ${scorePercent(item.score)} | ${item.passed ? "PASS" : "FAIL"} | ${markdownCell((item.failureTags || []).join(", ") || "none")} |`)
      ].join("\n")
    : "No cases.";
  const caseDetails = cases
    .map((item) => [
      `### ${item.id}`,
      "",
      `- Class: ${caseClassLabel(caseClassKey(item))}`,
      `- Set: ${item.set || "n/a"}`,
      `- Difficulty: ${item.difficulty || "n/a"}`,
      `- Passed: ${item.passed ? "yes" : "no"}`,
      `- Score: ${scorePercent(item.score)}`,
      `- Check: ${item.check || ""}`,
      `- Latency: ${item.latencyMs || 0}ms`,
      `- Reason: ${item.reason || ""}`,
      `- Failure tags: ${(item.failureTags || []).join(", ") || "none"}`,
      "",
      "#### Input / Turns",
      "",
      markdownFence(item.turns?.length ? item.turns : item.input || "", item.turns?.length ? "json" : "text"),
      "",
      "#### Expected",
      "",
      markdownFence(item.expected, typeof item.expected === "string" ? "text" : "json"),
      "",
      "#### Raw Output",
      "",
      markdownFence(item.output || "", "text"),
      "",
      "#### Parsed Output",
      "",
      markdownFence(item.parsedOutput, "json"),
      "",
      "#### Diagnostics",
      "",
      markdownFence(item.diagnostics, "json")
    ].join("\n"))
    .join("\n\n");

  return [
    `# Mini Model Harness Report`,
    "",
    `Run: ${run.id}`,
    `Created: ${run.createdAt}`,
    `Type: ${run.type}`,
    `Title: ${run.title || ""}`,
    `Run mode: ${runMode}`,
    configLabel ? `Config: ${configLabel}` : "",
    "",
    "## Runtime",
    "",
    `- Provider: ${profile.provider || ""}`,
    `- Base URL: ${profile.baseUrl || ""}`,
    `- Model: ${profile.model || ""}`,
    "",
    "## Device",
    "",
    `- OS: ${device.os?.platform || ""} ${device.os?.release || ""} ${device.os?.arch || ""}`,
    `- CPU: ${device.cpu?.model || ""}`,
    `- Cores: ${device.cpu?.cores || ""}`,
    `- Memory: ${device.memory?.totalBytes ? Math.round(device.memory.totalBytes / 1024 / 1024 / 1024) : ""} GB total`,
    `- Node: ${device.runtime?.node || ""}`,
    "",
    "## Summary",
    "",
    `- Passed: ${summary.passed ?? "n/a"}/${summary.total ?? "n/a"}`,
    `- Pass rate: ${formatPercent(summary.passRate)}`,
    `- Average score: ${scorePercent(summary.avgScore)} 分`,
    `- Latency: ${summary.latencyMs || 0}ms`,
    `- Avg case latency: ${summary.avgCaseLatencyMs || 0}ms`,
    `- Benchmark classes: ${benchmarkClasses.join(", ") || "n/a"}`,
    "",
    benchmarkSection,
    "## Per-Class Score",
    "",
    classTable,
    "",
    "## Per-Case Score",
    "",
    caseTable,
    "",
    "## Failure Tags",
    "",
    tags,
    "",
    "## Case Details",
    "",
    caseDetails || "No cases recorded in this run."
  ].filter((line) => line !== "").join("\n");
}

function csvEscape(value) {
  const text = stringifyExpected(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function generateCasesCsv(run) {
  const rows = [["id", "passed", "score", "latencyMs", "failureTags", "reason", "input", "expected", "output"]];
  for (const item of run.result?.cases || []) {
    rows.push([
      item.id,
      item.passed,
      item.score,
      item.latencyMs,
      (item.failureTags || []).join("|"),
      item.reason || "",
      item.input || "",
      item.expected ?? "",
      item.output || ""
    ]);
  }
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        name: "mini-model-harness",
        time: new Date().toISOString(),
        providers: [
          { id: "ollama", label: "Ollama", defaultBaseUrl: defaultBaseUrl("ollama") },
          { id: "lmstudio", label: "LM Studio", defaultBaseUrl: defaultBaseUrl("lmstudio") },
          { id: "llamacpp", label: "llama.cpp server", defaultBaseUrl: defaultBaseUrl("llamacpp") },
          { id: "openai", label: "OpenAI-compatible", defaultBaseUrl: defaultBaseUrl("openai") }
        ]
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/device") {
      sendJson(res, 200, { device: deviceSnapshot() });
      return;
    }

    if (req.method === "GET" && pathname === "/api/device/processes") {
      const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
      const provider = requestUrl.searchParams.get("provider") || "ollama";
      sendJson(res, 200, { runtime: await detectRuntimeProcesses(provider) });
      return;
    }

    const exportMatch = pathname.match(/^\/api\/runs\/([^/]+)\/(report\.md|export\.json|export\.csv)$/);
    if (req.method === "GET" && exportMatch) {
      const run = findRun(exportMatch[1]);
      if (!run) {
        sendJson(res, 404, { error: "Run not found" });
        return;
      }
      if (exportMatch[2] === "report.md") {
        sendDownload(res, 200, generateMarkdownReport(run), "text/markdown; charset=utf-8", `${run.id}.md`);
        return;
      }
      if (exportMatch[2] === "export.csv") {
        sendDownload(res, 200, generateCasesCsv(run), "text/csv; charset=utf-8", `${run.id}.csv`);
        return;
      }
      sendDownload(res, 200, `${JSON.stringify(run, null, 2)}\n`, "application/json; charset=utf-8", `${run.id}.json`);
      return;
    }

    if (req.method === "GET" && pathname === "/api/runs") {
      sendJson(res, 200, { runs: readRuns() });
      return;
    }

    if (req.method === "DELETE" && pathname === "/api/runs") {
      writeRuns([]);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = await readRequestBody(req);

    if (pathname === "/api/models") {
      sendJson(res, 200, await listModels(body.profile || body));
      return;
    }

    if (pathname === "/api/chat") {
      const result = await chatCompletion(body);
      const run = appendRun({
        type: "chat",
        title: (body.messages || []).find((item) => item.role === "user")?.content?.slice(0, 90) || "Prompt lab",
        profile: publicProfile(getProfile(body.profile || body)),
        params: cleanParams(body.params || {}),
        summary: { latencyMs: result.latencyMs },
        result: { text: result.text, usage: result.usage }
      });
      sendJson(res, 200, { ...result, runId: run.id });
      return;
    }

    if (pathname === "/api/swarm") {
      sendJson(res, 200, await runSwarm(body));
      return;
    }

    if (pathname === "/api/eval") {
      sendJson(res, 200, await runEval(body));
      return;
    }

    if (pathname === "/api/eval/stream") {
      await streamEval(body, res);
      return;
    }

    if (pathname === "/api/benchmark/generate") {
      sendJson(res, 200, await runBenchmark(body));
      return;
    }

    sendJson(res, 404, { error: "Unknown API route" });
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(res, status, {
      error: error.message || "Unknown error",
      status
    });
  }
}

ensureDataFiles();

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (requestUrl.pathname.startsWith("/api/")) {
    handleApi(req, res, requestUrl.pathname);
    return;
  }
  serveStatic(req, res, requestUrl.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`Mini model harness listening on http://${HOST}:${PORT}`);
});
