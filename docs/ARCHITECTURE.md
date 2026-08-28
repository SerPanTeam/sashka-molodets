# Архитектура

## Почему MVP без фреймворка

Первая версия — zero-dependency Node.js + browser modules PWA. Она запускается сразу, легко тестируется на планшете и уже правильно разделяет клиент и секретный серверный AI-слой.

После подтверждения UX интерфейс можно перенести на React/Next.js, не меняя модель контента и provider contracts.

```text
CHILD PWA
  Game Engine · UI · Local Progress · Offline · Web Speech
       |
       v
APP SERVER
  static files · content API · protected generation API
       |                         |
       v                         v
Google adapter              OpenAI adapter
 image · TTS                 image · TTS
```

## Ключи

API-ключи живут только на сервере. Никогда не кладём их в `public/`, LocalStorage или клиентские переменные окружения.

## Provider abstraction

Игровой движок не знает конкретного поставщика. Логические контракты:

```ts
interface ImageProvider { generateImage(req): Promise<BinaryAsset> }
interface SpeechProvider { generateSpeech(req): Promise<BinaryAsset> }
```

Сейчас: `google`, `openai`. Позже без изменения игры добавляются Vertex AI, Cloud TTS, ElevenLabs, Azure, локальные модели и т.д.

## Content SSOT

`content/content.json` + `content/categories/*.json` хранит стабильные ID, категорию, DE/UA-названия, немецкий артикль, атрибуты и approved visual path. Новые слова добавляются данными, а не `if`-ами в игре.

## Адаптивность

Каждый объект имеет `mastery` 0..1. Правильный ответ повышает его, ошибка немного снижает. Недавно показанные слова получают временный штраф, слабые — больший шанс выбора.

Следующий уровень — хранить mastery отдельно для навыков: узнавание картинки, немецкое слово, украинское соответствие, цвет, количество.

## AI strategy

Production pipeline:

```text
curriculum → prompt builder → provider → generated asset → human review → approved immutable asset → child app
```

Новые картинки не генерируются во время каждого вопроса: это медленно, дорого, меняет стиль и плохо контролируется.

## Audio strategy

1. Approved pre-generated audio.
2. Server TTS + cache, если фразы нет.
3. Browser SpeechSynthesis как бесплатный/offline fallback.

## Хранилище

MVP: LocalStorage. Далее: IndexedDB, профили, версии контента, sync queue. Cloud sync нужен только когда появится реальная необходимость.

## Будущая monorepo-структура

```text
apps/web
apps/admin
packages/domain
packages/content-schema
packages/curriculum
packages/ai-providers
packages/ui
packages/storage
services/api
```

Переходить в monorepo разумно, когда появится второй реально разворачиваемый app (например parent/admin studio).
