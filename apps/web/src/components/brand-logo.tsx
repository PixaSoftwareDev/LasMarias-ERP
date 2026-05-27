import { cn } from '@/lib/utils';

// Logo de marca para Lácteos Las Marías.
// Una gota de leche en blanco sobre un círculo verde esmeralda (#059669),
// con remate azul (#1C3076) que refuerza la identidad doble del sitio.

interface Props {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

export function BrandLogo({ size = 32, withWordmark = false, className }: Props) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="24" cy="24" r="22" fill="#059669" />
        <path
          d="M24 11c-3 4.5-7 9-7 14a7 7 0 0014 0c0-5-4-9.5-7-14z"
          fill="#FFFFFF"
        />
        <path
          d="M24 38a7 7 0 01-7-7c0-1.2.2-2.4.6-3.6a7 7 0 0012.8 0c.4 1.2.6 2.4.6 3.6a7 7 0 01-7 7z"
          fill="#1C3076"
          opacity="0.85"
        />
      </svg>
      {withWordmark && (
        <div className="flex flex-col leading-tight">
          <span className="font-display text-lg font-semibold tracking-tight text-secondary-700">Las Marías</span>
          <span className="text-[10px] uppercase tracking-wider text-foreground-muted">Industria Láctea</span>
        </div>
      )}
    </div>
  );
}
