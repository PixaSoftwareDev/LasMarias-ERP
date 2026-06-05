'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Circle, Rocket } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { productsApi, producersApi, clientsApi, recipesApi, inventoryApi, salesApi } from '@/features/api';

// Checklist de puesta en marcha (CLAUDE.md §7 UX): guía el primer uso en el orden correcto
// (cada paso depende del anterior) y se AUTOOCULTA cuando ya está todo cargado. Solo lectura.
export function SetupChecklist() {
  const products = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const producers = useQuery({ queryKey: ['producers'], queryFn: () => producersApi.list() });
  const clients = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const recipes = useQuery({ queryKey: ['recipes'], queryFn: () => recipesApi.list() });
  const silos = useQuery({ queryKey: ['silos'], queryFn: () => inventoryApi.silos() });
  const prices = useQuery({
    queryKey: ['price-list', 'all-count'],
    queryFn: async () => {
      const [min, may, dist] = await Promise.all([
        salesApi.priceList('minorista'),
        salesApi.priceList('mayorista'),
        salesApi.priceList('distribuidor'),
      ]);
      return min.length + may.length + dist.length;
    },
  });

  const queries = [products, producers, clients, recipes, silos, prices];
  // Mientras carga algo, no mostramos nada (evita parpadeo y falsos "pendientes").
  if (queries.some((q) => q.isLoading)) return null;

  const steps = [
    { label: 'Cargá tus productos', desc: 'Quesos, insumos y envases.', href: '/productos', done: (products.data?.length ?? 0) > 0 },
    { label: 'Cargá tus tambos', desc: 'Los productores de leche.', href: '/productores', done: (producers.data?.length ?? 0) > 0 },
    { label: 'Cargá tus clientes', desc: 'A quién le vendés.', href: '/clientes', done: (clients.data?.length ?? 0) > 0 },
    { label: 'Definí los silos', desc: 'Dónde entra la leche, con su capacidad.', href: '/admin/camaras', done: (silos.data?.silos.length ?? 0) > 0 },
    { label: 'Cargá tus recetas', desc: 'Para calcular el costo al producir.', href: '/recetas', done: (recipes.data?.length ?? 0) > 0 },
    { label: 'Cargá las listas de precio', desc: 'El precio por tipo de cliente.', href: '/admin/precios', done: (prices.data ?? 0) > 0 },
  ];

  const completos = steps.filter((s) => s.done).length;
  // Todo listo → no molestamos más.
  if (completos === steps.length) return null;

  return (
    <Card className="border-primary-200 bg-primary-50/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary-700" aria-hidden="true" /> Puesta en marcha
        </CardTitle>
        <p className="text-sm text-foreground-muted">
          Cargá estos datos base para empezar a operar. {completos} de {steps.length} listos.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
              s.done ? 'border-border-subtle bg-surface-elevated' : 'border-primary-200 bg-surface-elevated hover:border-primary-400'
            }`}
          >
            {s.done ? (
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-primary-600" aria-hidden="true" />
            ) : (
              <Circle className="h-5 w-5 flex-shrink-0 text-foreground-subtle" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-medium ${s.done ? 'text-foreground-muted line-through' : 'text-foreground'}`}>{s.label}</span>
              {!s.done && <span className="block text-xs text-foreground-muted">{s.desc}</span>}
            </span>
            {!s.done && <ArrowRight className="h-4 w-4 flex-shrink-0 text-primary-700 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
