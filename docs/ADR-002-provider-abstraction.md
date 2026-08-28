# ADR-002 — Provider abstraction
Status: accepted.

Игровой код не зависит от Google/OpenAI. Image/TTS выбираются registry, а model/voice — конфигурацией. Поэтому поставщика можно заменить без переписывания curriculum и game engine.
