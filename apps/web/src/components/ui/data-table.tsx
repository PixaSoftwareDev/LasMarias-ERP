'use client';

import * as React from 'react';
import { Card } from './card';
import { cn } from '@/lib/utils';

// Tabla simple compartida. Responsive: en mobile cada fila se convierte en stack vertical.
// CLAUDE.md §5.3 — listas sobre tablas en mobile.
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  primary?: boolean; // en mobile aparece arriba destacado
  secondary?: boolean; // en mobile aparece como metadata
  className?: string;
}

interface Props<T> {
  data: T[];
  columns: Column<T>[];
  getKey: (row: T) => string;
  emptyText?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({ data, columns, getKey, emptyText, onRowClick }: Props<T>) {
  if (data.length === 0)
    return (
      <Card className="p-8 text-center text-sm text-foreground-muted">
        {emptyText ?? 'No hay datos para mostrar.'}
      </Card>
    );

  return (
    <>
      {/* Mobile */}
      <div className="grid gap-2 md:hidden">
        {data.map((row) => {
          const primary = columns.filter((c) => c.primary);
          const secondary = columns.filter((c) => c.secondary);
          const rest = columns.filter((c) => !c.primary && !c.secondary);
          return (
            <Card
              key={getKey(row)}
              className={cn('p-4', onRowClick && 'cursor-pointer hover:bg-surface-subtle')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {primary.length > 0 && (
                <div className="mb-1 font-semibold">{primary.map((c) => c.render(row))}</div>
              )}
              {secondary.length > 0 && (
                <div className="mb-2 text-xs text-foreground-muted">
                  {secondary.map((c, i) => (
                    <span key={c.key}>
                      {i > 0 && ' · '}
                      {c.render(row)}
                    </span>
                  ))}
                </div>
              )}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                {rest.map((c) => (
                  <React.Fragment key={c.key}>
                    <dt className="text-foreground-muted">{c.header}</dt>
                    <dd className={cn('text-right', c.align === 'left' && 'text-left')}>{c.render(row)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </Card>
          );
        })}
      </div>

      {/* Desktop */}
      <Card className="hidden md:block">
        <table className="w-full">
          <thead className="border-b border-border-subtle bg-surface-subtle/40">
            <tr className="text-left text-xs uppercase tracking-wide text-foreground-muted">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-4 py-3 font-medium',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={getKey(row)}
                className={cn(
                  'border-b border-border-subtle last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-surface-subtle/30',
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-4 py-3 text-sm',
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center',
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
