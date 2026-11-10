import request from 'supertest';
import app from '../src/app';
import { pool } from '../src/db/connection';
import { createTradingFixture, removeTradingFixture, Fixture } from './fixtures';

describe('Validación de órdenes', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createTradingFixture();
  });

  afterEach(async () => {
    await removeTradingFixture(fixture);
  });

  const valid = () => ({
    userId: fixture.userId,
    instrumentId: fixture.instrumentId,
    side: 'BUY',
    type: 'MARKET',
    size: 1,
  });
  const send = (overrides: Record<string, unknown>) => request(app).post('/api/orders').send({ ...valid(), ...overrides });
  const ordersCount = async () => {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM orders WHERE userid = $1', [fixture.userId]);
    return rows[0].n;
  };

  test('responde 400 y no guarda nada si side o type no son válidos', async () => {
    const before = await ordersCount();

    const badSide = await send({ side: 'HOLD' });
    const badType = await send({ type: 'STOP' });
    const noSide = await send({ side: undefined });
    const noType = await send({ type: undefined });

    for (const response of [badSide, badType, noSide, noType]) {
      expect(response.statusCode).toBe(400);
      expect(response.body.order).toBeUndefined();
    }
    expect(await ordersCount()).toBe(before);
  });

  test('responde 400 si userId, instrumentId, size o price no son números válidos', async () => {
    const cases = [
      { userId: 'abc' },
      { userId: true },
      { instrumentId: 'abc' },
      { instrumentId: 1.5 },
      { size: 0 },
      { size: -1 },
      { size: 1.5 },
      { size: 'mucho' },
      { type: 'LIMIT', price: -10 },
      { type: 'LIMIT', price: 'abc' },
    ];

    for (const overrides of cases) {
      const response = await send(overrides);
      expect(response.statusCode).toBe(400);
    }
  });

  test('responde 400 si una MARKET trae price', async () => {
    expect((await send({ price: 100 })).statusCode).toBe(400);
  });

  test('responde 400 si falta size y amount', async () => {
    expect((await send({ size: undefined })).statusCode).toBe(400);
  });

  test('responde 400 si el monto no alcanza para una acción', async () => {
    const response = await send({ size: undefined, amount: 50 });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe('El monto no alcanza para una acción');
  });

  test('responde 404 si el usuario o el instrumento no existen', async () => {
    expect((await send({ userId: 2147483647 })).statusCode).toBe(404);
    expect((await send({ instrumentId: 2147483647 })).statusCode).toBe(404);
  });

  test('responde 400 si se intenta operar el instrumento ARS con BUY', async () => {
    const response = await send({ instrumentId: fixture.arsId });

    expect(response.statusCode).toBe(400);
  });

  test('responde 422 si el activo no tiene precio de mercado (MARKET)', async () => {
    await pool.query('DELETE FROM marketdata WHERE instrumentid = $1', [fixture.instrumentId]);

    const response = await send({});

    expect(response.statusCode).toBe(422);
  });

  test('responde 400 con JSON mal formado y 404 con una ruta inexistente', async () => {
    const malformed = await request(app)
      .post('/api/orders')
      .set('Content-Type', 'application/json')
      .send('{"userId": ');
    const unknown = await request(app).get('/api/nada');

    expect(malformed.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(404);
  });

  test('cancelar: 400 con id inválido, 404 si no existe', async () => {
    expect((await request(app).patch('/api/orders/abc/cancel')).statusCode).toBe(400);
    expect((await request(app).patch('/api/orders/2147483647/cancel')).statusCode).toBe(404);
  });
});
