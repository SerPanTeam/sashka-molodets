# Sashka Molodets

**A bilingual German–Ukrainian learning PWA for children, built as a production-ready portfolio project.**

[Live demo](https://serpanteam.github.io/sashka-molodets/) · [GitHub repository](https://github.com/SerPanTeam/sashka-molodets)

## Why this project exists

The goal was simple: create a child-friendly learning game that works reliably on a tablet, keeps the interface focused, and helps a child connect spoken German with familiar Ukrainian support.

Instead of putting a live AI model between the child and the app, the production runtime uses **pre-generated and validated media**. That keeps playback fast, predictable, privacy-friendly and suitable for offline/PWA use.

## What it demonstrates

This repository is more than a vocabulary game. It is a compact product case study covering:

- responsive front-end architecture for phone, tablet and desktop;
- touch-first UX designed for children;
- Progressive Web App behaviour and service-worker caching;
- bilingual German → Ukrainian audio playback;
- adaptive repetition based on local progress;
- pre-generated visual and voice assets;
- real object / animal / transport sound effects;
- production validation for content completeness;
- GitHub Actions deployment to GitHub Pages;
- browser smoke tests, including real audio playback;
- privacy-conscious architecture with no child account required.

## Product behaviour

A round presents a spoken and written prompt such as:

> Wo ist die Tomate?  
> Де помідор?

The child chooses one of several illustrated cards. Correct answers play feedback in a strict sequence:

**applause → object sound when available → German praise → Ukrainian praise**

Wrong answers keep the current question active and provide contextual hints rather than simply moving on.

## Current learning content

The production build contains the core learning set used by the app today, including:

- animals;
- vegetables;
- fruit;
- household objects;
- hygiene;
- transport;
- numbers 1–4;
- coloured clothing.

The content model is data-driven, so categories and cards can be extended without rewriting the game engine.

## Responsive UX

The interface is designed to behave consistently across common device sizes. CI currently verifies the public UI at representative phone, tablet and desktop viewports:

- 390 × 844;
- 768 × 1024;
- 1366 × 768.

The game screen keeps all answer cards visible without scrolling. Artwork uses `object-fit: contain` so the main subject is not cropped.

## Architecture

```text
content/*.json
     │
     ▼
pages-shim / static content loader
     │
     ▼
   app.js
     │
     ├── local progress + adaptive repetition
     ├── bilingual recorded voice playback
     ├── real SFX / applause
     └── responsive child UI

GitHub Actions
     │
     ├── production content validation
     ├── local browser smoke tests
     ├── real browser audio smoke test
     └── GitHub Pages deployment + production smoke test
```

The production GitHub Pages build is static and does **not** require API credentials.

## Privacy and safety by design

- No child account is required.
- Progress and preferences are stored locally in the browser.
- The production app does not send a child's answers to a live AI service.
- Secrets and generation logs are intentionally excluded from the public release.
- Cloud content-generation workflows are not published as runnable GitHub Actions jobs.

See [SECURITY.md](SECURITY.md) for the public-release rules.

## Run locally

A recent Node.js version is recommended.

```bash
node server.mjs
```

Then open:

```text
http://localhost:4173
```

The published app itself is static and can also be served directly from `public/` together with the `content/` directory.

## Production quality checks

The Pages workflow verifies, among other things:

- JavaScript syntax;
- production content completeness;
- generated image and voice files;
- transport and applause recordings;
- rendering in multiple viewport sizes;
- successful browser audio playback;
- the deployed GitHub Pages build after publication.

This is important for the project because mobile audio, caching and tablet browser behaviour were treated as production concerns rather than demo-only details.

## Technology

**JavaScript · HTML · CSS · PWA · Service Worker · Web Audio / HTMLMediaElement · JSON content architecture · GitHub Actions · GitHub Pages**

Content-authoring tools can optionally use cloud AI services during development, but those credentials are not required by the public production app.

## Background

This started as a practical learning tool for a real child and gradually became a production-focused engineering exercise: content pipelines, multilingual audio, cache invalidation, touch behaviour, CI validation and cross-device testing all had to work together.

That constraint is what makes the project useful as a portfolio piece: it solves a small real-world problem end to end instead of stopping at a visual prototype.

## Deutsch

**Sashka Molodets** ist eine zweisprachige Lern-PWA für Kinder. Sie verbindet deutsche Lernfragen mit ukrainischer Unterstützung, vorproduzierter Sprachausgabe, echten Geräuschen, lokalem Lernfortschritt und einer für Touch-Geräte optimierten Oberfläche.

Der produktive Build läuft statisch auf GitHub Pages und benötigt keine API-Schlüssel.

## Українською

**Sashka Molodets** — двомовна навчальна PWA для дітей: німецькі завдання, українська підтримка, заздалегідь підготовлена озвучка, реальні звуки, локальний прогрес і простий сенсорний інтерфейс.

Продакшн-версія працює статично на GitHub Pages і не потребує API-ключів.

---

Built by **Serhii Panchenko** as a practical web-development and automation portfolio project.
