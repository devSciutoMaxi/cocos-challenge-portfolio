import 'dotenv/config';
import { Pool, PoolClient } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL must be set in the environment');
}

export const pool = new Pool({
  connectionString,
  // Algunos proveedores (por ejemplo Neon) requieren SSL: DATABASE_SSL=true
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

export const connectDB = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    console.log('Base de datos conectada exitosamente');
    client.release();
  } catch (error) {
    console.error('Error al conectar a la base de datos:', (error as Error).message);
    process.exit(1);
  }
};

// Ejecuta fn(client) dentro de una transacción: COMMIT si termina bien, ROLLBACK si lanza.
export const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error al hacer ROLLBACK:', (rollbackError as Error).message);
    }
    throw error;
  } finally {
    client.release();
  }
};
