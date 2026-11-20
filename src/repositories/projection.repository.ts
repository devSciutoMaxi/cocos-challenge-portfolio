import { pool } from '../db/connection';
import { roundMoney } from '../money';
import type { Db } from '../types';
import type { Ledger } from '../services/portfolio/portfolio.types';

export interface BalanceRow {
  cash: string;
  last_order_id: number;
}

export interface PositionRow {
  instrumentid: number;
  shares: number;
  cost: string;
  ticker: string | null;
  name: string | null;
}

// Id de la última orden FILLED del usuario (0 si no tiene). Es la "huella" para saber si la proyección está al día.
export const getLastFilledOrderId = async (userId: number, db: Db = pool): Promise<number> => {
  const { rows } = await db.query<{ last: number }>(
    "SELECT COALESCE(MAX(id), 0)::int AS last FROM orders WHERE userid = $1 AND status = 'FILLED'",
    [userId]
  );
  return rows[0].last;
};

export const getBalance = async (userId: number, db: Db = pool): Promise<BalanceRow | null> => {
  const { rows } = await db.query<BalanceRow>(
    'SELECT cash, last_order_id FROM account_balance WHERE userid = $1',
    [userId]
  );
  return rows[0] || null;
};

export const getPositions = async (userId: number, db: Db = pool): Promise<PositionRow[]> => {
  const { rows } = await db.query<PositionRow>(
    `SELECT p.instrumentid, p.shares, p.cost, i.ticker, i.name
       FROM account_positions p
       JOIN instruments i ON i.id = p.instrumentid
      WHERE p.userid = $1`,
    [userId]
  );
  return rows;
};

export const saveBalance = async (userId: number, cash: number, lastOrderId: number, db: Db = pool): Promise<void> => {
  await db.query(
    `INSERT INTO account_balance (userid, cash, last_order_id) VALUES ($1, $2, $3)
     ON CONFLICT (userid) DO UPDATE SET cash = $2, last_order_id = $3, updated_at = now()`,
    [userId, roundMoney(cash), lastOrderId]
  );
};

// Guarda una posición; si quedó en cero se borra (una posición ausente equivale a 0 acciones y costo 0).
export const savePosition = async (
  userId: number,
  instrumentId: number,
  shares: number,
  cost: number,
  db: Db = pool
): Promise<void> => {
  if (shares === 0) {
    await db.query('DELETE FROM account_positions WHERE userid = $1 AND instrumentid = $2', [userId, instrumentId]);
    return;
  }
  await db.query(
    `INSERT INTO account_positions (userid, instrumentid, shares, cost) VALUES ($1, $2, $3, $4)
     ON CONFLICT (userid, instrumentid) DO UPDATE SET shares = $3, cost = $4`,
    [userId, instrumentId, shares, cost]
  );
};

// Reemplaza toda la proyección del usuario (reconstrucción desde las órdenes).
export const replaceAll = async (userId: number, ledger: Ledger, lastOrderId: number, db: Db = pool): Promise<void> => {
  await db.query('DELETE FROM account_positions WHERE userid = $1', [userId]);
  for (const [instrumentId, position] of ledger.positions) {
    if (position.shares !== 0) await savePosition(userId, instrumentId, position.shares, position.cost, db);
  }
  await saveBalance(userId, ledger.cash, lastOrderId, db);
};
