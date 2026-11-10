import { pool } from '../src/db/connection';

export interface Fixture {
  userId: number;
  instrumentId: number;
  arsId: number;
  arsCreated: boolean;
  ticker: string;
  name: string;
}

// Crea un usuario, un activo con precio y movimientos propios. No depende de datos previos en la base:
// si falta el instrumento ARS (MONEDA) lo crea y lo borra al terminar.
export const createTradingFixture = async (): Promise<Fixture> => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const userResult = await pool.query(
    'INSERT INTO users (email, accountnumber) VALUES ($1, $2) RETURNING id',
    [`test-${stamp}@example.com`, `T${stamp}`.slice(0, 20)]
  );
  const userId = userResult.rows[0].id;

  let arsCreated = false;
  let arsResult = await pool.query(
    "SELECT id FROM instruments WHERE type = 'MONEDA' AND ticker = 'ARS' ORDER BY id LIMIT 1"
  );
  if (!arsResult.rows[0]) {
    arsResult = await pool.query(
      "INSERT INTO instruments (ticker, name, type) VALUES ('ARS', 'Pesos', 'MONEDA') RETURNING id"
    );
    arsCreated = true;
  }
  const arsId = arsResult.rows[0].id;

  const ticker = `Z${userId}`.slice(0, 10);
  const name = `Activo de prueba ${stamp}`;
  const instrumentResult = await pool.query(
    "INSERT INTO instruments (ticker, name, type) VALUES ($1, $2, 'ACCIONES') RETURNING id",
    [ticker, name]
  );
  const instrumentId = instrumentResult.rows[0].id;

  await pool.query(
    `INSERT INTO marketdata (instrumentid, high, low, open, close, previousclose, date)
     VALUES ($1, 120, 90, 100, 110, 90, CURRENT_DATE)`,
    [instrumentId]
  );

  await pool.query(
    `INSERT INTO orders (instrumentid, userid, size, price, type, side, status, datetime)
     VALUES
       ($1, $2, 10000, 1, 'MARKET', 'CASH_IN', 'FILLED', NOW()),
       ($3, $2, 10, 100, 'MARKET', 'BUY', 'FILLED', NOW())`,
    [arsId, userId, instrumentId]
  );

  return { userId, instrumentId, arsId, arsCreated, ticker, name };
};

export const removeTradingFixture = async ({ userId, instrumentId, arsId, arsCreated }: Fixture): Promise<void> => {
  if (!userId) return;
  await pool.query('DELETE FROM orders WHERE userid = $1', [userId]);
  if (instrumentId) {
    await pool.query('DELETE FROM marketdata WHERE instrumentid = $1', [instrumentId]);
    await pool.query('DELETE FROM instruments WHERE id = $1', [instrumentId]);
  }
  if (arsCreated) await pool.query('DELETE FROM instruments WHERE id = $1', [arsId]);
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
};
