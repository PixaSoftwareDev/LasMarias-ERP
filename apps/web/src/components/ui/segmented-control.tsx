'use client';

// Control segmentado (pill) reutilizable: dos o más opciones excluyentes en una
// sola "cápsula". CLAUDE.md §5.2 — patrón de toggle. Fuente única para que el
// estilo sea consistente en toda la app (caja, reportes, etc.).
//
// Claves del layout para que NO se "toquen" los botones ni se desalinee:
// - la altura mínima (min-h-touch ≥44px) vive en el contenedor, no en cada botón;
// - padding interno p-1 + gap-1 dan aire entre la cápsula activa y el borde.

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Etiqueta accesible del grupo (no se muestra). */
  label: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={
        'inline-flex min-h-touch items-center gap-1 rounded-lg border border-border bg-surface-subtle p-1' +
        (className ? ` ${className}` : '')
      }
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={
            'whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ' +
            (value === opt.value
              ? 'bg-surface-elevated text-foreground shadow-sm'
              : 'text-foreground-muted hover:text-foreground')
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
