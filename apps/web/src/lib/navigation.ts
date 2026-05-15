import {
  LayoutDashboard,
  Milk,
  ChefHat,
  Factory,
  Package,
  ShoppingCart,
  Receipt,
  Wallet,
  Users,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@lasmarias/shared-schemas';

// Los 11 módulos del CLAUDE.md §4 — con permisos por rol y orden de aparición.
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];          // qué roles ven este item
  mobileGroup?: 'planta' | 'comercial' | 'admin'; // para bottom-nav según contexto
}

export const NAV: NavItem[] = [
  { href: '/dashboard',     label: 'Inicio',          icon: LayoutDashboard, roles: ['admin', 'gerente', 'operario', 'vendedor', 'repartidor', 'contable'] },
  { href: '/recepciones',   label: 'Recepción de leche', icon: Milk,         roles: ['admin', 'gerente', 'operario'], mobileGroup: 'planta' },
  { href: '/recetas',       label: 'Recetas',         icon: ChefHat,         roles: ['admin', 'gerente'] },
  { href: '/produccion',    label: 'Producción',      icon: Factory,         roles: ['admin', 'gerente', 'operario'], mobileGroup: 'planta' },
  { href: '/inventario',    label: 'Inventario',      icon: Package,         roles: ['admin', 'gerente', 'operario'], mobileGroup: 'planta' },
  { href: '/compras',       label: 'Compras',         icon: ShoppingCart,    roles: ['admin', 'gerente', 'contable'] },
  { href: '/ventas',        label: 'Ventas y pedidos', icon: Receipt,        roles: ['admin', 'gerente', 'vendedor'], mobileGroup: 'comercial' },
  { href: '/finanzas',      label: 'Costos y finanzas', icon: Wallet,        roles: ['admin', 'gerente', 'contable'] },
  { href: '/rrhh',          label: 'Asistencia',      icon: Users,           roles: ['admin', 'gerente'] },
  { href: '/reportes',      label: 'Reportes',        icon: BarChart3,       roles: ['admin', 'gerente', 'contable'] },
  { href: '/admin',         label: 'Administración',  icon: Settings,        roles: ['admin'] },
];

export function visibleFor(role: UserRole): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role));
}
