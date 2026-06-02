'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, Inbox, type LucideIcon } from 'lucide-react';
import { Card } from './card';
import { Button } from './button';
import { Input } from './input';
import { EmptyState } from './empty-state';
import { cn, normalizeText } from '@/lib/utils';

// Tabla simple compartida. Responsive: en mobile cada fila se convierte en stack vertical.
// CLAUDE.md §5.2/§5.3 — listas sobre tablas en mobile; paginación, orden y búsqueda.
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  primary?: boolean; // en mobile aparece arriba destacado
  secondary?: boolean; // en mobile aparece como metadata
  className?: string;
  // Si se provee, la columna se puede ordenar (click en el encabezado). El valor
  // determina el criterio (fecha como timestamp, números, o texto).
  sortValue?: (row: T) => string | number;
}

interface Props<T> {
  data: T[];
  columns: Column<T>[];
  getKey: (row: T) => string;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  /** Filas por página. Default 10. Pasar 0 para desactivar la paginación. */
  pageSize?: number;
  /** Si se provee, muestra un buscador que filtra por el texto que devuelve esta función. */
  getSearchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** Controles de filtro extra (fechas, chips…). Se renderizan en la MISMA fila que el buscador, a la derecha. */
  filters?: React.ReactNode;
  /** Estado vacío enriquecido (ícono + título). Si se provee, se usa <EmptyState> en vez del texto plano. */
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
}

const DEFAULT_PAGE_SIZE = 10;

export function DataTable<T>({
  data,
  columns,
  getKey,
  emptyText,
  onRowClick,
  pageSize = DEFAULT_PAGE_SIZE,
  getSearchText,
  searchPlaceholder = 'Buscar…',
  filters,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: Props<T>) {
  const [page, setPage] = React.useState(0);
  const [query, setQuery] = React.useState('');
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

  // 1) Filtrar por búsqueda (insensible a mayúsculas y a tildes).
  const filtered = React.useMemo(() => {
    if (!getSearchText || !query.trim()) return data;
    const q = normalizeText(query);
    return data.filter((row) => normalizeText(getSearchText(row)).includes(q));
  }, [data, getSearchText, query]);

  // 2) Ordenar.
  const sortCol = columns.find((c) => c.key === sortKey && c.sortValue);
  const sorted = React.useMemo(() => {
    if (!sortCol?.sortValue) return filtered;
    const getVal = sortCol.sortValue;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'es', { numeric: true }) * dir;
    });
  }, [filtered, sortCol, sortDir]);

  const total = sorted.length;
  const paginated = pageSize > 0 && total > pageSize;
  const totalPages = paginated ? Math.ceil(total / pageSize) : 1;

  // Si cambia el dataset/búsqueda/orden y la página queda fuera de rango, volvemos al inicio.
  React.useEffect(() => {
    setPage(0);
  }, [query, sortKey, sortDir]);
  React.useEffect(() => {
    if (page > totalPages - 1) setPage(0);
  }, [totalPages, page]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const start = paginated ? page * pageSize : 0;
  const rows = paginated ? sorted.slice(start, start + pageSize) : sorted;

  return (
    <div className="flex flex-col gap-3">
      {/* Barra superior: buscador (izquierda) + filtros (derecha), en una misma fila. */}
      {(getSearchText || filters) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {getSearchText ? (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" aria-hidden="true" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Buscar en la tabla"
                className="pl-9"
              />
            </div>
          ) : (
            <span aria-hidden="true" />
          )}
          {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
        </div>
      )}

      {total === 0 ? (
        query.trim() ? (
          // Vacío por búsqueda: mensaje simple, no un estado vacío "no hay nada".
          <Card className="p-8 text-center text-sm text-foreground-muted">
            No hay resultados para la búsqueda.
          </Card>
        ) : emptyIcon || emptyTitle ? (
          <Card className="py-4">
            <EmptyState icon={emptyIcon ?? Inbox} title={emptyTitle ?? 'No hay datos para mostrar.'} description={emptyDescription} />
          </Card>
        ) : (
          <Card className="p-8 text-center text-sm text-foreground-muted">
            {emptyText ?? 'No hay datos para mostrar.'}
          </Card>
        )
      ) : (
        <>
          {/* Mobile */}
          <div className="grid gap-2 md:hidden">
            {rows.map((row) => {
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
                    <div className="mb-1 font-semibold">
                      {primary.map((c) => (
                        <React.Fragment key={c.key}>{c.render(row)}</React.Fragment>
                      ))}
                    </div>
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

          {/* Desktop — scroll horizontal si la tabla es ancha (no se aprieta en tablet). */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[40rem]">
              <thead className="border-b border-border-subtle bg-surface-subtle/40">
                <tr className="text-left text-xs uppercase tracking-wide text-foreground-muted">
                  {columns.map((c) => {
                    const sortable = !!c.sortValue;
                    const activeSort = sortKey === c.key;
                    return (
                      <th
                        key={c.key}
                        className={cn(
                          'px-4 py-3 font-medium',
                          c.align === 'right' && 'text-right',
                          c.align === 'center' && 'text-center',
                        )}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className={cn(
                              'inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground',
                              c.align === 'right' && 'flex-row-reverse',
                              activeSort && 'text-foreground',
                            )}
                          >
                            {c.header}
                            {activeSort ? (
                              sortDir === 'asc' ? (
                                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
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

          {/* Paginación — solo si hay más de una página. */}
          {paginated && (
            <div className="flex flex-col items-center justify-between gap-2 text-sm sm:flex-row">
              <span className="text-foreground-muted">
                Mostrando {start + 1}–{Math.min(start + pageSize, total)} de {total}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </Button>
                <span className="px-1 text-foreground-muted">
                  Página {page + 1} de {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  Siguiente <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
