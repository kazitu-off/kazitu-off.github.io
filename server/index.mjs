import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createStore } from './db.mjs';

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SERVER_DIR, '..');
const PORT = parsePort(process.env.PORT, 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.DB_FILE || resolve(SERVER_DIR, 'pplay.sqlite');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const MAX_BODY_BYTES = 32 * 1024;
const DISCORD_API = 'https://discord.com/api/v10';

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.ico', 'image/x-icon'],
  ['.webmanifest', 'application/manifest+json'],
]);

class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

function parsePort(value, fallback) {
  if (value == null || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT должен быть целым числом от 1 до 65535, получено: ${value}`);
  }
  return port;
}

function getCookieHeader(request) {
  const cookies = {};
  for (const part of String(request.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) {
      try { cookies[name] = decodeURIComponent(value); } catch { /* ignore malformed cookie */ }
    }
  }
  return cookies;
}

function serializeCookie(name, value, { maxAge, secure, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return parts.join('; ');
}

function isSecureRequest(request) {
  const forwarded = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (forwarded) return forwarded === 'https';
  return Boolean(request.socket.encrypted);
}

function jsonHeaders(request, extra = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...extra,
  };
  const configuredOrigin = process.env.CORS_ORIGIN?.trim();
  const origin = request.headers.origin;
  if (configuredOrigin && origin === configuredOrigin) {
    headers['Access-Control-Allow-Origin'] = configuredOrigin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers.Vary = 'Origin';
  }
  return headers;
}

function sendJson(request, response, status, payload, extraHeaders = {}) {
  response.writeHead(status, jsonHeaders(request, extraHeaders));
  response.end(JSON.stringify(payload));
}

function sendError(request, response, error) {
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) console.error(error);
  sendJson(request, response, status, {
    error: status >= 500 ? 'Внутренняя ошибка сервера' : error.message,
  }, error instanceof HttpError ? error.headers : {});
}

function requireMethod(request, ...methods) {
  if (!methods.includes(request.method)) {
    throw new HttpError(405, 'Метод не поддерживается', { Allow: methods.join(', ') });
  }
}

function parseGameSlug(value) {
  let game;
  try { game = decodeURIComponent(value); } catch { throw new HttpError(400, 'Некорректный slug игры'); }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game) || game.length > 64) {
    throw new HttpError(400, 'game должен быть slug: латинские буквы, цифры и дефисы');
  }
  return game;
}

function validateScorePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'Ожидается JSON-объект {game, score}');
  }
  if (typeof payload.game !== 'string') throw new HttpError(400, 'game должен быть строкой');
  const game = parseGameSlug(payload.game);
  if (typeof payload.score !== 'number' || !Number.isSafeInteger(payload.score) || payload.score < 0) {
    throw new HttpError(400, 'score должен быть целым неотрицательным числом');
  }
  return { game, score: payload.score };
}

async function readJson(request) {
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new HttpError(413, 'Тело запроса слишком большое');
  }
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Используйте Content-Type: application/json');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Тело запроса слишком большое');
    chunks.push(chunk);
  }
  if (!size) throw new HttpError(400, 'Пустое тело запроса');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Некорректный JSON'); }
}

function sessionFor(request, store) {
  const sessionId = getCookieHeader(request).session;
  return { sessionId, user: store.getUserBySession(sessionId) };
}

function requireUser(request, store) {
  const session = sessionFor(request, store);
  if (!session.user) throw new HttpError(401, 'Требуется авторизация');
  return session;
}

function discordConfig() {
  const config = {
    clientId: process.env.DISCORD_CLIENT_ID?.trim(),
    clientSecret: process.env.DISCORD_CLIENT_SECRET?.trim(),
    redirectUri: process.env.DISCORD_REDIRECT_URI?.trim(),
  };
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new HttpError(503, 'Discord OAuth не настроен на сервере');
  }
  return config;
}

function safeCompare(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function discordFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch { throw new HttpError(502, 'Discord временно недоступен'); }
  finally { clearTimeout(timeout); }
}

async function exchangeDiscordCode(code, config) {
  const tokenResponse = await discordFetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
      grant_type: 'authorization_code', code, redirect_uri: config.redirectUri }),
  });
  const token = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || typeof token.access_token !== 'string') throw new HttpError(502, 'Discord не принял OAuth code');

  const profileResponse = await discordFetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
  });
  const profile = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok || typeof profile.id !== 'string' || typeof profile.username !== 'string') {
    throw new HttpError(502, 'Discord не вернул профиль пользователя');
  }
  return { id: profile.id, username: profile.username.slice(0, 128),
    globalName: typeof profile.global_name === 'string' ? profile.global_name.slice(0, 128) : null,
    avatar: typeof profile.avatar === 'string' ? profile.avatar.slice(0, 256) : null };
}

function redirect(response, location, cookies = []) {
  response.writeHead(302, { Location: location, 'Set-Cookie': cookies }); response.end();
}

async function handleApi(request, response, url, store) {
  if (request.method === 'OPTIONS') { response.writeHead(204, jsonHeaders(request)); response.end(); return; }
  if (url.pathname === '/api/health') {
    requireMethod(request, 'GET'); sendJson(request, response, 200, { ok: true, service: 'pplay', database: 'sqlite' }); return;
  }
  if (url.pathname === '/api/me') {
    requireMethod(request, 'GET'); sendJson(request, response, 200, { user: sessionFor(request, store).user }); return;
  }
  if (url.pathname === '/api/scores') {
    requireMethod(request, 'POST'); const { user } = requireUser(request, store);
    const { game, score } = validateScorePayload(await readJson(request));
    const saved = store.saveMaxScore(user.id, game, score);
    sendJson(request, response, 200, { game, score: saved.score, updatedAt: saved.updatedAt }); return;
  }
  const gameMatch = url.pathname.match(/^\/api\/scores\/([^/]+)$/);
  if (gameMatch) {
    requireMethod(request, 'GET'); const game = parseGameSlug(gameMatch[1]);
    sendJson(request, response, 200, { game, scores: store.getTopScores(game) }); return;
  }
  throw new HttpError(404, 'API route не найден');
}

async function handleAuth(request, response, url, store) {
  const secure = isSecureRequest(request) || process.env.NODE_ENV === 'production';
  if (url.pathname === '/auth/discord') {
    requireMethod(request, 'GET'); const config = discordConfig(); const state = randomBytes(32).toString('hex');
    const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
      response_type: 'code', scope: 'identify', state });
    redirect(response, `https://discord.com/oauth2/authorize?${params}`, [
      serializeCookie('oauth_state', state, { maxAge: OAUTH_STATE_TTL_SECONDS, secure }),
    ]); return;
  }
  if (url.pathname === '/auth/discord/callback') {
    requireMethod(request, 'GET'); const config = discordConfig();
    const queryError = url.searchParams.get('error'); const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); const expectedState = getCookieHeader(request).oauth_state;
    const clearState = serializeCookie('oauth_state', '', { maxAge: 0, secure });
    if (queryError || !code || !safeCompare(state, expectedState)) {
      throw new HttpError(400, queryError ? 'Discord авторизация отменена' : 'OAuth state не совпадает', { 'Set-Cookie': clearState });
    }
    const user = await exchangeDiscordCode(code, config); const sessionId = randomBytes(32).toString('hex');
    store.saveUser(user); store.createSession(sessionId, user.id, Date.now() + SESSION_TTL_MS);
    redirect(response, '/', [clearState, serializeCookie('session', sessionId, { maxAge: SESSION_TTL_MS / 1000, secure })]); return;
  }
  if (url.pathname === '/auth/logout') {
    requireMethod(request, 'POST'); const { sessionId } = sessionFor(request, store); store.deleteSession(sessionId);
    sendJson(request, response, 200, { ok: true }, { 'Set-Cookie': serializeCookie('session', '', { maxAge: 0, secure }) }); return;
  }
  throw new HttpError(404, 'Auth route не найден');
}

function safeStaticPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'Некорректный путь'); }
  const candidate = resolve(PROJECT_ROOT, `.${decoded === '/' ? '/index.html' : decoded}`);
  const relativePath = relative(PROJECT_ROOT, candidate);
  const firstSegment = relativePath.split(/[\\/]/, 1)[0];
  if (relativePath.startsWith('..') || firstSegment === 'server') {
    throw new HttpError(404, 'Файл не найден');
  }
  return candidate;
}

function serveStatic(request, response, url) {
  requireMethod(request, 'GET', 'HEAD'); const filePath = safeStaticPath(url.pathname);
  let stat; try { stat = statSync(filePath); } catch { throw new HttpError(404, 'Файл не найден'); }
  if (!stat.isFile()) throw new HttpError(404, 'Файл не найден');
  response.writeHead(200, { 'Content-Type': MIME_TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
    'Content-Length': stat.size, 'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff' });
  if (request.method === 'HEAD') response.end(); else createReadStream(filePath).pipe(response);
}

export function createApp({ store = createStore(DB_FILE) } = {}) {
  store.assertAvailable(); store.cleanupExpired();
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) await handleApi(request, response, url, store);
      else if (url.pathname.startsWith('/auth/')) await handleAuth(request, response, url, store);
      else serveStatic(request, response, url);
    } catch (error) {
      if (!response.headersSent) sendError(request, response, error); else response.destroy(error);
    }
  });
}

export async function startServer() {
  const store = createStore(DB_FILE); store.assertAvailable(); const server = createApp({ store });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(PORT, HOST, resolveListen); });
  console.log(`PPlay backend listening on http://${HOST}:${PORT}`); return { server, store };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  startServer().catch((error) => { console.error(`Не удалось запустить PPlay backend: ${error.message}`); process.exitCode = 1; });
}
