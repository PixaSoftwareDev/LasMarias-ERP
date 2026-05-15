'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChefHat, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { recipesApi } from '@/features/api';

export default function RecipesPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ['recipes'], queryFn: () => recipesApi.list() });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Recetas"
        description="Recetas de fabricación con versionado por producto."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Recetas' }]}
        action={
          <div className="flex gap-2">
            <Button asChild variant="secondary"><Link href="/recetas/simulador">Simulador</Link></Button>
            <Button asChild><Link href="/recetas/nueva"><Plus className="h-4 w-4" /> Nueva</Link></Button>
          </div>
        }
      />

      {isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : data.length === 0 ? (
        <EmptyState icon={ChefHat} title="Todavía no hay recetas" description="Cuando crees la primera receta, va a aparecer acá." action={<Button asChild><Link href="/recetas/nueva">Crear receta</Link></Button>} />
      ) : (
        <DataTable
          data={data}
          getKey={(r) => r.id}
          columns={[
            { key: 'name', header: 'Receta', render: (r) => r.name, primary: true },
            { key: 'product', header: 'Producto', render: (r) => r.productName, secondary: true },
            { key: 'yield', header: 'Rendimiento (kg/L)', render: (r) => r.activeVersion?.baseYieldKgPerLiter.toFixed(4) ?? '—', align: 'right' },
            { key: 'version', header: 'Versión', render: (r) => r.activeVersion ? `v${r.activeVersion.versionNumber}` : '—' },
            { key: 'ingredients', header: 'Insumos', render: (r) => r.activeVersion?.ingredients.length ?? 0, align: 'right' },
          ]}
        />
      )}
    </div>
  );
}
