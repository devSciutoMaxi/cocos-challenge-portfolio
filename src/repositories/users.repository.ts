import { pool } from '../db/connection';
import type { Db } from '../types';

export const getUserById = async (userId: number, db: Db = pool): Promise<{ id: number } | null> => {
  const { rows } = await db.query<{ id: number }>('SELECT id FROM users WHERE id = $1', [userId]);
  return rows[0] || null;
};

// Bloquea la fila del usuario hasta el fin de la transacción: serializa sus órdenes.
export const lockUserById = async (userId: number, db: Db): Promise<{ id: number } | null> => {
  const { rows } = await db.query<{ id: number }>('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  return rows[0] || null;
};
