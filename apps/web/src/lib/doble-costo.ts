// ¿Un insumo de la receta es en realidad lo mismo que se elabora? Caso real (oct 2026): para
// pasteurizar crema crearon el insumo "CREMA DE LECHE PARA PASTEURIZAR" porque no podían elegir
// la crema cruda como origen. Ahora la crema entra como origen con su costo; si el insumo sigue
// en la receta, la crema se cobra DOS veces. Se detecta por la primera palabra con significado
// ("CREMA") o por la categoría del insumo (leche, masa, crema o queso no son insumos).

const STOPWORDS = new Set(['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'PARA', 'CON', 'SIN', 'Y', 'X', 'EN', 'A', 'AL']);

// Categorías que se elaboran o se consumen como origen: nunca deberían ir como insumo.
export const CATEGORIAS_DE_ORIGEN = ['materia_prima', 'intermedio', 'subproducto', 'queso'];

function primeraPalabra(nombre: string): string | null {
  const palabras = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return palabras[0] ?? null;
}

export function mismaMateria(a: string, b: string): boolean {
  const pa = primeraPalabra(a);
  return pa != null && pa === primeraPalabra(b);
}

interface ProductoLite {
  id: string;
  name: string;
  category: string;
}

// Insumos de la receta que duplican el costo de lo que se elabora. `origenes` = productos de
// los lotes que consume la orden; si se omite (editor de recetas), se compara contra todos los
// productos de categorías de origen.
export function insumosDuplicados(
  ingredientes: { productId?: string; productName: string }[],
  productos: ProductoLite[],
  origenes?: ProductoLite[],
): { insumo: string; contra?: string }[] {
  const candidatos = origenes ?? productos.filter((p) => CATEGORIAS_DE_ORIGEN.includes(p.category));
  const out: { insumo: string; contra?: string }[] = [];
  for (const ing of ingredientes) {
    const prod = productos.find((p) => p.id === ing.productId);
    const nombre = prod?.name ?? ing.productName;
    if (prod && CATEGORIAS_DE_ORIGEN.includes(prod.category)) {
      out.push({ insumo: nombre });
      continue;
    }
    const igual = candidatos.find((o) => o.id !== prod?.id && mismaMateria(nombre, o.name));
    if (igual) out.push({ insumo: nombre, contra: igual.name });
  }
  return out;
}
