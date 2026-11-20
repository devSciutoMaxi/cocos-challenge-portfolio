import * as portfolioRepository from '../../repositories/portfolio.repository';
import * as projectionRepository from '../../repositories/projection.repository';
import type { Db } from '../../types';
import { applyOrder, buildLedger } from './ledger';
import type { Ledger, LedgerOrder } from './portfolio.types';

// Pesos y posiciones del usuario leyendo la proyección (pocas filas) en vez de todo el historial.
// Hay que llamarla con el usuario ya bloqueado (SELECT ... FOR UPDATE) y dentro de la transacción.
// La proyección se usa solo si su last_order_id coincide con la última orden FILLED real del usuario;
// si falta o no coincide (por ejemplo, órdenes insertadas por fuera de la API), se reconstruye desde las órdenes.
export const getLedgerLocked = async (userId: number, db: Db): Promise<Ledger> => {
  const lastOrderId = await projectionRepository.getLastFilledOrderId(userId, db);
  const balance = await projectionRepository.getBalance(userId, db);

  if (balance && balance.last_order_id === lastOrderId) {
    const rows = await projectionRepository.getPositions(userId, db);
    const positions = new Map(
      rows.map((row) => [
        row.instrumentid,
        { ticker: row.ticker, name: row.name, shares: row.shares, cost: Number(row.cost) },
      ])
    );
    return { cash: Number(balance.cash), positions };
  }

  const orders = await portfolioRepository.getFilledOrdersByUserId(userId, db);
  const ledger = buildLedger(orders);
  await projectionRepository.replaceAll(userId, ledger, lastOrderId, db);
  return ledger;
};

// Incorpora una orden FILLED recién creada: la aplica al ledger (la misma regla que buildLedger) y guarda
// el saldo y la posición afectada. Se ejecuta en la misma transacción que el INSERT de la orden.
export const applyFilledOrder = async (
  userId: number,
  ledger: Ledger,
  order: LedgerOrder,
  orderId: number,
  db: Db
): Promise<void> => {
  applyOrder(ledger, order);
  await projectionRepository.saveBalance(userId, ledger.cash, orderId, db);

  if (order.type !== 'MONEDA') {
    const position = ledger.positions.get(order.instrumentid);
    if (position) {
      await projectionRepository.savePosition(userId, order.instrumentid, position.shares, position.cost, db);
    }
  }
};
