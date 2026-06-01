'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreVertical, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Menú de acciones por fila (⋮). Mantiene las tablas limpias y deja las acciones
// secundarias (editar, activar/desactivar) a un click, sin saturar la grilla.
// CLAUDE.md §5.2 — acciones accesibles por teclado, destructiva en rojo.

export interface RowAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
}

interface Props {
  actions: RowAction[];
  /** Texto accesible del disparador (ej: "Acciones de Queso cremoso"). */
  label?: string;
}

export function RowActions({ actions, label = 'Acciones' }: Props) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 data-[state=open]:bg-surface-subtle"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[10rem] rounded-lg border border-border-subtle bg-surface-elevated p-1 shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <DropdownMenu.Item
                key={i}
                onSelect={() => a.onClick()}
                className={cn(
                  'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none',
                  a.destructive
                    ? 'text-red-600 focus:bg-red-50'
                    : 'text-foreground focus:bg-surface-subtle',
                )}
              >
                {Icon && <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
                {a.label}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
