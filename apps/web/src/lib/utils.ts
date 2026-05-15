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
