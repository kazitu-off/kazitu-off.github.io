import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = fileURLToPath(new URL("..", import.meta.url));
const fail = [];
const required = ["index.html", "config.js", "manifest.webmanifest", "sw.js", "assets-manifest.json", "README.md", "CREDITS.md", "js/app.js", "js/auth.js", "js/storage.js", "js/router.js", "js/ui.js", "js/audio.js", "server/index.mjs", "server/db.mjs", "server/schema.sql", "server/.env.example"];
for (const file of required) { try { await stat(join(root, file)); } catch { fail.push(`missing ${file}`); } }
const dirs = (await readdir(join(root, "games"), { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name);
if (dirs.length !== 20) fail.push(`expected 20 game directories, found ${dirs.length}`);
for (const dir of dirs) { const file = join(root, "games", dir, "index.js"); try { await stat(file); execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }); const src = await readFile(file, "utf8"); for (const name of ["init", "start", "pause", "destroy"]) if (!src.includes(`export function ${name}`)) fail.push(`${dir}: missing ${name}`); } catch (error) { fail.push(`${dir}: invalid module`); } }
const refs = new Set(); for (const file of ["index.html", "js/app.js", "README.md", "sw.js"]) { const src = await readFile(join(root, file), "utf8"); for (const match of src.matchAll(/(?:src|href|asset\(|\"|')((?:assets|assets\/icons)\/[^\"') ]+)/g)) refs.add(match[1]); }
for (const ref of refs) { const fileRef = ref.split("#", 1)[0]; try { await stat(join(root, fileRef)); } catch { fail.push(`missing asset reference ${ref}`); } }
for (const file of ["index.html", "js/app.js", ...dirs.map(dir => `games/${dir}/index.js`)]) { const source = await readFile(join(root, file), "utf8"); if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(source)) fail.push(`${file}: emoji-like visual character found`); }
if (fail.length) { console.error(fail.join("\n")); process.exit(1); }
console.log(`OK: ${dirs.length} game modules, required files, and referenced assets checked.`);
