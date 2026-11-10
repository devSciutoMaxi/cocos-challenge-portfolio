# Cocos Backend Challenge

API backend (Node.js + Express + PostgreSQL) para consultar portfolios, buscar activos y enviar órdenes.

## Requisitos

- Node.js
- PostgreSQL

## Configuración

1. Instalar dependencias:

   ```sh
   npm install
   ```

2. Copiar `.env.example` a `.env` y configurar `DATABASE_URL` con una base de datos PostgreSQL (si el proveedor exige SSL, como Neon, agregar `DATABASE_SSL=true`):

   ```sh
   cp .env.example .env
   ```

3. Iniciar el servidor. El proyecto está escrito en TypeScript:

   ```sh
   npm run dev            # desarrollo: ejecuta src/ directamente y recarga al guardar
   npm run build && npm start   # producción: compila a dist/ y ejecuta el JavaScript resultante
   ```

La API queda disponible en `http://localhost:3000` y la documentación Swagger en `http://localhost:3000/api-docs`.

Otros scripts: `npm run typecheck` (chequea los tipos de `src/` y `test/` sin generar archivos), `npm test` (todos los tests), `npm run test:unit` (solo los unitarios, sin base de datos) y `npm run test:integration`.

## TypeScript

- `tsconfig.json` (modo `strict`) chequea `src/` y `test/`; `tsconfig.build.json` compila solo `src/` a `dist/`.
- `src/types.ts` concentra los tipos compartidos: `Side`, `OrderType`, `OrderStatus`, las filas de la base y la interfaz `Db`, que cumplen tanto el `Pool` como el client de una transacción.
- Lo que llega de afuera (body, query) se tipa como `unknown` y se valida antes de usarlo (`src/validators.ts`). Después de `normalizeOrder`, el resto del código trabaja con tipos seguros.
- `pg` devuelve las columnas `numeric` como string, por eso `OrderRow.price` es `string`.

## Estructura del código

```
src/
  controllers/        # HTTP: leen la request, llaman al servicio y responden
  services/
    orders/
      orders.types.ts   # tipos compartidos de órdenes (payload, orden normalizada, resultado)
      order-input.ts    # valida y normaliza el body (sin base de datos)
      order-rules.ts    # reglas de negocio puras: cantidad, rechazo, estado
      orders.service.ts # orquesta: transacción, precio, ledger, guardado, cancelación
    portfolio/
      portfolio.types.ts # tipos compartidos del portfolio (posición, ledger, asset)
      ledger.ts         # pura: órdenes FILLED -> pesos y posiciones (costo promedio)
      valuation.ts      # pura: posiciones + precios -> activos valuados y warnings
      portfolio.service.ts # lee de la base y arma la respuesta
    market.service.ts
  repositories/       # SQL: única capa que habla con la base
  types.ts            # tipos globales: Side, OrderType, OrderStatus, filas de la base, Db
  validators.ts       # parseo de enteros y números
  money.ts            # redondeo a centavos
```

La lógica de negocio vive en funciones puras (`ledger`, `valuation`, `order-rules`, `order-input`) que no conocen la base ni Express, así se prueban con tests unitarios rápidos. Los servicios solo orquestan. Los tipos compartidos por varios archivos viven en archivos `*.types.ts`; los que usa un solo archivo quedan en él. Para validar una orden alcanza con el ledger (pesos y tenencias), sin consultar precios de mercado.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/portfolio?userId=1` | Valor total de la cuenta, pesos disponibles y activos con cantidad, valor y rendimiento |
| GET | `/api/market/search?q=texto` | Búsqueda parcial por ticker y/o nombre |
| POST | `/api/orders` | Envía una orden `BUY`, `SELL`, `CASH_IN` o `CASH_OUT` |
| PATCH | `/api/orders/:id/cancel` | Cancela una orden `NEW` |

### Enviar una orden

```json
{ "userId": 1, "instrumentId": 5, "side": "BUY", "type": "LIMIT", "size": 10, "price": 1500 }
{ "userId": 1, "instrumentId": 5, "side": "BUY", "type": "MARKET", "amount": 50000 }
{ "userId": 1, "side": "CASH_IN", "amount": 10000 }
```

- **BUY / SELL**: `userId`, `instrumentId`, `side`, `type` y `size` (acciones) o `amount` (pesos). `price` solo en `LIMIT`; una `MARKET` no lo lleva.
- **CASH_IN / CASH_OUT**: `userId`, `side` y `amount` en pesos enteros. No llevan `instrumentId`, `type` ni `price`.

## Decisiones de diseño

La tenencia y los pesos no se guardan en una tabla aparte. Se reconstruyen con las órdenes `FILLED`, ordenadas por `datetime` y luego por `id`:

- `CASH_IN` sobre el instrumento `MONEDA` suma `size` pesos.
- `CASH_OUT` sobre ese instrumento resta `size` pesos.
- `BUY` de una acción suma `size` acciones y resta `size * price` pesos.
- `SELL` de una acción resta `size` acciones y suma `size * price` pesos.

`NEW`, `REJECTED` y `CANCELLED` quedan en el historial y no mueven la cuenta. Una orden `LIMIT` no se ejecuta sola: el mercado no se simula.

**Fecha de las órdenes.** La asigna la base de datos (`NOW()`), no el servidor. La columna `datetime` es `timestamp` sin zona horaria, y mezclar el reloj de la base con el de Node puede dejar una orden nueva "antes" de otra anterior y romper el costo promedio.

**Rendimiento.** `returnPercentage` es el rendimiento total de la posición contra el costo promedio de las órdenes `FILLED`. `dailyReturnPercentage` es el retorno del activo, `(close - previousClose) / previousClose`. El último precio es el `close` de la fila más reciente de `marketdata` (columna `date`). Si un activo no tiene precio, se informa en `warnings`, sus valores van en `null` y no se suma a `accountValue` (no se lo valúa en 0).

**Órdenes.**
- Se puede enviar `size` o `amount`. Si vienen los dos, se usa `size`. Con `amount`, la cantidad es `floor(amount / precio)`; si no alcanza para una acción, responde 400.
- Una `MARKET` toma el `close` y queda `FILLED`. Una `LIMIT` exige `price` y queda `NEW`.
- Las transferencias son órdenes `FILLED` sobre el instrumento `ARS` (tipo `MONEDA`) con `price = 1`. Como `size` es entero, se transfieren pesos enteros.
- Si faltan pesos (compra o `CASH_OUT`) o acciones (venta), la orden se guarda como `REJECTED`. Esa respuesta es un **400** con el motivo (`reason`) y la orden guardada (`order`).
- Un dato inválido (campo faltante, `side` o `type` desconocido, números inválidos) responde 400 y **no inserta nada**. Usuario o instrumento inexistente: 404. `MARKET` sobre un activo sin precio: 422.
- `PATCH /api/orders/:id/cancel` solo pasa a `CANCELLED` una orden `NEW`. Es un único `UPDATE` condicional, así que dos cancelaciones simultáneas no pisan nada.

**Concurrencia.** Cada orden se procesa en una transacción que bloquea la fila del usuario (`SELECT ... FOR UPDATE`). Dos órdenes simultáneas del mismo usuario se ejecutan una detrás de otra, así no se gasta dos veces el mismo saldo. Los dos casos tienen test.

**Búsqueda.** Parcial y sin distinguir mayúsculas, sobre ticker y nombre. Excluye la moneda, trata `%` y `_` como texto literal, devuelve hasta 50 resultados y ordena primero el ticker exacto y luego los que empiezan igual.

**Errores.** Los 4xx devuelven `{ "error": "..." }`. Los 5xx se loguean y devuelven un mensaje genérico, sin detalles internos.

**Base de datos.** No se modificó el esquema. Las tablas no tienen foreign keys ni `NOT NULL`, así que la API valida que el usuario y el instrumento existan. Para los volúmenes del challenge no hacen falta índices; con muchos datos convendría indexar `orders(userid, status)` y `marketdata(instrumentid, date DESC)`.

## Limitaciones conocidas

- Los montos se calculan con `number` de JavaScript y se redondean a 2 decimales. Para un sistema real convendría trabajar en centavos o con una librería decimal.
- Una `LIMIT` valida fondos y acciones al enviarse, pero no los reserva: dos `LIMIT` pueden comprometer el mismo saldo. No se simula el mercado, así que ninguna se ejecuta sola.
- No hay autenticación (el enunciado no la pide): `userId` viaja en la request.
- Una transferencia es de pesos enteros por el tipo de la columna `size`.

## Postman

Importá [`postman_collection.json`](./postman_collection.json) en Postman. Incluye portfolio, búsqueda y ejemplos de órdenes `MARKET` (por cantidad y por monto), `LIMIT`, venta, `CASH_IN`, `CASH_OUT` y cancelación. Ajustá las variables `baseUrl`, `userId`, `instrumentId`, `orderId` y `marketQuery` a los datos de tu base.

## Pruebas

```sh
npm test
```

Los tests (ts-jest, con chequeo de tipos) corren contra la base de `DATABASE_URL` (idealmente una de desarrollo, no la de producción). Solo necesitan las tablas creadas (ver `db/schema.sql`): cada test crea su propio usuario, activo, precio y órdenes, y los borra al terminar, sin depender de datos previos. Cubren órdenes (MARKET, LIMIT, monto en pesos, rechazos, ventas, transferencias, cancelación, validaciones), concurrencia, portfolio y búsqueda.

Además hay tests unitarios (`test/unit`) de la lógica pura: ledger y costo promedio, valuación, validación de entrada, reglas de rechazo y redondeo. No necesitan base de datos ni `DATABASE_URL`.
