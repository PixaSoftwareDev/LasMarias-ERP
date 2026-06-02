'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Package, Users, Milk, Snowflake, Tags, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { productsApi, clientsApi, producersApi, inventoryApi, salesApi } from '@/features/api';

// Hub de datos maestros. Cada tarjeta muestra un mini-dato (conteo) para que
// aporte información, no sólo navegación. Estilo consistente con el Home.

const num = (n: number) => n.toLocaleString('es-AR');

// Pluralización simple para el conteo: "1 producto" / "12 productos".
function countLabel(n: number, singular: string, plural: string) {
  return `${num(n)} ${n === 1 ? singular : plural}`;
}

interface Section {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  count: number | undefined;
  loading: boolean;
  error: boolean;
  singular: string;
  plural: string;
}

function SectionCard({ s }: { s: Section }) {
  const Icon = s.icon;
  const metric = s.loading ? (
    <span className="mt-1 block h-6 w-24 animate-pulse rounded bg-surface-subtle" aria-hidden="true" />
  ) : s.error ? (
    <span className="mt-1 block text-sm text-foreground-muted">No se pudo cargar</span>
  ) : (
    <span className="mt-1 block font-display text-2xl font-bold tracking-tight text-foreground">
      {countLabel(s.count ?? 0, s.singular, s.plural)}
    </span>
  );

  return (
    <Link href={s.href} className="group block">
      <Card className="h-full transition-all hover:border-primary-300 hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-3 pt-6">
          <div className="flex items-start justify-between gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <ChevronRight
              className="h-4 w-4 flex-shrink-0 text-foreground-muted transition-colors group-hover:text-foreground"
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-foreground-muted">{s.title}</p>
            {metric}
          </div>
          <p className="mt-auto text-sm text-foreground-muted">{s.desc}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AdminHome() {
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const clientsQuery = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const producersQuery = useQuery({ queryKey: ['producers'], queryFn: () => producersApi.list() });
  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => inventoryApi.listWarehouses(),
  });
  // Listas de precio: contamos los productos con precio en cualquiera de los 3 tipos.
  const pricesQuery = useQuery({
    queryKey: ['price-list', 'all-count'],
    queryFn: async () => {
      const [min, may, dist] = await Promise.all([
        salesApi.priceList('minorista'),
        salesApi.priceList('mayorista'),
        salesApi.priceList('distribuidor'),
      ]);
      const ids = new Set([...min, ...may, ...dist].map((i) => i.productId));
      return ids.size;
    },
  });

  const sections: Section[] = [
    {
      href: '/productos',
      icon: Package,
      title: 'Productos',
      desc: 'Catálogo de productos terminados, materias primas e insumos.',
      count: productsQuery.data?.length,
      loading: productsQuery.isLoading,
      error: productsQuery.isError,
      singular: 'producto',
      plural: 'productos',
    },
    {
      href: '/clientes',
      icon: Users,
      title: 'Clientes',
      desc: 'Cuentas comerciales del sistema.',
      count: clientsQuery.data?.length,
      loading: clientsQuery.isLoading,
      error: clientsQuery.isError,
      singular: 'cliente',
      plural: 'clientes',
    },
    {
      href: '/productores',
      icon: Milk,
      title: 'Productores de leche',
      desc: 'Tambos que entregan leche cruda.',
      count: producersQuery.data?.length,
      loading: producersQuery.isLoading,
      error: producersQuery.isError,
      singular: 'tambo',
      plural: 'tambos',
    },
    {
      href: '/admin/camaras',
      icon: Snowflake,
      title: 'Cámaras',
      desc: 'Cámaras de frío, depósitos y sectores donde se almacenan los lotes.',
      count: warehousesQuery.data?.length,
      loading: warehousesQuery.isLoading,
      error: warehousesQuery.isError,
      singular: 'cámara',
      plural: 'cámaras',
    },
    {
      href: '/admin/precios',
      icon: Tags,
      title: 'Listas de precios',
      desc: 'Precio de cada producto según el tipo de cliente (minorista, mayorista, distribuidor).',
      count: pricesQuery.data,
      loading: pricesQuery.isLoading,
      error: pricesQuery.isError,
      singular: 'producto con precio',
      plural: 'productos con precio',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Datos maestros"
        description="Catálogos y datos base del sistema. Tocá una tarjeta para ver y editar."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <SectionCard key={s.href} s={s} />
        ))}

        {/* Configuración: no es un catálogo con conteo, así que va como tarjeta simple. */}
        <Link href="/admin/configuracion" className="group block">
          <Card className="h-full transition-all hover:border-primary-300 hover:shadow-md">
            <CardContent className="flex h-full flex-col gap-3 pt-6">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
                </span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-foreground-muted transition-colors group-hover:text-foreground" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-foreground-muted">Configuración</p>
                <span className="mt-1 block font-display text-2xl font-bold tracking-tight text-foreground">Empresa y calidad</span>
              </div>
              <p className="mt-auto text-sm text-foreground-muted">Datos de tu empresa para el remito y los límites de calidad de la leche.</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
