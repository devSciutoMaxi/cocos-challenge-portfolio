import { NextFunction, Request, Response, Router } from 'express';
import * as ordersService from '../services/orders.service';

const router = Router();

// POST /api/orders
// BUY / SELL: userId, instrumentId, side, type, (size | amount), price (solo LIMIT)
// CASH_IN / CASH_OUT: userId, side, (amount | size) en pesos enteros
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, instrumentId, side, type, amount, size, price } = req.body || {};

    const result = await ordersService.processOrder({ userId, instrumentId, side, type, amount, size, price });

    if (result.order.status === 'REJECTED') {
      return res.status(400).json({
        message: 'La orden fue rechazada',
        reason: result.rejectionReason,
        order: result.order,
      });
    }

    res.status(201).json(result.order);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/orders/:id/cancel
router.patch('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await ordersService.cancelOrder(req.params.id);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

export default router;
