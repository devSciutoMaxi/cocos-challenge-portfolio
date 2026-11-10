import * as marketRepository from '../repositories/market.repository';
import { HttpError } from '../http-error';
import type { Instrument } from '../types';

const MAX_QUERY_LENGTH = 100;

// `term` llega de req.query: puede ser string, array u objeto. Se valida antes de usarlo.
export const searchAssets = async (term: unknown): Promise<Instrument[]> => {
  if (typeof term !== 'string' || !term.trim()) {
    throw new HttpError('El término de búsqueda (q) es requerido');
  }
  const query = term.trim();
  if (query.length > MAX_QUERY_LENGTH) {
    throw new HttpError(`El término de búsqueda no puede superar ${MAX_QUERY_LENGTH} caracteres`);
  }
  return marketRepository.searchInstruments(query);
};
