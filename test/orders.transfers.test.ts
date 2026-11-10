import request from 'supertest';
import app from '../src/app';
import { createTradingFixture, removeTradingFixture, Fixture } from './fixtures';

describe('Transferencias CASH_IN y CASH_OUT', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createTradingFixture();
  });

  afterEach(async () => {
    await removeTradingFixture(fixture);
  });

  const send = (body: Record<string, unknown>) => request(app).post('/api/orders').send({ userId: fixture.userId, ...body });
  const portfolio = () => request(app).get(`/api/portfolio?userId=${fixture.userId}`);

  test('CASH_IN queda FILLED sobre ARS y suma pesos (sin enviar instrumentId)', async () => {
    const response = await send({ side: 'CASH_IN', amount: 500 });

    expect(response.statusCode).toBe(201);
    expect(response.body.status).toBe('FILLED');
    expect(response.body.side).toBe('CASH_IN');
    expect(response.body.instrumentid).toBe(fixture.arsId);
    expect(Number(response.body.size)).toBe(500);
    expect(Number(response.body.price)).toBe(1);

    const account = await portfolio();
    expect(account.body.availableCash).toBe(9500);
    expect(account.body.accountValue).toBe(10600);
  });

  test('CASH_OUT resta pesos', async () => {
    const response = await send({ side: 'CASH_OUT', size: 400 });

    expect(response.statusCode).toBe(201);
    expect(response.body.status).toBe('FILLED');
    expect((await portfolio()).body.availableCash).toBe(8600);
  });

  test('guarda REJECTED un CASH_OUT mayor a los pesos disponibles', async () => {
    const response = await send({ side: 'CASH_OUT', amount: 9001 });

    expect(response.statusCode).toBe(400);
    expect(response.body.order.status).toBe('REJECTED');
    expect(response.body.reason).toBe('Fondos insuficientes (Cash ARS)');
    expect((await portfolio()).body.availableCash).toBe(9000);
  });

  test('responde 400 si el monto no es un entero positivo', async () => {
    for (const amount of [0, -5, 10.5, 'abc']) {
      const response = await send({ side: 'CASH_IN', amount });
      expect(response.statusCode).toBe(400);
    }
    expect((await send({ side: 'CASH_IN' })).statusCode).toBe(400);
  });

  test('responde 400 si una transferencia trae type LIMIT o price', async () => {
    expect((await send({ side: 'CASH_IN', amount: 100, type: 'LIMIT' })).statusCode).toBe(400);
    expect((await send({ side: 'CASH_IN', amount: 100, price: 5 })).statusCode).toBe(400);
  });
});
