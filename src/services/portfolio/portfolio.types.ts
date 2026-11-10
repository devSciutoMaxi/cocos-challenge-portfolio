import type { Side } from '../../types';

// Un movimiento FILLED tal como llega de la base (con los datos del instrumento). El ledger solo
// necesita estos campos, así que no depende del repositorio ni de la conexión.
export interface LedgerOrder {
  instrumentid: number;
  size: number;
  price: string | number;
  side: Side;
  type: string | null;
  ticker: string | null;
  name: string | null;
}

export interface Position {
  ticker: string | null;
  name: string | null;
  shares: number;
  cost: number;
}

// Resultado de recorrer las órdenes FILLED: pesos disponibles y posición por instrumento.
export interface Ledger {
  cash: number;
  positions: Map<number, Position>;
}

export interface MarketPrice {
  close: number | null;
  previousClose: number | null;
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

export interface Valuation {
  assets: Asset[];
  positionsValue: number;
  warnings: string[];
}

export interface Portfolio {
  accountValue: number;
  availableCash: number;
  assets: Asset[];
  warnings?: string[];
}
