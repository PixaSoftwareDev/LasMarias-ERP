'use client';

import Link from 'next/link';
import { Calendar, Tag, Package, Users, MapPin, Milk } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';

const sections = [
  { href: '/productos', icon: Package, title: 'Productos', desc: 'Catálogo de productos terminados, materias primas e insumos.' },
  { href: '/clientes', icon: Users, title: 'Clientes', desc: 'Cuentas comerciales del sistema.' },
  { href: '/productores', icon: Milk, title: 'Productores de leche', desc: 'Tambos que entregan leche cruda.' },
  { href: '/admin/zonas', icon: MapPin, title: 'Zonas de reparto', desc: 'Días de reparto, cutoff y excepciones por zona.' },
  { href: '/admin/listas-precios', icon: Tag, title: 'Listas de precios', desc: 'Precios por tipo de cliente y vigencias.' },
  { href: '/admin/calendario', icon: Calendar, title: 'Calendario', desc: 'Vista mensual de reparto por zona (próximamente).' },
];

export default function AdminHome() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Administración"
        description="Configuración del sistema y datos maestros."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Administración' }]}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href} className="block">
              <Card className="h-full transition-colors hover:bg-surface-subtle">
                <CardHeader className="flex flex-row items-start gap-3">
                  <div className="rounded-md bg-primary-50 p-2"><Icon className="h-5 w-5 text-primary-600" aria-hidden="true" /></div>
                  <div>
                    <CardTitle className="text-base">{s.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-foreground-muted">{s.desc}</CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
