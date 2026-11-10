import * as ordersRepository from '../repositories/orders.repository';
import * as usersRepository from '../repositories/users.repository';
import * as portfolioService from './portfolio.service';
import { withTransaction } from '../db/connection';
import { HttpError } from '../http-error';
import { isPresent, parsePositiveInteger, parsePositiveNumber } from '../validators';
import type { OrderRow, OrderStatus, OrderType } from '../types';

const TRADE_SIDES = ['BUY', 'SELL'] as const;
const CASH_SIDES = ['CASH_IN', 'CASH_OUT'] as const;
const TYPES: readonly OrderType[] = ['MARKET', 'LIMIT'];

type TradeSide = (typeof TRADE_SIDES)[number];
type CashSide = (typeof CASH_SIDES)[number];

const isTradeSide = (side: unknown): side is TradeSide => (TRADE_SIDES as readonly unknown[]).includes(side);
const isCashSide = (side: unknown): side is CashSide => (CASH_SIDES as readonly unknown[]).includes(side);
const isOrderType = (type: unknown): type is OrderType => (TYPES as readonly unknown[]).includes(type);

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

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
interface CashOrder {
  isCash: true;
  userId: number;
  side: CashSide;
  type: 'MARKET';
  pesos: number;
}

interface TradeOrder {
  isCash: false;
  userId: number;
  side: TradeSide;
  type: OrderType;
  instrumentId: number;
  limitPrice?: number;
  size?: number;
  amount?: number;
}

type NormalizedOrder = CashOrder | TradeOrder;

export interface ProcessOrderResult {
  order: OrderRow;
  rejectionReason: string | null;
}

// Validaciones que no necesitan la base. Devuelve la orden ya normalizada.
const normalizeOrder = (payload: OrderPayload): NormalizedOrder => {
  const { userId, instrumentId, side, type, amount, size, price } = payload;

  if (!isPresent(userId)) throw new HttpError('Falta el campo userId');
  if (!isPresent(side)) throw new HttpError('Falta el campo side');
  if (!isTradeSide(side) && !isCashSide(side)) {
    throw new HttpError('El side tiene que ser BUY, SELL, CASH_IN o CASH_OUT');
  }

  const parsedUserId = parsePositiveInteger(userId, 'userId');

  // Transferencias: monto en pesos enteros (la columna size es entera), siempre MARKET a precio 1.
  if (isCashSide(side)) {
    if (isPresent(type) && type !== 'MARKET') {
      throw new HttpError('Las transferencias CASH_IN y CASH_OUT no admiten type LIMIT');
    }
    if (isPresent(price)) {
      throw new HttpError('Las transferencias CASH_IN y CASH_OUT no llevan price');
    }
    const pesos = isPresent(size) ? size : amount;
    if (!isPresent(pesos)) throw new HttpError('Tenés que enviar amount (pesos)');
    return {
      isCash: true,
      userId: parsedUserId,
      side,
      type: 'MARKET',
      pesos: parsePositiveInteger(pesos, 'El monto en pesos'),
    };
  }

  // Compra / venta de un activo.
  if (!isPresent(type)) throw new HttpError('Falta el campo type');
  if (!isOrderType(type)) throw new HttpError('El type tiene que ser MARKET o LIMIT');
  if (!isPresent(instrumentId)) throw new HttpError('Falta el campo instrumentId');

  const order: TradeOrder = {
    isCash: false,
    userId: parsedUserId,
    side,
    type,
    instrumentId: parsePositiveInteger(instrumentId, 'instrumentId'),
  };

  if (type === 'LIMIT') {
    if (!isPresent(price)) throw new HttpError('La orden LIMIT requiere un precio mayor a cero');
    order.limitPrice = parsePositiveNumber(price, 'El precio');
  } else if (isPresent(price)) {
    throw new HttpError('Las órdenes MARKET no llevan price: se ejecutan al último precio');
  }

  if (isPresent(size)) {
    order.size = parsePositiveInteger(size, 'El size');
  } else if (isPresent(amount)) {
    order.amount = parsePositiveNumber(amount, 'El monto');
  } else {
    throw new HttpError('Tenés que enviar size o amount');
  }

  return order;
};

export const processOrder = async (payload: OrderPayload): Promise<ProcessOrderResult> => {
  const order = normalizeOrder(payload);

  // Todo ocurre en una transacción con el usuario bloqueado (SELECT ... FOR UPDATE):
  // dos órdenes del mismo usuario se procesan una detrás de otra, así no se gasta dos veces el mismo saldo.
  return withTransaction(async (db) => {
    const user = await usersRepository.lockUserById(order.userId, db);
    if (!user) throw new HttpError('Usuario inexistente', 404);

    const portfolio = await portfolioService.getPortfolioByUserId(order.userId, db);
    let status: OrderStatus = 'FILLED';
    let rejectionReason: string | null = null;
    let instrumentId: number;
    let executionPrice: number;
    let size: number;

    if (order.isCash) {
      const cash = await ordersRepository.getCashInstrument(db);
      if (!cash) throw new Error('No existe el instrumento ARS (tipo MONEDA) en la base');
      instrumentId = cash.id;
      executionPrice = 1;
      size = order.pesos;

      if (order.side === 'CASH_OUT' && roundMoney(portfolio.availableCash) < size) {
        status = 'REJECTED';
        rejectionReason = 'Fondos insuficientes (Cash ARS)';
      }
    } else {
      const instrument = await ordersRepository.getInstrumentById(order.instrumentId, db);
      if (!instrument) throw new HttpError('Instrumento inexistente', 404);
      if (instrument.type === 'MONEDA') {
        throw new HttpError('Los pesos no se operan con BUY o SELL: usá CASH_IN o CASH_OUT');
      }
      instrumentId = instrument.id;

      if (order.type === 'MARKET') {
        const latest = await ordersRepository.getLatestMarketPrice(instrumentId, db);
        if (!latest) throw new HttpError('No hay precio de mercado para este instrumento', 422);
        executionPrice = latest;
        status = 'FILLED';
      } else {
        executionPrice = order.limitPrice as number;
        status = 'NEW';
      }

      if (order.size !== undefined) {
        size = order.size;
      } else {
        size = Math.floor((order.amount as number) / executionPrice);
        if (size <= 0) throw new HttpError('El monto no alcanza para una acción');
      }

      const total = roundMoney(size * executionPrice);

      if (order.side === 'BUY' && roundMoney(portfolio.availableCash) < total) {
        status = 'REJECTED';
        rejectionReason = 'Fondos insuficientes (Cash ARS)';
      }

      if (order.side === 'SELL') {
        const asset = portfolio.assets.find((item) => item.instrumentId === instrumentId);
        const ownedShares = asset ? asset.shares : 0;
        if (ownedShares < size) {
          status = 'REJECTED';
          rejectionReason = 'No hay acciones suficientes de este activo';
        }
      }
    }

    const orderRecord = await ordersRepository.createOrderRecord(
      { instrumentId, userId: order.userId, size, price: executionPrice, type: order.type, side: order.side, status },
      db
    );

    return { order: orderRecord, rejectionReason };
  });
};

export const cancelOrder = async (orderId: unknown): Promise<OrderRow> => {
  const id = parsePositiveInteger(orderId, 'El id de la orden');

  // UPDATE condicional: solo cancela si sigue en NEW, sin ventana entre leer y escribir.
  const cancelled = await ordersRepository.cancelOrderIfNew(id);
  if (cancelled) return cancelled;

  const order = await ordersRepository.findOrderById(id);
  if (!order) throw new HttpError('Orden no encontrada', 404);
  throw new HttpError('Solo se pueden cancelar órdenes en estado NEW');
};
