import { createHash } from 'crypto';
import { HttpError } from '../../http-error';
import type { NormalizedOrder } from './orders.types';

const MAX_KEY_LENGTH = 100;

// La key es opcional. Si viene, tiene que ser un texto no vacío y corto.
export const parseIdempotencyKey = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '' || value.length > MAX_KEY_LENGTH) {
    throw new HttpError(`Idempotency-Key tiene que ser un texto de 1 a ${MAX_KEY_LENGTH} caracteres`);
  }
  return value;
};

// Huella de la orden ya normalizada. Sirve para detectar que se reutilizó la key con otra orden distinta.
export const hashOrder = (order: NormalizedOrder): string =>
  createHash('sha256').update(JSON.stringify(order)).digest('hex');