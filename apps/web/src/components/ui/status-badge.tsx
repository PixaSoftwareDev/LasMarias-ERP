import { cn } from '@/lib/utils';

// Badge semántico. CLAUDE.md §5.2 — colores semánticos consistentes
// y CLAUDE.md §5.5 — no depender solo del color (cada variante tiene su label).
export type Status = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const styles: Record<Status, string> = {
  success: 'bg-green-50 text-green-800 border-green-200',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  danger: 'bg-red-50 text-red-800 border-red-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  neutral: 'bg-stone-100 text-stone-700 border-stone-200',
};

interface Props {
  status: Status;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ status, children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        styles[status],
        className,
      )}
    >
      {children}
    </span>
  );
}
