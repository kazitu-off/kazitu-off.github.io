# ШпротPlay

ШпротPlay — сайт с 20 мини-играми на чистых HTML, CSS и JavaScript ES modules. Теперь проект включает отдельный frameworkless Node.js backend с SQLite, Discord OAuth Authorization Code flow, серверными сессиями и лидербордом.

## Что внутри

- Адаптивная главная с поиском, фильтром по жанрам, темой и карточками игр.
- Игры загружаются лениво через `import()` после открытия карточки.
- Каждый модуль экспортирует `init(root, api)`, `start()`, `pause()`, `destroy()`.
- Гостевой режим работает без backend-сессии; локальный результат остаётся fallback для офлайн-режима.
- Авторизованные результаты отправляются на `POST /api/scores` и сохраняются в SQLite.
- Публичный leaderboard доступен через `GET /api/scores/:game`.
- Discord OAuth выполняется на сервере: client secret не попадает в браузер.
- CSS/SVG-иконки используются вместо emoji. Assets подключены непосредственно в canvas-играх платформера, шутера и уклонения.
- PWA manifest и service worker для кэширования оболочки.
- Пользовательские ассеты описаны в `assets-manifest.json`; внешние файлы не скачивались.

## Игры

1. Змейка — аркада
2. 2048 — пазл
3. Сапёр — логика
4. Пары — память
5. Крестики-нолики — стратегия
6. Тетрис — аркада
7. Пинг-понг — спорт
8. Птичка — тайминг
9. Арканоид — аркада
10. Пятнашки — пазл
11. Судоку — логика
12. Слово — слова
13. Платформер — экшен
14. Кликер — казуальная
15. Лабиринт — логика
16. Реакция — тайминг
17. Три в ряд — пазл
18. Шутер — экшен
19. Камень, ножницы, бумага — казуальная
20. Увернись — аркада

У canvas-игр есть `requestAnimationFrame`, масштабирование под `devicePixelRatio` и фиксированный шаг/ограничение `dt`. Активная игра ставится на паузу при скрытии вкладки. DOM-игры поддерживают кнопки, клавиатуру, pointer или touch там, где это имеет смысл.

## Запуск backend + frontend

Нужен Node.js 22.5+ с доступным встроенным модулем `node:sqlite`.

```bash
# из корня проекта
cp server/.env.example .env
# отредактировать .env, затем загрузить его в окружение shell
set -a; . ./.env; set +a
node server/index.mjs
# открыть http://localhost:3000
```

`server/index.mjs` сам раздаёт `index.html`, CSS, JS и `assets/`, поэтому frontend и API работают на одном origin. `.env` намеренно не загружается автоматически: передайте переменные процессу через shell, systemd, Docker secrets или ваш менеджер окружения. Пример для shell:

```bash
export PORT=3000
export DB_FILE=./server/pplay.sqlite
export DISCORD_CLIENT_ID=...
export DISCORD_CLIENT_SECRET=...
export DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback
node server/index.mjs
```

Простой `python3 -m http.server` всё ещё подходит для визуальной работы без авторизации, но `/api` и Discord login через него не работают. ES modules, OAuth и service worker нельзя надёжно тестировать через `file://`.

Подробности API и deployment notes: [`server/README.md`](server/README.md).

## Discord OAuth и ручная настройка

1. Создайте приложение в [Discord Developer Portal](https://discord.com/developers/applications).
2. В OAuth2 добавьте callback URI, например `http://localhost:3000/auth/discord/callback` или публичный HTTPS URL.
3. Скопируйте **Client ID** в `DISCORD_CLIENT_ID`.
4. Скопируйте **Client Secret только в server environment** как `DISCORD_CLIENT_SECRET`.
5. Укажите тот же URI в `DISCORD_REDIRECT_URI`.
6. Запустите backend и нажмите «Войти через Discord».

Backend запрашивает только scope `identify`, проверяет случайный HttpOnly `oauth_state`, обменивает code сервер-сервером и создаёт HttpOnly session cookie. В браузере Discord token не хранится.

## Backend API

- `GET /api/health` — проверка сервиса и SQLite.
- `GET /api/me` — текущий профиль или `{ "user": null }`.
- `POST /api/scores` — авторизованный JSON `{ "game": "snake", "score": 120 }`.
- `GET /api/scores/:game` — публичный топ-20.
- `GET /auth/discord` — начало OAuth.
- `GET /auth/discord/callback` — callback OAuth.
- `POST /auth/logout` — удаление серверной сессии.

Счёты валидируются на сервере, а для каждой пары user/game сохраняется максимум. Это не защищает от читерства полностью: для честного рейтинга добавьте серверную проверку событий/лимитов и rate limiting на reverse proxy.

## Данные и deployment

SQLite-файл `server/pplay.sqlite` содержит пользователей, сессии и результаты. Для одного процесса это реальная персистентная DB. Для нескольких реплик используйте общий PostgreSQL/Turso/другую managed DB и замените слой `server/db.mjs`, сохранив контракт store.

В production:

- используйте HTTPS reverse proxy;
- задайте `NODE_ENV=production` и постоянный `DB_FILE`;
- храните Discord Secret в secret manager;
- прокидывайте `X-Forwarded-Proto` и исходный Host;
- не добавляйте `.env` и `*.sqlite` в репозиторий;
- настройте backup SQLite или миграции для выбранной DB.

## Ассеты

Исходная поставка содержит 15 PNG/GIF-файлов. Они используются в карточках и непосредственно в canvas-рендерах платформера, шутера и уклонения; остальные игры используют лёгкую CSS/SVG-графику. Внешние CC0/Public Domain-файлы не скачивались. Лицензия исходных пользовательских изображений не указана — уточните её перед публикацией. Подробности: `CREDITS.md` и `assets-manifest.json`.

## Проверки

```bash
node scripts/check.mjs
for f in config.js js/*.js games/*/index.js server/*.mjs; do node --check "$f"; done
```

Для API smoke:

```bash
DB_FILE=/tmp/pplay.sqlite PORT=3311 node server/index.mjs
curl http://localhost:3311/api/health
```

Lighthouse в текущем окружении не установлен, поэтому численный результат Lighthouse не заявляется. Целевой прогон выполняйте на HTTPS/staging с реальным браузером.

## Ограничения

- Гостевой режим не отправляет результаты на сервер.
- Discord OAuth требует реального Client ID, Client Secret и зарегистрированного callback URI.
- Авторизованный score — максимум, присланный клиентом; это не античит-система.
- `node:sqlite` в Node 22 помечен experimental; при необходимости production-замените только DB adapter.
- Service worker кэширует оболочку и подгруженные файлы; при изменении версии увеличьте `CACHE` в `sw.js`.
