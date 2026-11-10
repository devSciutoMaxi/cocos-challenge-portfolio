import request from 'supertest';
import app from '../src/app';
import { createTradingFixture, removeTradingFixture, Fixture } from './fixtures';

interface Asset {
  id: number;
  ticker: string;
  name: string;
  type: string;
}

describe('Búsqueda de activos', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createTradingFixture();
  });

  afterEach(async () => {
    await removeTradingFixture(fixture);
  });

  const search = (q: string) => request(app).get('/api/market/search').query({ q });

  test('encuentra un activo por ticker', async () => {
    const response = await search(fixture.ticker);

    expect(response.statusCode).toBe(200);
    expect(response.body.some((asset: Asset) => asset.ticker === fixture.ticker)).toBe(true);
  });

  test('encuentra un activo por nombre, sin distinguir mayúsculas', async () => {
    const response = await search(fixture.name.toUpperCase());

    expect(response.statusCode).toBe(200);
    expect(response.body.some((asset: Asset) => asset.ticker === fixture.ticker)).toBe(true);
  });

  test('pone primero el ticker exacto', async () => {
    const response = await search(fixture.ticker);

    expect(response.body[0].ticker).toBe(fixture.ticker);
  });

  test('no devuelve la moneda ARS', async () => {
    const response = await search('ARS');

    expect(response.statusCode).toBe(200);
    expect(response.body.every((asset: Asset) => asset.type !== 'MONEDA')).toBe(true);
  });

  test('trata % y _ como texto literal y no como comodines', async () => {
    const percent = await search('%');
    const underscore = await search('_');

    expect(percent.statusCode).toBe(200);
    expect(percent.body.some((asset: Asset) => asset.ticker === fixture.ticker)).toBe(false);
    expect(underscore.body.some((asset: Asset) => asset.ticker === fixture.ticker)).toBe(false);
  });

  test('limita la cantidad de resultados', async () => {
    const response = await search('a');

    expect(response.statusCode).toBe(200);
    expect(response.body.length).toBeLessThanOrEqual(50);
  });

  test('responde 400 si no se envía el término o viene vacío', async () => {
    const missing = await request(app).get('/api/market/search');
    const blank = await search('   ');

    expect(missing.statusCode).toBe(400);
    expect(missing.body).toHaveProperty('error');
    expect(blank.statusCode).toBe(400);
  });

  test('responde 400 si q se repite en la URL', async () => {
    const response = await request(app).get('/api/market/search?q=a&q=b');

    expect(response.statusCode).toBe(400);
  });
});
