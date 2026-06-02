import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formato de fecha en español (ej: "15 may 2026, 08:30")
export function formatDateTime(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Formato corto de litros con separador de miles
export function formatLiters(liters: number): string {
  return `${liters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} l`;
}

// Dinero en pesos, siempre con 2 decimales y separador de miles (ej: "$1.250,00").
// Único formato de plata en toda la app — no definir `money` local en cada pantalla.
export function formatMoney(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Igual que formatMoney pero con signo explícito para flujos (ingreso/egreso): "−$1.250,00".
export function formatSignedMoney(n: number): string {
  return `${n < 0 ? '−' : ''}${formatMoney(Math.abs(n))}`;
}

// Fecha corta dd/mm/aaaa (ej: "02/06/2026"). Único formato de fecha sin hora.
export function formatDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Cantidad con separador de miles y hasta 2 decimales (ej: "1.200,5"). Para kg/litros/unidades.
export function formatQuantity(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

// Normaliza texto para búsquedas: minúsculas y sin tildes (así "creamoso" o "CREMOSO"
// encuentran "Cremoso"). CLAUDE.md §7 — fácil para el usuario.
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
