import { HttpError } from '../../src/http-error';
import { normalizeOrder } from '../../src/services/orders/order-input';
import type { OrderPayload } from '../../src/services/orders/orders.types';

const trade = (overrides: OrderPayload = {}): OrderPayload => ({
  userId: 1, instrumentId: 5, side: 'BUY', type: 'MARKET', size: 10, ...overrides,
});

// Verifica que la validación rechace con un 400 y (opcionalmente) con ese mensaje.
const expectInvalid = (payload: OrderPayload, message?: string) => {
  let error: unknown;
  try {
    normalizeOrder(payload);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).statusCode).toBe(400);
  if (message) expect((error as HttpError).message).toContain(message);
};

describe('normalizeOrder: compra y venta', () => {
  test('MARKET por cantidad', () => {
    expect(normalizeOrder(trade())).toEqual({
      isCash: false, userId: 1, side: 'BUY', type: 'MARKET', instrumentId: 5, size: 10,
    });
  });

  test('LIMIT con precio', () => {
    expect(normalizeOrder(trade({ type: 'LIMIT', price: 150.5 }))).toMatchObject({
      type: 'LIMIT', limitPrice: 150.5, size: 10,
    });
  });

  test('por monto en pesos', () => {
    const order = normalizeOrder(trade({ size: undefined, amount: 2500 }));

    expect(order).toMatchObject({ amount: 2500 });
    expect(order).not.toHaveProperty('size');
  });

  test('si vienen size y amount se usa size', () => {
    expect(normalizeOrder(trade({ amount: 999 }))).toMatchObject({ size: 10 });
    expect(normalizeOrder(trade({ amount: 999 }))).not.toHaveProperty('amount');
  });

  test('acepta números como string', () => {
    expect(normalizeOrder(trade({ userId: '1', instrumentId: '5', size: '10' }))).toMatchObject({
      userId: 1, instrumentId: 5, size: 10,
    });
  });

  test('acepta SELL', () => {
    expect(normalizeOrder(trade({ side: 'SELL' }))).toMatchObject({ side: 'SELL' });
  });

  test('rechaza campos faltantes', () => {
    expectInvalid(trade({ userId: undefined }), 'userId');
    expectInvalid(trade({ side: undefined }), 'side');
    expectInvalid(trade({ type: undefined }), 'type');
    expectInvalid(trade({ instrumentId: undefined }), 'instrumentId');
    expectInvalid(trade({ size: undefined }), 'size o amount');
  });

  test('rechaza side y type desconocidos', () => {
    expectInvalid(trade({ side: 'HOLD' }), 'side');
    expectInvalid(trade({ type: 'STOP' }), 'type');
    expectInvalid(trade({ side: 'buy' }), 'side');
  });

  test('rechaza ids, size y monto inválidos', () => {
    for (const userId of ['abc', true, 0, -1, 1.5, null]) expectInvalid(trade({ userId }));
    for (const instrumentId of ['abc', 0, 2.5]) expectInvalid(trade({ instrumentId }));
    for (const size of [0, -1, 1.5, 'mucho']) expectInvalid(trade({ size }));
    for (const amount of [0, -10, 'abc']) expectInvalid(trade({ size: undefined, amount }));
  });

  test('LIMIT exige un precio positivo', () => {
    expectInvalid(trade({ type: 'LIMIT' }), 'precio');
    expectInvalid(trade({ type: 'LIMIT', price: 0 }));
    expectInvalid(trade({ type: 'LIMIT', price: -5 }));
    expectInvalid(trade({ type: 'LIMIT', price: 'abc' }));
  });

  test('MARKET no lleva precio', () => {
    expectInvalid(trade({ price: 100 }), 'MARKET');
  });
});

describe('normalizeOrder: transferencias', () => {
  const cash = (overrides: OrderPayload = {}): OrderPayload => ({ userId: 1, side: 'CASH_IN', amount: 500, ...overrides });

  test('CASH_IN y CASH_OUT por amount, sin instrumentId ni type', () => {
    expect(normalizeOrder(cash())).toEqual({ isCash: true, userId: 1, side: 'CASH_IN', type: 'MARKET', pesos: 500 });
    expect(normalizeOrder(cash({ side: 'CASH_OUT' }))).toMatchObject({ side: 'CASH_OUT', pesos: 500 });
  });

  test('también acepta size como monto', () => {
    expect(normalizeOrder(cash({ amount: undefined, size: 300 }))).toMatchObject({ pesos: 300 });
  });

  test('acepta type MARKET explícito', () => {
    expect(normalizeOrder(cash({ type: 'MARKET' }))).toMatchObject({ type: 'MARKET' });
  });

  test('rechaza type LIMIT y price', () => {
    expectInvalid(cash({ type: 'LIMIT' }), 'LIMIT');
    expectInvalid(cash({ price: 1 }), 'price');
  });

  test('exige pesos enteros y positivos', () => {
    expectInvalid(cash({ amount: undefined }), 'amount');
    for (const amount of [0, -5, 10.5, 'abc']) expectInvalid(cash({ amount }));
  });
});
