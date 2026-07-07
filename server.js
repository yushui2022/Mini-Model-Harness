const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
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
        total_duration_ms: data.total_duration ? Math.round(data.total_duration / 1000000) : undefined
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
      totalBytes: os.totalmem(),
      freeBytes: os.freemem(),
      processRssBytes: memory.rss,
      processHeapUsedBytes: memory.heapUsed
    },
    runtime: {
      node: process.version,
      pid: process.pid
    },
    capturedAt: new Date().toISOString()
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
    family: String(testCase.family || "general"),
    input: String(testCase.input || testCase.prompt || ""),
    system: String(testCase.system || ""),
    expected,
    check: String(testCase.check || testCase.checkType || "keywords"),
    keywords,
    notContains: Array.isArray(testCase.notContains) ? testCase.notContains : [],
    choices: Array.isArray(testCase.choices) ? testCase.choices : [],
    regex: String(testCase.regex || ""),
    schema: testCase.schema || null,
    min: testCase.min ?? testCase.minimum,
    max: testCase.max ?? testCase.maximum,
    maxReasonableChars: testCase.max_reasonable_chars ?? testCase.maxReasonableChars
  };
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
  const parsed = check.startsWith("json") ? parseJsonOutput(output) : null;
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
    if (!passed) failureTags.push("SCHEMA_MISMATCH");
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

async function runEval(input) {
  const profile = getProfile(input.profile || {});
  const params = cleanParams(input.params || {});
  const dataset = Array.isArray(input.dataset) ? input.dataset.map(normalizeCase) : [];
  const defaultSystem = String(input.system || "You are a precise assistant. Keep answers short.");
  if (!dataset.length) throw badRequest("Dataset is empty");

  const startedAt = Date.now();
  const cases = [];
  for (const [index, item] of dataset.entries()) {
    const testCase = normalizeCase(item, index);
    if (!testCase.input.trim()) continue;
    const result = await chatCompletion({
      profile,
      params,
      messages: [
        { role: "system", content: testCase.system || defaultSystem },
        { role: "user", content: testCase.input }
      ]
    });
    const score = scoreCase(testCase, result.text);
    cases.push({
      id: testCase.id,
      family: testCase.family,
      check: testCase.check,
      input: testCase.input,
      expected: testCase.expected,
      output: result.text,
      latencyMs: result.latencyMs,
      ...score
    });
  }

  const total = cases.length;
  const passed = cases.filter((item) => item.passed).length;
  const avgScore = total ? cases.reduce((sum, item) => sum + item.score, 0) / total : 0;
  const failureTagCounts = {};
  for (const item of cases) {
    for (const tag of item.failureTags || []) {
      failureTagCounts[tag] = (failureTagCounts[tag] || 0) + 1;
    }
  }
  const summary = {
    total,
    passed,
    failed: total - passed,
    passRate: total ? passed / total : 0,
    avgScore,
    failureTagCounts,
    latencyMs: Date.now() - startedAt
  };

  const run = appendRun({
    type: "eval",
    title: `Eval ${passed}/${total}`,
    profile: publicProfile(profile),
    params,
    summary,
    result: { cases }
  });

  return { runId: run.id, summary, cases };
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

function generateMarkdownReport(run) {
  const summary = run.summary || {};
  const profile = run.profile || {};
  const device = run.device || {};
  const cases = run.result?.cases || [];
  const failedCases = cases.filter((item) => !item.passed).slice(0, 5);
  const tags = Object.entries(summary.failureTagCounts || {})
    .map(([tag, count]) => `- ${tag}: ${count}`)
    .join("\n") || "- None";
  const failed = failedCases
    .map((item) => [
      `### ${item.id}`,
      "",
      `- Passed: ${item.passed ? "yes" : "no"}`,
      `- Score: ${Math.round(Number(item.score || 0) * 100)}%`,
      `- Reason: ${item.reason || ""}`,
      `- Failure tags: ${(item.failureTags || []).join(", ") || "none"}`,
      "",
      "Input:",
      "",
      "```text",
      item.input || "",
      "```",
      "",
      "Output:",
      "",
      "```text",
      item.output || "",
      "```"
    ].join("\n"))
    .join("\n\n");

  return [
    `# Mini Model Harness Report`,
    "",
    `Run: ${run.id}`,
    `Created: ${run.createdAt}`,
    `Type: ${run.type}`,
    `Title: ${run.title || ""}`,
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
    `- Average score: ${formatPercent(summary.avgScore)}`,
    `- Latency: ${summary.latencyMs || 0}ms`,
    "",
    "## Failure Tags",
    "",
    tags,
    "",
    failedCases.length ? "## Failed Cases" : "## Cases",
    "",
    failedCases.length ? failed : "No failed cases recorded in this run."
  ].join("\n");
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
