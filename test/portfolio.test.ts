import request from 'supertest';
import app from '../src/app';
import { pool } from '../src/db/connection';
import { createTradingFixture, removeTradingFixture, Fixture } from './fixtures';

describe('Portfolio', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createTradingFixture();
  });

  afterEach(async () => {
    await removeTradingFixture(fixture);
  });

  test('arma pesos, tenencia y rendimiento con las órdenes FILLED', async () => {
    await pool.query(
      `INSERT INTO orders (instrumentid, userid, size, price, type, side, status, datetime)
       VALUES ($1, $2, 500, 1, 'MARKET', 'CASH_OUT', 'FILLED', NOW())`,
      [fixture.arsId, fixture.userId]
    );

    const response = await request(app).get(`/api/portfolio?userId=${fixture.userId}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.availableCash).toBe(8500);
    expect(response.body.accountValue).toBe(9600);
    expect(response.body.warnings).toBeUndefined();
    expect(response.body.assets).toEqual([
      expect.objectContaining({
        instrumentId: fixture.instrumentId,
        shares: 10,
        currentPrice: 110,
        totalValue: 1100,
        returnPercentage: 10,
        dailyReturnPercentage: 22.22,
      }),
    ]);
  });

  test('no valúa en 0 un activo sin precio: lo informa y lo deja fuera del total', async () => {
    const noPrice = await pool.query(
      "INSERT INTO instruments (ticker, name, type) VALUES ($1, 'Sin precio', 'ACCIONES') RETURNING id",
      [`N${fixture.userId}`.slice(0, 10)]
    );
    const noPriceId = noPrice.rows[0].id;

    try {
      await pool.query(
        `INSERT INTO orders (instrumentid, userid, size, price, type, side, status, datetime)
         VALUES ($1, $2, 1, 50, 'MARKET', 'BUY', 'FILLED', NOW())`,
        [noPriceId, fixture.userId]
      );

      const response = await request(app).get(`/api/portfolio?userId=${fixture.userId}`);
      const asset = response.body.assets.find((item: { instrumentId: number }) => item.instrumentId === noPriceId);

      expect(response.statusCode).toBe(200);
      expect(asset).toEqual(
        expect.objectContaining({ shares: 1, currentPrice: null, totalValue: null, returnPercentage: null })
      );
      expect(response.body.warnings).toHaveLength(1);
      // cash 9000 - 50 = 8950, más 10 acciones valuadas en 1100; el activo sin precio no suma.
      expect(response.body.availableCash).toBe(8950);
      expect(response.body.accountValue).toBe(10050);
    } finally {
      await pool.query('DELETE FROM orders WHERE instrumentid = $1', [noPriceId]);
      await pool.query('DELETE FROM instruments WHERE id = $1', [noPriceId]);
    }
  });

  test('responde 400 si no se envía el userId', async () => {
    const response = await request(app).get('/api/portfolio');

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('responde 400 si el userId no es un entero positivo', async () => {
    for (const userId of ['abc', '1.5', '-3', '0']) {
      const response = await request(app).get('/api/portfolio').query({ userId });
      expect(response.statusCode).toBe(400);
    }
  });

  test('responde 404 si el usuario no existe', async () => {
    const response = await request(app).get('/api/portfolio?userId=2147483647');

    expect(response.statusCode).toBe(404);
    expect(response.body.error).toBe('Usuario inexistente');
  });
});
