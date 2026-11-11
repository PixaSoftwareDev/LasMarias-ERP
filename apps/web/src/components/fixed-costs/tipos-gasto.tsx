'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import type { FixedCostType, FixedCostTypeInput } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fixedCostsApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

// Tipos de gasto que arma el dueño (nada precargado): un nombre y los campos que quiera.
// Ej: Sueldo → Empleado, Puesto, CUIL, Fecha de ingreso. Luz → N° de factura, Período.
// Los campos son solo para identificar el gasto; el monto se carga aparte en cada mes.
// Cambiar o borrar un tipo no toca los meses ya guardados (cada gasto guardó su copia).

const err = (e: unknown, def: string) => (e instanceof ApiError ? e.message : def);

export function TiposGasto({
  tipos,
  abierto: abiertoInicial,
  onCerrar,
}: {
  tipos: FixedCostType[];
  abierto: boolean;
  onCerrar?: () => void; // si lo controla la pantalla (botón de arriba), cerrar la avisa
}) {
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [editando, setEditando] = useState<FixedCostType | 'nuevo' | null>(tipos.length === 0 ? 'nuevo' : null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['fixed-costs'] });

  const borrar = useMutation({
    mutationFn: (t: FixedCostType) => fixedCostsApi.removeType(t.id),
    onSuccess: (_r, t) => {
      refresh();
      toast.success(`Tipo "${t.nombre}" borrado. Los meses ya cargados no cambian.`);
    },
    onError: (e) => toast.error(err(e, 'No se pudo borrar. Probá de nuevo.')),
  });

  if (!abierto)
    return (
      <Button variant="secondary" className="self-start" onClick={() => setAbierto(true)}>
        Tipos de gasto ({tipos.length})
      </Button>
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Tipos de gasto</CardTitle>
          <p className="text-sm text-foreground-muted">
            Armá cada tipo con los campos que quieras. Los campos son para saber qué es cada gasto; el monto se carga aparte.
          </p>
        </div>
        {tipos.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => (onCerrar ? onCerrar() : setAbierto(false))} aria-label="Cerrar tipos de gasto">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {tipos.map((t) =>
          editando !== 'nuevo' && editando?.id === t.id ? (
            <TipoForm key={t.id} tipo={t} onDone={() => setEditando(null)} />
          ) : (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-border-subtle px-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {t.nombre}
                  {t.variable && (
                    <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-foreground">
                      Cambia cada mes
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-foreground-muted">
                  {t.campos.length ? t.campos.join(' · ') : 'Sin campos extra'} · Monto
                </p>
              </div>
              <div className="flex flex-shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setEditando(t)} aria-label={`Cambiar ${t.nombre}`}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => borrar.mutate(t)}
                  disabled={borrar.isPending}
                  aria-label={`Borrar ${t.nombre}`}
                >
                  <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ),
        )}
        {editando === 'nuevo' ? (
          <TipoForm onDone={() => setEditando(null)} />
        ) : (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setEditando('nuevo')}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo tipo de gasto
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function TipoForm({ tipo, onDone }: { tipo?: FixedCostType; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState(tipo?.nombre ?? '');
  const [campos, setCampos] = useState<string[]>(tipo?.campos ?? []);
  const [variable, setVariable] = useState<boolean>(tipo?.variable ?? false);

  const save = useMutation({
    mutationFn: (input: FixedCostTypeInput) =>
      tipo ? fixedCostsApi.updateType(tipo.id, input) : fixedCostsApi.createType(input),
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ['fixed-costs'] });
      toast.success(tipo ? `Tipo "${t.nombre}" actualizado.` : `Tipo "${t.nombre}" creado.`);
      onDone();
    },
    onError: (e) => toast.error(err(e, 'No se pudo guardar. Probá de nuevo.')),
  });

  const onGuardar = () => {
    const n = nombre.trim();
    const cs = campos.map((c) => c.trim()).filter(Boolean);
    if (!n) return void toast.error('Falta el nombre del tipo de gasto.');
    if (new Set(cs.map((c) => c.toLowerCase())).size !== cs.length) return void toast.error('Hay dos campos con el mismo nombre.');
    save.mutate({ nombre: n, campos: cs, variable });
  };

  const idBase = tipo?.id ?? 'nuevo';
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-subtle/40 p-3">
      <Field label="Nombre del tipo" htmlFor={`tg-${idBase}-nombre`}>
        <Input value={nombre} placeholder="Ej: Sueldo" onChange={(e) => setNombre(e.target.value)} />
      </Field>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Campos</p>
        {campos.map((c, i) => (
          <div key={i} className="flex gap-2">
            <Input
              aria-label={`Campo ${i + 1}`}
              value={c}
              placeholder="Ej: Empleado"
              onChange={(e) => setCampos((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCampos((cs) => cs.filter((_, j) => j !== i))}
              aria-label={`Sacar campo ${c || i + 1}`}
            >
              <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
            </Button>
          </div>
        ))}
        {campos.length < 10 && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setCampos((cs) => [...cs, ''])}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Agregar campo
          </Button>
        )}
        <p className="text-sm text-foreground-muted">El monto se agrega siempre, no hace falta crearlo.</p>
      </div>
      <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-5 w-5 accent-primary-600"
          checked={variable}
          onChange={(e) => setVariable(e.target.checked)}
        />
        El monto cambia cada mes
        <span className="text-foreground-muted">(luz, agua, gas: avisa cuando falta la factura nueva)</span>
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onDone} disabled={save.isPending}>
          Cancelar
        </Button>
        <Button onClick={onGuardar} loading={save.isPending} loadingText="Guardando...">
          {tipo ? 'Guardar cambios' : 'Crear tipo'}
        </Button>
      </div>
    </div>
  );
}
