import {
  LayoutDashboard,
  Milk,
  ChefHat,
  Factory,
  Package,
  Settings,
  ShoppingCart,
  GitBranch,
  BarChart3,
  Wallet,
  Droplets,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@lasmarias/shared-schemas';

// Navegación principal, AGRUPADA por área del negocio (CLAUDE.md §7 — el menú da
// la ubicación; agrupar evita la sensación de "islas" de una lista plana larga).
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  // Etiqueta corta para la bottom-nav mobile (si no, se usa label).
  short?: string;
}

export interface NavGroup {
  // Encabezado del área. '' = sin encabezado (Inicio va solo, arriba de todo).
  area: string;
  items: NavItem[];
}

const ALL: UserRole[] = ['admin', 'gerente', 'operario', 'vendedor', 'repartidor', 'contable'];

export const NAV_GROUPS: NavGroup[] = [
  {
    area: '',
    items: [
      { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ALL },
    ],
  },
  {
    area: 'Planta',
    items: [
      { href: '/recepciones', label: 'Recepción de leche', short: 'Recepción', icon: Milk, roles: ['admin', 'gerente', 'operario'] },
      { href: '/produccion', label: 'Producción', icon: Factory, roles: ['admin', 'gerente', 'operario'] },
      { href: '/inventario', label: 'Stock', icon: Package, roles: ['admin', 'gerente', 'operario', 'vendedor'] },
      { href: '/silos', label: 'Silos de leche', short: 'Silos', icon: Droplets, roles: ['admin', 'gerente', 'operario'] },
      { href: '/recetas', label: 'Recetas', icon: ChefHat, roles: ['admin', 'gerente', 'operario'] },
      { href: '/trazabilidad', label: 'Trazabilidad', icon: GitBranch, roles: ['admin', 'gerente', 'operario'] },
    ],
  },
  {
    area: 'Ventas',
    items: [
      { href: '/ventas', label: 'Ventas', icon: ShoppingCart, roles: ['admin', 'gerente', 'vendedor'] },
    ],
  },
  {
    area: 'Administración',
    items: [
      // Finanzas unifica cobranzas, pagos, caja/bancos y cheques en un solo módulo.
      { href: '/finanzas', label: 'Finanzas', icon: Wallet, roles: ['admin', 'gerente'] },
      { href: '/reportes', label: 'Reportes', icon: BarChart3, roles: ['admin', 'gerente'] },
    ],
  },
  {
    area: 'Configuración',
    items: [
      { href: '/admin', label: 'Datos maestros', short: 'Config', icon: Settings, roles: ['admin'] },
    ],
  },
];

// Lista plana derivada (compatibilidad con consumidores que la usan).
export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// Pantallas habilitadas en Fase 1 (MVP).
const PHASE1_HREFS = new Set<string>([
  '/dashboard',
  '/recepciones',
  '/recetas',
  '/produccion',
  '/inventario',
  '/silos',
  '/trazabilidad',
  '/ventas',
  '/finanzas',
  '/cuentas',
  '/pagos-tambos',
  '/cuentas-pagar',
  '/caja',
  '/cheques',
  '/finanzas/conciliar',
  '/reportes',
  '/admin',
]);

export function visibleFor(role: UserRole): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role) && PHASE1_HREFS.has(n.href));
}

// Grupos visibles para el rol (filtra ítems por rol + fase y descarta grupos vacíos).
export function groupedFor(role: UserRole): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    area: g.area,
    items: g.items.filter((n) => n.roles.includes(role) && PHASE1_HREFS.has(n.href)),
  })).filter((g) => g.items.length > 0);
}

// Bottom-nav (mobile): los 5 de uso diario en planta + despacho, respetando rol.
const MOBILE_HREFS = ['/dashboard', '/recepciones', '/produccion', '/inventario', '/ventas'];

export function mobileNavFor(role: UserRole): NavItem[] {
  const items = visibleFor(role);
  return MOBILE_HREFS.map((h) => items.find((i) => i.href === h)).filter(
    (i): i is NavItem => Boolean(i),
  );
}
