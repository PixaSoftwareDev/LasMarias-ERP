'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tag } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { salesApi } from '@/features/api';

export default function PriceListsPage() {
  const [_] = useState(false); // placeholder para futuras opciones
  void _;
  const { data = [], isLoading } = useQuery({ queryKey: ['price-lists'], queryFn: () => salesApi.listPriceLists() });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Listas de precios"
        description="Una lista por tipo de cliente. La toma de pedidos resuelve el precio automáticamente."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { href: '/admin', label: 'Administración' }, { label: 'Listas de precios' }]}
      />

      {isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : data.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Todavía no hay listas de precios"
          description="Acá vas a ver una lista por tipo de cliente (minorista, mayorista, distribuidor). El formulario para cargarlas está en camino."
        />
      ) : (
        <DataTable
          data={data}
          getKey={(p) => p.id}
          columns={[
            { key: 'name', header: 'Nombre', render: (p) => p.name, primary: true },
            { key: 'type', header: 'Tipo cliente', render: (p) => <span className="capitalize">{p.clientType}</span> },
            { key: 'from', header: 'Desde', render: (p) => p.validFrom ? new Date(p.validFrom).toLocaleDateString('es-AR') : '—' },
            { key: 'to', header: 'Hasta', render: (p) => p.validTo ? new Date(p.validTo).toLocaleDateString('es-AR') : '—' },
          ]}
        />
      )}
    </div>
  );
}
