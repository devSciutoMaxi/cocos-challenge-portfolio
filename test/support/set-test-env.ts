import { resolveTestDatabaseUrl } from './test-env';

// Se ejecuta antes de cargar la app en cada archivo de test: fuerza la base de test.
// Pisa cualquier DATABASE_URL que venga del entorno o del .env (dotenv no pisa variables ya definidas).
process.env.DATABASE_URL = resolveTestDatabaseUrl();
process.env.DATABASE_SSL = 'false';
