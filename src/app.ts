import express, { NextFunction, Request, Response } from 'express';
import routes from './routes';
import { setupSwagger } from './swagger';

const app = express();
app.use(express.json());
app.use('/api', routes);
setupSwagger(app);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler global: 4xx con el mensaje; 5xx se loguea y no expone detalles internos.
// Errores con status: HttpError (statusCode) y los del parser de Express (status).
interface ErrorWithStatus extends Error {
  statusCode?: number;
  status?: number;
}

const ERROR_CODES: Record<number, string> = { 404: 'NOT_FOUND', 422: 'UNPROCESSABLE' };

app.use((err: ErrorWithStatus, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.statusCode || err.status || 500;
  if (status >= 500) {
    console.error('Error interno:', err);
    return res.status(500).json({ error: 'Error interno del servidor', code: 'INTERNAL' });
  }
  res.status(status).json({ error: err.message, code: ERROR_CODES[status] || 'BAD_REQUEST' });
});

export default app;
