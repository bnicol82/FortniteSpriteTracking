import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import {
  createUser,
  findUserByEmail,
  findUserById,
  getCollection,
  initDatabase,
  saveCollection
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(__dirname, '.env') });
const PORT = Number(process.env.PORT || 8000);
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL = '30d';

const app = express();
app.use(express.json({ limit: '256kb' }));

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || row.email.split('@')[0]
  };
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function authRequired(db) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required.' });

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await findUserById(db, payload.sub);
      if (!user) return res.status(401).json({ error: 'Invalid session.' });
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }
  };
}

function normalizeOwned(input) {
  if (!input || typeof input !== 'object') return {};
  const next = {};
  if (Array.isArray(input)) {
    input.forEach(file => {
      if (typeof file === 'string' && file.endsWith('.JPG')) next[file] = true;
    });
    return next;
  }
  Object.entries(input).forEach(([file, owned]) => {
    if (typeof file === 'string' && file.endsWith('.JPG') && owned) next[file] = true;
  });
  return next;
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function start() {
  const db = await initDatabase();
  const requireAuth = authRequired(db);
  const dbLabel = db.kind === 'postgres' ? 'Neon Postgres' : 'SQLite';

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, database: db.kind });
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const email = req.body?.email;
      const password = req.body?.password;
      const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim().slice(0, 40) : null;

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
      }
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }
      if (await findUserByEmail(db, email)) {
        return res.status(409).json({ error: 'An account with that email already exists.' });
      }

      const passwordHash = bcrypt.hashSync(password, 10);
      const userId = await createUser(db, { email, passwordHash, displayName });
      const user = await findUserById(db, userId);
      const token = signToken(user.id);
      res.status(201).json({ token, user: publicUser(user) });
    } catch (error) {
      console.error('Register failed:', error);
      res.status(500).json({ error: 'Could not create account.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = req.body?.email;
      const password = req.body?.password;

      if (!isValidEmail(email) || typeof password !== 'string') {
        return res.status(400).json({ error: 'Enter your email and password.' });
      }

      const user = await findUserByEmail(db, email);
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Incorrect email or password.' });
      }

      const token = signToken(user.id);
      res.json({ token, user: publicUser(user) });
    } catch (error) {
      console.error('Login failed:', error);
      res.status(500).json({ error: 'Could not sign in.' });
    }
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  app.get('/api/collection', requireAuth, async (req, res) => {
    try {
      const collection = await getCollection(db, req.user.id);
      res.json(collection);
    } catch (error) {
      console.error('Load collection failed:', error);
      res.status(500).json({ error: 'Could not load collection.' });
    }
  });

  app.put('/api/collection', requireAuth, async (req, res) => {
    try {
      const owned = normalizeOwned(req.body?.owned);
      const collection = await saveCollection(db, req.user.id, owned);
      res.json(collection);
    } catch (error) {
      console.error('Save collection failed:', error);
      res.status(500).json({ error: 'Could not save collection.' });
    }
  });

  app.use(express.static(ROOT));

  app.use((_req, res) => {
    const indexPath = path.join(ROOT, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Not found');
    }
  });

  app.listen(PORT, () => {
    console.log(`Fortnite Sprite Tracker running at http://localhost:${PORT}`);
    console.log(`Database: ${dbLabel}`);
  });
}

start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
