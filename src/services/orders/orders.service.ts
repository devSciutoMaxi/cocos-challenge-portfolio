import * as ordersRepository from '../../repositories/orders.repository';
import * as usersRepository from '../../repositories/users.repository';
import * as portfolioService from '../portfolio/portfolio.service';
import { withTransaction } from '../../db/connection';
import { HttpError } from '../../http-error';
import { parsePositiveInteger } from '../../validators';
import type { Db, OrderRow } from '../../types';
import { normalizeOrder } from './order-input';
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

export const processOrder = async (payload: OrderPayload): Promise<ProcessOrderResult> => {
  const order = normalizeOrder(payload);

  // Todo ocurre en una transacción con el usuario bloqueado (SELECT ... FOR UPDATE):
  // dos órdenes del mismo usuario se procesan una detrás de otra, así no se gasta dos veces el mismo saldo.
  return withTransaction(async (db) => {
    const user = await usersRepository.lockUserById(order.userId, db);
    if (!user) throw new HttpError('Usuario inexistente', 404);

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
