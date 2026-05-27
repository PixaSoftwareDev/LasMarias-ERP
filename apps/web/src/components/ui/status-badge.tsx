import { cn } from '@/lib/utils';

// Badge semántico estilo "pill" moderno: fondo suave + punto de color.
// CLAUDE.md §5.2 — colores semánticos consistentes (alineados a la paleta:
// emerald/navy/amber/red/slate) y §5.5 — no depender solo del color (texto + dot).
export type Status = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const styles: Record<Status, { wrap: string; dot: string }> = {
  success: { wrap: 'bg-primary-50 text-primary-700', dot: 'bg-primary-500' },
  warning: { wrap: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  danger: { wrap: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  info: { wrap: 'bg-secondary-50 text-secondary-700', dot: 'bg-secondary-500' },
  neutral: { wrap: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
};

interface Props {
  status: Status;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ status, children, className }: Props) {
  const s = styles[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        s.wrap,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden="true" />
      {children}
    </span>
  );
}
