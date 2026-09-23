import { createMilkReceptionInputSchema } from '@lasmarias/shared-schemas';

// Pedido del dueño (sep 2026): un remito puede traer leche de 6-7 tamboreros. Se carga una
// sola vez fecha, remito y calidad, y adentro todos los tambos. Antes había un tope de 4.

function input(tambos: number) {
  return {
    receivedAt: '2026-07-01T08:00:00-03:00',
    remito: '0001-00001234',
    producers: Array.from({ length: tambos }, (_, i) => ({
      producerId: `00000000-0000-4000-8000-00000000000${i % 10}`.slice(0, 36),
      liters: 1000 + i,
    })),
    quality: { temperature: 4 },
  };
}

describe('Recepción de leche — cantidad de tambos por descarga', () => {
  it('acepta 7 tambos en una misma descarga (antes el tope era 4)', () => {
    const r = createMilkReceptionInputSchema.safeParse(input(7));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.producers).toHaveLength(7);
  });

  it('no tiene tope: 25 tambos también entran', () => {
    expect(createMilkReceptionInputSchema.safeParse(input(25)).success).toBe(true);
  });

  it('sigue exigiendo al menos un tambo', () => {
    expect(createMilkReceptionInputSchema.safeParse(input(0)).success).toBe(false);
  });
});
