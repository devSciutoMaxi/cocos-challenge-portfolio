import { execFileSync } from 'child_process';
import { Client } from 'pg';
import { resolveTestDatabaseUrl } from './test-env';

const COMPOSE_ARGS = ['compose', '-f', 'docker-compose.test.yml'];

const waitForDatabase = async (url: string): Promise<void> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`No se pudo conectar a la base de test: ${(lastError as Error).message}`);
};

// Antes de los tests de integración: levanta el Postgres descartable de Docker.
// Con TEST_DB_SKIP_DOCKER=1 no usa Docker y trabaja con la base de TEST_DATABASE_URL (por ejemplo, el
// service de Postgres de un pipeline de CI).
export default async function globalSetup(): Promise<void> {
  const url = resolveTestDatabaseUrl();

  if (process.env.TEST_DB_SKIP_DOCKER !== '1') {
    try {
      execFileSync('docker', [...COMPOSE_ARGS, 'up', '-d', '--wait'], { stdio: 'inherit' });
    } catch {
      throw new Error(
        'No se pudo levantar el Postgres de test con Docker. Verificá que Docker esté corriendo, o definí ' +
          'TEST_DATABASE_URL (una base de test) y TEST_DB_SKIP_DOCKER=1 para usar otra.'
      );
    }
  }

  await waitForDatabase(url);
}
