const $ = (selector) => document.querySelector(selector);
const main = $("#main");
const toast = $("#toast");
const confettiLayer = $("#confetti");
const brand = $("#brandButton");
const sound = $("#soundButton");
const full = $("#fullscreenButton");
const dialog = $("#parentDialog");

const meta = {
  mixed: { icon: "✨", de: "Gemischt", ua: "Змішано" },
  vegetables: { icon: "🥕", de: "Gemüse", ua: "Овочі" },
  fruits: { icon: "🍎", de: "Obst", ua: "Фрукти" },
  animals: { icon: "🐶", de: "Tiere", ua: "Тварини" },
  colors: { icon: "🎨", de: "Farben", ua: "Кольори" },
  numbers: { icon: "🔢", de: "Zahlen", ua: "Числа" },
  transport: { icon: "🚂", de: "Verkehr", ua: "Транспорт" },
  shapes: { icon: "🔷", de: "Formen", ua: "Форми" },
  clothes: { icon: "👕", de: "Kleidung", ua: "Одяг" },
  body: { icon: "🖐️", de: "Körper", ua: "Тіло" },
  home: { icon: "🏠", de: "Zu Hause", ua: "Дім" }
};

const defaults = {
  childName: "Сашко",
  languageMode: "dual",
  difficulty: 3,
  showLabels: false,
  autoSpeak: true,
  categories: ["animals", "vegetables", "fruits"]
};

const load = (key, fallback) => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key)) }; }
  catch { return structuredClone(fallback); }
};

const state = {
  content: { items: [] },
  settings: load("sashka.settings", defaults),
  progress: load("sashka.progress", {}),
  route: "home",
  category: "mixed",
  round: 0,
  score: 0,
  current: null,
  wrong: 0,
  locked: false,
  timer: null,
  long: null,
  voiceAudio: null,
  audioContext: null
};

state.settings.languageMode = "dual";

const save = () => {
  state.settings.languageMode = "dual";
  localStorage.setItem("sashka.settings", JSON.stringify(state.settings));
  localStorage.setItem("sashka.progress", JSON.stringify(state.progress));
};

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[c]));

const shuffle = (array) => {
  const copy = [...array];
  for (let i = copy.length - 1; i; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

async function boot() {
  try { state.content = await fetch("/api/content").then((r) => r.json()); }
  catch { showToast("Контент не загрузился"); }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  setup();
  home();
}

function home() {
  state.route = "home";
  stopVoice();
  sound.style.visibility = "hidden";
  main.innerHTML = `<section class="home">
    <div class="hero">
      <div class="mascot">🌟</div>
      <h1>${esc(state.settings.childName)}, граємо?</h1>
      <p>Deutsch + українська · дивимось, слухаємо і знаходимо правильну картинку</p>
      <button class="big-play" id="play">▶ Змішано · Gemischt</button>
    </div>
    <div class="category-strip" id="strip"></div>
  </section>`;
  $("#play").onclick = () => start("mixed");

  const strip = $("#strip");
  const mixed = document.createElement("button");
  mixed.className = "category-button";
  mixed.innerHTML = `<span class="icon">${meta.mixed.icon}</span>${meta.mixed.de}<span class="small">${meta.mixed.ua} · ${state.settings.categories.length} категорії</span>`;
  mixed.onclick = () => start("mixed");
  strip.append(mixed);

  for (const category of state.settings.categories) {
    if (!meta[category]) continue;
    const count = state.content.items.filter((item) => item.category === category).length;
    const button = document.createElement("button");
    button.className = "category-button";
    button.innerHTML = `<span class="icon">${meta[category].icon}</span>${meta[category].de}<span class="small">${meta[category].ua} · ${count}</span>`;
    button.onclick = () => start(category);
    strip.append(button);
  }
}

function start(category) {
  state.route = "game";
  state.category = category;
  state.round = 0;
  state.score = 0;
  sound.style.visibility = "visible";
  main.innerHTML = `<section class="game">
    <div class="game-header">
      <button id="back" class="back-button">←</button>
      <div class="progress-wrap"><div id="progress" class="progress-bar"></div></div>
      <div id="stars" class="stars">☆ ☆ ☆</div>
    </div>
    <div id="question" class="question-card"></div>
    <div id="cards" class="cards"></div>
  </section>`;
  $("#back").onclick = home;
  next();
}

function next() {
  if (state.round >= 10) return finish();
  state.round++;
  state.wrong = 0;
  state.locked = false;
  state.current = build();
  $("#progress").style.width = `${(state.round - 1) * 10}%`;
  $("#stars").textContent = stars();
  renderQuestion();
  if (state.settings.autoSpeak) setTimeout(speakCurrent, 260);
}

function build() {
  const categories = state.category === "mixed" ? state.settings.categories : [state.category];
  const pool = state.content.items.filter((item) => categories.includes(item.category));
  if (!pool.length) throw Error("No content");
  const target = adaptive(pool);
  const count = [2, 4, 6, 6, 6][Math.max(0, Math.min(4, +state.settings.difficulty - 1))];
  const choices = shuffle([target, ...distractors(target, pool, count - 1)]);
  const attr = +state.settings.difficulty >= 5 && target.attributes?.color && !["colors", "numbers"].includes(target.category);
  return { target, choices, prompt: promptFor(target, attr) };
}

function adaptive(pool) {
  const weighted = pool.map((item) => {
    const progress = state.progress[item.id] || {};
    const recent = progress.lastSeen && Date.now() - progress.lastSeen < 6e4 ? .25 : 1;
    return { item, weight: Math.max(.08, (1.15 - (progress.mastery || 0)) * recent) };
  });
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let point = Math.random() * total;
  for (const entry of weighted) {
    point -= entry.weight;
    if (point <= 0) return entry.item;
  }
  return weighted.at(-1).item;
}

function distractors(target, pool, count) {
  let candidates = pool.filter((item) => item.id !== target.id);
  if (+state.settings.difficulty >= 4) {
    candidates = [
      ...shuffle(candidates.filter((item) => item.category === target.category)),
      ...shuffle(candidates.filter((item) => item.category !== target.category))
    ];
  } else candidates = shuffle(candidates);
  const out = [];
  const visual = new Set([target.emoji]);
  for (const item of candidates) {
    if (visual.has(item.emoji)) continue;
    out.push(item);
    visual.add(item.emoji);
    if (out.length === count) break;
  }
  return out;
}

const pluralGerman = new Set(["grapes", "cherries"]);
function article(item) { return item.article?.de || "die"; }
function deQuestion(item) {
  return pluralGerman.has(item.id) ? `Wo sind die ${item.labels.de}?` : `Wo ist ${article(item)} ${item.labels.de}?`;
}
function deThisIs(item) {
  return pluralGerman.has(item.id) ? `Das sind die ${item.labels.de}.` : `Das ist ${article(item)} ${item.labels.de}.`;
}
function promptFor(item, withColor) {
  if (!withColor) return { de: deQuestion(item), ua: `Де ${item.labels.ua}?` };
  return {
    de: `Wo ist ${article(item)} ${item.attributes.color.de}e ${item.labels.de}?`,
    ua: `Де ${item.attributes.color.ua} ${item.labels.ua}?`
  };
}

function renderQuestion() {
  const { prompt, choices } = state.current;
  $("#question").innerHTML = `<div class="question-primary">${esc(prompt.de)}</div><div class="question-secondary">${esc(prompt.ua)}</div>`;
  const cards = $("#cards");
  cards.innerHTML = "";
  for (const item of choices) {
    const button = document.createElement("button");
    button.className = "choice-card";
    button.dataset.id = item.id;
    const visual = item.generatedImage
      ? `<img class="choice-image" src="${esc(resolveAsset(item.generatedImage))}" alt="">`
      : `<div class="choice-emoji">${item.emoji}</div>`;
    const label = state.settings.showLabels
      ? `<div class="choice-label">${esc(item.labels.de)}</div><div class="choice-sub">${esc(item.labels.ua)}</div>`
      : "";
    button.innerHTML = visual + label;
    button.setAttribute("aria-label", `${item.labels.de} — ${item.labels.ua}`);
    button.onclick = () => choose(item, button);
    cards.append(button);
  }
}

function choose(item, button) {
  if (state.locked) return;
  stopVoice();
  const target = state.current.target;
  if (item.id === target.id) {
    state.locked = true;
    button.classList.add("correct");
    record(target.id, true);
    state.score++;
    const feedbackPair = good(target);
    feedback(feedbackPair, true);
    playApplause();
    confetti(34);
    $("#progress").style.width = `${state.round * 10}%`;
    $("#stars").textContent = stars();
    setTimeout(async () => {
      await playItemVoice(target, "success", feedbackPair);
      if (state.route === "game" && state.locked) setTimeout(next, 280);
    }, 420);
    return;
  }

  state.wrong++;
  record(target.id, false);
  button.classList.add("wrong");
  button.disabled = true;
  const feedbackPair = bad(item, target, state.wrong);
  feedback(feedbackPair, false);
  playItemVoice(target, "retry", feedbackPair);
  if (state.wrong >= 2) document.querySelector(`.choice-card[data-id="${CSS.escape(target.id)}"]`)?.classList.add("hint");
  if (state.wrong >= 3) {
    state.locked = true;
    document.querySelector(`.choice-card[data-id="${CSS.escape(target.id)}"]`)?.classList.add("correct");
    setTimeout(next, 2600);
  }
}

function good(target) {
  return {
    de: `Alexander, super! Gut gemacht! ${deThisIs(target)}`,
    ua: `Сашка, молодець! Це ${target.labels.ua}.`
  };
}

function bad(chosen, target, number) {
  if (number === 1) return {
    de: `Alexander, noch nicht. Das ist ${article(chosen)} ${chosen.labels.de}. Suche ${article(target)} ${target.labels.de}.`,
    ua: `Сашка, ще ні. Це ${chosen.labels.ua}. Знайди ${target.labels.ua}.`
  };
  if (target.attributes?.color) return {
    de: `Schau genau: ${target.labels.de} ist ${target.attributes.color.de}. Versuch es noch einmal.`,
    ua: `Подивись уважно: ${target.labels.ua} — ${target.attributes.color.ua}. Спробуй ще раз.`
  };
  return {
    de: `Schau genau hin. Suche ${article(target)} ${target.labels.de}.`,
    ua: `Подивись уважно. Знайди ${target.labels.ua}.`
  };
}

function record(id, ok) {
  const progress = state.progress[id] || { seen: 0, correct: 0, wrong: 0, mastery: 0 };
  progress.seen++;
  if (ok) {
    progress.correct++;
    progress.mastery = Math.min(1, progress.mastery + .14);
  } else {
    progress.wrong++;
    progress.mastery = Math.max(0, progress.mastery - .05);
  }
  progress.lastSeen = Date.now();
  state.progress[id] = progress;
  save();
}

function feedback(pair, isGood) {
  clearTimeout(state.timer);
  document.querySelector(".feedback-bubble")?.remove();
  const element = document.createElement("div");
  element.className = `feedback-bubble ${isGood ? "good" : ""}`;
  element.innerHTML = `<div>${esc(pair.de)}</div><div style="opacity:.78;font-size:.78em;margin-top:3px">${esc(pair.ua)}</div>`;
  document.body.append(element);
  state.timer = setTimeout(() => element.remove(), isGood ? 3200 : 2400);
}

function resolveAsset(source) {
  if (!source) return "";
  const normalized = source.startsWith("/") ? `.${source}` : source;
  return new URL(normalized, document.baseURI).href;
}

function stopVoice() {
  if (state.voiceAudio) {
    state.voiceAudio.pause();
    state.voiceAudio.currentTime = 0;
    state.voiceAudio = null;
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function playRecorded(source) {
  return new Promise((resolve) => {
    if (!source) return resolve(false);
    stopVoice();
    const audio = new Audio(resolveAsset(source));
    state.voiceAudio = audio;
    audio.preload = "auto";
    audio.volume = 1;
    audio.onended = () => { if (state.voiceAudio === audio) state.voiceAudio = null; resolve(true); };
    audio.onerror = () => { if (state.voiceAudio === audio) state.voiceAudio = null; resolve(false); };
    audio.play().catch(() => resolve(false));
  });
}

async function playItemVoice(item, kind, fallbackPair) {
  const source = item?.generatedAudio?.[kind];
  if (source && await playRecorded(source)) return true;
  await speakPair(fallbackPair);
  return false;
}

function speakCurrent() {
  if (!state.current) return Promise.resolve();
  return playItemVoice(state.current.target, "question", state.current.prompt);
}

function speakPair(pair) {
  return speakSeq([
    { text: pair.de, lang: "de-DE" },
    { text: pair.ua, lang: "uk-UA" }
  ]);
}

function speakSeq(parts) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    speechSynthesis.cancel();
    let index = 0;
    const nextPart = () => {
      if (index >= parts.length) return resolve();
      const part = parts[index++];
      const utterance = new SpeechSynthesisUtterance(part.text);
      utterance.lang = part.lang;
      utterance.rate = .88;
      utterance.pitch = 1.03;
      utterance.onend = nextPart;
      utterance.onerror = nextPart;
      speechSynthesis.speak(utterance);
    };
    nextPart();
  });
}

function playApplause() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = state.audioContext || (state.audioContext = new AudioContextClass());
    ctx.resume?.().catch(() => {});
    const master = ctx.createGain();
    master.gain.value = .58;
    master.connect(ctx.destination);
    const start = ctx.currentTime + .01;
    for (let i = 0; i < 22; i++) {
      const duration = .07 + Math.random() * .035;
      const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < length; j++) {
        const decay = 1 - j / length;
        data[j] = (Math.random() * 2 - 1) * decay * decay;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1050 + Math.random() * 1250;
      filter.Q.value = .65 + Math.random() * .8;
      const gain = ctx.createGain();
      const t = start + i * .038 + Math.random() * .12;
      gain.gain.setValueAtTime(.0001, t);
      gain.gain.exponentialRampToValueAtTime(.24 + Math.random() * .2, t + .006);
      gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(t);
      source.stop(t + duration + .01);
    }
    setTimeout(() => master.disconnect(), 1500);
  } catch {}
}

function stars() {
  const ratio = state.round ? state.score / state.round : 0;
  return ratio >= .85 ? "★ ★ ★" : ratio >= .6 ? "★ ★ ☆" : state.score ? "★ ☆ ☆" : "☆ ☆ ☆";
}

function finish() {
  stopVoice();
  sound.style.visibility = "hidden";
  const result = state.score >= 9 ? "★★★" : state.score >= 7 ? "★★☆" : state.score >= 4 ? "★☆☆" : "☆☆☆";
  main.innerHTML = `<section class="home"><div class="hero"><div class="mascot">🏆</div><h1>${result}</h1><p><strong>${esc(state.settings.childName)}</strong>, ${state.score} / 10 · Sehr gut! · Молодець!</p><button class="big-play" id="again">Ще раз · Nochmal</button></div></section>`;
  $("#again").onclick = () => start(state.category);
  confetti(36);
}

function setup() {
  const startLongPress = () => {
    clearTimeout(state.long);
    state.long = setTimeout(openSettings, 1700);
  };
  const cancelLongPress = () => clearTimeout(state.long);
  brand.onpointerdown = startLongPress;
  brand.onpointerup = cancelLongPress;
  brand.onpointercancel = cancelLongPress;
  brand.onpointerleave = cancelLongPress;
  sound.onclick = speakCurrent;
  full.onclick = toggleFullscreen;
  $("#saveSettingsButton").onclick = saveSettings;
  $("#resetProgressButton").onclick = () => {
    if (confirm("Сбросить весь прогресс ребёнка?")) {
      state.progress = {};
      save();
      showToast("Прогресс сброшен");
    }
  };
}

function openSettings() {
  $("#childNameInput").value = state.settings.childName;
  $("#languageModeInput").value = "dual";
  $("#difficultyInput").value = state.settings.difficulty;
  $("#labelsInput").checked = state.settings.showLabels;
  $("#autoSpeakInput").checked = state.settings.autoSpeak;
  const holder = $("#categorySettings");
  holder.innerHTML = "";
  for (const [key, info] of Object.entries(meta)) {
    if (key === "mixed") continue;
    const count = state.content.items.filter((item) => item.category === key).length;
    if (!count) continue;
    const label = document.createElement("label");
    label.className = "cat-chip";
    label.innerHTML = `<input type="checkbox" value="${key}" ${state.settings.categories.includes(key) ? "checked" : ""}><span>${info.icon} ${info.de} · ${info.ua}</span>`;
    holder.append(label);
  }
  dialog.showModal();
}

function saveSettings() {
  const categories = [...document.querySelectorAll("#categorySettings input:checked")].map((input) => input.value);
  state.settings = {
    ...state.settings,
    childName: $("#childNameInput").value.trim() || "Сашко",
    languageMode: "dual",
    difficulty: +$("#difficultyInput").value,
    showLabels: $("#labelsInput").checked,
    autoSpeak: $("#autoSpeakInput").checked,
    categories: categories.length ? categories : defaults.categories
  };
  save();
  dialog.close();
  showToast("Сохранено");
  state.route === "home" ? home() : renderQuestion();
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      if ("wakeLock" in navigator) navigator.wakeLock.request("screen").catch(() => {});
    } else await document.exitFullscreen();
  } catch { showToast("Полноэкранный режим недоступен"); }
}

function confetti(count = 22) {
  const colors = ["#ffce54", "#57c7ff", "#7f6cff", "#54d985", "#ff7e8b"];
  for (let i = 0; i < count; i++) {
    const element = document.createElement("i");
    element.className = "confetti";
    element.style.left = `${10 + Math.random() * 80}%`;
    element.style.top = `${-10 - Math.random() * 30}px`;
    element.style.background = colors[i % colors.length];
    element.style.setProperty("--drift", `${-120 + Math.random() * 240}px`);
    element.style.animationDelay = `${Math.random() * 180}ms`;
    confettiLayer.append(element);
    setTimeout(() => element.remove(), 1300);
  }
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove("show"), 1500);
}

boot();
