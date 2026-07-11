import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDbPath = path.join(__dirname, '..', 'data', 'sprites.db');

export function openDatabase(dbPath = process.env.DATABASE_PATH || defaultDbPath) {
  const resolved = path.isAbsolute(dbPath) ? dbPath : path.resolve(__dirname, dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const db = new DatabaseSync(resolved);
  db.exec(`
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
  `);

  return db;
}

export function findUserByEmail(db, email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
}

export function findUserById(db, id) {
  return db.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?').get(id);
}

export function createUser(db, { email, passwordHash, displayName }) {
  const normalizedEmail = email.trim().toLowerCase();
  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, display_name)
    VALUES (?, ?, ?)
  `);
  const insertCollection = db.prepare(`
    INSERT INTO collections (user_id, owned_json)
    VALUES (?, '{}')
  `);

  const result = insertUser.run(normalizedEmail, passwordHash, displayName || null);
  insertCollection.run(result.lastInsertRowid);
  return result.lastInsertRowid;
}

export function getCollection(db, userId) {
  const row = db.prepare('SELECT owned_json, updated_at FROM collections WHERE user_id = ?').get(userId);
  if (!row) return { owned: {}, updatedAt: null };
  try {
    return { owned: JSON.parse(row.owned_json), updatedAt: row.updated_at };
  } catch {
    return { owned: {}, updatedAt: row.updated_at };
  }
}

export function saveCollection(db, userId, owned) {
  const ownedJson = JSON.stringify(owned || {});
  db.prepare(`
    UPDATE collections
    SET owned_json = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(ownedJson, userId);
  return getCollection(db, userId);
}
