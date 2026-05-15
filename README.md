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

- Node 22 LTS
- pnpm 10+
- Docker Desktop (para Postgres y Redis locales)

## Setup inicial

```powershell
# 1. Instalar dependencias del monorepo
pnpm install

# 2. Copiar variables de entorno
Copy-Item .env.example .env

# 3. Levantar infra local (Postgres + Redis)
pnpm infra:up

# 4. Correr migraciones (cuando estén creadas)
pnpm --filter @lasmarias/api migration:run

# 5. Arrancar todo en dev
pnpm dev
```

API: http://localhost:4000 — Web: http://localhost:3000

## Scripts útiles

| Script | Qué hace |
|---|---|
| `pnpm dev` | Arranca api y web en paralelo |
| `pnpm build` | Build de producción de todo |
| `pnpm lint` | Lint en todo el monorepo |
| `pnpm typecheck` | Typecheck en todo el monorepo |
| `pnpm test` | Tests en todo el monorepo |
| `pnpm infra:up` / `infra:down` | Levanta / apaga Postgres + Redis |

## Convenciones

- Commits convencionales (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Branch por feature, PR con review obligatorio antes de merge a `main`.
- TypeScript estricto. ESLint + Prettier compartidos.
- UX: ver CLAUDE.md sección 5. **Es tan obligatorio como el stack.**

## Fases

Fase 0 cimientos · Fase 1 planta · Fase 2 comercial · Fase 3 admin · Fase 4 RRHH/BI · Fase 5 pulido.

Hoy: Fase 0 + arranque de Recepción de leche.
