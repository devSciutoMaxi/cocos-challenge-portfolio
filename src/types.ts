import type { QueryResult, QueryResultRow } from 'pg';

export type Side = 'BUY' | 'SELL' | 'CASH_IN' | 'CASH_OUT';
export type OrderType = 'MARKET' | 'LIMIT';
export type OrderStatus = 'NEW' | 'FILLED' | 'REJECTED' | 'CANCELLED';

// Lo único que necesitan los repositorios: poder hacer query. Lo cumplen tanto el Pool como un
// client de una transacción, así el mismo código sirve dentro y fuera de ella.
export interface Db {
  query<R extends QueryResultRow = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

export interface Instrument {
  id: number;
  ticker: string | null;
  name: string | null;
  type: string | null;
}

// Fila de la tabla orders tal como la devuelve pg (numeric llega como string).
export interface OrderRow {
  id: number;
  instrumentid: number;
  userid: number;
  size: number;
  price: string;
  type: OrderType;
  side: Side;
  status: OrderStatus;
  datetime: Date;
}

export interface NewOrder {
  instrumentId: number;
  userId: number;
  size: number;
  price: number;
  type: OrderType;
  side: Side;
  status: OrderStatus;
  datetime?: Date | null;
}
