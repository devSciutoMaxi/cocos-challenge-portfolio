import request from 'supertest';
import app from '../src/app';
import { createTradingFixture, removeTradingFixture, Fixture } from './fixtures';

describe('Órdenes', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createTradingFixture();
  });

  afterEach(async () => {
    await removeTradingFixture(fixture);
  });

  const portfolio = () => request(app).get(`/api/portfolio?userId=${fixture.userId}`);

  test('ejecuta una MARKET al close y descuenta el cash', async () => {
    const response = await request(app).post('/api/orders').send({
      userId: fixture.userId,
      instrumentId: fixture.instrumentId,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.status).toBe('FILLED');
    expect(response.body.price).toBe('110.00');
    expect(Number(response.body.size)).toBe(1);

    const account = await portfolio();
    expect(account.body.availableCash).toBe(8890);
    expect(account.body.assets[0].shares).toBe(11);
  });

  test('deja una LIMIT en NEW sin mover el portfolio', async () => {
    const response = await request(app).post('/api/orders').send({
      userId: fixture.userId,
      instrumentId: fixture.instrumentId,
      side: 'BUY',
      type: 'LIMIT',
      size: 1,
      price: 50,
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.status).toBe('NEW');

    const account = await portfolio();
    expect(account.body.availableCash).toBe(9000);
    expect(account.body.assets[0].shares).toBe(10);
  });

  test('convierte un monto en pesos a la cantidad entera máxima de acciones', async () => {
    const response = await request(app).post('/api/orders').send({
      userId: fixture.userId,
      instrumentId: fixture.instrumentId,
      side: 'BUY',
      type: 'MARKET',
      amount: 250,
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.status).toBe('FILLED');
    expect(Number(response.body.size)).toBe(2);

    const account = await portfolio();
    expect(account.body.availableCash).toBe(8780);
    expect(account.body.assets[0].shares).toBe(12);
  });

  test('guarda REJECTED una compra por más pesos de los disponibles', async () => {
    const response = await request(app).post('/api/orders').send({
      userId: fixture.userId,
      instrumentId: fixture.instrumentId,
      side: 'BUY',
      type: 'MARKET',
      amount: 999999,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.order.status).toBe('REJECTED');
    expect(response.body.reason).toBe('Fondos insuficientes (Cash ARS)');

    const account = await portfolio();
    expect(account.body.availableCash).toBe(9000);
    expect(account.body.assets[0].shares).toBe(10);
  });

  test('guarda REJECTED una venta por más acciones de las que hay', async () => {
    const response = await request(app).post('/api/orders').send({
      userId: fixture.userId,
      instrumentId: fixture.instrumentId,
      side: 'SELL',
      type: 'MARKET',
      size: 100,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.order.status).toBe('REJECTED');
    expect(response.body.reason).toBe('No hay acciones suficientes de este activo');

    const account = await portfolio();
    expect(account.body.availableCash).toBe(9000);
    expect(account.body.assets[0].shares).toBe(10);
  });

  test('ejecuta una venta MARKET y suma los pesos cobrados', async () => {
    const response = await request(app).post('/api/orders').send({
      userId: fixture.userId,
      instrumentId: fixture.instrumentId,
      side: 'SELL',
      type: 'MARKET',
      size: 2,
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.status).toBe('FILLED');

    const account = await portfolio();
    expect(account.body.availableCash).toBe(9220);
    expect(account.body.assets[0].shares).toBe(8);
    expect(account.body.assets[0].totalValue).toBe(880);
    expect(account.body.assets[0].returnPercentage).toBe(10);
    expect(account.body.accountValue).toBe(10100);
  });

  test('cancela una orden NEW y rechaza cancelar una FILLED', async () => {
    const created = await request(app).post('/api/orders').send({
      userId: fixture.userId,
      instrumentId: fixture.instrumentId,
      side: 'BUY',
      type: 'LIMIT',
      size: 1,
      price: 50,
    });

    const cancelled = await request(app).patch(`/api/orders/${created.body.id}/cancel`);
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    const account = await portfolio();
    expect(account.body.availableCash).toBe(9000);
    expect(account.body.assets[0].shares).toBe(10);

    const filled = await request(app).post('/api/orders').send({
      userId: fixture.userId,
      instrumentId: fixture.instrumentId,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    });
    const rejected = await request(app).patch(`/api/orders/${filled.body.id}/cancel`);
    expect(rejected.statusCode).toBe(400);
    expect(rejected.body.error).toBe('Solo se pueden cancelar órdenes en estado NEW');
  });

  test('responde 400 si una LIMIT no trae precio y no guarda la orden', async () => {
    const before = await portfolio();
    const response = await request(app).post('/api/orders').send({
      userId: fixture.userId,
      instrumentId: fixture.instrumentId,
      side: 'BUY',
      type: 'LIMIT',
      size: 1,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.order).toBeUndefined();

    const after = await portfolio();
    expect(after.body).toEqual(before.body);
  });
});
