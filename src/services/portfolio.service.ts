import * as portfolioRepository from '../repositories/portfolio.repository';
import * as usersRepository from '../repositories/users.repository';
import { HttpError } from '../http-error';
import { parsePositiveInteger } from '../validators';
import type { Db } from '../types';

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

const toNumberOrNull = (value: string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

interface Position {
  ticker: string | null;
  name: string | null;
  shares: number;
  cost: number;
}

export interface Asset {
  instrumentId: number;
  ticker: string | null;
  name: string | null;
  shares: number;
  currentPrice: number | null;
  totalValue: number | null;
  returnPercentage: number | null;
  dailyReturnPercentage: number | null;
}

export interface Portfolio {
  accountValue: number;
  availableCash: number;
  assets: Asset[];
  warnings?: string[];
}

// `db` es opcional: dentro de una transacción se pasa el client para leer con la misma conexión.
export const getPortfolioByUserId = async (userId: unknown, db?: Db): Promise<Portfolio> => {
  const id = parsePositiveInteger(userId, 'userId');

  const user = await usersRepository.getUserById(id, db);
  if (!user) throw new HttpError('Usuario inexistente', 404);

  const orders = await portfolioRepository.getFilledOrdersByUserId(id, db);

  let cashBalance = 0;
  const positions = new Map<number, Position>();

  for (const order of orders) {
    const instrumentId = order.instrumentid;
    const shares = Number(order.size);
    const price = Number(order.price);
    const { side, type, ticker, name } = order;

    if (type === 'MONEDA') {
      if (side === 'CASH_IN') cashBalance += shares;
      if (side === 'CASH_OUT') cashBalance -= shares;
      continue;
    }

    let position = positions.get(instrumentId);
    if (!position) {
      position = { ticker, name, shares: 0, cost: 0 };
      positions.set(instrumentId, position);
    }

    if (side === 'BUY') {
      position.shares += shares;
      position.cost += shares * price;
      cashBalance -= shares * price;
    } else if (side === 'SELL') {
      const averageCost = position.shares > 0 ? position.cost / position.shares : 0;
      const sharesFromPosition = Math.min(shares, Math.max(position.shares, 0));
      position.cost -= averageCost * sharesFromPosition;
      position.shares -= shares;
      if (position.shares <= 0) position.cost = 0;
      cashBalance += shares * price;
    }
  }

  // Solo se piden precios de los instrumentos que el usuario tiene en cartera.
  const held = [...positions.entries()].filter(([, position]) => position.shares > 0);
  const marketRows = await portfolioRepository.getLatestMarketData(
    held.map(([instrumentId]) => instrumentId),
    db
  );
  const marketMap = new Map<number, { close: number | null; previousClose: number | null }>();
  marketRows.forEach((row) => {
    marketMap.set(row.instrumentid, {
      close: toNumberOrNull(row.close),
      previousClose: toNumberOrNull(row.previousclose),
    });
  });

  let totalPortfolioValue = cashBalance;
  const assets: Asset[] = [];
  const warnings: string[] = [];

  for (const [instrumentId, position] of held) {
    const market = marketMap.get(instrumentId);

    // Sin precio de mercado no se puede valuar: se informa en vez de asumir 0.
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
    totalPortfolioValue += totalValue;

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

  const result: Portfolio = {
    accountValue: roundMoney(totalPortfolioValue),
    availableCash: roundMoney(cashBalance),
    assets,
  };
  if (warnings.length) result.warnings = warnings;
  return result;
};
