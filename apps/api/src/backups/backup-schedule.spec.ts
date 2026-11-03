import {
  DEFAULT_BACKUP_CONFIG,
  computeWarnings,
  isDue,
  isoWeekday,
  localDateKey,
  previousScheduledDate,
  runsToPrune,
} from './backup-schedule';
import type { BackupConfig } from '@lasmarias/shared-schemas';

// Fechas de referencia (verificables a mano con un calendario):
// jueves 22/10/2026, viernes 23/10/2026, sábado 24/10/2026, domingo 25/10/2026.
const vie23 = (h: number, m = 0) => new Date(2026, 9, 23, h, m);

// Config PRENDIDA para los tests del calendario (el default real arranca apagado:
// nada corre hasta que se activa con el botón de la pantalla — pedido del dueño).
const config = (over: Partial<BackupConfig> = {}): BackupConfig => ({
  ...DEFAULT_BACKUP_CONFIG,
  enabled: true,
  ...over,
});

describe('calendario de copias (backup-schedule)', () => {
  it('de fábrica está APAGADO: no corre nada hasta que se activa con el botón', () => {
    expect(DEFAULT_BACKUP_CONFIG.enabled).toBe(false);
    expect(isDue(DEFAULT_BACKUP_CONFIG, null, vie23(23, 59))).toBe(false);
  });

  it('isoWeekday: lunes=1 … domingo=7', () => {
    expect(isoWeekday(new Date(2026, 9, 19))).toBe(1); // lunes 19/10/2026
    expect(isoWeekday(new Date(2026, 9, 23))).toBe(5); // viernes
    expect(isoWeekday(new Date(2026, 9, 25))).toBe(7); // domingo
  });

  describe('isDue — ¿corresponde correr ahora?', () => {
    it('corre a la hora exacta configurada si hoy no corrió', () => {
      expect(isDue(config({ hour: '03:00' }), null, vie23(3, 0))).toBe(true);
    });

    it('no corre antes de la hora', () => {
      expect(isDue(config({ hour: '03:00' }), null, vie23(2, 59))).toBe(false);
    });

    it('ponerse al día: servidor prendido a las 9 y la copia era a las 3 → corre igual', () => {
      // último intento automático: ayer
      expect(isDue(config({ hour: '03:00' }), '2026-10-22', vie23(9, 15))).toBe(true);
    });

    it('si hoy ya hubo un intento (ok o error), no repite', () => {
      expect(isDue(config({ hour: '03:00' }), '2026-10-23', vie23(9, 15))).toBe(false);
    });

    it('apagado → nunca corre', () => {
      expect(isDue(config({ enabled: false }), null, vie23(3, 0))).toBe(false);
    });

    it('día no elegido → no corre (viernes fuera de la lista)', () => {
      expect(isDue(config({ days: [1, 3] }), null, vie23(3, 0))).toBe(false);
    });
  });

  describe('previousScheduledDate — qué copia debería existir de antes', () => {
    it('todos los días → ayer (jueves 22/10)', () => {
      expect(localDateKey(previousScheduledDate(config(), vie23(10))!)).toBe('2026-10-22');
    });

    it('solo lunes → el lunes pasado (19/10)', () => {
      expect(localDateKey(previousScheduledDate(config({ days: [1] }), vie23(10))!)).toBe('2026-10-19');
    });
  });

  describe('computeWarnings — avisos para el Inicio', () => {
    const okAyer = { startedAt: new Date(2026, 9, 22, 3, 0), status: 'ok' as const };
    const okHoy = { startedAt: new Date(2026, 9, 23, 3, 0), status: 'ok' as const };

    it('todo en orden → sin avisos', () => {
      expect(computeWarnings(config(), [okHoy, okAyer], vie23(10))).toEqual([]);
    });

    it('la de ayer no se hizo (servidor apagado) → un aviso con la fecha', () => {
      const w = computeWarnings(config(), [okHoy, { startedAt: new Date(2026, 9, 21, 3, 0), status: 'ok' }], vie23(10));
      expect(w).toHaveLength(1);
      expect(w[0]).toContain('22/10');
      expect(w[0]).toContain('no se hizo');
    });

    it('la última falló → aviso de falla', () => {
      const w = computeWarnings(config(), [{ startedAt: new Date(2026, 9, 23, 3, 0), status: 'error' }, okAyer], vie23(10));
      expect(w.some((x) => x.includes('falló'))).toBe(true);
    });

    it('automático apagado → solo el aviso de apagado', () => {
      expect(computeWarnings(config({ enabled: false }), [okHoy], vie23(10))).toEqual([
        'Las copias de seguridad están apagadas. Activalas en Copias de seguridad desde la PC donde quieras guardarlas.',
      ]);
    });

    it('recién instalado (sin corridas) → sin avisos: la primera corre sola', () => {
      expect(computeWarnings(config(), [], vie23(10))).toEqual([]);
    });

    it('primer día de uso: no avisa por el día anterior a la instalación', () => {
      // Única copia de la historia: hoy. "Ayer" el sistema no existía → sin avisos.
      expect(computeWarnings(config(), [okHoy], vie23(10))).toEqual([]);
    });
  });

  describe('runsToPrune — rotación de archivos', () => {
    // "Ahora" fijo para los tests: viernes 23/10/2026 10:00.
    const ahora = new Date(2026, 9, 23, 10, 0);
    const hace = (dias: number) => new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);
    const auto = (n: number, dias = 0) => ({ n, trigger: 'auto' as const, fileAvailable: true, startedAt: hace(dias) });
    const manual = (n: number, dias = 0) => ({ n, trigger: 'manual' as const, fileAvailable: true, startedAt: hace(dias) });

    it('con 9 automáticas y máximo 7, rota las 2 más viejas', () => {
      const runs = Array.from({ length: 9 }, (_, i) => auto(i)); // 0 = la más nueva
      const prune = runsToPrune(runs, ahora, 7);
      expect(prune.map((r) => r.n)).toEqual([7, 8]);
    });

    it('las manuales no cuentan para el máximo de automáticas', () => {
      const runs = [manual(0), ...Array.from({ length: 8 }, (_, i) => auto(i + 1))];
      const prune = runsToPrune(runs, ahora, 7);
      expect(prune.every((r) => r.trigger === 'auto')).toBe(true);
      expect(prune).toHaveLength(1);
    });

    it('con menos del máximo no borra nada', () => {
      expect(runsToPrune([auto(0), auto(1)], ahora, 7)).toEqual([]);
    });

    it('borra el archivo de una manual vieja (más de 7 días en el servidor)', () => {
      const prune = runsToPrune([auto(0), manual(1, 8)], ahora, 7);
      expect(prune.map((r) => r.n)).toEqual([1]);
    });

    it('no borra una manual de hace 6 días', () => {
      expect(runsToPrune([auto(0), manual(1, 6)], ahora, 7)).toEqual([]);
    });

    it('no repite una automática que además está vencida', () => {
      const runs = [...Array.from({ length: 7 }, (_, i) => auto(i)), auto(7, 9)];
      const prune = runsToPrune(runs, ahora, 7);
      expect(prune.map((r) => r.n)).toEqual([7]);
    });
  });
});
