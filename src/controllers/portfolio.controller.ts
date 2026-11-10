import { NextFunction, Request, Response, Router } from 'express';
import * as portfolioService from '../services/portfolio/portfolio.service';
import { HttpError } from '../http-error';
import { isPresent } from '../validators';

const router = Router();

// GET /api/portfolio?userId=1
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.query;
    if (!isPresent(userId)) {
      throw new HttpError('El parámetro userId es requerido');
    }

    // El servicio valida que userId sea un entero positivo.
    res.json(await portfolioService.getPortfolioByUserId(userId));
  } catch (error) {
    next(error);
  }
});

export default router;
