import { HttpError } from './http-error';

// Entero positivo. Acepta number o string numérico ("5"); rechaza booleanos, null, decimales, etc.
export const parsePositiveInteger = (value: unknown, label: string): number => {
  const valid =
    (typeof value === 'number' && Number.isInteger(value) && value > 0) ||
    (typeof value === 'string' && /^\d+$/.test(value.trim()) && Number(value) > 0);
  if (!valid || !Number.isSafeInteger(Number(value))) {
    throw new HttpError(`${label} tiene que ser un entero mayor a cero`);
  }
  return Number(value);
};

// Número positivo (precio o monto). Acepta number o string numérico.
export const parsePositiveNumber = (value: unknown, label: string): number => {
  const valid =
    (typeof value === 'number' && Number.isFinite(value) && value > 0) ||
    (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0);
  if (!valid) {
    throw new HttpError(`${label} tiene que ser un número mayor a cero`);
  }
  return Number(value);
};

export const isPresent = <T>(value: T | null | undefined): value is T => value !== undefined && value !== null;
