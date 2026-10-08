'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChefHat, Pencil, Plus, Power } from 'lucide-react';
import type { Recipe } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { RowActions } from '@/components/ui/row-actions';
import { useConfirm } from '@/hooks/use-confirm';
import { ApiError } from '@/lib/api-client';
import { DataTable } from '@/components/ui/data-table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { recipesApi } from '@/features/api';

export default function RecipesPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: all = [], isLoading } = useQuery({ queryKey: ['recipes'], queryFn: () => recipesApi.list() });
  // Las dadas de baja no se muestran: sus versiones y lotes viejos siguen en la trazabilidad.
  const data = all.filter((r) => r.isActive);

  const deactivate = useMutation({
    mutationFn: (id: string) => recipesApi.update(id, { isActive: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Receta dada de baja');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo dar de baja la receta. Probá de nuevo.'),
  });

  async function onDeactivate(r: Recipe) {
    const ok = await confirm({
      title: `Dar de baja ${r.name}`,
      message: 'Deja de aparecer en Recetas y en Producción. Los lotes ya elaborados con ella conservan su costo e historial.',
      confirmLabel: 'Dar de baja',
      destructive: true,
    });
    if (ok) deactivate.mutate(r.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recetas"
        description="Cada producto tiene su receta con el rinde (kg por litro) y los costos. Para cambiarla tocá Modificar: el cambio se guarda como una nueva versión y las producciones ya hechas conservan la versión con la que se elaboraron."        action={
          <div className="flex gap-2">
            <Button asChild variant="secondary"><Link href="/recetas/simulador">Simulador</Link></Button>
            <Button asChild><Link href="/recetas/nueva"><Plus className="h-4 w-4" /> Nueva</Link></Button>
          </div>
        }
      />

      {isLoading ? <TableSkeleton /> : data.length === 0 ? (
        <EmptyState icon={ChefHat} title="Todavía no hay recetas" description="Cuando crees la primera receta, va a aparecer acá." action={<Button asChild><Link href="/recetas/nueva">Crear receta</Link></Button>} />
      ) : (
        <>
        {/* Resumen en chip compacto (consistente con el Home). */}
        <div className="flex flex-wrap gap-3">
          <div className="flex min-w-[8rem] sm:min-w-[11rem] items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3 shadow-sm">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <ChefHat className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] uppercase tracking-wide text-foreground-muted">Recetas activas</span>
              <span className="block font-display text-lg font-bold tracking-tight text-foreground">{data.length.toLocaleString('es-AR')}</span>
            </span>
          </div>
        </div>
        <div className="mt-6">
        <DataTable
          data={data}
          getKey={(r) => r.id}
          columns={[
            { key: 'name', header: 'Receta', render: (r) => r.name, primary: true },
            { key: 'product', header: 'Producto', render: (r) => r.productName, secondary: true },
            { key: 'version', header: 'Versión', render: (r) => r.activeVersion ? `v${r.activeVersion.versionNumber}` : '—' },
            { key: 'ingredients', header: 'Insumos', render: (r) => r.activeVersion?.ingredients.length ?? 0, align: 'right' },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (r) => (
                <div className="flex items-center justify-end gap-1">
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/recetas/${r.id}/nueva-version`}><Pencil className="h-4 w-4" /> Modificar</Link>
                  </Button>
                  <RowActions
                    label={`Acciones de ${r.name}`}
                    actions={[{ label: 'Dar de baja', icon: Power, onClick: () => onDeactivate(r), destructive: true }]}
                  />
                </div>
              ),
            },
          ]}
        />
        </div>
        </>
      )}
    </div>
  );
}
