'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { Card } from './card';
import { Input } from './input';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  primary?: boolean;
  secondary?: boolean;
  className?: string;
}

interface Props<T> {
  data: T[];
  columns: Column<T>[];
  getKey: (row: T) => string;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  searchFn?: (row: T, query: string) => boolean;
}

export function DataTable<T>({ data, columns, getKey, emptyText, onRowClick, searchPlaceholder, searchFn }: Props<T>) {
  const [query, setQuery] = React.useState('');

  const filtered = React.useMemo(() => {
    if (!query.trim() || !searchFn) return data;
    return data.filter((row) => searchFn(row, query.toLowerCase()));
  }, [data, query, searchFn]);

  return (
    <div className="flex flex-col gap-3">
      {searchFn && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" aria-hidden="true" />
          <Input
            placeholder={searchPlaceholder ?? 'Buscar...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-foreground-muted">
          {query ? `No se encontraron resultados para "${query}"` : (emptyText ?? 'No hay datos para mostrar.')}
        </Card>
      ) : (
        <>
          {/* Mobile */}
          <div className="grid gap-2 md:hidden">
            {filtered.map((row) => {
              const primary = columns.filter((c) => c.primary);
              const secondary = columns.filter((c) => c.secondary);
              const rest = columns.filter((c) => !c.primary && !c.secondary);
              return (
                <Card
                  key={getKey(row)}
                  className={cn('p-4', onRowClick && 'cursor-pointer hover:bg-surface-subtle active:bg-surface-subtle')}
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
                  {onRowClick && (
                    <p className="mt-2 text-right text-xs text-foreground-muted">Tocá para ver / editar →</p>
                  )}
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
                  {onRowClick && <th className="px-4 py-3 font-medium text-right w-20">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={getKey(row)}
                    className={cn(
                      'border-b border-border-subtle last:border-0',
                      onRowClick && 'cursor-pointer hover:bg-surface-subtle/40',
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
                    {onRowClick && (
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-primary-600 font-medium">Editar →</span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
