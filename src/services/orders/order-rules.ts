import { HttpError } from '../../http-error';
import { roundMoney } from '../../money';
import type { OrderStatus, OrderType, Side } from '../../types';
import type { TradeOrder } from './orders.types';
import { sharesOf } from '../portfolio/ledger';
import type { Ledger } from '../portfolio/portfolio.types';

// Reglas de negocio de una orden. Funciones puras: reciben datos y devuelven una decisión.

export const INSUFFICIENT_FUNDS = 'Fondos insuficientes (Cash ARS)';
export const INSUFFICIENT_SHARES = 'No hay acciones suficientes de este activo';

// Cantidad de acciones: la enviada, o la máxima entera que entra en el monto (sin fracciones).
export const resolveTradeSize = (order: TradeOrder, price: number): number => {
  if (order.size !== undefined) return order.size;

  const size = Math.floor((order.amount as number) / price);
  if (size <= 0) throw new HttpError('El monto no alcanza para una acción');
  return size;
};

interface RejectionInput {
  side: Side;
  size: number;
  price: number;
  instrumentId: number;
  ledger: Ledger;
}

// Devuelve el motivo del rechazo, o null si la orden se puede aceptar.
//  - BUY: alcanzan los pesos para size * price.
//  - SELL: alcanzan las acciones del instrumento.
//  - CASH_OUT: alcanzan los pesos.
//  - CASH_IN: siempre se acepta.
export const getRejectionReason = ({ side, size, price, instrumentId, ledger }: RejectionInput): string | null => {
  switch (side) {
    case 'BUY':
      return roundMoney(ledger.cash) < roundMoney(size * price) ? INSUFFICIENT_FUNDS : null;
    case 'SELL':
      return sharesOf(ledger, instrumentId) < size ? INSUFFICIENT_SHARES : null;
    case 'CASH_OUT':
      return roundMoney(ledger.cash) < size ? INSUFFICIENT_FUNDS : null;
    case 'CASH_IN':
      return null;
  }
};

// Estado inicial: REJECTED si hay motivo; si no, MARKET se ejecuta (FILLED) y LIMIT queda NEW.
export const decideStatus = (type: OrderType, rejectionReason: string | null): OrderStatus => {
  if (rejectionReason) return 'REJECTED';
  return type === 'MARKET' ? 'FILLED' : 'NEW';
};
