import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resolveNeonDatabaseUrl } from './neon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDbPath = path.join(__dirname, '..', 'data', 'sprites.db');

const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collections (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  owned_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (LOWER(email));
`;

const SQLITE_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collections (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  owned_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export async function initDatabase() {
  const databaseUrl = await resolveNeonDatabaseUrl();
  if (databaseUrl) {
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
    await pool.query(POSTGRES_SCHEMA);
    return { kind: 'postgres', pool };
  }

  const { DatabaseSync } = await import('node:sqlite');
  const dbPath = process.env.DATABASE_PATH || defaultDbPath;
  const resolved = path.isAbsolute(dbPath) ? dbPath : path.resolve(__dirname, dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const sqlite = new DatabaseSync(resolved);
  sqlite.exec(SQLITE_SCHEMA);
  return { kind: 'sqlite', sqlite };
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(db, email) {
  const normalized = normalizeEmail(email);
  if (db.kind === 'postgres') {
    const { rows } = await db.pool.query(
      'SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1',
      [normalized]
    );
    return rows[0] || null;
  }
  return db.sqlite.prepare('SELECT * FROM users WHERE email = ?').get(normalized);
}

export async function findUserById(db, id) {
  if (db.kind === 'postgres') {
    const { rows } = await db.pool.query(
      'SELECT id, email, display_name, created_at FROM users WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }
  return db.sqlite.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?').get(id);
}

export async function createUser(db, { email, passwordHash, displayName }) {
  const normalizedEmail = normalizeEmail(email);
  if (db.kind === 'postgres') {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [normalizedEmail, passwordHash, displayName || null]
      );
      const userId = userResult.rows[0].id;
      await client.query(
        `INSERT INTO collections (user_id, owned_json)
         VALUES ($1, '{}'::jsonb)`,
        [userId]
      );
      await client.query('COMMIT');
      return userId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const insertUser = db.sqlite.prepare(`
    INSERT INTO users (email, password_hash, display_name)
    VALUES (?, ?, ?)
  `);
  const insertCollection = db.sqlite.prepare(`
    INSERT INTO collections (user_id, owned_json)
    VALUES (?, '{}')
  `);
  const result = insertUser.run(normalizedEmail, passwordHash, displayName || null);
  insertCollection.run(result.lastInsertRowid);
  return result.lastInsertRowid;
}

function parseOwned(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export async function getCollection(db, userId) {
  if (db.kind === 'postgres') {
    const { rows } = await db.pool.query(
      'SELECT owned_json, updated_at FROM collections WHERE user_id = $1',
      [userId]
    );
    if (!rows[0]) return { owned: {}, updatedAt: null };
    return { owned: parseOwned(rows[0].owned_json), updatedAt: rows[0].updated_at };
  }

  const row = db.sqlite.prepare('SELECT owned_json, updated_at FROM collections WHERE user_id = ?').get(userId);
  if (!row) return { owned: {}, updatedAt: null };
  return { owned: parseOwned(row.owned_json), updatedAt: row.updated_at };
}

export async function saveCollection(db, userId, owned) {
  const ownedPayload = owned || {};
  if (db.kind === 'postgres') {
    const { rows } = await db.pool.query(
      `UPDATE collections
       SET owned_json = $1::jsonb, updated_at = NOW()
       WHERE user_id = $2
       RETURNING owned_json, updated_at`,
      [JSON.stringify(ownedPayload), userId]
    );
    if (!rows[0]) return { owned: ownedPayload, updatedAt: null };
    return { owned: parseOwned(rows[0].owned_json), updatedAt: rows[0].updated_at };
  }

  const ownedJson = JSON.stringify(ownedPayload);
  db.sqlite.prepare(`
    UPDATE collections
    SET owned_json = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(ownedJson, userId);
  return getCollection(db, userId);
}
