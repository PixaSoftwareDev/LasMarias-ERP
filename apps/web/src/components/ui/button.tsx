'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// CLAUDE.md §5.1 — botones táctiles ≥44px, una acción primaria visualmente dominante.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ' +
    'focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Gradiente verde profundo (no chillón) + sombra suave para un acabado moderno.
        primary:
          'bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-sm ' +
          'hover:from-primary-700 hover:to-primary-900 active:from-primary-800 active:to-primary-900',
        secondary: 'bg-surface-elevated text-foreground border border-border shadow-sm hover:bg-surface-subtle',
        ghost: 'text-foreground hover:bg-surface-subtle',
        danger: 'bg-danger text-white shadow-sm hover:bg-red-700',
      },
      size: {
        // Min-h 44px en todos para cumplir CLAUDE.md §5.1
        sm: 'min-h-touch px-3 text-sm',
        md: 'min-h-touch px-4 text-base',
        lg: 'min-h-[52px] px-6 text-base font-semibold',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      block: false,
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild, loading, loadingText, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingText ?? 'Guardando...'}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
