import 'dotenv/config';
import app from './app';
import { connectDB } from './db/connection';

const PORT = process.env.PORT || 3000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
      console.log(`📄 Documentación disponible en http://localhost:${PORT}/api-docs`);
    });
  })
  .catch((err) => {
    console.error('Error al iniciar la aplicación', err);
    process.exit(1);
  });
