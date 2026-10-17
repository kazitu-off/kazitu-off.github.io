import { getBest, saveScore, getSetting, setSetting } from "./storage.js";
import { isMuted, setMuted, playTone } from "./audio.js";
import { loadAuth, login, logout } from "./auth.js";
import { getRoute, goHome, goGame, listen } from "./router.js";
import { esc, toast, updateUserSlot } from "./ui.js";
import { formatNumber } from "./format.js";
import { submitScore } from "./backend.js";

const games = [
  ["snake", "Змейка", "Аркада"], ["2048", "2048", "Пазл"], ["minesweeper", "Сапёр", "Логика"], ["memory", "Пары", "Память"], ["tic-tac-toe", "Крестики-нолики", "Стратегия"], ["tetris", "Тетрис", "Аркада"], ["pong", "Пинг-понг", "Спорт"], ["flappy", "Птичка", "Тайминг"], ["breakout", "Арканоид", "Аркада"], ["fifteen", "Пятнашки", "Пазл"], ["sudoku", "Судоку", "Логика"], ["wordle", "Слово", "Слова"], ["platformer", "Платформер", "Экшен"], ["clicker", "Кликер", "Казуальная"], ["maze", "Лабиринт", "Логика"], ["reaction", "Реакция", "Тайминг"], ["match3", "Три в ряд", "Пазл"], ["shooter", "Шутер", "Экшен"], ["rps", "Камень, ножницы, бумага", "Казуальная"], ["dodge", "Увернись", "Аркада"]
].map(([slug, title, genre]) => ({ slug, title, genre }));

const previewFor = Object.fromEntries(games.map(game => [game.slug, `assets/previews/${game.slug}.webp`]));
const app = document.querySelector("#app");
const userSlot = document.querySelector("#user-slot");
let user = null, active = null, cleanup = null, query = "", genre = "all";

function icon(name, label = "") {
  return `<svg class="icon" viewBox="0 0 24 24" ${label ? `aria-label="${label}"` : 'aria-hidden="true"'}><use href="assets/icons/lucide.svg#${name}"></use></svg>`;
}

function applyTheme() {
  const saved = getSetting("theme", "system");
  if (saved === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = saved;
  const button = document.querySelector("#theme-toggle");
  button.querySelector("use").setAttribute("href", `assets/icons/lucide.svg#${saved === "dark" ? "sun" : "moon"}`);
}

function toggleTheme() {
  const current = getSetting("theme", "system");
  setSetting("theme", current === "dark" ? "light" : current === "light" ? "system" : "dark");
  applyTheme();
}

function renderHome() {
  active = null;
  const genres = ["all", ...new Set(games.map(game => game.genre))];
  const visible = games.filter(game => (genre === "all" || game.genre === genre) && `${game.title} ${game.genre}`.toLowerCase().includes(query.toLowerCase()));
  app.innerHTML = `<section class="hero"><p class="eyebrow">20 игр · без регистрации</p><h1>Играй. Отдыхай.<br>Снова играй.</h1><p class="lede">Небольшая коллекция быстрых игр для клавиатуры, мыши и телефона. В гостевом режиме прогресс локальный, а Discord-профиль синхронизирует результаты через сервер.</p></section><section aria-label="Поиск игр"><div class="controls"><label><span class="sr-only">Поиск</span><input class="field" id="search" type="search" placeholder="Найти игру..." value="${esc(query)}"></label><label><span class="sr-only">Жанр</span><select class="field" id="genre">${genres.map(value => `<option value="${esc(value)}" ${value === genre ? "selected" : ""}>${value === "all" ? "Все жанры" : esc(value)}</option>`).join("")}</select></label></div></section><section aria-labelledby="games-title"><div class="section-heading"><h2 id="games-title">Коллекция</h2><span class="help">${formatNumber(visible.length)} из ${formatNumber(games.length)}</span></div><div class="game-grid">${visible.length ? visible.map(card).join("") : `<p class="empty">Ничего не найдено. Попробуйте другой запрос.</p>`}</div></section>`;
  app.querySelector("#search").addEventListener("input", event => { query = event.target.value; renderHome(); app.querySelector("#search").focus(); });
  app.querySelector("#genre").addEventListener("change", event => { genre = event.target.value; renderHome(); });
  app.querySelectorAll("[data-game]").forEach(button => button.addEventListener("click", () => goGame(button.dataset.game)));
}

function card(game) {
  return `<article class="game-card"><div class="game-preview"><img class="preview-image" src="${previewFor[game.slug]}" alt="" width="640" height="360" loading="lazy"></div><div class="game-card-body"><div class="game-meta"><span>${esc(game.genre)}</span><span>Лучший: ${formatNumber(getBest(game.slug))}</span></div><h3>${esc(game.title)}</h3><button class="play primary" type="button" data-game="${game.slug}">Играть</button></div></article>`;
}

async function renderGame(slug) {
  const game = games.find(item => item.slug === slug);
  if (!game) return renderHome();
  app.innerHTML = `<section class="game-shell"><div class="game-topbar"><div><p class="eyebrow">${esc(game.genre)}</p><h1>${esc(game.title)}</h1><p class="help">Лучший результат: ${formatNumber(getBest(slug))}</p></div><div class="game-topbar-actions"><button id="back" type="button">${icon("arrow-left")} Все игры</button><button id="mute" type="button" aria-pressed="${isMuted()}">${icon(isMuted() ? "volume-x" : "volume-2")} Звук</button></div></div><div class="game-stage" id="game-root" aria-live="polite"></div></section>`;
  app.querySelector("#back").addEventListener("click", goHome);
  app.querySelector("#mute").addEventListener("click", () => { setMuted(!isMuted()); renderGame(slug); });
  const root = app.querySelector("#game-root");
  try {
    const module = await import(`../games/${slug}/index.js`);
    if (active?.destroy) active.destroy();
    const api = { saveScore: score => { const best = saveScore(slug, Math.round(score)); if (user) submitScore(slug, Math.max(0, Math.round(score))).then(result => toast(`Результат сохранён в профиле. Лучший: ${formatNumber(result.score)}`)).catch(error => { if (error.status === 401) toast("Сессия истекла, войдите снова"); }); else toast(`Результат сохранён локально. Лучший: ${formatNumber(best)}`); return best; }, playTone, asset: path => path };
    active = module;
    module.init(root, api);
    module.start?.();
    cleanup = () => module.destroy?.();
  } catch (error) {
    console.error(error);
    root.innerHTML = `<p class="empty">Не удалось загрузить игру. Проверьте консоль и путь модуля.</p>`;
    toast("Ошибка загрузки игры");
  }
}

async function route() { cleanup?.(); cleanup = null; active = null; const current = getRoute(); if (current.name === "game") await renderGame(current.slug); else renderHome(); }

async function boot() {
  applyTheme();
  document.querySelector("#theme-toggle").addEventListener("click", toggleTheme);
  updateUserSlot(userSlot, user, { login: () => { try { login(); } catch (error) { toast(error.message); } }, logout });
  try { user = await loadAuth(); updateUserSlot(userSlot, user, { login, logout }); } catch (error) { toast(error.message); }
  listen(route);
  document.addEventListener("visibilitychange", () => document.hidden ? active?.pause?.() : active?.start?.());
  await route();
  app.setAttribute("aria-busy", "false");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
}

boot();
