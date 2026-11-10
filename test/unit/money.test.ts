import { roundMoney } from '../../src/money';

describe('roundMoney', () => {
  test('redondea a 2 decimales', () => {
    expect(roundMoney(10.126)).toBe(10.13);
    expect(roundMoney(10.124)).toBe(10.12);
    expect(roundMoney(100)).toBe(100);
  });

  test('no devuelve -0', () => {
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true);
  });

  test('mantiene los negativos', () => {
    expect(roundMoney(-12.346)).toBe(-12.35);
  });
});
