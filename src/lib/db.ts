import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/workflow_builder';

// Use a single pool instance across the application
let pool: Pool;

if (process.env.NODE_ENV === 'production') {
  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
} else {
  // In development, bind the pool to the global object to prevent multiple pools from forming due to hot reloading
  const globalRef = global as unknown as { pool: Pool };
  if (!globalRef.pool) {
    globalRef.pool = new Pool({
      connectionString,
      // For local development on Windows, usually SSL is disabled. Let's make it conditional:
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
    });
  }
  pool = globalRef.pool;
}

export default pool;

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // console.log('executed query', { text, duration, rowsCount: res.rowCount });
  return res;
}
