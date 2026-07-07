const http = require("http");
const fs = require("fs");
const path = require("path");
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
const MAX_RUNS = 100;
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

function appendRun(run) {
  const runs = readRuns();
  const saved = {
    id: `run_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
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

  const run = appendRun({
    type: "swarm",
    title: task.slice(0, 90),
    profile: publicProfile(profile),
    params,
    summary: {
      agents: agents.map((agent) => agent.name),
      rounds,
      latencyMs: Date.now() - startedAt
    },
    result: {
      final: final.text,
      trace
    }
  });

  return {
    runId: run.id,
    final: final.text,
    trace,
    latencyMs: Date.now() - startedAt
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
    input: String(testCase.input || testCase.prompt || ""),
    system: String(testCase.system || ""),
    expected: String(expected),
    check: String(testCase.check || testCase.checkType || "keywords"),
    keywords,
    regex: String(testCase.regex || "")
  };
}

function scoreCase(testCase, output) {
  const normalizedOutput = output.toLowerCase();
  if (testCase.check === "regex" && testCase.regex) {
    try {
      const passed = new RegExp(testCase.regex, "i").test(output);
      return { passed, score: passed ? 1 : 0, reason: `regex: ${testCase.regex}` };
    } catch (error) {
      return { passed: false, score: 0, reason: `invalid regex: ${error.message}` };
    }
  }

  if (testCase.check === "exact") {
    const clean = (value) => String(value).trim().replace(/\s+/g, " ").toLowerCase();
    const passed = clean(output) === clean(testCase.expected);
    return { passed, score: passed ? 1 : 0, reason: "exact match" };
  }

  const keywords = testCase.keywords.filter(Boolean);
  if (!keywords.length) {
    return { passed: true, score: 1, reason: "no assertion configured" };
  }
  const hits = keywords.filter((keyword) => normalizedOutput.includes(keyword.toLowerCase()));
  return {
    passed: hits.length === keywords.length,
    score: hits.length / keywords.length,
    reason: `keyword hits: ${hits.length}/${keywords.length}`,
    hits
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
  const summary = {
    total,
    passed,
    failed: total - passed,
    passRate: total ? passed / total : 0,
    avgScore,
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
