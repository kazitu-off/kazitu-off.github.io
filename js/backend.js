const API_BASE = "";
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || `Ошибка API ${response.status}`); error.status = response.status; throw error; }
  return body;
}
export async function getSession() { return request("/api/me"); }
export async function submitScore(game, score) { return request("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, score }) }); }
export async function getLeaderboard(game) { return request(`/api/scores/${encodeURIComponent(game)}`); }
export async function endSession() { return request("/auth/logout", { method: "POST" }); }
