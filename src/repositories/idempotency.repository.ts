import { pool } from '../db/connection';
import type { Db } from '../types';

export interface StoredIdempotency {
  request_hash: string;
  response: unknown;
}

// Busca si este usuario ya usó esta key.
export const findByKey = async (userId: number, key: string, db: Db = pool): Promise<StoredIdempotency | null> => {
  const { rows } = await db.query<StoredIdempotency>(
    'SELECT request_hash, response FROM idempotency_keys WHERE userid = $1 AND key = $2',
    [userId, key]
  );
  return rows[0] || null;
};

// Guarda la respuesta junto con la orden (misma transacción: o se guardan las dos cosas o ninguna).
export const save = async (
  userId: number,
  key: string,
  requestHash: string,
  response: unknown,
  db: Db = pool
): Promise<void> => {
  await db.query(
    'INSERT INTO idempotency_keys (userid, key, request_hash, response) VALUES ($1, $2, $3, $4)',
    [userId, key, requestHash, JSON.stringify(response)]
  );
};