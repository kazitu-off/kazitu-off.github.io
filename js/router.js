export function getRoute() { const raw = location.hash.replace(/^#\/?/, ""); const parts = raw.split("/").filter(Boolean); return parts[0] === "play" && parts[1] ? { name: "game", slug: decodeURIComponent(parts[1]) } : { name: "home" }; }
export function goHome() { location.hash = "#/"; }
export function goGame(slug) { location.hash = `#/play/${encodeURIComponent(slug)}`; }
export function listen(callback) { addEventListener("hashchange", callback); return () => removeEventListener("hashchange", callback); }
