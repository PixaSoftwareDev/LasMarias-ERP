import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Dashboard inicial — KPIs placeholder. En siguientes fases conecta a /reports.
// CLAUDE.md §5.3 — máximo 6 KPIs, número dominante, label corto.
export default function DashboardPage() {
  const kpis = [
    { label: 'Leche recibida hoy', value: '—', unit: 'litros' },
    { label: 'Recepciones del día', value: '—', unit: '' },
    { label: 'Productores activos', value: '—', unit: '' },
    { label: 'Alertas abiertas', value: '—', unit: '' },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Inicio"
        description="Vista general de la planta hoy."
      />

      <section
        aria-label="Indicadores"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-foreground-muted">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {k.value}
                {k.unit && <span className="ml-1 text-base font-normal text-foreground-muted">{k.unit}</span>}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Próximas etapas</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-foreground-muted">
          <p>
            Estamos en Fase 0 + arranque de Recepción de leche. Una vez probado este flujo, seguimos con
            Recetas, Producción e Inventario (Fase 1 completa).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
