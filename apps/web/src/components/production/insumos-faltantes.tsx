import { AlertTriangle } from 'lucide-react';

// Insumos que no alcanzaron en el stock al cerrar o recalcular: se descontó lo que había y el
// resto quedó sin descontar. Avisa para cargar la compra que falta.
export function InsumosFaltantes({ faltantes }: { faltantes?: { name: string; faltan: string }[] }) {
  if (!faltantes?.length) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>
        No alcanzó el stock de{' '}
        {faltantes.map((f, i) => (
          <span key={f.name}>
            {i > 0 && ', '}
            <span className="font-medium">{f.name}</span> (faltaron {Number(f.faltan).toLocaleString('es-AR')})
          </span>
        ))}
        . Se descontó lo que había: revisá si falta cargar una compra.
      </span>
    </div>
  );
}
