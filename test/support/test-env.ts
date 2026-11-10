// Conexión de los tests de integración. NUNCA usa DATABASE_URL (la base de desarrollo o producción):
// usa TEST_DATABASE_URL, o por defecto el Postgres descartable de docker-compose.test.yml.
const DEFAULT_TEST_DATABASE_URL = 'postgres://postgres:postgres@localhost:5433/cocos_test';

export const resolveTestDatabaseUrl = (): string => {
  const url = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;

  // Seguro anti-accidentes: los tests crean y borran datos, así que la base tiene que ser de test.
  const databaseName = new URL(url).pathname.replace('/', '');
  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Los tests se niegan a correr contra la base "${databaseName}": su nombre tiene que incluir "test" ` +
        `(por ejemplo cocos_test). Revisá TEST_DATABASE_URL.`
    );
  }
  return url;
};
