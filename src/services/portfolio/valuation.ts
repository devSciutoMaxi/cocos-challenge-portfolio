import { roundMoney } from '../../money';
import type { Asset, MarketPrice, Position, Valuation } from './portfolio.types';

// Valúa las posiciones con el último precio de mercado. Función pura.
// Un activo sin precio no se valúa en 0: se informa en `warnings`, sus valores quedan en null
// y no se suma al total.
export const valuePositions = (
  held: Array<[number, Position]>,
  prices: Map<number, MarketPrice>
): Valuation => {
  const assets: Asset[] = [];
  const warnings: string[] = [];
  let positionsValue = 0;

  for (const [instrumentId, position] of held) {
    const market = prices.get(instrumentId);

    if (!market || !market.close) {
      warnings.push(`Sin precio de mercado para ${position.ticker}: la posición no se incluye en accountValue`);
      assets.push({
        instrumentId,
        ticker: position.ticker,
        name: position.name,
        shares: position.shares,
        currentPrice: null,
        totalValue: null,
        returnPercentage: null,
        dailyReturnPercentage: null,
      });
      continue;
    }

    const totalValue = position.shares * market.close;
    positionsValue += totalValue;

    const returnPercentage = position.cost > 0 ? ((totalValue - position.cost) / position.cost) * 100 : 0;
    const dailyReturnPercentage =
      market.previousClose && market.previousClose > 0
        ? ((market.close - market.previousClose) / market.previousClose) * 100
        : null;

    assets.push({
      instrumentId,
      ticker: position.ticker,
      name: position.name,
      shares: position.shares,
      currentPrice: market.close,
      totalValue: roundMoney(totalValue),
      returnPercentage: roundMoney(returnPercentage),
      dailyReturnPercentage: dailyReturnPercentage === null ? null : roundMoney(dailyReturnPercentage),
    });
  }

  return { assets, positionsValue, warnings };
};
