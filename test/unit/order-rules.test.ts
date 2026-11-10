import { HttpError } from '../../src/http-error';
import type { TradeOrder } from '../../src/services/orders/orders.types';
import {
  decideStatus,
  getRejectionReason,
  INSUFFICIENT_FUNDS,
  INSUFFICIENT_SHARES,
  resolveTradeSize,
} from '../../src/services/orders/order-rules';
import { buildLedger } from '../../src/services/portfolio/ledger';
import type { LedgerOrder } from '../../src/services/portfolio/portfolio.types';

const GGAL = 2;

// Ledger de ejemplo: 9000 pesos y 10 acciones de GGAL.
const orders: LedgerOrder[] = [
  { instrumentid: 1, size: 10000, price: '1.00', side: 'CASH_IN', type: 'MONEDA', ticker: 'ARS', name: 'Pesos' },
  { instrumentid: GGAL, size: 10, price: '100.00', side: 'BUY', type: 'ACCIONES', ticker: 'GGAL', name: 'Galicia' },
];
const ledger = buildLedger(orders);

const tradeOrder = (overrides: Partial<TradeOrder> = {}): TradeOrder => ({
  isCash: false, userId: 1, side: 'BUY', type: 'MARKET', instrumentId: GGAL, size: 1, ...overrides,
});

describe('resolveTradeSize', () => {
  test('usa size si viene', () => {
    expect(resolveTradeSize(tradeOrder({ size: 7 }), 110)).toBe(7);
  });

  test('con amount, calcula la cantidad entera máxima (sin fracciones)', () => {
    expect(resolveTradeSize(tradeOrder({ size: undefined, amount: 250 }), 110)).toBe(2);
    expect(resolveTradeSize(tradeOrder({ size: undefined, amount: 220 }), 110)).toBe(2);
    expect(resolveTradeSize(tradeOrder({ size: undefined, amount: 219.99 }), 110)).toBe(1);
  });

  test('si el monto no alcanza para una acción, lanza 400', () => {
    let error: unknown;
    try {
      resolveTradeSize(tradeOrder({ size: undefined, amount: 50 }), 110);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBe(400);
  });
});

describe('getRejectionReason', () => {
  const reason = (side: 'BUY' | 'SELL' | 'CASH_IN' | 'CASH_OUT', size: number, price = 110) =>
    getRejectionReason({ side, size, price, instrumentId: GGAL, ledger });

  test('BUY: acepta si alcanzan los pesos, incluso justo', () => {
    expect(reason('BUY', 81)).toBeNull(); // 81 * 110 = 8910 <= 9000
    expect(reason('BUY', 90, 100)).toBeNull(); // exactamente 9000
  });

  test('BUY: rechaza si faltan pesos, aunque sea un centavo', () => {
    expect(reason('BUY', 82)).toBe(INSUFFICIENT_FUNDS); // 9020 > 9000
    expect(reason('BUY', 1, 9000.01)).toBe(INSUFFICIENT_FUNDS);
  });

  test('SELL: acepta hasta las acciones que tiene', () => {
    expect(reason('SELL', 10)).toBeNull();
  });

  test('SELL: rechaza si vende más de lo que tiene o no tiene el instrumento', () => {
    expect(reason('SELL', 11)).toBe(INSUFFICIENT_SHARES);
    expect(
      getRejectionReason({ side: 'SELL', size: 1, price: 110, instrumentId: 99, ledger })
    ).toBe(INSUFFICIENT_SHARES);
  });

  test('CASH_OUT: acepta hasta el saldo y rechaza si lo supera', () => {
    expect(reason('CASH_OUT', 9000)).toBeNull();
    expect(reason('CASH_OUT', 9001)).toBe(INSUFFICIENT_FUNDS);
  });

  test('CASH_IN: siempre se acepta', () => {
    expect(reason('CASH_IN', 1_000_000)).toBeNull();
  });

  test('un usuario sin órdenes no puede comprar ni vender', () => {
    const empty = buildLedger([]);

    expect(getRejectionReason({ side: 'BUY', size: 1, price: 1, instrumentId: GGAL, ledger: empty })).toBe(INSUFFICIENT_FUNDS);
    expect(getRejectionReason({ side: 'SELL', size: 1, price: 1, instrumentId: GGAL, ledger: empty })).toBe(INSUFFICIENT_SHARES);
  });
});

describe('decideStatus', () => {
  test('MARKET se ejecuta y LIMIT queda NEW', () => {
    expect(decideStatus('MARKET', null)).toBe('FILLED');
    expect(decideStatus('LIMIT', null)).toBe('NEW');
  });

  test('con motivo de rechazo siempre es REJECTED', () => {
    expect(decideStatus('MARKET', INSUFFICIENT_FUNDS)).toBe('REJECTED');
    expect(decideStatus('LIMIT', INSUFFICIENT_SHARES)).toBe('REJECTED');
  });
});
