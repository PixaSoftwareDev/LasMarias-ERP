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
  Banknote,
  HandCoins,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@lasmarias/shared-schemas';

// Navegación principal. Lista plana, ordenada por el flujo del negocio
// (leche → producir → vender → plata → configurar).
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export const NAV: NavItem[] = [
  { href: '/dashboard',     label: 'Inicio',              icon: LayoutDashboard, roles: ['admin', 'gerente', 'operario', 'vendedor', 'repartidor', 'contable'] },
  { href: '/recepciones',   label: 'Recepción de leche',  icon: Milk,            roles: ['admin', 'gerente', 'operario'] },
  { href: '/produccion',    label: 'Producción',          icon: Factory,         roles: ['admin', 'gerente', 'operario'] },
  { href: '/inventario',    label: 'Stock',               icon: Package,         roles: ['admin', 'gerente', 'operario', 'vendedor'] },
  { href: '/ventas',        label: 'Ventas',              icon: ShoppingCart,    roles: ['admin', 'gerente', 'vendedor'] },
  { href: '/cuentas',       label: 'Cuenta corriente',    icon: Wallet,          roles: ['admin', 'gerente', 'vendedor'] },
  { href: '/pagos-tambos',  label: 'Pagos a tambos',      icon: HandCoins,       roles: ['admin', 'gerente'] },
  { href: '/caja',          label: 'Flujo de caja',       icon: Banknote,        roles: ['admin', 'gerente'] },
  { href: '/reportes',      label: 'Reportes',            icon: BarChart3,       roles: ['admin', 'gerente'] },
  { href: '/trazabilidad',  label: 'Trazabilidad',        icon: GitBranch,       roles: ['admin', 'gerente', 'operario'] },
  { href: '/recetas',       label: 'Recetas',             icon: ChefHat,         roles: ['admin', 'gerente', 'operario'] },
  { href: '/admin',         label: 'Datos maestros',      icon: Settings,        roles: ['admin'] },
];

// Pantallas habilitadas en Fase 1 (MVP).
const PHASE1_HREFS = new Set<string>([
  '/dashboard',
  '/recepciones',
  '/recetas',
  '/produccion',
  '/inventario',
  '/trazabilidad',
  '/ventas',
  '/cuentas',
  '/pagos-tambos',
  '/caja',
  '/reportes',
  '/admin',
]);

export function visibleFor(role: UserRole): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role) && PHASE1_HREFS.has(n.href));
}

// Bottom-nav (mobile): los 5 de uso diario en planta + despacho, respetando rol.
const MOBILE_HREFS = ['/dashboard', '/recepciones', '/produccion', '/inventario', '/ventas'];

export function mobileNavFor(role: UserRole): NavItem[] {
  const items = visibleFor(role);
  return MOBILE_HREFS.map((h) => items.find((i) => i.href === h)).filter(
    (i): i is NavItem => Boolean(i),
  );
}
