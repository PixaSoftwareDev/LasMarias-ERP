# Infra local (dev)

Stack: PostgreSQL 16 + Redis 7 levantado vía Docker Compose.

## Comandos

```powershell
# Levantar
pnpm infra:up

# Ver logs
pnpm infra:logs

# Apagar (conserva datos)
pnpm infra:down

# Borrar todo (incluyendo datos persistentes)
docker compose -f infra/docker-compose.yml down -v
```

## Puertos

- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## Datos persistidos

Los volúmenes `lasmarias_postgres_data` y `lasmarias_redis_data` sobreviven a `down`. Para reiniciar de cero, agregar el flag `-v`.

## Extensiones de Postgres

Al crear el contenedor por primera vez se ejecuta `postgres/init/01-extensions.sql`, que habilita:

- `uuid-ossp` y `pgcrypto` — IDs UUID y hashing.
- `pg_trgm` — búsquedas por similitud (autocompletado de clientes/productos).
- `unaccent` — búsqueda insensible a acentos.
