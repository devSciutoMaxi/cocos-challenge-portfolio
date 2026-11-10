import { execFileSync } from 'child_process';

// Después de los tests: baja el contenedor y borra sus datos (-v), pasen o fallen.
export default async function globalTeardown(): Promise<void> {
  if (process.env.TEST_DB_SKIP_DOCKER === '1') return;
  try {
    execFileSync('docker', ['compose', '-f', 'docker-compose.test.yml', 'down', '-v'], { stdio: 'inherit' });
  } catch {
    console.warn('No se pudo bajar el Postgres de test: bajalo a mano con "npm run test:db:down".');
  }
}
