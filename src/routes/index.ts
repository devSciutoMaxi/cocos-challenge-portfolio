import { Router } from 'express';
import portfolioRoutes from '../controllers/portfolio.controller';
import marketRoutes from '../controllers/market.controller';
import ordersRoutes from '../controllers/orders.controller';

const router = Router();

router.use('/portfolio', portfolioRoutes);
router.use('/market', marketRoutes);
router.use('/orders', ordersRoutes);

export default router;
