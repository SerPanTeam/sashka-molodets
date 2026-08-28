# Сашка молодец — Production Guardrails

Этот файл фиксирует решения, которые нельзя случайно сломать в следующих итерациях проекта.

## 1. Прод проверяется отдельно от `main`

Файл в репозитории ≠ файл на GitHub Pages. После изменений всегда проверять последний `Deploy GitHub Pages` и считать задачу готовой только после `conclusion: success`.

Push из GitHub Actions через `GITHUB_TOKEN` не должен считаться гарантированным триггером следующего workflow. Если генератор сохраняет новые assets, он должен либо сам выполнить Pages deploy, либо после него нужен отдельный human/connector-originated commit.

## 2. Bilingual voice contract

Основной режим: `DE → UA`.

- Вопрос: немецкий, затем украинский.
- Правильный ответ: немецкая похвала, затем украинская похвала.
- Неправильный ответ: немецкая подсказка, затем украинская подсказка.
- Режим `DE only` остаётся отдельной настройкой.
- Для записанных клипов использовать один общий HTMLAudioElement, чтобы браузер/PWA не блокировал второй последовательный `play()`.

Немецкое имя ребёнка: **Olexander**.
Украинская похвала: **Сашка**.

Старые немецкие `*.success.de.wav` были записаны с именем `Alexander`. Пока OpenAI API credits исчерпаны, production shim принудительно отключает эти success WAV и использует browser TTS с `Olexander`. После успешной перегенерации всех 60 success WAV этот override нужно удалить.

## 3. Correct-answer sound order

При правильном выборе строгая последовательность:

1. Аплодисменты.
2. Естественный звук объекта, если он есть.
3. Похвала DE.
4. Похвала UA в dual mode.
5. Только после завершения всей цепочки переход к следующему вопросу.

SFX должны быть короткими, узнаваемыми, детскими и не пугающими. Если у объекта естественного звука нет — шаг 2 пропускается.

Поддерживаемые SFX сейчас: dog, cat, rabbit, cow, horse, pig, sheep, lion, elephant, bear, car, bus, train, bicycle, airplane, ship, truck, tractor, tram, helicopter, fridge.

## 4. PWA/cache

- При изменении runtime-логики повышать cache version в `public/sw.js`.
- Критические runtime-файлы и generated assets обслуживать network-first.
- Версии query string в `index.html` повышать при изменении JS bridge/shim/SFX логики.
- После cache migration проверять не только новый браузер, но и уже установленный PWA/старый localStorage.

## 5. Content readiness

На проде показывать только карточки, у которых есть:

- generated image;
- German question + success metadata;
- Ukrainian question + success metadata.

Незавершённые карточки нельзя отдавать в игровой пул.

## 6. Generation / billing resilience

Перед массовой генерацией делать smoke gate. Ошибка `credit_balance_exhausted` / `insufficient_quota` — внешний blocker, а не повод удалять рабочие assets.

Нельзя сначала удалять рабочие production WAV, а потом пытаться их регенерировать без подтверждённого API balance. Новая схема должна быть atomic: генерировать во временный путь/новое имя, проверить полный batch, затем переключить references.

## 7. Definition of Done

Нельзя говорить пользователю «готово на проде», пока не выполнено всё:

- код/контент физически в `main`;
- syntax/static checks прошли;
- Pages workflow завершён `success`;
- prod использует свежий runtime (cache bust применён);
- bilingual path работает DE → UA;
- правильный ответ ждёт applause → SFX → praise;
- нет видимых/озвученных legacy `Alexander` там, где ожидается `Olexander`.

## 8. Current external blocker

OpenAI API на последней проверке вернул `credit_balance_exhausted`. Поэтому новый recorded German success batch с `Olexander` нельзя завершить до пополнения API credits. Все остальные runtime-исправления должны работать без дополнительных API расходов.
