# AI providers

Проверено 2026-08-28.

## Google Gemini API / AI Studio

Изображения: `gemini-3.1-flash-image`.

Речь: `gemini-3.1-flash-tts-preview`.

Ключ: `GEMINI_API_KEY`.

Отдельно можно добавить Google Cloud Text-to-Speech (Chirp 3 HD) как `google-cloud-tts`, если понадобится production IAM/региональность/streaming.

## OpenAI

Изображения: `gpt-image-2`.

Речь: `gpt-4o-mini-tts`.

Ключ: `OPENAI_API_KEY`.

## Почему модели в env

Модели меняются быстрее продукта. Поэтому имя модели и голоса можно заменить без изменения game engine.

## Требования к детским изображениям

Один предмет, целиком, по центру, простой светлый фон, легко узнаваемая форма, единый стиль, без текста/водяных знаков/лишних объектов/рук/людей.

## Кэш

Следующая версия должна считать хеш из provider + model + prompt + voice + settings и не платить повторно за идентичный ассет.
