'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Droplets, TriangleAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { inventoryApi } from '@/features/api';
import type { SiloLevel } from '@lasmarias/shared-schemas';

// Vista visual de silos de leche (CLAUDE.md §9). Todo sale del stock real; no se carga
// a mano. Tanque por silo (llenado de abajo hacia arriba) + velocímetro del total.

const LOW_THRESHOLD = 15; // % por debajo del cual el silo está "casi vacío" (alerta).

const litros = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
const pct = (n: number) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;

type Tone = 'low' | 'normal' | 'over';
function toneOf(fillPercent: number): Tone {
  if (fillPercent > 100) return 'over';
  if (fillPercent < LOW_THRESHOLD) return 'low';
  return 'normal';
}
// Colores del líquido por estado (CLAUDE.md §5.2): azul normal, rojo bajo, ámbar excedido.
const LIQUID: Record<Tone, string> = { low: '#ef4444', normal: '#0ea5e9', over: '#f59e0b' };
const TEXT_TONE: Record<Tone, string> = {
  low: 'text-danger',
  normal: 'text-foreground',
  over: 'text-amber-600',
};

// --- Tanque SVG: se llena de abajo hacia arriba según el % (clamp 0–100 para el dibujo). ---
function Tank({ silo }: { silo: SiloLevel }) {
  const tone = toneOf(silo.fillPercent);
  const W = 132;
  const H = 172;
  const top = 10;
  const innerH = H - top - 14;
  const frac = Math.max(0, Math.min(100, silo.fillPercent)) / 100;
  const liquidH = innerH * frac;
  const liquidY = top + (innerH - liquidH);
  const clipId = `tank-clip-${silo.id}`;

  return (
    <Card className="flex flex-col items-center">
      <CardContent className="flex flex-col items-center gap-3 pt-6">
        <p className="text-center text-sm font-semibold text-foreground">{silo.name}</p>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Silo ${silo.name}, ${pct(silo.fillPercent)} lleno`}>
          <defs>
            <clipPath id={clipId}>
              <rect x="14" y={top} width={W - 28} height={innerH} rx="14" />
            </clipPath>
          </defs>
          {/* Cuerpo del tanque */}
          <rect x="14" y={top} width={W - 28} height={innerH} rx="14" className="fill-surface-subtle stroke-border" strokeWidth="2" />
          {/* Líquido (recortado al cuerpo) */}
          <g clipPath={`url(#${clipId})`}>
            <rect x="14" y={liquidY} width={W - 28} height={liquidH + 14} fill={LIQUID[tone]} opacity={0.85} />
            {/* "superficie" del líquido un poco más clara */}
            <rect x="14" y={liquidY} width={W - 28} height={4} fill={LIQUID[tone]} />
          </g>
          {/* Líneas de marca (25/50/75%) */}
          {[0.25, 0.5, 0.75].map((m) => (
            <line key={m} x1="14" x2={W - 14} y1={top + innerH * (1 - m)} y2={top + innerH * (1 - m)} className="stroke-border-subtle" strokeWidth="1" strokeDasharray="3 3" />
          ))}
          {/* Base */}
          <rect x="22" y={top + innerH} width={W - 44} height="8" rx="3" className="fill-border" />
        </svg>
        <div className="text-center">
          <p className={`font-display text-2xl font-bold tracking-tight ${TEXT_TONE[tone]}`}>{pct(silo.fillPercent)}</p>
          <p className="text-sm text-foreground-muted">
            {litros(silo.currentLiters)} / {silo.capacityLiters > 0 ? `${litros(silo.capacityLiters)} L` : 'sin capacidad'}
          </p>
          {tone === 'low' && (
            <p className="mt-1 flex items-center justify-center gap-1 text-xs font-medium text-danger">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" /> Casi sin leche
            </p>
          )}
          {tone === 'over' && (
            <p className="mt-1 flex items-center justify-center gap-1 text-xs font-medium text-amber-600">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" /> Supera la capacidad
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Velocímetro semicircular (gauge) del total de la planta. ---
// Dibujado con polilíneas (sin arcos SVG) para que el render sea siempre correcto.
function Gauge({ percent, label }: { percent: number; label: string }) {
  const cx = 130;
  const cy = 130;
  const r = 104;
  const clamped = Math.max(0, Math.min(100, percent));
  // Punto sobre el semicírculo superior para una fracción 0–1 (0 = izquierda, 1 = derecha).
  const point = (frac: number) => {
    const a = Math.PI * (1 - frac);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const;
  };
  const poly = (from: number, to: number, steps = 64) => {
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const f = from + (to - from) * (i / steps);
      const [x, y] = point(f);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  };
  const [nx, ny] = point(clamped / 100);
  const color = clamped < LOW_THRESHOLD ? '#ef4444' : '#059669';

  return (
    <svg width="260" height="160" viewBox="0 0 260 150" role="img" aria-label={`Capacidad total de la planta, ${pct(percent)}`}>
      {/* Arco de fondo */}
      <polyline points={poly(0, 1)} fill="none" className="stroke-surface-subtle" strokeWidth="18" strokeLinecap="round" />
      {/* Arco de valor */}
      <polyline points={poly(0, clamped / 100)} fill="none" stroke={color} strokeWidth="18" strokeLinecap="round" />
      {/* Aguja */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="7" fill={color} />
      {/* Texto */}
      <text x={cx} y={cy - 28} textAnchor="middle" className="fill-foreground" style={{ fontSize: 30, fontWeight: 700 }}>{pct(percent)}</text>
      <text x={cx} y={cy - 6} textAnchor="middle" className="fill-foreground-muted" style={{ fontSize: 13 }}>{label}</text>
    </svg>
  );
}

export default function SilosPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['silos'], queryFn: () => inventoryApi.silos() });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Silos de leche"
        description="Nivel de cada silo y de toda la planta. Sube con la recepción y baja con la elaboración — siempre automático."
      />

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-surface-subtle" />
      ) : isError || !data ? (
        <Card><CardContent className="py-6 text-center text-sm text-danger">No se pudo cargar el nivel de los silos.</CardContent></Card>
      ) : data.silos.length === 0 ? (
        <EmptyState
          icon={Droplets}
          title="Todavía no hay silos"
          description="Creá un silo de leche (con su capacidad en litros) en Datos maestros → Cámaras, y asigná la leche al recibirla."
          action={<Button asChild><Link href="/admin/camaras">Crear un silo</Link></Button>}
        />
      ) : (
        <>
          {/* Velocímetro del total de la planta. */}
          <Card>
            <CardContent className="flex flex-col items-center gap-2 pt-6 sm:flex-row sm:justify-center sm:gap-8">
              <Gauge percent={data.totalFillPercent} label="capacidad de la planta" />
              <div className="text-center sm:text-left">
                <p className="text-xs uppercase tracking-wide text-foreground-muted">Total en silos</p>
                <p className="font-display text-3xl font-bold tracking-tight text-foreground">{litros(data.totalCurrent)} L</p>
                <p className="text-sm text-foreground-muted">
                  de {data.totalCapacity > 0 ? `${litros(data.totalCapacity)} L` : 'capacidad sin definir'} · {data.silos.length} {data.silos.length === 1 ? 'silo' : 'silos'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Tanque por silo. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.silos.map((s) => <Tank key={s.id} silo={s} />)}
          </div>
        </>
      )}
    </div>
  );
}
