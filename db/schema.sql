-- Estructura de la base provista (sin foreign keys ni NOT NULL, como en el original).
CREATE TABLE IF NOT EXISTS public.instruments (
	id serial4 PRIMARY KEY,
	ticker varchar(10) NULL,
	"name" varchar(255) NULL,
	"type" varchar(10) NULL
);

CREATE TABLE IF NOT EXISTS public.users (
	id serial4 PRIMARY KEY,
	email varchar(255) NULL,
	accountnumber varchar(20) NULL
);

CREATE TABLE IF NOT EXISTS public.marketdata (
	id serial4 PRIMARY KEY,
	instrumentid int4 NULL,
	high numeric(10, 2) NULL,
	low numeric(10, 2) NULL,
	"open" numeric(10, 2) NULL,
	"close" numeric(10, 2) NULL,
	previousclose numeric(10, 2) NULL,
	"date" date NULL
);

CREATE TABLE IF NOT EXISTS public.orders (
	id serial4 PRIMARY KEY,
	instrumentid int4 NULL,
	userid int4 NULL,
	"size" int4 NULL,
	price numeric(10, 2) NULL,
	"type" varchar(10) NULL,
	side varchar(10) NULL,
	status varchar(20) NULL,
	datetime timestamp NULL
);

-- Idempotencia de órdenes: guarda la respuesta de cada Idempotency-Key para devolverla si el cliente reintenta.
-- Clave primaria (userid, key): la misma key puede usarla otro usuario sin chocar.
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
	userid int4 NOT NULL,
	"key" varchar(100) NOT NULL,
	request_hash char(64) NOT NULL,
	response jsonb NOT NULL,
	created_at timestamp NOT NULL DEFAULT now(),
	PRIMARY KEY (userid, "key")
);

-- Proyección del saldo y las posiciones de cada usuario (se actualiza en la misma transacción que la orden).
-- Las órdenes FILLED siguen siendo la fuente de verdad: si la proyección falta o está desactualizada, se reconstruye.
-- last_order_id: id de la última orden FILLED del usuario que ya está incorporada en estos números.
CREATE TABLE IF NOT EXISTS public.account_balance (
	userid int4 PRIMARY KEY,
	cash numeric(14, 2) NOT NULL DEFAULT 0 CHECK (cash >= 0),
	last_order_id int4 NOT NULL DEFAULT 0,
	updated_at timestamp NOT NULL DEFAULT now()
);

-- Sin CHECK en shares a propósito: el historial puede traer una venta de más (por ejemplo, el usuario 1 del
-- dataset vende 30 acciones de BMA con 20 en cartera) y la proyección tiene que dar lo mismo que el ledger.
CREATE TABLE IF NOT EXISTS public.account_positions (
	userid int4 NOT NULL,
	instrumentid int4 NOT NULL,
	shares int4 NOT NULL,
	cost numeric(18, 6) NOT NULL,
	PRIMARY KEY (userid, instrumentid)
);

-- Para que MAX(id) de las órdenes FILLED de un usuario sea inmediato.
CREATE INDEX IF NOT EXISTS orders_user_status_id_idx ON public.orders (userid, status, id);