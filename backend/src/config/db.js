import pg from 'pg';
const { Pool } = pg;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Copy backend/.env.example to backend/.env and configure PostgreSQL.');
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 12, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined });
pool.on('error', (error) => console.error('Unexpected idle PostgreSQL client error:', error.message));
