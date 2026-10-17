import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let DatabaseSync;
let sqliteLoadError;

try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch (error) {
  sqliteLoadError = error;
}

const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), 'schema.sql');

class UnavailableDatabase {
  constructor(filename) {
    this.filename = filename;
    this.reason = sqliteLoadError;
  }

  close() {}

  fail() {
    const detail = this.reason?.message ? ` Причина: ${this.reason.message}` : '';
    throw new Error(
      `Для этого backend нужен Node.js 22 с доступным встроенным модулем node:sqlite. ` +
      `Обновите Node.js или запустите поддерживаемый runtime (DB_FILE=${this.filename}).${detail}`,
    );
  }
}

function asPublicUser(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    username: String(row.username),
    globalName: row.global_name == null ? null : String(row.global_name),
    avatar: row.avatar == null ? null : String(row.avatar),
  };
}

export function sqliteAvailable() {
  return typeof DatabaseSync === 'function';
}

export function openDatabase(filename = 'server/pplay.sqlite', schema = schemaPath) {
  if (!sqliteAvailable()) return new UnavailableDatabase(filename);

  if (filename !== ':memory:') {
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  }

  const database = new DatabaseSync(filename);
  database.exec(readFileSync(schema, 'utf8'));
  database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  return database;
}

export function createStore(filename = 'server/pplay.sqlite', schema = schemaPath) {
  const database = openDatabase(filename, schema);
  if (database instanceof UnavailableDatabase) {
    return {
      available: false,
      close: () => database.close(),
      assertAvailable: () => database.fail(),
    };
  }

  const cleanupExpired = database.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  const findSessionUser = database.prepare(`
    SELECT u.id, u.username, u.global_name, u.avatar
    FROM sessions AS s
    JOIN users AS u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ?
  `);
  const removeSession = database.prepare('DELETE FROM sessions WHERE id = ?');
  const saveUserStatement = database.prepare(`
    INSERT INTO users (id, username, global_name, avatar, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      global_name = excluded.global_name,
      avatar = excluded.avatar,
      updated_at = excluded.updated_at
  `);
  const saveSession = database.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const saveScore = database.prepare(`
    INSERT INTO scores (user_id, game, score, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, game) DO UPDATE SET
      score = CASE WHEN excluded.score > scores.score THEN excluded.score ELSE scores.score END,
      updated_at = CASE WHEN excluded.score > scores.score THEN excluded.updated_at ELSE scores.updated_at END
    RETURNING score, updated_at
  `);
  const readScore = database.prepare('SELECT score, updated_at FROM scores WHERE user_id = ? AND game = ?');
  const topScores = database.prepare(`
    SELECT
      s.game,
      s.score,
      s.updated_at,
      u.id AS user_id,
      u.username,
      u.global_name,
      u.avatar
    FROM scores AS s
    JOIN users AS u ON u.id = s.user_id
    WHERE s.game = ?
    ORDER BY s.score DESC, s.updated_at ASC, s.user_id ASC
    LIMIT 20
  `);

  return {
    available: true,
    database,
    close: () => database.close(),
    assertAvailable: () => {},
    cleanupExpired(now = Date.now()) {
      cleanupExpired.run(now);
    },
    getUserBySession(sessionId, now = Date.now()) {
      if (!sessionId) return null;
      const user = findSessionUser.get(sessionId, now);
      if (!user) removeSession.run(sessionId);
      return asPublicUser(user);
    },
    saveUser(user, now = Date.now()) {
      saveUserStatement.run(user.id, user.username, user.globalName, user.avatar, now, now);
    },
    createSession(sessionId, userId, expiresAt, now = Date.now()) {
      saveSession.run(sessionId, userId, expiresAt, now);
    },
    deleteSession(sessionId) {
      if (sessionId) removeSession.run(sessionId);
    },
    saveMaxScore(userId, game, score, now = Date.now()) {
      const saved = saveScore.get(userId, game, score, now);
      return {
        score: Number(saved?.score ?? readScore.get(userId, game)?.score ?? score),
        updatedAt: Number(saved?.updated_at ?? now),
      };
    },
    getTopScores(game) {
      return topScores.all(game).map((row, index) => ({
        rank: index + 1,
        game: String(row.game),
        score: Number(row.score),
        updatedAt: Number(row.updated_at),
        user: asPublicUser({
          id: row.user_id,
          username: row.username,
          global_name: row.global_name,
          avatar: row.avatar,
        }),
      }));
    },
  };
}

export { schemaPath };
