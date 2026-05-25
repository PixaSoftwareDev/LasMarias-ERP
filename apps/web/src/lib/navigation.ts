import {
  LayoutDashboard,
  Milk,
  ChefHat,
  Factory,
  Package,
  Receipt,
  Users,
  BarChart3,
  Settings,
  Truck,
  ShoppingCart,
  ArchiveX,
  Thermometer,
  Tractor,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@lasmarias/shared-schemas';

// CLAUDE.md §4 — 11 módulos visibles según rol.
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export const NAV: NavItem[] = [
  { href: '/dashboard',     label: 'Inicio',              icon: LayoutDashboard, roles: ['admin', 'gerente', 'operario', 'vendedor', 'repartidor', 'contable'] },
  { href: '/recepciones',   label: 'Recepción de leche',  icon: Milk,            roles: ['admin', 'gerente', 'operario'] },
  { href: '/productores',   label: 'Productores',         icon: Tractor,         roles: ['admin', 'gerente', 'operario'] },
  { href: '/recetas',       label: 'Recetas',             icon: ChefHat,         roles: ['admin', 'gerente', 'operario'] },
  { href: '/produccion',    label: 'Producción',          icon: Factory,         roles: ['admin', 'gerente', 'operario'] },
  { href: '/inventario',    label: 'Inventario',          icon: Package,         roles: ['admin', 'gerente', 'operario', 'vendedor'] },
  { href: '/inventario/maduracion', label: 'Maduración',  icon: Thermometer,     roles: ['admin', 'gerente', 'operario'] },
  { href: '/compras',       label: 'Compras',             icon: Truck,           roles: ['admin', 'gerente', 'contable'] },
  { href: '/ventas',        label: 'Ventas y pedidos',    icon: ShoppingCart,    roles: ['admin', 'gerente', 'vendedor'] },
  { href: '/envases-retornables', label: 'Envases retornables', icon: ArchiveX, roles: ['admin', 'gerente', 'vendedor', 'repartidor'] },
  { href: '/comprobantes',  label: 'Comprobantes',        icon: Receipt,         roles: ['admin', 'gerente', 'contable', 'vendedor'] },
  { href: '/rrhh',          label: 'Asistencia',          icon: Users,           roles: ['admin', 'gerente'] },
  { href: '/reportes',      label: 'Reportes',            icon: BarChart3,       roles: ['admin', 'gerente', 'contable'] },
  { href: '/admin',         label: 'Administración',      icon: Settings,        roles: ['admin'] },
];

export function visibleFor(role: UserRole): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role));
}
