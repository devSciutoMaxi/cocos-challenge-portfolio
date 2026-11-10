import * as portfolioRepository from '../../repositories/portfolio.repository';
import * as usersRepository from '../../repositories/users.repository';
import { HttpError } from '../../http-error';
import { roundMoney } from '../../money';
import { parsePositiveInteger } from '../../validators';
import type { Db } from '../../types';
import { buildLedger, heldPositions } from './ledger';
import type { Ledger, MarketPrice, Portfolio } from './portfolio.types';
import { valuePositions } from './valuation';

const toNumberOrNull = (value: string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

// Pesos y tenencias del usuario, sin precios de mercado. Es lo único que necesita validar una orden.
// `db` es opcional: dentro de una transacción se pasa el client para leer con la misma conexión.
export const getLedger = async (userId: number, db?: Db): Promise<Ledger> => {
  const orders = await portfolioRepository.getFilledOrdersByUserId(userId, db);
  return buildLedger(orders);
};

// Portfolio completo: pesos, activos valuados y total de la cuenta.
export const getPortfolioByUserId = async (userId: unknown, db?: Db): Promise<Portfolio> => {
  const id = parsePositiveInteger(userId, 'userId');

  const user = await usersRepository.getUserById(id, db);
  if (!user) throw new HttpError('Usuario inexistente', 404);

  const ledger = await getLedger(id, db);

  // Solo se piden precios de los instrumentos que el usuario tiene en cartera.
  const held = heldPositions(ledger);
  const marketRows = await portfolioRepository.getLatestMarketData(
    held.map(([instrumentId]) => instrumentId),
    db
  );
  const prices = new Map<number, MarketPrice>();
  marketRows.forEach((row) => {
    prices.set(row.instrumentid, {
      close: toNumberOrNull(row.close),
      previousClose: toNumberOrNull(row.previousclose),
    });
  });

  const valuation = valuePositions(held, prices);

  const portfolio: Portfolio = {
    accountValue: roundMoney(ledger.cash + valuation.positionsValue),
    availableCash: roundMoney(ledger.cash),
    assets: valuation.assets,
  };
  if (valuation.warnings.length) portfolio.warnings = valuation.warnings;
  return portfolio;
};
