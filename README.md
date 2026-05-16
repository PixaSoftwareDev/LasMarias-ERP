# Lácteos Las Marías — Sistema de Gestión

Plataforma integral para la planta láctea de Pergamino. Cubre recepción de leche, recetas, producción, inventario con trazabilidad bidireccional, ventas con calendario de reparto, compras, RRHH y reportes.

> La especificación completa del producto está en [`CLAUDE.md`](./CLAUDE.md). Ese documento es la fuente de verdad.

## Stack

- **Backend:** Node 22 + NestJS + TypeORM + PostgreSQL 16 + Redis 7 + BullMQ
- **Frontend:** Next.js 14 (App Router) + Tailwind + shadcn/ui — **web responsive única** (desktop + mobile)
- **Schemas compartidos:** Zod (runtime validation cross-stack)
- **Monorepo:** pnpm workspaces + Turborepo
- **Infra dev:** Docker Compose (Postgres + Redis)
- **CI:** GitHub Actions

## Estructura

```
.
├── apps/
│   ├── api/              Backend NestJS
│   └── web/              Frontend Next.js 14 (responsive)
├── packages/
│   ├── shared-schemas/   Zod compartido API <-> Web
│   ├── design-tokens/    Paleta, tipografía, espaciado (Tailwind preset)
│   └── tsconfig/         Configs TS base
├── infra/
│   └── docker-compose.yml   Postgres 16 + Redis 7 para dev
└── .github/workflows/    CI/CD
```

## Requisitos

- **Node 22 LTS** (`node -v` debería decir `v22.x`)
- **pnpm 10+** (`pnpm -v`)
- **Docker Desktop** corriendo (para Postgres y Redis)

## Arranque local

### 1. Instalar dependencias

```powershell
pnpm install
```

### 2. Configurar entorno

```powershell
Copy-Item .env.example .env
Copy-Item apps\api\.env.example apps\api\.env
Copy-Item apps\web\.env.example apps\web\.env.local
```

Los valores por defecto sirven para dev local.

### 3. Levantar infraestructura

```powershell
pnpm infra:up
```

Postgres 16 en `localhost:5432` y Redis 7 en `localhost:6379`. Verificá con `docker ps` que estén `healthy`.

### 4. Migraciones + seed

```powershell
pnpm --filter @lasmarias/api migration:run
pnpm --filter @lasmarias/api seed
```

El seed crea un usuario admin inicial:

- **Email:** `admin@lasmarias.local`
- **Contraseña:** `Admin123!Cambiar`

> Cambiá esa contraseña apenas entres por primera vez.

### 5. Arrancar la app

```powershell
pnpm dev
```

API: http://localhost:4000 — Web: http://localhost:3000

## Smoke test manual

1. Abrí http://localhost:3000 y entrá con el usuario admin.
2. Vas a parar en el dashboard con KPIs en placeholder.
3. Desde el sidebar (desktop) o bottom-nav (mobile, ventana <768px), entrá a **Recepción de leche**.
4. Antes de cargar una recepción necesitás al menos un productor:

   ```powershell
   $token = (Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/auth/login -ContentType 'application/json' -Body '{"email":"admin@lasmarias.local","password":"Admin123!Cambiar"}').tokens.accessToken
   Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/producers -ContentType 'application/json' -Headers @{Authorization="Bearer $token"} -Body '{"name":"Tambo La Esperanza"}'
   ```

5. **Nueva recepción** → completá fecha/hora, productor, litros `1200`, temperatura `4`, pH `6.7`, prueba de alcohol tildada. Guardar → toast verde y aparece en la lista.
6. Probá el bloqueo por calidad: nueva recepción con temperatura `15`. Debe quedar con badge rojo (CLAUDE.md §4.1).

## Scripts útiles

| Comando | Qué hace |
|---|---|
| `pnpm dev` | API + web con hot-reload |
| `pnpm build` | Build de producción de todo |
| `pnpm lint` | Lint en todo el monorepo |
| `pnpm typecheck` | Typecheck en todo el monorepo |
| `pnpm test` | Tests en todo el monorepo |
| `pnpm infra:up` / `infra:down` / `infra:logs` | Postgres + Redis |
| `pnpm --filter @lasmarias/api migration:generate src/database/migrations/NOMBRE` | Genera migración desde diffs |
| `pnpm --filter @lasmarias/api migration:revert` | Deshace la última migración |
| `docker compose -f infra/docker-compose.yml down -v` | Borra datos persistidos de Postgres/Redis |

## Si algo falla

- **Postgres no levanta:** `pnpm infra:logs` y revisar puertos ocupados.
- **Migration da error de conexión:** confirmá que `apps/api/.env` coincide con `infra/docker-compose.yml`.
- **Web no encuentra la API:** chequear `NEXT_PUBLIC_API_URL` en `apps/web/.env.local`.
- **CORS error:** verificar `CORS_ORIGIN` en `apps/api/.env` — por defecto `http://localhost:3000`.

## Convenciones

- Commits convencionales (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Branch por feature, PR con review obligatorio antes de merge a `main`.
- TypeScript estricto. ESLint + Prettier compartidos.
- UX: ver CLAUDE.md sección 5. **Es tan obligatorio como el stack.**

## Fases

Fase 0 cimientos · Fase 1 planta · Fase 2 comercial · Fase 3 admin · Fase 4 RRHH/BI · Fase 5 pulido.

Hoy: Fase 0 + arranque de Recepción de leche.
