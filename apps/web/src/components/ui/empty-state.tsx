import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// CLAUDE.md §5.3 — estado vacío con mensaje claro y CTA si corresponde.
interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="mb-4 rounded-full bg-surface-subtle p-4">
        <Icon className="h-8 w-8 text-foreground-muted" aria-hidden="true" />
      </div>
      <p className="text-lg font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-foreground-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
