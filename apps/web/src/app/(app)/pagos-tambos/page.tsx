import { redirect } from 'next/navigation';

// Unificada en la pestaña "Pagos" (sección Tambos). Se mantiene la ruta como redirect
// para no romper enlaces guardados.
export default function PagosTambosRedirect() {
  redirect('/pagos?seccion=tambos');
}
