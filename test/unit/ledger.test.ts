import { buildLedger, heldPositions, sharesOf } from '../../src/services/portfolio/ledger';
import type { LedgerOrder } from '../../src/services/portfolio/portfolio.types';

const ARS = 1;
const GGAL = 2;
const PAMP = 3;

const cash = (side: 'CASH_IN' | 'CASH_OUT', size: number): LedgerOrder => ({
  instrumentid: ARS, size, price: '1.00', side, type: 'MONEDA', ticker: 'ARS', name: 'Pesos',
});

const trade = (side: 'BUY' | 'SELL', instrumentid: number, size: number, price: number): LedgerOrder => ({
  instrumentid, size, price: price.toFixed(2), side, type: 'ACCIONES',
  ticker: instrumentid === GGAL ? 'GGAL' : 'PAMP', name: 'Acción',
});

describe('buildLedger', () => {
  test('sin órdenes: no hay pesos ni posiciones', () => {
    const ledger = buildLedger([]);

    expect(ledger.cash).toBe(0);
    expect(ledger.positions.size).toBe(0);
  });

  test('CASH_IN suma y CASH_OUT resta pesos', () => {
    const ledger = buildLedger([cash('CASH_IN', 1000), cash('CASH_OUT', 300)]);

    expect(ledger.cash).toBe(700);
    expect(ledger.positions.size).toBe(0);
  });

  test('BUY resta pesos y suma acciones y costo', () => {
    const ledger = buildLedger([cash('CASH_IN', 10000), trade('BUY', GGAL, 10, 100)]);

    expect(ledger.cash).toBe(9000);
    expect(ledger.positions.get(GGAL)).toMatchObject({ shares: 10, cost: 1000, ticker: 'GGAL' });
  });

  test('SELL suma pesos y baja el costo al costo promedio, no al precio de venta', () => {
    // 10 a 100 y 10 a 200: costo promedio 150. Vender 5 deja 15 acciones y costo 15 * 150.
    const ledger = buildLedger([
      cash('CASH_IN', 10000),
      trade('BUY', GGAL, 10, 100),
      trade('BUY', GGAL, 10, 200),
      trade('SELL', GGAL, 5, 300),
    ]);

    expect(ledger.positions.get(GGAL)).toMatchObject({ shares: 15, cost: 2250 });
    expect(ledger.cash).toBe(10000 - 1000 - 2000 + 1500);
  });

  test('al vender todo, la posición queda en 0 y el costo se reinicia', () => {
    const ledger = buildLedger([trade('BUY', GGAL, 10, 100), trade('SELL', GGAL, 10, 120)]);

    expect(ledger.positions.get(GGAL)).toMatchObject({ shares: 0, cost: 0 });
  });

  test('lleva cada instrumento por separado', () => {
    const ledger = buildLedger([trade('BUY', GGAL, 4, 50), trade('BUY', PAMP, 6, 10)]);

    expect(sharesOf(ledger, GGAL)).toBe(4);
    expect(sharesOf(ledger, PAMP)).toBe(6);
  });

  test('acepta el precio como string (así lo devuelve pg para numeric)', () => {
    const ledger = buildLedger([{ ...trade('BUY', GGAL, 2, 0), price: '110.50' }]);

    expect(ledger.cash).toBe(-221);
  });

  test('el orden importa: vender antes de comprar deja un costo incorrecto', () => {
    // Documenta por qué las órdenes tienen que venir en orden cronológico (ORDER BY datetime, id).
    const ordered = buildLedger([trade('BUY', GGAL, 10, 100), trade('SELL', GGAL, 2, 110)]);
    const shuffled = buildLedger([trade('SELL', GGAL, 2, 110), trade('BUY', GGAL, 10, 100)]);

    expect(ordered.positions.get(GGAL)?.cost).toBe(800);
    expect(shuffled.positions.get(GGAL)?.cost).toBe(1000);
  });
});

describe('sharesOf y heldPositions', () => {
  test('sharesOf devuelve 0 si el usuario no tiene el instrumento', () => {
    expect(sharesOf(buildLedger([]), GGAL)).toBe(0);
  });

  test('heldPositions descarta las posiciones en cero', () => {
    const ledger = buildLedger([
      trade('BUY', GGAL, 10, 100),
      trade('SELL', GGAL, 10, 100),
      trade('BUY', PAMP, 3, 10),
    ]);

    expect(heldPositions(ledger).map(([id]) => id)).toEqual([PAMP]);
  });
});
