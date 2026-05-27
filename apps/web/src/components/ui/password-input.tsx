'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from './input';

// Campo de contraseña con botón mostrar/ocultar.
// Reutiliza <Input> (mismos estilos y tamaño táctil) y reenvía id/aria que
// inyecta <Field>, así la asociación label↔input y los mensajes de error
// siguen funcionando igual que en cualquier otro campo. CLAUDE.md §5.3 / §5.5.
export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  ({ className, ...props }, ref) => {
    const [show, setShow] = React.useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={show ? 'text' : 'password'}
          className={`pr-11 ${className ?? ''}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-subtle transition-colors hover:text-foreground-muted"
        >
          {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
