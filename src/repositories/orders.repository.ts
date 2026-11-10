import { pool } from '../db/connection';
import type { Db, Instrument, NewOrder, OrderRow } from '../types';

// Obtener último precio de marketdata para un instrumento
export const getLatestMarketPrice = async (instrumentId: number, db: Db = pool): Promise<number | null> => {
  const query = `
    SELECT close
    FROM marketdata
    WHERE instrumentid = $1 AND close IS NOT NULL
    ORDER BY date DESC, id DESC
    LIMIT 1;
  `;
  const { rows } = await db.query<{ close: string }>(query, [instrumentId]);
  return rows.length > 0 ? parseFloat(rows[0].close) : null;
};

// Insertar una nueva orden.
// La fecha la asigna la base (NOW()) para que todas las órdenes usen el mismo reloj.
export const createOrderRecord = async (orderData: NewOrder, db: Db = pool): Promise<OrderRow> => {
  const { instrumentId, userId, size, price, type, side, status, datetime } = orderData;
  const query = `
    INSERT INTO orders (instrumentid, userid, size, price, type, side, status, datetime)
    VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
    RETURNING *;
  `;
  const values = [instrumentId, userId, size, price, type, side, status, datetime || null];
  const { rows } = await db.query<OrderRow>(query, values);
  return rows[0];
};

export const getInstrumentById = async (instrumentId: number, db: Db = pool): Promise<Instrument | null> => {
  const { rows } = await db.query<Instrument>(
    'SELECT id, ticker, name, type FROM instruments WHERE id = $1',
    [instrumentId]
  );
  return rows[0] || null;
};

// Instrumento que representa los pesos (cash), tipo MONEDA.
export const getCashInstrument = async (db: Db = pool): Promise<Instrument | null> => {
  const { rows } = await db.query<Instrument>(
    `SELECT id, ticker, name, type
       FROM instruments
      WHERE type = 'MONEDA' AND ticker = 'ARS'
      ORDER BY id ASC
      LIMIT 1`
  );
  return rows[0] || null;
};

export const findOrderById = async (orderId: number, db: Db = pool): Promise<OrderRow | null> => {
  const { rows } = await db.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [orderId]);
  return rows[0] || null;
};

// Cancela solo si la orden sigue en NEW. Un único UPDATE condicional evita carreras.
export const cancelOrderIfNew = async (orderId: number, db: Db = pool): Promise<OrderRow | null> => {
  const { rows } = await db.query<OrderRow>(
    `UPDATE orders SET status = 'CANCELLED' WHERE id = $1 AND status = 'NEW' RETURNING *`,
    [orderId]
  );
  return rows[0] || null;
};
