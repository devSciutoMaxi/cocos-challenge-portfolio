import { pool } from '../db/connection';
import type { Instrument } from '../types';

export const SEARCH_LIMIT = 50;

// Escapa los comodines de LIKE para que el texto se busque literal.
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (char) => `\\${char}`);

// Busca por ticker o nombre (parcial, sin distinguir mayúsculas). Excluye la moneda (ARS).
// Orden: ticker exacto, luego ticker que empieza igual, luego el resto por ticker.
export const searchInstruments = async (queryText: string): Promise<Instrument[]> => {
  const escaped = escapeLike(queryText);
  const query = `
    SELECT id, ticker, name, type
    FROM instruments
    WHERE COALESCE(type, '') <> 'MONEDA'
      AND (ticker ILIKE $1 OR name ILIKE $1)
    ORDER BY
      CASE
        WHEN UPPER(ticker) = UPPER($2) THEN 0
        WHEN ticker ILIKE $3 THEN 1
        ELSE 2
      END,
      ticker ASC,
      id ASC
    LIMIT $4;
  `;
  const { rows } = await pool.query<Instrument>(query, [
    `%${escaped}%`,
    queryText,
    `${escaped}%`,
    SEARCH_LIMIT,
  ]);
  return rows;
};
