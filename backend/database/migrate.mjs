import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const directory = path.join(here, 'migrations');
const client = await pool.connect();
try {
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(directory)).filter((f) => f.endsWith('.sql')).sort();
  for (const name of files) {
    if (applied.has(name)) continue;
    await client.query('BEGIN');
    try {
      await client.query(await readFile(path.join(directory, name), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally { client.release(); await pool.end(); }
