import { NextFunction, Request, Response, Router } from 'express';
import * as marketService from '../services/market.service';

const router = Router();

// GET /api/market/search?q=PAMP
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assets = await marketService.searchAssets(req.query.q);
    res.json(assets);
  } catch (error) {
    next(error);
  }
});

export default router;
