const PREFIX = "shprotplay";
const guestKey = "guest";
function currentKey() { return sessionStorage.getItem("discord_user_id") || guestKey; }
function read(id = currentKey()) { try { return JSON.parse(localStorage.getItem(`${PREFIX}:${id}`) || "{}"); } catch { return {}; } }
function write(data, id = currentKey()) { localStorage.setItem(`${PREFIX}:${id}`, JSON.stringify(data)); }
export function getBest(slug) { return read().scores?.[slug] ?? 0; }
export function saveScore(slug, score) { const data = read(); data.scores ||= {}; const old = Number(data.scores[slug] || 0); const next = Math.max(old, Number(score) || 0); data.scores[slug] = next; write(data); return next; }
export function setSetting(name, value) { const data = read(); data.settings ||= {}; data.settings[name] = value; write(data); }
export function getSetting(name, fallback) { return read().settings?.[name] ?? fallback; }
export function migrateGuest(userId) { if (!userId) return; const guest = read(guestKey); const user = read(userId); user.scores = { ...(guest.scores || {}), ...(user.scores || {}) }; write(user, userId); }
export function clearLocalProgress() { localStorage.removeItem(`${PREFIX}:${currentKey()}`); }
