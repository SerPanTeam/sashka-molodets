(() => {
  const REPO = "SerPanTeam/sashka-molodets";
  const API = `https://api.github.com/repos/${REPO}`;
  const REFRESH_MS = 30000;

  const workflows = {
    ".github/workflows/gemini-smoke-test.yml": {
      mode: "Проверка API: 1 голос + 1 картинка",
      stages: [
        { name: "① Checkout", label: "Подготовка runner", weight: 5 },
        { name: "② Setup Node", label: "Подготовка Node.js", weight: 5 },
        { name: "③ Verify GEMINI_API_KEY", label: "🔑 Проверка GEMINI_API_KEY", weight: 10 },
        { name: "④ Generate ONE German TTS", label: "🔊 1 немецкий Gemini-голос", weight: 35 },
        { name: "⑤ Generate ONE tomato image", label: "🍅 1 Gemini-картинка", weight: 35 },
        { name: "⑥ Persist proof to main", label: "💾 Сохранение результата в GitHub", weight: 10 }
      ]
    },
    ".github/workflows/generate-priority-assets.yml": {
      mode: "Массовая генерация",
      stages: []
    }
  };

  let panel;
  let refreshTimer;

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
        <div><div class="admin-ai-eyebrow">ADMIN · LIVE</div><h3>AI-генерация</h3></div>
        <button id="adminAiRefresh" type="button" class="admin-ai-refresh" title="Обновить">↻</button>
      </div>
      <div id="adminAiMode" class="admin-ai-stage">—</div>
      <div class="admin-ai-state"><span id="adminAiDot" class="admin-ai-dot"></span><strong id="adminAiStatus">Загрузка…</strong></div>
      <div class="admin-ai-progress"><div id="adminAiProgressBar"></div></div>
      <div class="admin-ai-percent"><strong id="adminAiPercent">—</strong><span>прогресс текущего запуска</span></div>
      <div id="adminAiStage" class="admin-ai-stage">Получаю состояние GitHub Actions…</div>
      <div id="adminAiSteps" class="admin-ai-steps"></div>
      <div class="admin-ai-metrics">
        <div><b id="adminAiAudioCount">—</b><span>аудио создано</span></div>
        <div><b id="adminAiImageCount">—</b><span>картинок создано</span></div>
      </div>
      <div class="admin-ai-meta"><span id="adminAiStarted">Старт: —</span><span id="adminAiUpdated">Проверено: —</span></div>
      <a id="adminAiLink" class="admin-ai-link" href="https://github.com/${REPO}/actions" target="_blank" rel="noopener">Открыть текущий GitHub Actions ↗</a>
      <div class="admin-ai-note">Живой статус GitHub Actions. Обновление каждые 30 секунд. Успешные тестовые файлы учитываются сразу после сохранения в main.</div>
    `;
    if (actions) parent.insertBefore(panel, actions); else parent.append(panel);
    panel.querySelector("#adminAiRefresh")?.addEventListener("click", () => refresh(true));
    return panel;
  }

  async function github(path) {
    const response = await fetch(`${API}${path}`, { cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub API: ${response.status}`);
    return response.json();
  }

  function configFor(run) {
    return workflows[run.path] || workflows[Object.keys(workflows).find(p => String(run.path || "").endsWith(p.split('/').pop()))] || { mode: run.name || "AI", stages: [] };
  }

  function pickRun(runs) {
    const relevant = runs.filter(r => Object.keys(workflows).some(p => r.path === p || String(r.path || "").endsWith(p.split('/').pop())));
    return relevant.find(r => ["in_progress", "queued", "waiting", "pending"].includes(r.status)) || relevant[0];
  }

  function statusText(run) {
    if (run.status === "in_progress") return "Генерация идёт";
    if (["queued", "waiting", "pending"].includes(run.status)) return "Ожидает runner";
    if (run.conclusion === "success") return "Завершено успешно";
    if (run.conclusion === "cancelled") return "Остановлено";
    if (run.conclusion === "failure") return "Ошибка — смотри шаг ниже";
    return run.status || run.conclusion || "Неизвестно";
  }

  function progressFor(steps, run, stages) {
    if (run.status === "completed" && run.conclusion === "success") return 100;
    if (!stages.length) return 0;
    let value = 0;
    for (const stage of stages) {
      const step = steps.find(s => s.name === stage.name);
      if (step?.status === "completed" && step.conclusion === "success") value += stage.weight;
      else if (step?.status === "in_progress") value += stage.weight * 0.35;
    }
    return Math.min(99, Math.round(value));
  }

  function renderSteps(steps, stages) {
    const holder = panel.querySelector("#adminAiSteps");
    if (!stages.length) {
      const visible = steps.filter(s => !/^Set up job|^Complete job|^Post /.test(s.name || ""));
      holder.innerHTML = visible.map(step => {
        const state = step.status === "completed" ? (step.conclusion === "success" ? "done" : "failed") : step.status === "in_progress" ? "active" : "pending";
        const icon = state === "done" ? "✓" : state === "failed" ? "!" : state === "active" ? "●" : "○";
        return `<div class="admin-ai-step ${state}"><span>${icon}</span><span>${esc(step.name)}</span></div>`;
      }).join("");
      return;
    }
    holder.innerHTML = stages.map(stage => {
      const step = steps.find(s => s.name === stage.name);
      const state = step?.status === "completed" ? (step.conclusion === "success" ? "done" : "failed") : step?.status === "in_progress" ? "active" : "pending";
      const icon = state === "done" ? "✓" : state === "failed" ? "!" : state === "active" ? "●" : "○";
      return `<div class="admin-ai-step ${state}"><span>${icon}</span><span>${esc(stage.label)}</span></div>`;
    }).join("");
  }

  function formatTime(value) {
    if (!value) return "—";
    try { return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value)); }
    catch { return "—"; }
  }

  async function countCreated() {
    const countDir = async (path, test) => {
      try {
        const data = await github(`/contents/${path}?ref=main&_=${Date.now()}`);
        return Array.isArray(data) ? data.filter(x => x.type === "file" && test(x.name)).length : 0;
      } catch { return 0; }
    };
    const [audioProd, imageProd, smokeAudio, smokeImage] = await Promise.all([
      countDir("public/assets/generated/audio", n => /\.(wav|mp3|ogg|m4a)$/i.test(n)),
      countDir("public/assets/generated/images", n => /\.(jpe?g|png|webp)$/i.test(n)),
      countDir("public/assets/generated/smoke", n => /\.(wav|mp3|ogg|m4a)$/i.test(n)),
      countDir("public/assets/generated/smoke", n => /\.(jpe?g|png|webp)$/i.test(n))
    ]);
    panel.querySelector("#adminAiAudioCount").textContent = audioProd + smokeAudio;
    panel.querySelector("#adminAiImageCount").textContent = imageProd + smokeImage;
  }

  async function refresh(manual = false) {
    ensurePanel();
    if (!panel) return;
    const status = panel.querySelector("#adminAiStatus");
    const dot = panel.querySelector("#adminAiDot");
    if (manual) status.textContent = "Обновляю…";
    try {
      const runsData = await github(`/actions/runs?per_page=30&_=${Date.now()}`);
      const run = pickRun(runsData.workflow_runs || []);
      if (!run) throw new Error("Запуск AI пока не найден");
      const cfg = configFor(run);
      const jobsData = await github(`/actions/runs/${run.id}/jobs?per_page=20&_=${Date.now()}`);
      const job = (jobsData.jobs || [])[0];
      const steps = job?.steps || [];
      const progress = progressFor(steps, run, cfg.stages);
      const active = steps.find(s => s.status === "in_progress");
      const failed = steps.find(s => s.status === "completed" && s.conclusion === "failure");

      panel.querySelector("#adminAiMode").textContent = cfg.mode;
      status.textContent = statusText(run);
      dot.className = `admin-ai-dot ${run.status === "in_progress" ? "running" : run.conclusion === "success" ? "success" : run.conclusion === "failure" ? "failure" : "waiting"}`;
      panel.querySelector("#adminAiProgressBar").style.width = `${progress}%`;
      panel.querySelector("#adminAiPercent").textContent = `${progress}%`;
      panel.querySelector("#adminAiStage").textContent = failed ? `Ошибка: ${failed.name}` : active ? `Сейчас: ${cfg.stages.find(s => s.name === active.name)?.label || active.name}` : run.conclusion === "success" ? "Все шаги завершены" : "Ожидание следующего шага";
      panel.querySelector("#adminAiStarted").textContent = `Старт: ${formatTime(run.run_started_at || run.created_at)}`;
      panel.querySelector("#adminAiUpdated").textContent = `Проверено: ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
      panel.querySelector("#adminAiLink").href = run.html_url || `https://github.com/${REPO}/actions`;
      renderSteps(steps, cfg.stages);
      await countCreated();
    } catch (error) {
      status.textContent = error?.message || "Не удалось получить статус";
      dot.className = "admin-ai-dot failure";
      panel.querySelector("#adminAiStage").textContent = "Открой GitHub Actions по ссылке ниже.";
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
    if (original) dialog.showModal = (...args) => { const result = original(...args); startAutoRefresh(); return result; };
    dialog.addEventListener("close", () => clearInterval(refreshTimer));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
})();
