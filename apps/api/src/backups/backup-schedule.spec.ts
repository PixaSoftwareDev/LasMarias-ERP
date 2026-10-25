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

const config = (over: Partial<BackupConfig> = {}): BackupConfig => ({
  ...DEFAULT_BACKUP_CONFIG,
  ...over,
});

describe('calendario de copias (backup-schedule)', () => {
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
        'Las copias de seguridad automáticas están apagadas.',
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
    const auto = (n: number) => ({ n, trigger: 'auto' as const, fileAvailable: true });
    const manual = (n: number) => ({ n, trigger: 'manual' as const, fileAvailable: true });

    it('con 32 automáticas y máximo 30, rota las 2 más viejas', () => {
      const runs = Array.from({ length: 32 }, (_, i) => auto(i)); // 0 = la más nueva
      const prune = runsToPrune(runs, 30);
      expect(prune.map((r) => r.n)).toEqual([30, 31]);
    });

    it('las manuales no se rotan nunca', () => {
      const runs = [manual(0), ...Array.from({ length: 31 }, (_, i) => auto(i + 1))];
      const prune = runsToPrune(runs, 30);
      expect(prune.every((r) => r.trigger === 'auto')).toBe(true);
      expect(prune).toHaveLength(1);
    });

    it('con menos del máximo no borra nada', () => {
      expect(runsToPrune([auto(0), auto(1)], 30)).toEqual([]);
    });
  });
});
