'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createProductInputSchema, type CreateProductInput, type Product } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { productsApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

// Modal para crear un insumo (producto) SIN salir del editor de recetas, así no se pierde la
// receta a medio cargar. Al crearlo, se lo agrega al catálogo y se avisa al que llama para que lo
// seleccione en la fila que lo necesitaba. Reusa el mismo lenguaje visual del resto (Card + overlay).

const selectClass =
  'min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

// Categorías que pueden usarse como insumo de una receta (mismo criterio que el editor).
const CATEGORY_OPTIONS: { value: CreateProductInput['category']; label: string }[] = [
  { value: 'insumo', label: 'Insumo' },
  { value: 'envase', label: 'Envase' },
  { value: 'materia_prima', label: 'Materia prima' },
  { value: 'intermedio', label: 'Masa (intermedio)' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (product: Product) => void;
}

export function NewIngredientDialog({ open, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const form = useForm<CreateProductInput>({
    resolver: zodResolver(createProductInputSchema),
    mode: 'onBlur',
    defaultValues: { category: 'insumo', unit: 'kg', trackBatches: false, defaultCostCurrency: 'ARS', costIvaMode: 'sin_iva' },
  });

  // La leche/materia prima y la masa no llevan costo de referencia acá; el insumo y el envase sí.
  const watchCategory = form.watch('category');
  const showCostFields = watchCategory === 'insumo' || watchCategory === 'envase' || watchCategory === 'materia_prima';

  // Al cerrar, limpiar el form para que la próxima apertura arranque en blanco.
  useEffect(() => {
    if (!open)
      form.reset({ category: 'insumo', unit: 'kg', trackBatches: false, defaultCostCurrency: 'ARS', costIvaMode: 'sin_iva' });
  }, [open, form]);

  // Esc cierra, como cualquier diálogo.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const create = useMutation({
    mutationFn: (i: CreateProductInput) => productsApi.create(i),
    onSuccess: (product) => {
      // Dejarlo disponible en el catálogo al instante (sin esperar el refetch) y avisar al editor.
      queryClient.setQueryData<Product[]>(['products'], (old) => (old ? [...old, product] : [product]));
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Insumo creado');
      onCreated(product);
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo crear el insumo. Probá de nuevo.'),
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>Nuevo insumo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-foreground-muted">
            Creá el insumo acá mismo para no perder la receta. Después lo vas a poder ajustar en Productos.
          </p>
          <form
            onSubmit={form.handleSubmit((v) => create.mutateAsync(v))}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <Field label="SKU" htmlFor="ins-sku" required error={form.formState.errors.sku?.message}>
              <Input id="ins-sku" autoFocus placeholder="FER-001" {...form.register('sku')} />
            </Field>
            <Field label="Nombre" htmlFor="ins-name" required error={form.formState.errors.name?.message}>
              <Input id="ins-name" placeholder="Fermento" {...form.register('name')} />
            </Field>
            <Field label="Categoría" htmlFor="ins-category" required error={form.formState.errors.category?.message}>
              <select id="ins-category" className={selectClass} {...form.register('category')}>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Unidad" htmlFor="ins-unit" required error={form.formState.errors.unit?.message}>
              <select id="ins-unit" className={selectClass} {...form.register('unit')}>
                <option value="kg">kg</option>
                <option value="litro">litro</option>
                <option value="unidad">unidad</option>
              </select>
            </Field>
            {showCostFields && (
              <Field
                label="Costo de referencia"
                htmlFor="ins-cost"
                className="sm:col-span-2"
                hint="Opcional. Es el precio que la receta usa para costear este insumo al elaborar."
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="ins-cost"
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    min={0}
                    placeholder="Ej: 1500"
                    className="flex-1"
                    {...form.register('defaultCost', {
                      setValueAs: (v) => (v === '' || v === null || Number.isNaN(Number(v)) ? undefined : Number(v)),
                    })}
                  />
                  <select
                    aria-label="Moneda del costo"
                    className="min-h-touch w-full flex-none rounded-md border border-border bg-surface-elevated px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 sm:w-24"
                    {...form.register('defaultCostCurrency')}
                  >
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                  <select
                    aria-label="IVA del costo"
                    className="min-h-touch w-full flex-none rounded-md border border-border bg-surface-elevated px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 sm:w-32"
                    {...form.register('costIvaMode')}
                  >
                    <option value="sin_iva">Sin IVA</option>
                    <option value="con_iva">Con IVA</option>
                  </select>
                </div>
              </Field>
            )}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button type="submit" loading={create.isPending}>Crear insumo</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
