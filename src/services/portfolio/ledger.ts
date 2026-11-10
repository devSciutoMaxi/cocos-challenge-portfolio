import type { Ledger, LedgerOrder, Position } from './portfolio.types';

// Reconstruye pesos y posiciones recorriendo las órdenes FILLED. Función pura (sin base de datos).
// IMPORTANTE: las órdenes tienen que venir en orden cronológico; el costo promedio depende de eso.
//  - CASH_IN / CASH_OUT (instrumento MONEDA): suman / restan `size` pesos.
//  - BUY: suma acciones y costo, y resta size * price de los pesos.
//  - SELL: resta acciones, reduce el costo al costo promedio vigente y suma size * price a los pesos.
export const buildLedger = (orders: LedgerOrder[]): Ledger => {
  let cash = 0;
  const positions = new Map<number, Position>();

  for (const order of orders) {
    const shares = Number(order.size);
    const price = Number(order.price);

    if (order.type === 'MONEDA') {
      if (order.side === 'CASH_IN') cash += shares;
      if (order.side === 'CASH_OUT') cash -= shares;
      continue;
    }

    let position = positions.get(order.instrumentid);
    if (!position) {
      position = { ticker: order.ticker, name: order.name, shares: 0, cost: 0 };
      positions.set(order.instrumentid, position);
    }

    if (order.side === 'BUY') {
      position.shares += shares;
      position.cost += shares * price;
      cash -= shares * price;
    } else if (order.side === 'SELL') {
      const averageCost = position.shares > 0 ? position.cost / position.shares : 0;
      const sharesFromPosition = Math.min(shares, Math.max(position.shares, 0));
      position.cost -= averageCost * sharesFromPosition;
      position.shares -= shares;
      if (position.shares <= 0) position.cost = 0;
      cash += shares * price;
    }
  }

  return { cash, positions };
};

// Acciones que el usuario tiene de un instrumento (0 si no tiene).
export const sharesOf = (ledger: Ledger, instrumentId: number): number =>
  ledger.positions.get(instrumentId)?.shares ?? 0;

// Posiciones con acciones (descarta las que quedaron en cero o negativas).
export const heldPositions = (ledger: Ledger): Array<[number, Position]> =>
  [...ledger.positions.entries()].filter(([, position]) => position.shares > 0);
