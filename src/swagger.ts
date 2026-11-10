import { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';

// swagger.yaml está en la raíz del proyecto: se resuelve desde este archivo (src/ o dist/),
// así funciona sin importar desde qué carpeta se inicie el servidor.
const swaggerPath = path.join(__dirname, '..', 'swagger.yaml');
const swaggerDoc = yaml.load(fs.readFileSync(swaggerPath, 'utf8')) as swaggerUi.JsonObject;

export function setupSwagger(app: Express): void {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
  app.get('/api-docs', (_req: Request, res: Response) => {
    res.send(`<a href="/api-docs">Hacé clic aquí para ver la documentación interactiva</a>`);
  });
}
