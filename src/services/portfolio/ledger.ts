import type { Ledger, LedgerOrder, Position } from './portfolio.types';

export const emptyLedger = (): Ledger => ({ cash: 0, positions: new Map() });

// Aplica UNA orden FILLED al ledger (lo modifica). Es la única regla de cómo una orden mueve la cuenta:
// la usan buildLedger (reconstruir desde el historial) y la proyección (actualizar tras cada orden).
//  - CASH_IN / CASH_OUT (instrumento MONEDA): suman / restan `size` pesos.
//  - BUY: suma acciones y costo, y resta size * price de los pesos.
//  - SELL: resta acciones, reduce el costo al costo promedio vigente y suma size * price a los pesos.
export const applyOrder = (ledger: Ledger, order: LedgerOrder): void => {
  const shares = Number(order.size);
  const price = Number(order.price);

  if (order.type === 'MONEDA') {
    if (order.side === 'CASH_IN') ledger.cash += shares;
    if (order.side === 'CASH_OUT') ledger.cash -= shares;
    return;
  }

  let position = ledger.positions.get(order.instrumentid);
  if (!position) {
    position = { ticker: order.ticker, name: order.name, shares: 0, cost: 0 };
    ledger.positions.set(order.instrumentid, position);
  }

  if (order.side === 'BUY') {
    position.shares += shares;
    position.cost += shares * price;
    ledger.cash -= shares * price;
  } else if (order.side === 'SELL') {
    const averageCost = position.shares > 0 ? position.cost / position.shares : 0;
    const sharesFromPosition = Math.min(shares, Math.max(position.shares, 0));
    position.cost -= averageCost * sharesFromPosition;
    position.shares -= shares;
    if (position.shares <= 0) position.cost = 0;
    ledger.cash += shares * price;
  }
};

// Reconstruye pesos y posiciones recorriendo las órdenes FILLED. Función pura (sin base de datos).
// IMPORTANTE: las órdenes tienen que venir en orden cronológico; el costo promedio depende de eso.
export const buildLedger = (orders: LedgerOrder[]): Ledger => {
  const ledger = emptyLedger();
  for (const order of orders) applyOrder(ledger, order);
  return ledger;
};

// Acciones que el usuario tiene de un instrumento (0 si no tiene).
export const sharesOf = (ledger: Ledger, instrumentId: number): number =>
  ledger.positions.get(instrumentId)?.shares ?? 0;

// Posiciones con acciones (descarta las que quedaron en cero o negativas).
export const heldPositions = (ledger: Ledger): Array<[number, Position]> =>
  [...ledger.positions.entries()].filter(([, position]) => position.shares > 0);
