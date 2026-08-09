import { Pool } from 'pg';

const connectionString = process.env.NHOST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/workflow_builder';

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
});

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}
