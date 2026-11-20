import * as ordersRepository from '../../repositories/orders.repository';
import * as usersRepository from '../../repositories/users.repository';
import * as idempotencyRepository from '../../repositories/idempotency.repository';
import * as portfolioService from '../portfolio/portfolio.service';
import { withTransaction } from '../../db/connection';
import { HttpError } from '../../http-error';
import { parsePositiveInteger } from '../../validators';
import type { Db, OrderRow } from '../../types';
import { normalizeOrder } from './order-input';
import { hashOrder, parseIdempotencyKey } from './idempotency';                          // NUEVO
import { decideStatus, getRejectionReason, resolveTradeSize } from './order-rules';
import type { CashOrder, OrderPayload, ProcessOrderResult, TradeOrder } from './orders.types';

// Instrumento, precio y cantidad con los que se va a registrar la orden (solo se usa acá).
interface Execution {
  instrumentId: number;
  price: number;
  size: number;
}

// Transferencia: instrumento ARS, precio 1 y cantidad = pesos.
const resolveCashExecution = async (order: CashOrder, db: Db): Promise<Execution> => {
  const cash = await ordersRepository.getCashInstrument(db);
  if (!cash) throw new Error('No existe el instrumento ARS (tipo MONEDA) en la base');
  return { instrumentId: cash.id, price: 1, size: order.pesos };
};

// Compra / venta: valida el instrumento y fija precio (close si es MARKET, el enviado si es LIMIT) y cantidad.
const resolveTradeExecution = async (order: TradeOrder, db: Db): Promise<Execution> => {
  const instrument = await ordersRepository.getInstrumentById(order.instrumentId, db);
  if (!instrument) throw new HttpError('Instrumento inexistente', 404);
  if (instrument.type === 'MONEDA') {
    throw new HttpError('Los pesos no se operan con BUY o SELL: usá CASH_IN o CASH_OUT');
  }

  let price: number;
  if (order.type === 'MARKET') {
    const latest = await ordersRepository.getLatestMarketPrice(instrument.id, db);
    if (!latest) throw new HttpError('No hay precio de mercado para este instrumento', 422);
    price = latest;
  } else {
    price = order.limitPrice as number;
  }

  return { instrumentId: instrument.id, price, size: resolveTradeSize(order, price) };
};

export const processOrder = async (payload: OrderPayload, idempotencyKeyHeader?: unknown): Promise<ProcessOrderResult> => {
  const order = normalizeOrder(payload);
  const idempotencyKey = parseIdempotencyKey(idempotencyKeyHeader);

  // Todo ocurre en una transacción con el usuario bloqueado (SELECT ... FOR UPDATE):
  // dos órdenes del mismo usuario se procesan una detrás de otra, así no se gasta dos veces el mismo saldo.
  return withTransaction(async (db) => {
    const user = await usersRepository.lockUserById(order.userId, db);
    if (!user) throw new HttpError('Usuario inexistente', 404);

    // Idempotencia: con el usuario ya bloqueado, si esta key ya se usó se devuelve la respuesta guardada
    // sin crear nada. Si la key se reutilizó con una orden distinta, es un error del cliente (422).
    const requestHash = hashOrder(order);
    if (idempotencyKey) {
      const stored = await idempotencyRepository.findByKey(order.userId, idempotencyKey, db);
      if (stored) {
        if (stored.request_hash !== requestHash) {
          throw new HttpError('La Idempotency-Key ya se usó con una orden distinta', 422);
        }
        return { ...(stored.response as ProcessOrderResult), replayed: true };
      }
    }

    const execution = order.isCash
      ? await resolveCashExecution(order, db)
      : await resolveTradeExecution(order, db);

    // Para validar solo hacen falta los pesos y las tenencias: no se consultan precios de mercado.
    const ledger = await portfolioService.getLedger(order.userId, db);

    const rejectionReason = getRejectionReason({ side: order.side, ledger, ...execution });
    const status = decideStatus(order.type, rejectionReason);

    const orderRecord = await ordersRepository.createOrderRecord(
      {
        instrumentId: execution.instrumentId,
        userId: order.userId,
        size: execution.size,
        price: execution.price,
        type: order.type,
        side: order.side,
        status,
      },
      db
    );

    const result: ProcessOrderResult = { order: orderRecord, rejectionReason };

    // Se guarda en la misma transacción que la orden: si algo falla, no queda ni la orden ni la key.
    if (idempotencyKey) {
      await idempotencyRepository.save(order.userId, idempotencyKey, requestHash, result, db);
    }

    return result;
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
