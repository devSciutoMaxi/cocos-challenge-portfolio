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