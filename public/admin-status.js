(() => {
  const REPO = "SerPanTeam/sashka-molodets";
  const API = `https://api.github.com/repos/${REPO}`;
  const WORKFLOW_PATH = ".github/workflows/generate-priority-assets.yml";
  const REFRESH_MS = 180000;

  const stages = [
    { name: "Validate source", label: "Проверка кода и контента", weight: 5, expected: 60 },
    { name: "Generate German-only Gemini voices", label: "🇩🇪 Немецкие Gemini-голоса", weight: 25, expected: 1200 },
    { name: "Generate missing bilingual Gemini voices", label: "🇩🇪+🇺🇦 Двуязычные Gemini-голоса", weight: 25, expected: 1200 },
    { name: "Commit generated voices", label: "Сохранение голосов в GitHub", weight: 5, expected: 90 },
    { name: "Generate reviewed learning images", label: "🎨 Картинки + AI-проверка", weight: 35, expected: 1200 },
    { name: "Commit generated images", label: "Сохранение картинок в GitHub", weight: 5, expected: 90 }
  ];

  let panel;
  let refreshTimer;
  let countsLoaded = false;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
  }

  function ensurePanel() {
    if (panel) return panel;
    const parent = document.querySelector(".parent-panel");
    const actions = document.querySelector(".parent-actions");
    if (!parent) return null;
    panel = document.createElement("section");
    panel.className = "admin-ai-status";
    panel.innerHTML = `
      <div class="admin-ai-head">
        <div>
          <div class="admin-ai-eyebrow">ADMIN · LIVE</div>
          <h3>AI-генерация</h3>
        </div>
        <button id="adminAiRefresh" type="button" class="admin-ai-refresh" title="Обновить">↻</button>
      </div>
      <div class="admin-ai-state"><span id="adminAiDot" class="admin-ai-dot"></span><strong id="adminAiStatus">Загрузка…</strong></div>
      <div class="admin-ai-progress"><div id="adminAiProgressBar"></div></div>
      <div class="admin-ai-percent"><strong id="adminAiPercent">—</strong><span>примерный общий прогресс</span></div>
      <div id="adminAiStage" class="admin-ai-stage">Получаю состояние GitHub Actions…</div>
      <div id="adminAiSteps" class="admin-ai-steps"></div>
      <div class="admin-ai-metrics">
        <div><b id="adminAiAudioCount">—</b><span>аудио в проде</span></div>
        <div><b id="adminAiImageCount">—</b><span>AI-картинок в проде</span></div>
      </div>
      <div class="admin-ai-meta">
        <span id="adminAiStarted">Старт: —</span>
        <span id="adminAiUpdated">Проверено: —</span>
      </div>
      <a id="adminAiLink" class="admin-ai-link" href="https://github.com/${REPO}/actions" target="_blank" rel="noopener">Открыть GitHub Actions ↗</a>
      <div class="admin-ai-note">Статус настоящий, из GitHub Actions. Процент внутри текущего длительного этапа оценочный. Автообновление каждые 3 минуты.</div>
    `;
    if (actions) parent.insertBefore(panel, actions); else parent.append(panel);
    panel.querySelector("#adminAiRefresh")?.addEventListener("click", () => refresh(true));
    return panel;
  }

  async function github(path) {
    const response = await fetch(`${API}${path}`, {
      cache: "no-store",
      headers: { "Accept": "application/vnd.github+json" }
    });
    if (!response.ok) {
      const remain = response.headers.get("x-ratelimit-remaining");
      throw new Error(response.status === 403 && remain === "0" ? "Лимит GitHub API. Попробуйте позже." : `GitHub API: ${response.status}`);
    }
    return response.json();
  }

  function statusText(run) {
    if (run.status === "in_progress") return "Генерация идёт";
    if (run.status === "queued" || run.status === "waiting" || run.status === "pending") return "Ожидает запуска";
    if (run.conclusion === "success") return "Генерация завершена";
    if (run.conclusion === "cancelled") return "Генерация отменена";
    if (run.conclusion === "failure") return "Есть ошибка генерации";
    return run.status || run.conclusion || "Неизвестно";
  }

  function estimate(step, stage) {
    if (!step) return 0;
    if (step.status === "completed") return step.conclusion === "success" ? 1 : 0;
    if (step.status !== "in_progress") return 0;
    const started = Date.parse(step.started_at || "") || Date.now();
    const elapsed = Math.max(0, (Date.now() - started) / 1000);
    return Math.min(.9, Math.max(.08, elapsed / stage.expected));
  }

  function computeProgress(steps, run) {
    if (run.status === "completed" && run.conclusion === "success") return 100;
    let total = 0;
    for (const stage of stages) {
      const step = steps.find(s => s.name === stage.name);
      total += stage.weight * estimate(step, stage);
    }
    return Math.max(0, Math.min(99, Math.round(total)));
  }

  function renderSteps(steps) {
    const holder = panel.querySelector("#adminAiSteps");
    holder.innerHTML = stages.map(stage => {
      const step = steps.find(s => s.name === stage.name);
      const status = step?.status === "completed"
        ? (step.conclusion === "success" ? "done" : "failed")
        : step?.status === "in_progress" ? "active" : "pending";
      const icon = status === "done" ? "✓" : status === "failed" ? "!" : status === "active" ? "●" : "○";
      return `<div class="admin-ai-step ${status}"><span>${icon}</span><span>${esc(stage.label)}</span></div>`;
    }).join("");
  }

  function formatTime(value) {
    if (!value) return "—";
    try { return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value)); }
    catch { return "—"; }
  }

  async function loadCounts() {
    if (countsLoaded) return;
    countsLoaded = true;
    const countDir = async (path, test) => {
      try {
        const data = await github(`/contents/${path}?ref=main`);
        return Array.isArray(data) ? data.filter(x => x.type === "file" && test(x.name)).length : 0;
      } catch { return null; }
    };
    const [audio, images] = await Promise.all([
      countDir("public/assets/generated/audio", n => /\.(wav|mp3|ogg|m4a)$/i.test(n)),
      countDir("public/assets/generated/images", n => /\.(jpe?g|png|webp)$/i.test(n))
    ]);
    panel.querySelector("#adminAiAudioCount").textContent = audio == null ? "?" : audio;
    panel.querySelector("#adminAiImageCount").textContent = images == null ? "?" : images;
  }

  async function refresh(manual = false) {
    ensurePanel();
    if (!panel) return;
    const status = panel.querySelector("#adminAiStatus");
    const dot = panel.querySelector("#adminAiDot");
    if (manual) status.textContent = "Обновляю…";
    try {
      const runsData = await github("/actions/runs?per_page=20");
      const run = (runsData.workflow_runs || []).find(r => r.path === WORKFLOW_PATH || String(r.path || "").endsWith("generate-priority-assets.yml"));
      if (!run) throw new Error("Запуск генерации пока не найден");
      const jobsData = await github(`/actions/runs/${run.id}/jobs?per_page=20`);
      const job = (jobsData.jobs || [])[0];
      const steps = job?.steps || [];
      const progress = computeProgress(steps, run);
      const active = steps.find(s => s.status === "in_progress") || steps.find(s => s.status === "queued");

      status.textContent = statusText(run);
      dot.className = `admin-ai-dot ${run.status === "in_progress" ? "running" : run.conclusion === "success" ? "success" : run.conclusion === "failure" ? "failure" : "waiting"}`;
      panel.querySelector("#adminAiProgressBar").style.width = `${progress}%`;
      panel.querySelector("#adminAiPercent").textContent = `${progress}%`;
      panel.querySelector("#adminAiStage").textContent = active ? `Сейчас: ${stages.find(s => s.name === active.name)?.label || active.name}` : (run.conclusion === "success" ? "Все этапы завершены" : "Нет активного этапа");
      panel.querySelector("#adminAiStarted").textContent = `Старт: ${formatTime(run.run_started_at || run.created_at)}`;
      panel.querySelector("#adminAiUpdated").textContent = `Проверено: ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
      panel.querySelector("#adminAiLink").href = run.html_url || `https://github.com/${REPO}/actions`;
      renderSteps(steps);
      loadCounts();
    } catch (error) {
      status.textContent = error?.message || "Не удалось получить статус";
      dot.className = "admin-ai-dot failure";
      panel.querySelector("#adminAiStage").textContent = "Можно открыть GitHub Actions по ссылке ниже.";
    }
  }

  function startAutoRefresh() {
    clearInterval(refreshTimer);
    refresh();
    refreshTimer = setInterval(() => {
      const dialog = document.querySelector("#parentDialog");
      if (dialog?.open) refresh();
    }, REFRESH_MS);
  }

  function install() {
    const dialog = document.querySelector("#parentDialog");
    if (!dialog) return;
    ensurePanel();
    const original = dialog.showModal?.bind(dialog);
    if (original) {
      dialog.showModal = (...args) => {
        const result = original(...args);
        startAutoRefresh();
        return result;
      };
    }
    dialog.addEventListener("close", () => clearInterval(refreshTimer));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
