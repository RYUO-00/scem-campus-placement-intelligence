import 'dotenv/config';
import { pool } from '../src/config/db.js';
import { createConfiguredAccount } from './dev-accounts.mjs';

const email = process.env.DEV_OFFICER_EMAIL?.trim();
const password = process.env.DEV_OFFICER_PASSWORD;

try {
  if (!email || !password) {
    throw new Error('Set DEV_OFFICER_EMAIL and DEV_OFFICER_PASSWORD in backend/.env before provisioning the development officer.');
  }
  await createConfiguredAccount(pool, {
    email,
    password,
    name: 'Development Placement Officer',
    role: 'placement_officer',
  });
} finally {
  await pool.end();
}
