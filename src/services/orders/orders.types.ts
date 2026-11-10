import type { OrderRow, OrderType } from '../../types';

export type TradeSide = 'BUY' | 'SELL';
export type CashSide = 'CASH_IN' | 'CASH_OUT';

// Lo que llega del body, sin validar: por eso todo es unknown.
export interface OrderPayload {
  userId?: unknown;
  instrumentId?: unknown;
  side?: unknown;
  type?: unknown;
  amount?: unknown;
  size?: unknown;
  price?: unknown;
}

// Orden ya validada. `isCash` es la marca que permite a TypeScript saber qué campos existen.
export interface CashOrder {
  isCash: true;
  userId: number;
  side: CashSide;
  type: 'MARKET';
  pesos: number;
}

export interface TradeOrder {
  isCash: false;
  userId: number;
  side: TradeSide;
  type: OrderType;
  instrumentId: number;
  limitPrice?: number;
  size?: number;
  amount?: number;
}

export type NormalizedOrder = CashOrder | TradeOrder;

export interface ProcessOrderResult {
  order: OrderRow;
  rejectionReason: string | null;
}
