import request from 'supertest';
import app from '../src/app';
import { pool } from '../src/db/connection';
import { buildLedger } from '../src/services/portfolio/ledger';
import * as portfolioRepository from '../src/repositories/portfolio.repository';
import { createTradingFixture, removeTradingFixture, Fixture } from './fixtures';

describe('Proyección de saldo y posiciones', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createTradingFixture(); // 10000 pesos de CASH_IN y 10 acciones compradas a 100 (por SQL)
  });

  afterEach(async () => {
    await removeTradingFixture(fixture);
  });

  const send = (body: object) => request(app).post('/api/orders').send({ userId: fixture.userId, ...body });
  const buy = (size: number) => send({ instrumentId: fixture.instrumentId, side: 'BUY', type: 'MARKET', size });
  const sell = (size: number) => send({ instrumentId: fixture.instrumentId, side: 'SELL', type: 'MARKET', size });

  const projection = async () => {
    const balance = await pool.query('SELECT cash, last_order_id FROM account_balance WHERE userid = $1', [fixture.userId]);
    const positions = await pool.query(
      'SELECT instrumentid, shares, cost FROM account_positions WHERE userid = $1 ORDER BY instrumentid',
      [fixture.userId]
    );
    return { balance: balance.rows[0], positions: positions.rows };
  };

  const lastFilledId = async () => {
    const { rows } = await pool.query(
      "SELECT MAX(id)::int AS last FROM orders WHERE userid = $1 AND status = 'FILLED'",
      [fixture.userId]
    );
    return rows[0].last as number;
  };

  test('tras varias operaciones, la proyección coincide con el ledger calculado desde las órdenes', async () => {
    await buy(5); // 5 * 110 = 550
    await sell(3); // 3 * 110 = 330
    await send({ side: 'CASH_OUT', amount: 500 });
    await send({ side: 'CASH_IN', amount: 1000 });

    const ledger = buildLedger(await portfolioRepository.getFilledOrdersByUserId(fixture.userId));
    const { balance, positions } = await projection();

    expect(Number(balance.cash)).toBeCloseTo(ledger.cash, 2);
    expect(balance.cash).toBe('9280.00'); // 9000 (fixture) - 550 + 330 - 500 + 1000
    expect(balance.last_order_id).toBe(await lastFilledId());

    const position = ledger.positions.get(fixture.instrumentId)!;
    expect(positions).toHaveLength(1);
    expect(positions[0].shares).toBe(position.shares);
    expect(Number(positions[0].cost)).toBeCloseTo(position.cost, 4);
  });

  test('una compra sin fondos se rechaza con la proyección y no la modifica', async () => {
    await buy(1); // crea la proyección
    const before = await projection();

    const rejected = await buy(1000);
    expect(rejected.statusCode).toBe(400);

    expect(await projection()).toEqual(before);
  });

  test('si alguien inserta una orden por fuera de la API, la proyección se reconstruye sola', async () => {
    await buy(1); // la proyección ya existe y está al día
    await pool.query(
      `INSERT INTO orders (instrumentid, userid, size, price, type, side, status, datetime)
       VALUES ($1, $2, 2000, 1, 'MARKET', 'CASH_IN', 'FILLED', clock_timestamp())`,
      [fixture.arsId, fixture.userId]
    );

    await buy(1); // detecta que last_order_id quedó viejo y reconstruye antes de decidir

    const ledger = buildLedger(await portfolioRepository.getFilledOrdersByUserId(fixture.userId));
    const { balance } = await projection();
    expect(Number(balance.cash)).toBeCloseTo(ledger.cash, 2);
    expect(balance.last_order_id).toBe(await lastFilledId());
  });

  test('varias compras a la vez: la proyección nunca queda negativa y coincide con el portfolio', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => buy(20))); // 20 * 110 = 2200 cada una
    expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(4);

    const { balance } = await projection();
    const account = await request(app).get(`/api/portfolio?userId=${fixture.userId}`);
    expect(Number(balance.cash)).toBe(account.body.availableCash);
    expect(Number(balance.cash)).toBeGreaterThanOrEqual(0);
  });

  test('la base impide un saldo negativo (CHECK cash >= 0)', async () => {
    await buy(1);

    await expect(
      pool.query('UPDATE account_balance SET cash = -1 WHERE userid = $1', [fixture.userId])
    ).rejects.toThrow(/check/i);
  });
});
