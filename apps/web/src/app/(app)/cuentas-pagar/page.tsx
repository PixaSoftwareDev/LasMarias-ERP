import { redirect } from 'next/navigation';

// Unificada en la pestaña "Pagos" (sección Insumos). Se mantiene la ruta como redirect
// para no romper enlaces guardados.
export default function CuentasPagarRedirect() {
  redirect('/pagos?seccion=insumos');
}
