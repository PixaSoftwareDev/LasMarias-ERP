'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { FinanceTabs } from '@/components/finance-tabs';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TambosPanel } from '@/components/finance/tambos-panel';
import { ProveedoresPanel } from '@/components/finance/proveedores-panel';

type Seccion = 'tambos' | 'insumos';

// Pestaña "Pagos": unifica lo que se le debe a los tambos (por la leche) y a los
// proveedores de insumos, antes separadas en dos pestañas (CLAUDE.md §7 — menos islas).
function PagosContent() {
  const params = useSearchParams();
  const initial: Seccion = params.get('seccion') === 'insumos' ? 'insumos' : 'tambos';
  const [seccion, setSeccion] = useState<Seccion>(initial);

  return (
    <>
      <SegmentedControl
        label="Sección de pagos"
        value={seccion}
        onChange={setSeccion}
        options={[
          { value: 'tambos', label: 'Tambos' },
          { value: 'insumos', label: 'Insumos' },
        ]}
      />
      {seccion === 'tambos' ? <TambosPanel /> : <ProveedoresPanel />}
    </>
  );
}

export default function PagosPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pagos"
        description="Lo que le debés a los tambos por la leche y a los proveedores de insumos."
      />
      <FinanceTabs />
      <Suspense fallback={null}>
        <PagosContent />
      </Suspense>
    </div>
  );
}
