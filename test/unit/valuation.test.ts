import { valuePositions } from '../../src/services/portfolio/valuation';
import type { MarketPrice, Position } from '../../src/services/portfolio/portfolio.types';

const position = (shares: number, cost: number, ticker = 'GGAL'): Position => ({
  ticker, name: 'Acción', shares, cost,
});

const prices = (entries: Array<[number, MarketPrice]>) => new Map<number, MarketPrice>(entries);

describe('valuePositions', () => {
  test('valúa con el close, y calcula el rendimiento total y el diario', () => {
    // 10 acciones compradas a 100 (costo 1000), hoy cierran a 110 y ayer a 90.
    const result = valuePositions([[2, position(10, 1000)]], prices([[2, { close: 110, previousClose: 90 }]]));

    expect(result.positionsValue).toBe(1100);
    expect(result.warnings).toEqual([]);
    expect(result.assets).toEqual([
      {
        instrumentId: 2, ticker: 'GGAL', name: 'Acción', shares: 10,
        currentPrice: 110, totalValue: 1100, returnPercentage: 10, dailyReturnPercentage: 22.22,
      },
    ]);
  });

  test('rendimiento negativo cuando el precio cayó por debajo del costo', () => {
    const result = valuePositions([[2, position(10, 1000)]], prices([[2, { close: 80, previousClose: 100 }]]));

    expect(result.assets[0].returnPercentage).toBe(-20);
    expect(result.assets[0].dailyReturnPercentage).toBe(-20);
  });

  test('suma el valor de todas las posiciones', () => {
    const result = valuePositions(
      [[2, position(10, 1000)], [3, position(5, 100, 'PAMP')]],
      prices([[2, { close: 110, previousClose: 100 }], [3, { close: 30, previousClose: 30 }]])
    );

    expect(result.positionsValue).toBe(1250);
    expect(result.assets).toHaveLength(2);
  });

  test('un activo sin precio no se valúa en 0: avisa, deja null y no suma al total', () => {
    const result = valuePositions(
      [[2, position(10, 1000)], [3, position(5, 100, 'PAMP')]],
      prices([[2, { close: 110, previousClose: 100 }]])
    );

    expect(result.positionsValue).toBe(1100);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('PAMP');
    expect(result.assets[1]).toMatchObject({
      instrumentId: 3, shares: 5, currentPrice: null, totalValue: null,
      returnPercentage: null, dailyReturnPercentage: null,
    });
  });

  test('close en null cuenta como sin precio', () => {
    const result = valuePositions([[2, position(10, 1000)]], prices([[2, { close: null, previousClose: 100 }]]));

    expect(result.warnings).toHaveLength(1);
    expect(result.positionsValue).toBe(0);
  });

  test('sin previousClose (null o 0) el retorno diario es null, pero se valúa igual', () => {
    const withNull = valuePositions([[2, position(10, 1000)]], prices([[2, { close: 110, previousClose: null }]]));
    const withZero = valuePositions([[2, position(10, 1000)]], prices([[2, { close: 110, previousClose: 0 }]]));

    for (const result of [withNull, withZero]) {
      expect(result.assets[0].dailyReturnPercentage).toBeNull();
      expect(result.assets[0].totalValue).toBe(1100);
    }
  });

  test('con costo 0 el rendimiento total es 0 y no divide por cero', () => {
    const result = valuePositions([[2, position(10, 0)]], prices([[2, { close: 110, previousClose: 100 }]]));

    expect(result.assets[0].returnPercentage).toBe(0);
  });

  test('redondea los importes a 2 decimales', () => {
    const result = valuePositions([[2, position(3, 100)]], prices([[2, { close: 33.333, previousClose: 30 }]]));

    expect(result.assets[0].totalValue).toBe(100);
    expect(result.assets[0].returnPercentage).toBe(0);
    expect(result.assets[0].dailyReturnPercentage).toBe(11.11);
  });

  test('sin posiciones no hay activos ni valor', () => {
    expect(valuePositions([], prices([]))).toEqual({ assets: [], positionsValue: 0, warnings: [] });
  });
});
