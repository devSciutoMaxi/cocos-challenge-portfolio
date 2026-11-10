import request from 'supertest';
import app from '../src/app';
import { createTradingFixture, removeTradingFixture, Fixture } from './fixtures';

describe('Órdenes simultáneas del mismo usuario', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createTradingFixture();
  });

  afterEach(async () => {
    await removeTradingFixture(fixture);
  });

  const buy = (size: number) =>
    request(app).post('/api/orders').send({
      userId: fixture.userId,
      instrumentId: fixture.instrumentId,
      side: 'BUY',
      type: 'MARKET',
      size,
    });

  test('no gasta dos veces el mismo saldo: con 9000 pesos solo entra una compra de 5500', async () => {
    // Cada compra cuesta 50 * 110 = 5500. Con 9000 alcanza para una sola.
    const responses = await Promise.all([buy(50), buy(50)]);
    const statuses = responses.map((response) => response.body.status || response.body.order.status).sort();

    expect(statuses).toEqual(['FILLED', 'REJECTED']);

    const account = await request(app).get(`/api/portfolio?userId=${fixture.userId}`);
    expect(account.body.availableCash).toBe(3500);
    expect(account.body.assets[0].shares).toBe(60);
  });

  test('con varias compras a la vez nunca queda saldo negativo', async () => {
    // 9000 / (20 * 110 = 2200) -> entran 4 de las 8.
    const responses = await Promise.all(Array.from({ length: 8 }, () => buy(20)));
    const filled = responses.filter((response) => response.statusCode === 201);

    expect(filled).toHaveLength(4);

    const account = await request(app).get(`/api/portfolio?userId=${fixture.userId}`);
    expect(account.body.availableCash).toBe(200);
    expect(account.body.availableCash).toBeGreaterThanOrEqual(0);
  });

  test('una orden cancelada dos veces a la vez solo se cancela una', async () => {
    const created = await request(app).post('/api/orders').send({
      userId: fixture.userId,
      instrumentId: fixture.instrumentId,
      side: 'BUY',
      type: 'LIMIT',
      size: 1,
      price: 50,
    });

    const results = await Promise.all([
      request(app).patch(`/api/orders/${created.body.id}/cancel`),
      request(app).patch(`/api/orders/${created.body.id}/cancel`),
    ]);

    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 400]);
  });
});
