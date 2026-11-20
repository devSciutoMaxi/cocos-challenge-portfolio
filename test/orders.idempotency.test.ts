import request from 'supertest';
import app from '../src/app';
import { pool } from '../src/db/connection';
import { createTradingFixture, removeTradingFixture, Fixture } from './fixtures';

describe('Idempotencia de órdenes (Idempotency-Key)', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createTradingFixture(); // 10000 pesos de CASH_IN y 10 acciones compradas a 100
  });

  afterEach(async () => {
    await removeTradingFixture(fixture);
  });

  const buy = (size: number, key?: string, userId = fixture.userId) => {
    const req = request(app).post('/api/orders');
    if (key) req.set('Idempotency-Key', key);
    return req.send({ userId, instrumentId: fixture.instrumentId, side: 'BUY', type: 'MARKET', size });
  };

  const countOrders = async () => {
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM orders WHERE userid = $1', [fixture.userId]);
    return rows[0].n as number;
  };

  test('un reintento con la misma key devuelve la misma orden y no crea otra', async () => {
    const first = await buy(1, 'key-1');
    const retry = await buy(1, 'key-1');

    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(retry.headers['idempotent-replayed']).toBe('true');

    expect(await countOrders()).toBe(3); // CASH_IN + BUY inicial + una sola compra nueva
    const account = await request(app).get(`/api/portfolio?userId=${fixture.userId}`);
    expect(account.body.availableCash).toBe(8890); // 10000 - 1000 - 110, descontado una sola vez
  });

  test('la misma key enviada varias veces a la vez crea una sola orden', async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => buy(1, 'key-paralela')));

    const ids = new Set(responses.map((response) => response.body.id));
    expect(ids.size).toBe(1);
    expect(responses.every((response) => response.statusCode === 201)).toBe(true);
    expect(await countOrders()).toBe(3);
  });

  test('la misma key con una orden distinta responde 422 y no crea nada', async () => {
    await buy(1, 'key-2');
    const other = await buy(2, 'key-2');

    expect(other.statusCode).toBe(422);
    expect(await countOrders()).toBe(3);
  });

  test('sin key, dos órdenes iguales son dos órdenes (comportamiento de siempre)', async () => {
    await buy(1);
    await buy(1);

    expect(await countOrders()).toBe(4);
  });

  test('una orden rechazada también se guarda: el reintento devuelve el mismo rechazo', async () => {
    const first = await buy(1000000, 'key-rechazo'); // no alcanzan los pesos
    const retry = await buy(1000000, 'key-rechazo');

    expect(first.statusCode).toBe(400);
    expect(retry.statusCode).toBe(400);
    expect(retry.body.order.id).toBe(first.body.order.id);
    expect(await countOrders()).toBe(3); // una sola REJECTED
  });

  test('un error de validación no consume la key: se puede reintentar corregido', async () => {
    const invalid = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'key-3')
      .send({ userId: fixture.userId, instrumentId: fixture.instrumentId, side: 'BUY', type: 'MARKET' });
    expect(invalid.statusCode).toBe(400);

    const fixed = await buy(1, 'key-3');
    expect(fixed.statusCode).toBe(201);
  });

  test('la misma key en usuarios distintos no choca', async () => {
    const otherFixture = await createTradingFixture();
    try {
      const mine = await buy(1, 'key-compartida');
      const theirs = await request(app)
        .post('/api/orders')
        .set('Idempotency-Key', 'key-compartida')
        .send({ userId: otherFixture.userId, instrumentId: otherFixture.instrumentId, side: 'BUY', type: 'MARKET', size: 1 });

      expect(theirs.statusCode).toBe(201);
      expect(theirs.body.id).not.toBe(mine.body.id);
    } finally {
      await removeTradingFixture(otherFixture);
    }
  });

  test('una key vacía o demasiado larga responde 400', async () => {
    const empty = await buy(1, ' ');
    const tooLong = await buy(1, 'k'.repeat(101));

    expect(empty.statusCode).toBe(400);
    expect(tooLong.statusCode).toBe(400);
  });
});