const DEFAULT_PROFILE = {
  provider: "ollama",
  baseUrl: "http://127.0.0.1:11434",
  model: "",
  apiKey: ""
};

const DEFAULT_PARAMS = {
  temperature: 0.3,
  top_p: 0.9,
  max_tokens: 512,
  num_ctx: 4096
};

const PROVIDER_BASE_URLS = {
  ollama: "http://127.0.0.1:11434",
  lmstudio: "http://127.0.0.1:1234",
  llamacpp: "http://127.0.0.1:8080",
  openai: "http://127.0.0.1:8000",
  vllm: "http://127.0.0.1:8000"
};

const DEFAULT_AGENTS = [
  {
    id: "planner",
    name: "Planner",
    enabled: true,
    system:
      "You are a planner for a small local model swarm. Break the task into the fewest concrete steps. Be concise."
  },
  {
    id: "solver",
    name: "Solver",
    enabled: true,
    system:
      "You are a practical solver. Use the plan and produce a direct answer or implementation guidance. Avoid speculation."
  },
  {
    id: "critic",
    name: "Critic",
    enabled: true,
    system:
      "You are a strict critic. Find missing constraints, failure cases, and weak assumptions. Keep feedback short."
  },
  {
    id: "synthesizer",
    name: "Synthesizer",
    enabled: false,
    system:
      "You combine prior outputs into a final concise result. Preserve only decisions, risks, and next actions."
  }
];

const EVAL_PRESET = [
  {
    id: "json_extract",
    input: "从文本中抽取 name 和 age，返回紧凑 JSON。文本：Alice is 31 years old.",
    expected: "Alice,31",
    check: "keywords",
    keywords: ["Alice", "31"]
  },
  {
    id: "route_intent",
    input: "把用户意图分类为 search、write、code 三者之一：帮我写一个 Python 排序函数",
    expected: "code",
    check: "regex",
    regex: "\\bcode\\b"
  },
  {
    id: "short_reasoning",
    input: "只回答最终数字：13 + 29 = ?",
    expected: "42",
    check: "exact"
  }
];

const PROMPT_TEMPLATE = {
  system:
    "You are a compact 1B-3B local model. Follow the user task exactly.\nRules:\n- Keep the answer short.\n- Use the requested format.\n- If unsure, say what is missing.\n- Do not include hidden reasoning.",
  user:
    "Task: classify the request into one label: code, write, search, extract.\nRequest: 帮我从这段日志里提取错误码\nReturn only the label."
};

const state = {
  profile: loadJson("miniHarness.profile", DEFAULT_PROFILE),
  params: loadJson("miniHarness.params", DEFAULT_PARAMS),
  agents: loadJson("miniHarness.agents", DEFAULT_AGENTS),
  activePage: "control"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return Array.isArray(fallback) ? fallback.map((item) => ({ ...item })) : { ...fallback };
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) {
      return Array.isArray(parsed) ? parsed : fallback.map((item) => ({ ...item }));
    }
    return { ...fallback, ...parsed };
  } catch {
    return Array.isArray(fallback) ? fallback.map((item) => ({ ...item })) : { ...fallback };
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = number;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `${response.status} ${response.statusText}`);
  }
  return data;
}

function getProfileFromForm() {
  return {
    provider: $("#providerInput").value,
    baseUrl: $("#baseUrlInput").value.trim(),
    model: $("#modelInput").value.trim(),
    apiKey: $("#apiKeyInput").value.trim()
  };
}

function getParamsFromForm() {
  return {
    temperature: Number($("#temperatureInput").value),
    top_p: Number($("#topPInput").value),
    max_tokens: Number($("#maxTokensInput").value),
    num_ctx: Number($("#contextTokensInput").value)
  };
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label || "运行中";
    button.disabled = true;
    return;
  }
  button.textContent = button.dataset.label || button.textContent;
  button.disabled = false;
}

function syncProfileForm() {
  $("#providerInput").value = state.profile.provider;
  $("#baseUrlInput").value = state.profile.baseUrl;
  $("#modelInput").value = state.profile.model;
  $("#apiKeyInput").value = state.profile.apiKey || "";
  updateProfileBadge();
}

function syncParamsForm() {
  $("#temperatureInput").value = state.params.temperature;
  $("#topPInput").value = state.params.top_p;
  $("#maxTokensInput").value = state.params.max_tokens;
  $("#contextTokensInput").value = state.params.num_ctx;
  $("#temperatureValue").textContent = state.params.temperature.toFixed(2);
  $("#topPValue").textContent = state.params.top_p.toFixed(2);
}

function persistFormState() {
  state.profile = getProfileFromForm();
  state.params = getParamsFromForm();
  saveJson("miniHarness.profile", state.profile);
  saveJson("miniHarness.params", state.params);
  updateProfileBadge();
}

function updateProfileBadge(kind) {
  const profile = getProfileFromForm();
  const badge = $("#profileBadge");
  badge.classList.remove("ok", "bad");
  if (kind) badge.classList.add(kind);
  badge.textContent = profile.model ? `${profile.provider} · ${profile.model}` : `${profile.provider} · 未选模型`;
}

function renderAgents() {
  const container = $("#agentTable");
  container.innerHTML = state.agents
    .map(
      (agent, index) => `
        <div class="agent-row" data-agent-index="${index}">
          <input type="checkbox" ${agent.enabled ? "checked" : ""} aria-label="启用 ${escapeHtml(agent.name)}" />
          <input type="text" value="${escapeHtml(agent.name)}" aria-label="角色名" spellcheck="false" />
          <textarea spellcheck="false" aria-label="角色系统提示词">${escapeHtml(agent.system)}</textarea>
        </div>
      `
    )
    .join("");

  $$(".agent-row").forEach((row) => {
    row.addEventListener("input", syncAgentsFromDom);
  });
}

function syncAgentsFromDom() {
  state.agents = $$(".agent-row").map((row, index) => {
    const [enabledInput, nameInput] = row.querySelectorAll("input");
    const systemInput = row.querySelector("textarea");
    return {
      id: state.agents[index]?.id || `agent_${index + 1}`,
      enabled: enabledInput.checked,
      name: nameInput.value.trim() || `Agent ${index + 1}`,
      system: systemInput.value.trim()
    };
  });
  saveJson("miniHarness.agents", state.agents);
}

function switchPage(page) {
  state.activePage = page;
  $$(".page").forEach((section) => {
    section.classList.toggle("active", section.id === `page-${page}`);
  });
  $$(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  const titles = {
    control: "控制台",
    lab: "Prompt Lab",
    swarm: "Swarm",
    eval: "Eval",
    runs: "Runs"
  };
  $("#pageTitle").textContent = titles[page] || "Mini Harness";
  if (page === "runs") loadRuns();
}

async function checkServer() {
  const dot = $("#serverDot");
  const label = $("#serverStatus");
  try {
    await api("/api/health");
    dot.classList.remove("bad");
    dot.classList.add("ok");
    label.textContent = "server ready";
  } catch (error) {
    dot.classList.remove("ok");
    dot.classList.add("bad");
    label.textContent = "server offline";
  }
}

async function loadModels() {
  persistFormState();
  const button = $("#loadModelsBtn");
  setBusy(button, true, "读取中");
  try {
    const data = await api("/api/models", {
      method: "POST",
      body: JSON.stringify({ profile: state.profile })
    });
    const models = data.models || [];
    const list = $("#modelList");
    list.innerHTML = models.map((model) => `<option value="${escapeHtml(model.id)}"></option>`).join("");
    $("#modelsOutput").innerHTML = models.length
      ? models
          .map(
            (model) => `
              <div class="model-pill">
                <span>${escapeHtml(model.name || model.id)} ${model.size ? `<small>${formatBytes(model.size)}</small>` : ""}</span>
                <button data-model="${escapeHtml(model.id)}">选择</button>
              </div>
            `
          )
          .join("")
      : '<div class="model-pill"><span>端点可访问，但没有返回模型。</span></div>';
    $("#modelsOutput").querySelectorAll("button[data-model]").forEach((button) => {
      button.addEventListener("click", () => {
        $("#modelInput").value = button.dataset.model;
        persistFormState();
        showToast(`已选择 ${button.dataset.model}`);
      });
    });
    updateProfileBadge("ok");
    showToast(`读取到 ${models.length} 个模型`);
  } catch (error) {
    updateProfileBadge("bad");
    $("#modelsOutput").innerHTML = `<div class="model-pill"><span>${escapeHtml(error.message)}</span></div>`;
    showToast(error.message);
  } finally {
    setBusy(button, false);
  }
}

async function runPrompt() {
  persistFormState();
  const button = $("#runPromptBtn");
  const output = $("#promptOutput");
  setBusy(button, true, "运行中");
  $("#promptMeta").textContent = "running";
  output.textContent = "";
  try {
    const data = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        profile: state.profile,
        params: state.params,
        messages: [
          { role: "system", content: $("#systemPromptInput").value },
          { role: "user", content: $("#userPromptInput").value }
        ]
      })
    });
    output.textContent = data.text || "";
    $("#promptMeta").textContent = `${data.model} · ${data.latencyMs}ms · run ${data.runId}`;
    showToast("Prompt run complete");
  } catch (error) {
    output.textContent = error.message;
    $("#promptMeta").textContent = "failed";
    showToast(error.message);
  } finally {
    setBusy(button, false);
  }
}

async function runSwarm() {
  persistFormState();
  syncAgentsFromDom();
  const button = $("#runSwarmBtn");
  const output = $("#swarmOutput");
  output.innerHTML = "";
  $("#swarmMeta").textContent = "running";
  setBusy(button, true, "运行中");
  try {
    const data = await api("/api/swarm", {
      method: "POST",
      body: JSON.stringify({
        profile: state.profile,
        params: state.params,
        task: $("#swarmTaskInput").value,
        rounds: Number($("#swarmRoundsInput").value),
        memory: $("#swarmMemoryInput").value,
        agents: state.agents
      })
    });
    renderSwarmResult(data);
    $("#swarmMeta").textContent = `${data.trace.length} steps · ${data.latencyMs}ms · run ${data.runId}`;
    showToast("Swarm run complete");
  } catch (error) {
    output.innerHTML = `<div class="trace-item"><pre>${escapeHtml(error.message)}</pre></div>`;
    $("#swarmMeta").textContent = "failed";
    showToast(error.message);
  } finally {
    setBusy(button, false);
  }
}

function renderSwarmResult(data) {
  const finalBlock = `
    <div class="trace-item">
      <div class="trace-head"><span>Final synthesis</span><span>${escapeHtml(data.runId || "")}</span></div>
      <pre>${escapeHtml(data.final || "")}</pre>
    </div>
  `;
  const traceBlocks = (data.trace || [])
    .map(
      (item) => `
        <div class="trace-item">
          <div class="trace-head">
            <span>R${item.round} · ${escapeHtml(item.agentName)}</span>
            <span>${item.latencyMs || 0}ms</span>
          </div>
          <pre>${escapeHtml(item.output)}</pre>
        </div>
      `
    )
    .join("");
  $("#swarmOutput").innerHTML = finalBlock + traceBlocks;
}

function parseEvalDataset() {
  const raw = $("#evalDatasetInput").value.trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Eval dataset must be a JSON array");
  return parsed;
}

async function runEval() {
  persistFormState();
  const button = $("#runEvalBtn");
  const output = $("#evalOutput");
  output.innerHTML = "";
  $("#evalMeta").textContent = "running";
  setBusy(button, true, "运行中");
  try {
    const dataset = parseEvalDataset();
    const data = await api("/api/eval", {
      method: "POST",
      body: JSON.stringify({
        profile: state.profile,
        params: state.params,
        system: $("#evalSystemInput").value,
        dataset
      })
    });
    renderEvalResult(data);
    const rate = Math.round(data.summary.passRate * 100);
    $("#evalMeta").textContent = `${data.summary.passed}/${data.summary.total} pass · ${rate}% · run ${data.runId}`;
    showToast("Eval complete");
  } catch (error) {
    output.innerHTML = `<div class="eval-case"><pre>${escapeHtml(error.message)}</pre></div>`;
    $("#evalMeta").textContent = "failed";
    showToast(error.message);
  } finally {
    setBusy(button, false);
  }
}

function renderEvalResult(data) {
  const rate = Math.round((data.summary?.passRate || 0) * 100);
  const score = Math.round((data.summary?.avgScore || 0) * 100);
  const cases = (data.cases || [])
    .map(
      (item) => `
        <div class="eval-case">
          <div class="eval-head">
            <span class="${item.passed ? "pass" : "fail"}">${escapeHtml(item.id)} · ${item.passed ? "PASS" : "FAIL"}</span>
            <span>${Math.round(item.score * 100)}% · ${item.latencyMs}ms</span>
          </div>
          <pre>Input:
${escapeHtml(item.input)}

Expected:
${escapeHtml(item.expected)}

Output:
${escapeHtml(item.output)}

Reason:
${escapeHtml(item.reason)}</pre>
        </div>
      `
    )
    .join("");
  $("#evalOutput").innerHTML = `
    <div class="scorebar"><span style="width:${rate}%"></span></div>
    <div class="hint-list">
      <div><strong>Pass rate:</strong> ${rate}%</div>
      <div><strong>Average assertion score:</strong> ${score}%</div>
      <div><strong>Latency:</strong> ${data.summary?.latencyMs || 0}ms</div>
    </div>
    ${cases}
  `;
}

async function loadRuns() {
  const output = $("#runsOutput");
  output.innerHTML = '<div class="run-item"><pre class="run-json">loading</pre></div>';
  try {
    const data = await api("/api/runs");
    const runs = data.runs || [];
    output.innerHTML = runs.length
      ? runs
          .map(
            (run) => `
              <div class="run-item">
                <div class="run-head">
                  <span>${escapeHtml(run.type)} · ${escapeHtml(run.title || run.id)}</span>
                  <span>${new Date(run.createdAt).toLocaleString()}</span>
                </div>
                <pre class="run-json">${escapeHtml(JSON.stringify(run, null, 2))}</pre>
              </div>
            `
          )
          .join("")
      : '<div class="run-item"><pre class="run-json">No runs yet.</pre></div>';
  } catch (error) {
    output.innerHTML = `<div class="run-item"><pre class="run-json">${escapeHtml(error.message)}</pre></div>`;
  }
}

async function clearRuns() {
  await api("/api/runs", { method: "DELETE" });
  await loadRuns();
  showToast("Runs cleared");
}

function bindEvents() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchPage(button.dataset.page));
  });

  $("#providerInput").addEventListener("change", () => {
    const provider = $("#providerInput").value;
    $("#baseUrlInput").value = PROVIDER_BASE_URLS[provider] || PROVIDER_BASE_URLS.openai;
    persistFormState();
  });

  ["baseUrlInput", "modelInput", "apiKeyInput"].forEach((id) => {
    $(`#${id}`).addEventListener("input", persistFormState);
  });

  ["temperatureInput", "topPInput", "maxTokensInput", "contextTokensInput"].forEach((id) => {
    $(`#${id}`).addEventListener("input", () => {
      state.params = getParamsFromForm();
      saveJson("miniHarness.params", state.params);
      syncParamsForm();
    });
  });

  $("#saveProfileBtn").addEventListener("click", () => {
    persistFormState();
    showToast("Profile saved");
  });
  $("#loadModelsBtn").addEventListener("click", loadModels);
  $("#quickHealthBtn").addEventListener("click", loadModels);
  $("#runPromptBtn").addEventListener("click", runPrompt);
  $("#clearPromptBtn").addEventListener("click", () => {
    $("#promptOutput").textContent = "";
    $("#promptMeta").textContent = "等待运行";
  });
  $("#loadPromptPresetBtn").addEventListener("click", () => {
    $("#systemPromptInput").value = PROMPT_TEMPLATE.system;
    $("#userPromptInput").value = PROMPT_TEMPLATE.user;
  });
  $("#runSwarmBtn").addEventListener("click", runSwarm);
  $("#resetAgentsBtn").addEventListener("click", () => {
    state.agents = DEFAULT_AGENTS.map((agent) => ({ ...agent }));
    saveJson("miniHarness.agents", state.agents);
    renderAgents();
  });
  $("#loadEvalPresetBtn").addEventListener("click", () => {
    $("#evalDatasetInput").value = JSON.stringify(EVAL_PRESET, null, 2);
  });
  $("#formatEvalBtn").addEventListener("click", () => {
    try {
      $("#evalDatasetInput").value = JSON.stringify(parseEvalDataset(), null, 2);
      showToast("Dataset formatted");
    } catch (error) {
      showToast(error.message);
    }
  });
  $("#runEvalBtn").addEventListener("click", runEval);
  $("#refreshRunsBtn").addEventListener("click", loadRuns);
  $("#clearRunsBtn").addEventListener("click", clearRuns);
}

function initDefaults() {
  syncProfileForm();
  syncParamsForm();
  renderAgents();
  $("#systemPromptInput").value = PROMPT_TEMPLATE.system;
  $("#userPromptInput").value = PROMPT_TEMPLATE.user;
  $("#swarmTaskInput").value =
    "设计一个本地 1B-3B 小模型调教流程：包括 prompt 模板、评测集、失败样例记录和多角色协作。输出可执行清单。";
  $("#swarmRoundsInput").value = 2;
  $("#evalSystemInput").value = "You are a precise local model. Return the shortest valid answer.";
  $("#evalDatasetInput").value = JSON.stringify(EVAL_PRESET, null, 2);
}

bindEvents();
initDefaults();
checkServer();
