import { recipeByproductSchema } from '@lasmarias/shared-schemas';

// Pedido del dueño (28/10/2026): la crema desnatada al hacer masa tiene que entrar al stock
// como CLNP. Eso solo pasa si el subproducto está asociado a un producto del catálogo; un
// destino "otro producto" sin producto elegido no generaba lote ni descontaba nada.
describe('subproducto de receta con destino "otro producto"', () => {
  const base = { name: 'CREMA', expectedYield: 0.02, unit: 'kg' as const, basis: 'per_liter_milk' as const, referenceValuePerUnit: 4165 };

  it('exige elegir a qué producto va', () => {
    const r = recipeByproductSchema.safeParse({ ...base, destination: 'product' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Elegí a qué producto va el subproducto');
  });

  it('acepta el subproducto con su producto', () => {
    const r = recipeByproductSchema.safeParse({ ...base, destination: 'product', destinationProductId: 'b2677c77-ff26-4f22-a320-33b0d5831c1d' });
    expect(r.success).toBe(true);
  });

  it('venta o descarte no necesitan producto', () => {
    expect(recipeByproductSchema.safeParse({ ...base, destination: 'sale' }).success).toBe(true);
    expect(recipeByproductSchema.safeParse({ ...base, destination: 'discard' }).success).toBe(true);
  });
});
