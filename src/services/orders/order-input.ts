import { HttpError } from '../../http-error';
import { isPresent, parsePositiveInteger, parsePositiveNumber } from '../../validators';
import type { OrderType } from '../../types';
import type { CashSide, NormalizedOrder, OrderPayload, TradeOrder, TradeSide } from './orders.types';

const TRADE_SIDES: readonly TradeSide[] = ['BUY', 'SELL'];
const CASH_SIDES: readonly CashSide[] = ['CASH_IN', 'CASH_OUT'];
const TYPES: readonly OrderType[] = ['MARKET', 'LIMIT'];

const isTradeSide = (side: unknown): side is TradeSide => (TRADE_SIDES as readonly unknown[]).includes(side);
const isCashSide = (side: unknown): side is CashSide => (CASH_SIDES as readonly unknown[]).includes(side);
const isOrderType = (type: unknown): type is OrderType => (TYPES as readonly unknown[]).includes(type);

// Valida el formato de lo que llegó (no consulta la base) y devuelve la orden normalizada.
// Cualquier problema lanza HttpError 400 y no se guarda nada.
export const normalizeOrder = (payload: OrderPayload): NormalizedOrder => {
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
