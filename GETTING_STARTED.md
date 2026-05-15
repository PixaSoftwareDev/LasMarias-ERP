# Guía de arranque local — Lácteos Las Marías

Esta guía te lleva desde un clone limpio hasta tener la app andando en localhost con login, dashboard y carga de la primera recepción de leche.

## Prerrequisitos

- **Node 22 LTS** instalado (`node -v` debería decir `v22.x`).
- **pnpm 10+** (`pnpm -v`).
- **Docker Desktop** corriendo (para Postgres y Redis).

## Paso 1 — Instalar dependencias

```powershell
pnpm install
```

> La primera vez baja todo el monorepo (NestJS, Next.js, etc.) y puede tardar unos minutos.

## Paso 2 — Configurar entorno

```powershell
Copy-Item .env.example .env
Copy-Item apps\api\.env.example apps\api\.env
Copy-Item apps\web\.env.example apps\web\.env.local
```

Los valores por defecto sirven para dev local. Cambialos si querés.

## Paso 3 — Levantar la infraestructura local

```powershell
pnpm infra:up
```

Levanta Postgres 16 en `localhost:5432` y Redis 7 en `localhost:6379`. Verificá con `docker ps` que estén `healthy`.

## Paso 4 — Correr migraciones y seed inicial

```powershell
pnpm --filter @lasmarias/api migration:run
pnpm --filter @lasmarias/api seed
```

El seed crea un usuario admin inicial:

- **Email:** `admin@lasmarias.local`
- **Contraseña:** `Admin123!Cambiar`

> Cambiá esa contraseña apenas entres por primera vez (próximo módulo de admin).

## Paso 5 — Arrancar la app

```powershell
pnpm dev
```

Levanta la API (puerto 4000) y la web (puerto 3000) en paralelo con hot-reload.

## Paso 6 — Smoke test manual

1. Abrí http://localhost:3000 en el navegador.
2. Te redirige a `/login`. Entrá con el usuario admin.
3. Vas a parar en el dashboard. Debe mostrar KPIs en placeholder.
4. En el sidebar (desktop) o bottom-nav (mobile, redimensioná la ventana <768px), entrá a **Recepción de leche**.
5. Vas a ver un estado vacío. Antes de cargar una recepción tenés que tener al menos un productor:

```powershell
# Crear un productor de prueba vía curl (PowerShell)
$token = (Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/auth/login -ContentType 'application/json' -Body '{"email":"admin@lasmarias.local","password":"Admin123!Cambiar"}').tokens.accessToken
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/producers -ContentType 'application/json' -Headers @{Authorization="Bearer $token"} -Body '{"name":"Tambo La Esperanza"}'
```

> Pantalla de alta de productores queda para Fase 1 cuando hagamos Administración.

6. Hacé click en **Nueva recepción**. Completá:
   - Fecha y hora (autocompleta con la actual)
   - Productor: elegí "Tambo La Esperanza"
   - Litros: por ejemplo `1200`
   - Temperatura: `4` (dentro de límite — recepción aceptada)
   - pH: `6.7`
   - Prueba de alcohol: tildá "pasó"
7. **Guardar recepción.** Debería volver a la lista con un toast verde y la recepción visible.
8. Probá la versión "bloqueada": cargá otra recepción con temperatura `15`. Debe quedar con badge rojo y un mensaje explicando el motivo (CLAUDE.md §4.1 — bloqueo automático por calidad).

## Cuando termines

```powershell
# Apagar la app: Ctrl+C en la terminal donde corre pnpm dev
pnpm infra:down   # Apaga Postgres y Redis (los datos persisten)
```

## Comandos útiles del día a día

| Comando | Qué hace |
|---|---|
| `pnpm dev` | API + web con hot-reload |
| `pnpm --filter @lasmarias/api test` | Tests del backend (incluye dominio de calidad/lote) |
| `pnpm --filter @lasmarias/api typecheck` | Typecheck del backend |
| `pnpm --filter @lasmarias/web build` | Build de producción del web |
| `pnpm --filter @lasmarias/api migration:generate src/database/migrations/NOMBRE` | Genera una nueva migración desde diffs de entidades |
| `pnpm --filter @lasmarias/api migration:revert` | Deshace la última migración |
| `docker compose -f infra/docker-compose.yml down -v` | Borra los datos de Postgres/Redis |

## Si algo falla

- **Postgres no levanta:** ver `pnpm infra:logs` y revisar puertos ocupados.
- **Migration run da error de conexión:** confirmá que `apps/api/.env` apunta a los mismos valores que `infra/docker-compose.yml`.
- **Web no encuentra la API:** chequear `NEXT_PUBLIC_API_URL` en `apps/web/.env.local`.
- **CORS error:** verificar `CORS_ORIGIN` en `apps/api/.env` — por defecto `http://localhost:3000`.
