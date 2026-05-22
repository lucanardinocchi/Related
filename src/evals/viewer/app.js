(function () {
  "use strict";

  const RUNS_INDEX_URL = "/runs/index.json";
  const REVIEW_STORAGE_PREFIX = "ci-eval-review:";

  /** @type {EvalRunManifest | null} */
  let currentManifest = null;
  /** @type {string | null} */
  let currentRunPath = null;
  /** @type {Map<string, EvalTrace>} */
  const traceCache = new Map();
  /** @type {string | null} */
  let selectedCaseId = null;
  /** @type {Map<string, File>} */
  let localFiles = new Map();

  // DOM refs
  const runSelect = document.getElementById("run-select");
  const loadRunBtn = document.getElementById("load-run-btn");
  const folderInput = document.getElementById("folder-input");
  const manifestInput = document.getElementById("manifest-input");
  const themeToggle = document.getElementById("theme-toggle");
  const emptyState = document.getElementById("empty-state");
  const app = document.getElementById("app");
  const runSummary = document.getElementById("run-summary");
  const caseList = document.getElementById("case-list");
  const traceEmpty = document.getElementById("trace-empty");
  const traceContent = document.getElementById("trace-content");

  init();

  function init() {
    initTheme();
    loadRunsIndex();
    bindEvents();
  }

  function bindEvents() {
    loadRunBtn.addEventListener("click", onLoadRunClick);
    runSelect.addEventListener("change", () => {
      loadRunBtn.disabled = !runSelect.value;
    });
    folderInput.addEventListener("change", onFolderSelected);
    manifestInput.addEventListener("change", onManifestSelected);
    themeToggle.addEventListener("click", toggleTheme);
  }

  // ── Theme ──────────────────────────────────────────────

  function initTheme() {
    const saved = localStorage.getItem("ci-eval-viewer-theme");
    if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
    localStorage.setItem("ci-eval-viewer-theme", isDark ? "light" : "dark");
  }

  // ── Run loading ──────────────────────────────────────

  async function loadRunsIndex() {
    try {
      const res = await fetch(RUNS_INDEX_URL);
      if (!res.ok) throw new Error("not found");
      /** @type {Array<{ runId: string; path: string; startedAt: string; caseCount: number }>} */
      const index = await res.json();
      populateRunDropdown(index);
    } catch {
      runSelect.innerHTML = '<option value="">No runs/index.json found</option>';
      runSelect.disabled = true;
      loadRunBtn.disabled = true;
    }
  }

  /** @param {Array<{ runId: string; path: string; startedAt: string; caseCount: number }>} index */
  function populateRunDropdown(index) {
    runSelect.innerHTML = '<option value="">Select a run…</option>';
    for (const entry of index) {
      const opt = document.createElement("option");
      opt.value = entry.path || `/runs/${entry.runId}`;
      const date = entry.startedAt ? formatDate(entry.startedAt) : "";
      opt.textContent = `${entry.runId} (${entry.caseCount} cases${date ? ", " + date : ""})`;
      runSelect.appendChild(opt);
    }
    runSelect.disabled = false;
  }

  async function onLoadRunClick() {
    const path = runSelect.value;
    if (!path) return;
    await loadRunFromPath(path);
  }

  async function loadRunFromPath(basePath) {
    resetState();
    currentRunPath = basePath.replace(/\/$/, "");
    try {
      const res = await fetch(`${currentRunPath}/manifest.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      currentManifest = await res.json();
      showRun();
    } catch (err) {
      showStatus(emptyState, `Failed to load manifest: ${err.message}`, "error");
    }
  }

  /** @param {Event} e */
  async function onFolderSelected(e) {
    const files = /** @type {FileList} */ (e.target.files);
    if (!files || files.length === 0) return;

    resetState();
    localFiles.clear();

    /** @type {File | null} */
    let manifestFile = null;

    for (const file of files) {
      const name = file.webkitRelativePath || file.name;
      localFiles.set(name, file);
      if (name.endsWith("manifest.json")) {
        manifestFile = file;
      }
    }

    if (!manifestFile) {
      showStatus(emptyState, "No manifest.json found in selected folder.", "error");
      return;
    }

    try {
      const text = await readFileAsText(manifestFile);
      currentManifest = JSON.parse(text);
      currentRunPath = null;
      showRun();
    } catch (err) {
      showStatus(emptyState, `Failed to parse manifest: ${err.message}`, "error");
    }

    folderInput.value = "";
  }

  /** @param {Event} e */
  async function onManifestSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    resetState();
    localFiles.clear();
    localFiles.set(file.name, file);

    try {
      const text = await readFileAsText(file);
      currentManifest = JSON.parse(text);
      currentRunPath = null;
      showRun();
    } catch (err) {
      showStatus(emptyState, `Failed to parse manifest: ${err.message}`, "error");
    }

    manifestInput.value = "";
  }

  function resetState() {
    currentManifest = null;
    currentRunPath = null;
    traceCache.clear();
    selectedCaseId = null;
    localFiles.clear();
    clearStatus(emptyState);
  }

  // ── Run display ──────────────────────────────────────

  function showRun() {
    if (!currentManifest) return;
    emptyState.classList.add("hidden");
    app.classList.remove("hidden");
    renderRunSummary();
    renderCaseList();
    traceEmpty.classList.remove("hidden");
    traceContent.classList.add("hidden");
  }

  function renderRunSummary() {
    const m = currentManifest;
    runSummary.innerHTML = `
      <h2>Run Summary</h2>
      <div class="meta-grid">
        <span class="meta-label">Run ID</span>
        <span class="meta-value">${esc(m.runId)}</span>
        <span class="meta-label">Model</span>
        <span class="meta-value">${esc(m.model || "—")}</span>
        <span class="meta-label">Git SHA</span>
        <span class="meta-value">${esc(m.gitSha || "—")}</span>
        <span class="meta-label">Started</span>
        <span class="meta-value">${esc(formatDate(m.startedAt))}</span>
        <span class="meta-label">Finished</span>
        <span class="meta-value">${esc(formatDate(m.finishedAt))}</span>
        <span class="meta-label">Cases</span>
        <span class="meta-value">${(m.cases || []).length}</span>
      </div>
    `;
  }

  function renderCaseList() {
    caseList.innerHTML = "";
    const cases = currentManifest?.cases || [];

    for (const c of cases) {
      const li = document.createElement("li");
      li.className = "case-item";
      li.dataset.caseId = c.id;

      const review = getReview(currentManifest.runId, c.id);
      if (review?.verdict) li.classList.add(`review-${review.verdict}`);

      li.innerHTML = `
        <div class="case-id">${esc(c.id)}</div>
        ${c.description ? `<div class="case-desc">${esc(c.description)}</div>` : ""}
        <div class="case-meta">
          ${renderTags(c.tags)}
          <span class="latency">${formatLatency(c.latencyMs)}</span>
        </div>
      `;

      li.addEventListener("click", () => selectCase(c.id));
      caseList.appendChild(li);
    }
  }

  async function selectCase(caseId) {
    selectedCaseId = caseId;
    highlightCase(caseId);

    traceEmpty.classList.add("hidden");
    traceContent.classList.remove("hidden");
    traceContent.innerHTML = '<p style="color:var(--text-muted)">Loading trace…</p>';

    try {
      const trace = await loadTrace(caseId);
      renderTrace(trace);
    } catch (err) {
      traceContent.innerHTML = `<div class="status-msg error">Failed to load trace: ${esc(err.message)}</div>`;
    }
  }

  function highlightCase(caseId) {
    for (const li of caseList.querySelectorAll(".case-item")) {
      li.classList.toggle("active", li.dataset.caseId === caseId);
    }
  }

  // ── Trace loading ──────────────────────────────────────

  async function loadTrace(caseId) {
    if (traceCache.has(caseId)) return traceCache.get(caseId);

    const caseEntry = currentManifest.cases.find((c) => c.id === caseId);
    if (!caseEntry) throw new Error(`Case ${caseId} not in manifest`);

    let trace;

    if (currentRunPath) {
      const url = `${currentRunPath}/${caseEntry.traceFile}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} loading ${caseEntry.traceFile}`);
      trace = await res.json();
    } else {
      trace = await loadTraceFromLocalFiles(caseEntry.traceFile);
    }

    traceCache.set(caseId, trace);
    return trace;
  }

  /** @param {string} traceFile */
  async function loadTraceFromLocalFiles(traceFile) {
    const basename = traceFile.split("/").pop();

    for (const [path, file] of localFiles) {
      if (path === traceFile || path.endsWith("/" + traceFile) || path.endsWith("/" + basename) || file.name === basename) {
        const text = await readFileAsText(file);
        return JSON.parse(text);
      }
    }

    throw new Error(`Trace file "${traceFile}" not found in loaded folder. Load the run folder containing trace files.`);
  }

  // ── Trace rendering ──────────────────────────────────────

  /** @param {EvalTrace} trace */
  function renderTrace(trace) {
    const input = trace.input || {};
    const history = input.history || [];
    const rounds = trace.rounds || [];
    const outputText = trace.output?.text ?? "";

    traceContent.innerHTML = "";

    // Header
    const header = el("div", "trace-header");
    header.innerHTML = `
      <h2>${esc(trace.caseId)}</h2>
      ${trace.description ? `<p>${esc(trace.description)}</p>` : ""}
      ${renderTags(trace.tags)}
      ${trace.notes ? `<div class="trace-notes">${esc(trace.notes)}</div>` : ""}
    `;
    traceContent.appendChild(header);

    // Input history
    if (history.length > 0) {
      traceContent.appendChild(renderSection("Input History", renderChatHistory(history)));
    }

    // System prompt
    if (input.systemPromptBase) {
      traceContent.appendChild(renderCollapsibleSection("System Prompt", input.systemPromptBase));
    }

    // Context block
    if (input.contextBlock) {
      traceContent.appendChild(renderCollapsibleSection("Context Block", input.contextBlock));
    }

    // Rounds timeline
    if (rounds.length > 0) {
      traceContent.appendChild(renderSection("Rounds", renderRoundsTimeline(rounds)));
    }

    // Final output
    traceContent.appendChild(renderSection("Final Output", `<div class="final-output">${esc(outputText)}</div>`));

    // Human review
    traceContent.appendChild(renderReviewSection(trace.runId || currentManifest.runId, trace.caseId));
  }

  /** @param {Array<{ role: string; content: string }>} messages */
  function renderChatHistory(messages) {
    const container = el("div", "chat-history");
    for (const msg of messages) {
      const role = (msg.role || "unknown").toLowerCase();
      const bubble = el("div", `chat-bubble ${role}`);
      bubble.innerHTML = `
        <div class="chat-role">${esc(msg.role || "unknown")}</div>
        ${esc(msg.content || "")}
      `;
      container.appendChild(bubble);
    }
    return container;
  }

  /** @param {EvalTrace["rounds"]} rounds */
  function renderRoundsTimeline(rounds) {
    const timeline = el("div", "rounds-timeline");

    for (const round of rounds) {
      const card = el("div", "round-card");

      const header = el("div", "round-header");
      header.innerHTML = `
        <span class="round-number">Round ${round.round ?? "?"}</span>
        ${round.latencyMs != null ? `<span class="round-latency">${formatLatency(round.latencyMs)}</span>` : ""}
        ${round.usage ? `<span class="round-usage">${formatUsage(round.usage)}</span>` : ""}
      `;
      card.appendChild(header);

      const body = el("div", "round-body");

      // Tool calls
      const toolUses = round.toolUses || [];
      if (toolUses.length > 0) {
        const toolsContainer = el("div", "tool-calls");
        for (const tool of toolUses) {
          toolsContainer.appendChild(renderToolCall(tool, round.toolResults));
        }
        body.appendChild(toolsContainer);
      }

      // Orphan tool results (no matching tool use)
      const toolResults = round.toolResults || [];
      const usedIds = new Set(toolUses.map((t) => t.id));
      for (const result of toolResults) {
        if (!usedIds.has(result.id)) {
          body.appendChild(renderToolResult(result, null));
        }
      }

      // Assistant text
      if (round.text) {
        const textBlock = el("div");
        textBlock.innerHTML = `<div class="round-text-label">Assistant</div>`;
        const textEl = el("div", "round-text");
        textEl.textContent = round.text;
        textBlock.appendChild(textEl);
        body.appendChild(textBlock);
      }

      card.appendChild(body);
      timeline.appendChild(card);
    }

    return timeline;
  }

  /** @param {{ id: string; name: string; input: object }} tool */
  function renderToolCall(tool, toolResults) {
    const call = el("div", "tool-call");

    const header = el("div", "tool-call-header");
    header.innerHTML = `
      <span class="tool-chip">${esc(tool.name)}</span>
      <span class="tool-id">${esc(tool.id)}</span>
    `;
    call.appendChild(header);

    const inputEl = el("pre", "tool-input json-block");
    inputEl.textContent = formatJson(tool.input);
    call.appendChild(inputEl);

    const result = (toolResults || []).find((r) => r.id === tool.id);
    if (result) {
      call.appendChild(renderToolResultBody(result));
    }

    return call;
  }

  /** @param {{ id: string; result: unknown; error?: string; latencyMs?: number }} result */
  function renderToolResult(result, name) {
    const wrapper = el("div", "tool-call");
    if (name) {
      const header = el("div", "tool-call-header");
      header.innerHTML = `<span class="tool-chip">${esc(name)}</span><span class="tool-id">${esc(result.id)}</span>`;
      wrapper.appendChild(header);
    }
    wrapper.appendChild(renderToolResultBody(result));
    return wrapper;
  }

  /** @param {{ id: string; result: unknown; error?: string; latencyMs?: number }} result */
  function renderToolResultBody(result) {
    const label = el("div", "tool-result-label");
    label.textContent = result.error
      ? `Error${result.latencyMs != null ? " · " + formatLatency(result.latencyMs) : ""}`
      : `Result${result.latencyMs != null ? " · " + formatLatency(result.latencyMs) : ""}`;

    const body = el("details", "collapsible");
    body.open = false;
    const summary = el("summary");
    summary.textContent = result.error ? "Error details" : "Result JSON";
    body.appendChild(summary);

    const pre = el("pre", `tool-result json-block${result.error ? " error" : ""}`);
    pre.textContent = result.error || formatJson(result.result);
    const collapsibleBody = el("div", "collapsible-body");
    collapsibleBody.appendChild(pre);
    body.appendChild(collapsibleBody);

    const container = el("div");
    container.appendChild(label);
    container.appendChild(body);
    return container;
  }

  // ── Human review ──────────────────────────────────────

  /** @param {string} runId @param {string} caseId */
  function renderReviewSection(runId, caseId) {
    const section = el("div", "panel-section");
    section.innerHTML = `<h3>Human Review</h3>`;

    const reviewBox = el("div", "review-section");
    const review = getReview(runId, caseId);

    const buttons = el("div", "review-buttons");
    for (const verdict of ["pass", "fail", "skip"]) {
      const btn = el("button", `review-btn ${verdict}${review?.verdict === verdict ? " active" : ""}`);
      btn.textContent = verdict.charAt(0).toUpperCase() + verdict.slice(1);
      btn.addEventListener("click", () => {
        saveReview(runId, caseId, verdict, textarea.value);
        for (const b of buttons.querySelectorAll(".review-btn")) b.classList.remove("active");
        btn.classList.add("active");
        updateCaseReviewIndicator(caseId, verdict);
        savedHint.textContent = "Saved locally";
      });
      buttons.appendChild(btn);
    }
    reviewBox.appendChild(buttons);

    const textarea = el("textarea", "review-notes");
    textarea.placeholder = "Review notes…";
    textarea.value = review?.notes || "";
    textarea.addEventListener(
      "input",
      debounce(() => {
        const activeVerdict = buttons.querySelector(".review-btn.active");
        saveReview(runId, caseId, activeVerdict ? activeVerdict.textContent.toLowerCase() : review?.verdict || null, textarea.value);
        savedHint.textContent = "Saved locally";
      }, 400)
    );
    reviewBox.appendChild(textarea);

    const savedHint = el("div", "review-saved");
    savedHint.textContent = review ? "Loaded from local storage" : "";
    reviewBox.appendChild(savedHint);

    section.appendChild(reviewBox);
    return section;
  }

  function getReviewKey(runId, caseId) {
    return REVIEW_STORAGE_PREFIX + runId + ":" + caseId;
  }

  function getReview(runId, caseId) {
    try {
      const raw = localStorage.getItem(getReviewKey(runId, caseId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveReview(runId, caseId, verdict, notes) {
    const data = { verdict: verdict || null, notes: notes || "", updatedAt: new Date().toISOString() };
    localStorage.setItem(getReviewKey(runId, caseId), JSON.stringify(data));
  }

  function updateCaseReviewIndicator(caseId, verdict) {
    for (const li of caseList.querySelectorAll(".case-item")) {
      if (li.dataset.caseId !== caseId) continue;
      li.classList.remove("review-pass", "review-fail", "review-skip");
      if (verdict) li.classList.add(`review-${verdict}`);
    }
  }

  // ── Helpers ──────────────────────────────────────────

  function renderSection(title, content) {
    const section = el("div", "panel-section");
    section.innerHTML = `<h3>${esc(title)}</h3>`;
    if (typeof content === "string") {
      const wrapper = el("div");
      wrapper.innerHTML = content;
      section.appendChild(wrapper);
    } else {
      section.appendChild(content);
    }
    return section;
  }

  function renderCollapsibleSection(title, text) {
    const section = el("div", "panel-section");
    section.innerHTML = `<h3>${esc(title)}</h3>`;
    const details = el("details", "collapsible");
    const summary = el("summary");
    const lines = (text || "").split("\n").length;
    summary.textContent = `Show content (${lines} line${lines === 1 ? "" : "s"})`;
    details.appendChild(summary);
    const body = el("div", "collapsible-body");
    body.textContent = text;
    details.appendChild(body);
    section.appendChild(details);
    return section;
  }

  /** @param {string[] | undefined} tags */
  function renderTags(tags) {
    if (!tags || tags.length === 0) return "";
    return tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(" ");
  }

  function formatJson(value) {
    if (value === undefined || value === null) return "null";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function formatLatency(ms) {
    if (ms == null || isNaN(ms)) return "—";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  function formatUsage(usage) {
    const parts = [];
    if (usage.input_tokens != null) parts.push(`in: ${usage.input_tokens}`);
    if (usage.output_tokens != null) parts.push(`out: ${usage.output_tokens}`);
    return parts.join(" · ");
  }

  function esc(str) {
    if (str == null) return "";
    const d = document.createElement("div");
    d.textContent = String(str);
    return d.innerHTML;
  }

  /** @param {string} tag @param {string} [className] */
  function el(tag, className) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  /** @param {File} file */
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(/** @type {string} */ (reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  /** @param {HTMLElement} container @param {string} msg @param {"error"|"info"} type */
  function showStatus(container, msg, type) {
    clearStatus(container);
    const div = el("div", `status-msg ${type}`);
    div.textContent = msg;
    container.appendChild(div);
  }

  function clearStatus(container) {
    for (const el of container.querySelectorAll(".status-msg")) el.remove();
  }

  function debounce(fn, ms) {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }
})();
