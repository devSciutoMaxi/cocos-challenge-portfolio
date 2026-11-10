import { pool } from '../db/connection';
import type { Db, Side } from '../types';

export interface FilledOrderRow {
  id: number;
  instrumentid: number;
  size: number;
  price: string;
  side: Side;
  ticker: string | null;
  name: string | null;
  type: string | null;
}

export interface MarketRow {
  instrumentid: number;
  close: string | null;
  previousclose: string | null;
}

export const getFilledOrdersByUserId = async (userId: number, db: Db = pool): Promise<FilledOrderRow[]> => {
  const query = `
    SELECT
      o.id,
      o.instrumentid,
      o.size,
      o.price,
      o.side,
      i.ticker,
      i.name,
      i.type
    FROM orders o
    JOIN instruments i ON o.instrumentid = i.id
    WHERE o.userid = $1 AND o.status = 'FILLED'
    ORDER BY o.datetime ASC, o.id ASC
  `;
  const { rows } = await db.query<FilledOrderRow>(query, [userId]);
  return rows;
};

// Último precio solo de los instrumentos pedidos (no de todo el mercado).
export const getLatestMarketData = async (instrumentIds: number[], db: Db = pool): Promise<MarketRow[]> => {
  if (!instrumentIds.length) return [];
  const query = `
    SELECT DISTINCT ON (instrumentid)
      instrumentid,
      close,
      previousclose
    FROM marketdata
    WHERE instrumentid = ANY($1::int[]) AND close IS NOT NULL
    ORDER BY instrumentid, date DESC, id DESC;
  `;
  const { rows } = await db.query<MarketRow>(query, [instrumentIds]);
  return rows;
};
