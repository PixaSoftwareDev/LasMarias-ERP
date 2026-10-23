'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  invalid?: boolean;
  /** Adorno fijo a la izquierda dentro del campo (ej: "$"). */
  prefix?: React.ReactNode;
  /** Adorno fijo a la derecha dentro del campo (ej: "kg", "L"). */
  suffix?: React.ReactNode;
}

// Deja un signo menos inicial, dígitos y un único separador decimal (coma o punto:
// el primero que se escriba). "1392,75" y "1392.75" quedan como se tipearon.
export function cleanNumberText(raw: string): string {
  const negative = raw.trimStart().startsWith('-');
  const only = raw.replace(/[^\d.,]/g, '');
  const sep = only.search(/[.,]/);
  const body = sep === -1 ? only : only.slice(0, sep + 1) + only.slice(sep + 1).replace(/[.,]/g, '');
  return (negative ? '-' : '') + body;
}

// Lo que recibe el formulario: siempre con punto, para que Number() lo entienda.
const toDotDecimal = (text: string) => text.replace(',', '.');

const numberOf = (text: string) => {
  const n = Number(toDotDecimal(text));
  return Number.isFinite(n) ? n : 0;
};

// CLAUDE.md §5.3 — inputs grandes (altura ≥44px), buen padding, labels arriba (no flotantes).
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, type = 'text', prefix, suffix, ...props }, ref) => {
    const fieldClass = cn(
      'flex min-h-touch w-full rounded-md border bg-surface-elevated px-3 py-2 text-base',
      'placeholder:text-foreground-subtle',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1',
      'disabled:cursor-not-allowed disabled:opacity-50',
      invalid ? 'border-danger focus-visible:ring-danger' : 'border-border',
      // Espacio para los adornos cuando existen.
      prefix && 'pl-7',
      suffix && 'pr-10',
      className,
    );

    const inputEl =
      type === 'number' ? (
        <NumberField ref={ref} invalid={invalid} className={fieldClass} {...props} />
      ) : (
        <input ref={ref} type={type} autoComplete="off" aria-invalid={invalid || undefined} className={fieldClass} {...props} />
      );

    if (!prefix && !suffix) return inputEl;

    // Adornos dentro del campo: no capturan el click (pointer-events-none) para que
    // el foco vaya siempre al input. Color tenue para no competir con el valor.
    return (
      <div className="relative w-full">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-foreground-muted">
            {prefix}
          </span>
        )}
        {inputEl}
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">
            {suffix}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

/**
 * Campo numérico. La tecla decimal del teclado numérico manda "." o "," según la PC, y el
 * `type="number"` del navegador rechaza el que no espera (y a veces borra lo escrito). Por
 * eso es un campo de texto que acepta los dos: muestra lo que se tipeó y al formulario le
 * llega siempre con punto. Con `value` (controlado) guarda el texto propio para no perder
 * "1392," a medio escribir; sin `value` (react-hook-form) corrige el texto en el lugar.
 */
const NumberField = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'prefix' | 'suffix'>>(
  ({ invalid, value, onChange, inputMode, ...props }, ref) => {
    const controlled = value !== undefined;
    const [text, setText] = React.useState(value == null ? '' : String(value));
    const inner = React.useRef<HTMLInputElement | null>(null);
    const caret = React.useRef<number | null>(null);

    // Si el valor cambia desde afuera (precio de lista, limpiar el formulario), mostrarlo.
    React.useEffect(() => {
      if (!controlled) return;
      const external = value == null ? '' : String(value);
      if (numberOf(text) !== numberOf(external)) setText(external);
    }, [value]);

    // Al cambiar el texto, el cursor queda donde estaba (no salta al final).
    React.useLayoutEffect(() => {
      const el = inner.current;
      if (caret.current != null && el && el === document.activeElement) {
        el.setSelectionRange(caret.current, caret.current);
      }
      caret.current = null;
    }, [text]);

    return (
      <input
        ref={(el) => {
          inner.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        type="text"
        inputMode={inputMode ?? 'decimal'}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        {...props}
        {...(controlled ? { value: text } : {})}
        onChange={(e) => {
          const el = e.target;
          const cleaned = cleanNumberText(el.value);
          const pos = Math.max(0, (el.selectionStart ?? cleaned.length) - (el.value.length - cleaned.length));
          if (controlled) {
            caret.current = pos;
            setText(cleaned);
          }
          const forForm = toDotDecimal(cleaned);
          if (el.value !== forForm) {
            el.value = forForm;
            el.setSelectionRange(pos, pos);
          }
          onChange?.(e);
        }}
      />
    );
  },
);
NumberField.displayName = 'NumberField';
