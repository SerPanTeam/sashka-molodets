(() => {
  const REPO = "SerPanTeam/sashka-molodets";
  const API = `https://api.github.com/repos/${REPO}`;
  const REFRESH_MS = 30000;
  const configs = {
    "gemini-smoke-test.yml": {
      mode: "Проверка API: 1 голос + 1 картинка",
      stages: [
        ["① Checkout", "Подготовка runner", 5],
        ["② Setup Node", "Подготовка Node.js", 5],
        ["③ Verify GEMINI_API_KEY", "🔑 Проверка GEMINI_API_KEY", 10],
        ["④ Generate ONE German TTS", "🔊 Генерация 1 немецкого голоса", 30],
        ["⑤ Persist TTS proof immediately", "💾 Сохранение голоса в GitHub", 10],
        ["⑥ Generate ONE tomato image", "🍅 Генерация 1 картинки", 30],
        ["⑦ Persist image/log result", "🧾 Сохранение картинки/лога", 10]
      ].map(([name,label,weight]) => ({name,label,weight}))
    },
    "generate-priority-assets.yml": { mode: "Массовая генерация", stages: [] }
  };
  let panel, timer;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

  function ensurePanel() {
    if (panel) return panel;
    const parent = document.querySelector(".parent-panel");
    if (!parent) return null;
    panel = document.createElement("section");
    panel.className = "admin-ai-status";
    panel.innerHTML = `
      <div class="admin-ai-head"><div><div class="admin-ai-eyebrow">ADMIN · LIVE</div><h3>AI-генерация</h3></div><button id="adminAiRefresh" type="button" class="admin-ai-refresh">↻</button></div>
      <div id="adminAiMode" class="admin-ai-stage">—</div>
      <div class="admin-ai-state"><span id="adminAiDot" class="admin-ai-dot"></span><strong id="adminAiStatus">Загрузка…</strong></div>
      <div class="admin-ai-progress"><div id="adminAiProgressBar"></div></div>
      <div class="admin-ai-percent"><strong id="adminAiPercent">—</strong><span>прогресс текущего запуска</span></div>
      <div id="adminAiStage" class="admin-ai-stage">Получаю GitHub Actions…</div>
      <div id="adminAiSteps" class="admin-ai-steps"></div>
      <div class="admin-ai-metrics"><div><b id="adminAiAudioCount">—</b><span>аудио создано</span></div><div><b id="adminAiImageCount">—</b><span>картинок создано</span></div></div>
      <div class="admin-ai-meta"><span id="adminAiStarted">Старт: —</span><span id="adminAiUpdated">Проверено: —</span></div>
      <a id="adminAiLink" class="admin-ai-link" href="https://github.com/${REPO}/actions" target="_blank" rel="noopener">Открыть текущий GitHub Actions ↗</a>
      <div class="admin-ai-note">Реальный статус GitHub Actions. Обновление каждые 30 секунд. Каждый сохранённый smoke-файл сразу попадает в счётчик.</div>`;
    const actions = document.querySelector(".parent-actions");
    actions ? parent.insertBefore(panel, actions) : parent.append(panel);
    panel.querySelector("#adminAiRefresh")?.addEventListener("click", () => refresh(true));
    return panel;
  }

  async function gh(path) {
    const r = await fetch(`${API}${path}`, {cache:"no-store", headers:{Accept:"application/vnd.github+json"}});
    if (!r.ok) throw new Error(`GitHub API: ${r.status}`);
    return r.json();
  }
  const filename = run => String(run.path || "").split("/").pop();
  const cfg = run => configs[filename(run)] || {mode:run.name || "AI",stages:[]};
  function pickRun(runs) {
    const xs = runs.filter(r => configs[filename(r)]);
    return xs.find(r => ["in_progress","queued","waiting","pending"].includes(r.status)) || xs[0];
  }
  function statusText(run) {
    if (run.status === "in_progress") return "Генерация идёт";
    if (["queued","waiting","pending"].includes(run.status)) return "Ожидает runner";
    if (run.conclusion === "success") return "Завершено успешно";
    if (run.conclusion === "failure") return "Есть ошибка — смотри этап";
    if (run.conclusion === "cancelled") return "Остановлено";
    return run.status || run.conclusion || "Неизвестно";
  }
  function progress(steps, run, stages) {
    if (!stages.length) {
      const visible = steps.filter(s => !/^Set up job|^Complete job|^Post /.test(s.name || ""));
      if (!visible.length) return 0;
      const done = visible.filter(s => s.status === "completed").length;
      return Math.min(99, Math.round((done + (visible.some(s => s.status === "in_progress") ? .35 : 0)) / visible.length * 100));
    }
    let n=0;
    for (const s of stages) {
      const step=steps.find(x=>x.name===s.name);
      if (step?.status === "completed" && step.conclusion === "success") n += s.weight;
      else if (step?.status === "in_progress") n += s.weight*.35;
    }
    return Math.min(99,Math.round(n));
  }
  function renderSteps(steps, stages) {
    const list = stages.length ? stages.map(s => ({...s, step:steps.find(x=>x.name===s.name)})) : steps.filter(s=>!/^Set up job|^Complete job|^Post /.test(s.name||"")).map(s=>({name:s.name,label:s.name,step:s}));
    panel.querySelector("#adminAiSteps").innerHTML = list.map(x => {
      const s=x.step, state=s?.status === "completed" ? (s.conclusion === "success" ? "done" : "failed") : s?.status === "in_progress" ? "active" : "pending";
      const icon=state === "done" ? "✓" : state === "failed" ? "!" : state === "active" ? "●" : "○";
      return `<div class="admin-ai-step ${state}"><span>${icon}</span><span>${esc(x.label)}</span></div>`;
    }).join("");
  }
  const fmt = v => { try { return v ? new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit"}).format(new Date(v)) : "—"; } catch { return "—"; } };
  async function countDir(path,re) { try { const a=await gh(`/contents/${path}?ref=main&_=${Date.now()}`); return Array.isArray(a)?a.filter(x=>x.type==="file"&&re.test(x.name)).length:0; } catch { return 0; } }
  async function updateCounts() {
    const [a,i,sa,si]=await Promise.all([
      countDir("public/assets/generated/audio",/\.(wav|mp3|ogg|m4a)$/i),countDir("public/assets/generated/images",/\.(jpe?g|png|webp)$/i),
      countDir("public/assets/generated/smoke",/\.(wav|mp3|ogg|m4a)$/i),countDir("public/assets/generated/smoke",/\.(jpe?g|png|webp)$/i)
    ]);
    panel.querySelector("#adminAiAudioCount").textContent=a+sa;
    panel.querySelector("#adminAiImageCount").textContent=i+si;
  }
  async function refresh(manual=false) {
    ensurePanel(); if(!panel) return;
    if(manual) panel.querySelector("#adminAiStatus").textContent="Обновляю…";
    try {
      const data=await gh(`/actions/runs?per_page=30&_=${Date.now()}`), run=pickRun(data.workflow_runs||[]);
      if(!run) throw new Error("AI-запуск не найден");
      const c=cfg(run), jobs=await gh(`/actions/runs/${run.id}/jobs?per_page=20&_=${Date.now()}`), steps=(jobs.jobs||[])[0]?.steps||[];
      const p=progress(steps,run,c.stages), active=steps.find(s=>s.status==="in_progress"), failed=steps.find(s=>s.status==="completed"&&s.conclusion==="failure");
      panel.querySelector("#adminAiMode").textContent=c.mode;
      panel.querySelector("#adminAiStatus").textContent=statusText(run);
      panel.querySelector("#adminAiDot").className=`admin-ai-dot ${run.status==="in_progress"?"running":run.conclusion==="success"?"success":run.conclusion==="failure"?"failure":"waiting"}`;
      panel.querySelector("#adminAiProgressBar").style.width=`${p}%`; panel.querySelector("#adminAiPercent").textContent=`${p}%`;
      panel.querySelector("#adminAiStage").textContent=failed?`Ошибка: ${failed.name}`:active?`Сейчас: ${c.stages.find(s=>s.name===active.name)?.label||active.name}`:run.conclusion==="success"?"Все этапы завершены":"Нет активного этапа";
      panel.querySelector("#adminAiStarted").textContent=`Старт: ${fmt(run.run_started_at||run.created_at)}`;
      panel.querySelector("#adminAiUpdated").textContent=`Проверено: ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
      panel.querySelector("#adminAiLink").href=run.html_url||`https://github.com/${REPO}/actions`;
      renderSteps(steps,c.stages); await updateCounts();
    } catch(e) { panel.querySelector("#adminAiStatus").textContent=e?.message||"Не удалось получить статус"; panel.querySelector("#adminAiDot").className="admin-ai-dot failure"; }
  }
  function install() {
    const dialog=document.querySelector("#parentDialog"); if(!dialog) return; ensurePanel();
    const original=dialog.showModal?.bind(dialog); if(original) dialog.showModal=(...args)=>{const r=original(...args); clearInterval(timer); refresh(); timer=setInterval(()=>dialog.open&&refresh(),REFRESH_MS); return r;};
    dialog.addEventListener("close",()=>clearInterval(timer));
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",install); else install();
})();
