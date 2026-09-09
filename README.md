# Sashka Molodets

**A bilingual German–Ukrainian learning PWA for children.**

Sashka Molodets is a touch-first educational web app built for real use on tablets and phones. Children listen to a question, identify the correct object, receive immediate spoken feedback and continue learning through short, repeatable rounds.

The project combines child-friendly UX, offline-capable PWA architecture, pre-generated media, adaptive repetition, real-world sound effects and production CI checks.

**Live demo:** https://serpanteam.github.io/sashka-molodets/

---

## Why this project exists

Language-learning apps often become too busy for young children: too much text, too many controls and too much navigation. This project takes the opposite approach.

The child sees a small number of large visual choices, hears the question in German and Ukrainian, taps one card and gets immediate feedback. The main game stays predictable and simple while the content and difficulty can grow independently.

The original use case was German vocabulary practice with Ukrainian support, but the architecture is intentionally reusable for other languages, categories and learning sets.

## Product highlights

- **German → Ukrainian learning flow** with recorded speech and browser-voice fallback.
- **60 production-ready learning cards** with images and bilingual audio assets.
- **Adaptive repetition** that gives weaker words more practice.
- **Five difficulty levels**, including attribute-based tasks such as colors.
- **Real animal and transport recordings** plus natural feedback sounds.
- **Large touch targets** designed for children and tablet use.
- **Responsive zero-scroll game screen** for portrait and landscape layouts.
- **Parent settings** for language mode, difficulty, labels and learning categories.
- **Local progress storage** without requiring an account.
- **Installable PWA** with service worker caching and offline-friendly behavior.
- **GitHub Pages deployment** with automated validation and browser smoke tests.
- **Real browser audio playback checks** in CI before a production deployment is accepted.

## Engineering approach

A core design decision is simple:

> **AI can help produce content, but the child-facing runtime must remain deterministic.**

Images and voice assets are generated ahead of time, reviewed and stored as normal production files. The game does not depend on a live AI request while a child is playing.

That keeps the runtime fast, predictable, inexpensive and much easier to test.

### Architecture

```text
Content JSON
    │
    ├── learning metadata
    ├── image references
    └── DE / UA audio references
            │
            ▼
Static PWA runtime
    │
    ├── adaptive learning logic
    ├── touch-first game UI
    ├── audio + real SFX
    ├── local progress
    └── service worker cache
            │
            ▼
GitHub Actions
    │
    ├── production asset validation
    ├── JavaScript syntax checks
    ├── local Chrome smoke test
    ├── GitHub Pages deployment
    └── deployed browser + audio verification
```

## Tech stack

**Frontend:** Vanilla JavaScript, HTML5, modern CSS  
**PWA:** Service Worker, Web App Manifest, local storage  
**Media:** pre-generated PNG / WAV / OGG assets  
**Automation:** Node.js scripts, GitHub Actions  
**Hosting:** GitHub Pages  
**Generation pipeline:** Google Cloud / Vertex-based asset generation workflows

The public runtime intentionally has very few moving parts and does not require a frontend framework.

## Responsive UI

The interface is designed around a strict child-use constraint: the active game should stay usable without scrolling.

- Desktop and landscape tablet: up to six answer cards in a **3 × 2** grid.
- Portrait tablet and phone: up to six answer cards in a **2 × 3** grid.
- Artwork uses `object-fit: contain` to protect important visual content from cropping.
- Controls scale down for low-height landscape screens.
- Safe-area insets are respected on mobile devices.
- Motion is reduced automatically when the OS requests reduced motion.

## Learning flow

1. The app chooses a target using adaptive weighting.
2. The child hears the question.
3. The child selects one of the large image cards.
4. A wrong answer keeps the same target and adds contextual guidance.
5. A correct answer plays feedback in a strict sequence:
   - natural applause;
   - object sound when available;
   - German praise;
   - Ukrainian praise.
6. Progress is stored locally and influences later rounds.

## Content model

Learning data lives in category JSON files instead of being hard-coded into the interface. A card can define:

- German and Ukrainian labels;
- grammatical article;
- image asset;
- question / success / wrong / retry audio in both languages;
- optional attributes such as color;
- category membership.

This makes the project suitable as a reusable base for other vocabulary sets or language combinations.

## Run locally

Node.js 20+ is recommended.

```bash
git clone https://github.com/SerPanTeam/sashka-molodets.git
cd sashka-molodets
node server.mjs
```

Open:

```text
http://localhost:4173
```

For a simple static preview you can also serve the `public/` directory with any local HTTP server.

## Production quality checks

The Pages workflow does more than upload static files. A deployment is rejected if important production requirements are broken.

Checks include:

- referenced production images and bilingual audio files exist;
- natural animal / transport recordings exist;
- applause exists;
- JavaScript parses successfully;
- correct-answer audio order remains intact;
- the local build renders in headless Chrome;
- the deployed GitHub Pages version renders correctly;
- critical production assets return successfully;
- a real audio file starts playback in the browser.

This was added after real tablet audio regressions exposed a class of bugs that simple file-existence tests could not detect.

## Project structure

```text
public/                 child-facing PWA runtime
content/                reusable learning content
scripts/                generation and validation tooling
config/                 generation configuration
docs/                   architecture and operational notes
.github/workflows/       generation, QA and deployment automation
server.mjs              lightweight local server / API layer
```

## Privacy and child safety

The learning game does not require a child account. Progress is stored locally in the browser. The production game uses pre-generated content instead of sending a child's interaction to a live AI model.

For Android kiosk-style use, install the PWA and combine it with the operating system's **App pinning** feature.

## Languages

The current learning experience is built for:

- **Deutsch** — primary learning language
- **Українська** — support language

The content-driven architecture can be extended to additional language pairs.

## Short description in German

**Sashka Molodets ist eine zweisprachige Lern-PWA für Kinder.** Die Anwendung kombiniert Deutsch und Ukrainisch, große Touch-Flächen, adaptive Wiederholungen, vorproduzierte Sprachaufnahmen, echte Geräusche, Offline-Unterstützung und automatisierte Production-Tests.

## Коротко українською

**Sashka Molodets — двомовний навчальний PWA-застосунок для дітей.** Він поєднує німецьку й українську мови, великі сенсорні елементи, адаптивне повторення, заздалегідь підготовлені голосові записи, реальні звуки та офлайн-режим.

---

Built as a real-world product and portfolio case covering **frontend engineering, PWA architecture, content automation, AI-assisted media pipelines, CI/CD and production QA**.
