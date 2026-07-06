# Sistema de Gestión para Quesería — Las Marías

> **Para Claude (Code):** Este documento es la especificación maestra y la fuente de verdad del proyecto. Define **cómo trabaja el equipo**, **el alcance del producto (cerrado)** y **el corazón del sistema: la calculadora de costo**. Si una decisión técnica no está acá, priorizá la **exactitud de los cálculos** y la **simplicidad para el usuario final** por encima de cualquier elegancia técnica. Ante la duda entre simple y completo, elegí simple.
>
> **Estado: producto CERRADO con el alcance actual. No hay Fase 2 ni fases futuras planificadas.** Cualquier ampliación es una decisión nueva del dueño, por fuera de este documento.

---

## 1. Cómo trabaja este equipo

Claude actúa como **Tech Lead / Orquestador** de un equipo de desarrollo de un SaaS B2B. No trabaja solo: coordina agentes especializados, les asigna tareas, integra su trabajo y hace cumplir los principios. Trabajamos como una empresa profesional: roles claros, hand-offs explícitos, revisión de código y control de calidad antes de dar algo por terminado.

### El equipo (un agente por rol, se delega según corresponda)

1. **Analista de dominio lácteo (Product Owner)** — traduce el negocio de la quesería a requisitos. Valida que flujos y fórmulas tengan sentido en una quesería real. Tiene la última palabra sobre **QUÉ** se construye.
2. **Arquitecto** — define el modelo de datos relacional y la estructura de pantallas. Vela por la simplicidad y **veta la sobre-ingeniería**.
3. **Desarrollador Backend** — API, lógica de negocio, base de datos y, sobre todo, la **calculadora de costo**.
4. **Desarrollador Frontend** — pantallas simples, formularios cortos, UX obvia para un operario.
5. **QA / Testing** — arma y corre los casos de prueba. Es **dueño de la exactitud de la calculadora**: ningún cálculo pasa sin tests verificables a mano.
6. **Revisor de código** — code review de cada entrega. Rechaza complejidad innecesaria y código que no se entienda.

### Regla de colaboración (definición de "hecho")

Nada se da por **hecho** hasta que pasó por: **Backend o Frontend → QA → Revisor → integración por el Tech Lead.**

### Flujo de trabajo (mantenimiento del producto cerrado)

El producto está cerrado. Para cualquier cambio o corrección:

1. El equipo revisa lo existente y evalúa el impacto, **sobre todo en la calculadora de costo** (nada la rompe).
2. Entregan el **diseño** (pantallas + datos afectados) y los **casos de prueba**.
3. **El Tech Lead frena, entrega el plan y espera aprobación del dueño antes de escribir código.**

---

## 2. Contexto del negocio

Sistema de gestión para una **quesería** (Argentina, todo en español). Hoy se maneja en un Excel con este flujo:

> **Ingreso de leche → Elaboración (leche → masa) → Stock (masa, mozzarella, envases) → Despacho y facturación.**

La app **reemplaza ese Excel**. El usuario final es un **operario de planta** y un **administrativo**, no un experto en sistemas. Una pantalla por hoja del Excel.

---

## 3. Principios rectores (no negociables)

1. **Simplicidad ante todo.** Una pantalla por hoja del Excel. Si algo no sale de una columna del Excel, queda fuera del alcance.
2. **La calculadora de costo es el corazón** y tiene que funcionar impecable: **cero errores, resultados verificables a mano.**
3. **Cero sobre-ingeniería.** Si lo simple resuelve el 90%, se usa lo simple.
4. **El stock nunca se carga a mano:** sube con producción, baja con despacho.

---

## 4. Alcance del producto (cerrado)

> El producto está **cerrado con el alcance actual**. **No hay Fase 2 ni fases futuras planificadas.** Cualquier ampliación es una decisión nueva del dueño, por fuera de este documento, y nunca debe romper la calculadora de costo.

El sistema cubre el **ciclo completo** de la quesería: leche → producción con costo → stock → despacho → cobranza → finanzas. Pantallas y módulos que tiene:

- **Recepción de leche:** fecha, tambo, transporte, remito, litros declarados/recibidos (diferencia automática), T°, acidez, pH, observaciones; asignación a silo.
- **Silos de leche:** nivel de cada silo y de toda la planta; sube con la recepción, baja con la elaboración (automático).
- **Producción / Elaboración:** órdenes con la **calculadora de costo** (ver sección 5); costeo encadenado `leche → masa → producto`, real vs estándar.
- **Recetas:** versionadas por producto (los lotes viejos conservan su versión), insumos con costo + subproductos, y **simulador** de costo sin abrir una orden real.
- **Stock / Inventario:** vista única por categoría (materia prima, intermedios, productos, subproductos, insumos, envases) con stock mínimo y alertas. **Solo lectura:** sube con producción, baja con despacho.
- **Trazabilidad:** recorrido bidireccional de un lote (de la leche al cliente y del cliente a la leche, pasando por masa y producto).
- **Ventas / Despacho:** cliente + líneas (producto, kg, precio) → importe automático; baja de stock por **FEFO**; remito imprimible; devoluciones con nota de crédito.
- **Finanzas:** cobranzas (cuenta corriente con saldo + antigüedad), pagos (tambos + proveedores de insumos), caja y bancos, cheques, conciliación bancaria, flujo de caja + gastos, rentabilidad por cliente.
- **Reportes:** producción, ventas y rendimiento por período. **Sin BI.**
- **Datos maestros:** productos, clientes, tambos, proveedores, cámaras, listas de precio, cotización del dólar/euro y datos de la empresa.
- **Inicio:** panel accionable (accesos rápidos + KPIs + "para resolver") con calendario.

---

## 5. Calculadora de costo (FOCO — especificar, construir y testear con rigor)

Es el corazón del sistema. Se especifica, se construye y se testea con rigor. Vive en la pantalla de **Elaboración**.

### 5.1 Modelo de datos

- **Producto:** nombre, unidad.
- **Receta (versionada por producto):** rendimiento esperado (kg/litro), lista de insumos y lista de subproductos esperados. **Al cambiar la receta, los lotes viejos conservan su versión.**
- **Insumo de receta:** nombre, costo unitario, y **base de consumo**: `por litro de leche` | `por kg de producto` | `fijo por orden`. Ej: leche ($/litro), fermento, cuajo, sal, mano de obra, energía, envase.
- **Subproducto esperado:** nombre, rendimiento esperado y **valor de recupero** ($/kg) — suero, ricota, crema.
- **LoteElaboracion:** receta usada (versión), litros elaborados, kg de producto real, kg de cada subproducto real, fecha.

### 5.2 Fórmulas (todas verificables a mano)

```
rendimiento_real   = kg_producto / litros_elaborados
costo_insumos      = Σ (cantidad_consumida_i × costo_unitario_i)
    donde cantidad_consumida depende de la base:
      "por litro" → base × litros
      "por kg"    → base × kg_producto
      "fijo"      → base
valor_subproductos = Σ (kg_subproducto_j × valor_recupero_j)
costo_neto_producto = costo_insumos − valor_subproductos
costo_por_kg        = costo_neto_producto / kg_producto
costo_estandar      = el mismo cálculo con los valores ESPERADOS de la receta
desvio_costo        = costo_real − costo_estandar          (mostrar $ y %)
desvio_rendimiento  = rendimiento_real − rendimiento_esperado
```

### 5.3 Requisitos técnicos

- **Tipo `decimal`** para dinero y cantidades (NUNCA float binario).
- **Ningún valor hardcodeado:** todo sale de la receta + datos del lote.
- **Manejar bordes:** `kg_producto = 0` o `litros = 0` no debe romper (mostrar aviso, no dividir por cero).
- **La pantalla muestra:** costo total del lote, costo neto, costo por kg, valor recuperado de subproductos, y **real vs estándar con el desvío resaltado**.

### 5.4 Casos de prueba que QA debe incluir (mínimo)

1. **Lote normal:** validar a mano cada línea contra un cálculo en papel.
2. **Lote sin subproductos:** `costo_neto = costo_insumos`.
3. **`kg_producto = 0`:** no rompe, avisa.
4. **Cambio de versión de receta:** un lote viejo mantiene sus costos.
5. **Insumo "fijo por orden":** no escala con litros ni con kg.

### 5.5 Decisiones de diseño tomadas (validadas con el dueño, 30/05/2026)

- **Elaboración en DOS pasos. La masa es stock intermedio.** Flujo: `leche → masa` (la masa se guarda en cámara con su propio costo/kg) `→ mozzarella/queso` (consume masa). Implica:
  - Una **categoría de producto `intermedio`** (la masa) además de queso/subproducto/materia_prima/envase/insumo.
  - El costo se calcula **encadenado**: la 1ª orden produce masa con un `costo_por_kg`; la 2ª orden **consume la masa como input** y **hereda ese costo/kg** (no recalcula desde leche).
  - Generalización: una orden de producción consume **inputs** (lotes con costo unitario: litros de leche × $/litro, o kg de masa × $/kg) + insumos de receta, y produce un producto + subproductos. El mismo `lote.unitCost` sirve para leche y para masa.
- **Mano de obra y energía = insumos de receta**, con base configurable (`fijo por orden` o `por kg`). No hay sub-sistema de costos laborales ni biometría: son dos ítems más de la lista de insumos.
- **Subproductos:** se aprueba el mecanismo (descuento por `valor_recupero × kg_real`, sin piso en 0). Los **valores concretos se cargan más adelante**; mientras tanto pueden ir en 0 sin romper nada.
- **Dinero/cantidades con DECIMAL exacto** (librería liviana tipo `big.js`/`decimal.js` en el núcleo). `0.10 + 0.20` debe dar `0.30` exacto. Prohibido float binario.
- **El costo neto puede ser negativo** (si el subproducto vale más que los insumos): se muestra con aviso, **no se clampea a 0**.
- **Modelo: no se crean tablas nuevas** salvo la categoría `intermedio`. Se agregan dos campos `unitCost` (insumo de receta en JSONB, y lote en `batches`). El versionado de receta congelado por lote ya existe y se reusa.

---

## 6. Stack y guardarraíles de ingeniería

**Stack liviano y estándar. Monolito simple + base relacional.** La prioridad es exactitud de cálculos y UX obvia por encima de toda elegancia técnica.

### Lo que se usa (la arquitectura real construida)

- **Backend:** Node.js 22 + TypeScript estricto, **NestJS**, **TypeORM** con esquema **sincronizado desde las entidades** (`synchronize: true`, sin migraciones versionadas). API **REST** con prefijo `/api` (puerto 4000). Lógica de dominio (costeo, producción) en **servicios testeables sin HTTP**.
- **Base:** **PostgreSQL 16** como única base (Docker, puerto local 55432).
- **Frontend:** **React 18 + Next.js 14** (App Router, dev/prod en puerto 3010, proxy `/api` → backend), **TailwindCSS + shadcn/ui + Radix**, **TanStack Query**, **React Hook Form + Zod**.
- **Validación:** **Zod** compartida entre back y front (`packages/shared-schemas`).
- **Auth:** JWT + refresh, bcrypt, roles.
- **Tests:** **Jest + Supertest**.
- **Monorepo:** pnpm + Turborepo.

### 🚫 Guardarraíles — NADA de esto en esta etapa

Sin **microservicios**, **GraphQL**, **colas** (Redis/BullMQ), **biometría**, **Raspberry Pi**, **React Native / móvil**, **QR**, **Sentry/Grafana/S3/pgBackRest**, **constructor de reportes ad-hoc**. No son parte del producto cerrado; si alguna vez se necesitan, es una decisión nueva del dueño.

---

## 7. Criterios de UX (obligatorios)

> Tan obligatorios como el stack. El sistema lo usa un operario de planta con las manos ocupadas y un administrativo. Si una pantalla no se entiende en 30 segundos, está mal.

### 7.1 Principios

1. **Simple antes que completo.** Una acción primaria por pantalla (un solo botón dominante). Lo secundario, detrás de un click.
2. **Lo importante, grande. Lo accesorio, chico.** Jerarquía visual real.
3. **El sistema avisa antes de que el usuario se equivoque.** Validación en vivo, mensajes específicos, nunca recién después de "Guardar".
4. **Cero jerga técnica.** Todo en español del negocio: "ingreso de leche", "kg de masa", "este lote", no "registro" / "entidad" / "submit".
5. **Feedback inmediato.** Cada acción tiene respuesta visible (loading, confirmación).
6. **Errores que ayudan, no que culpan.** "Falta cargar los litros", no "Error 422".

### 7.2 Componentes y patrones

- **Formularios cortos:** una columna en mobile, máximo dos en desktop; labels arriba; inputs grandes (≥44px); **validación en blur**; botón primario abajo (full-width en mobile); teclado numérico donde corresponde.
- **Tablas/listas:** en mobile, cada fila es una card con 3-4 datos y chevron a detalle; en desktop, tabla con columnas claras; búsqueda con debounce; paginación (nunca 5000 filas); **estado vacío con mensaje claro + CTA**.
- **Estados de carga:** skeletons en listas/cards, no spinners centrados; botón "Guardando…" deshabilitado durante la acción.
- **Modales:** solo para confirmaciones críticas (eliminar, anular). Título imperativo corto, acción destructiva en rojo. Nunca un modal sobre otro.
- **Toasts:** verde éxito (autodismiss 4s), rojo error (persistente con cerrar). Nunca tapando el botón que el usuario iba a apretar.

### 7.3 Sistema visual

- **Tipografía Inter.** Escala limitada: 30px títulos, 20px secciones, 16px texto, 14px metadatos. No más de 3 tamaños por pantalla. Peso 700 solo para números importantes.
- **Paleta:** fondo neutro claro; **primario emerald `#059669`**; acento navy; semánticos consistentes — verde OK/en stock, amarillo atención/por vencer, rojo error/vencido, azul informativo. Texto gris muy oscuro (no negro puro). **Contraste WCAG AA mínimo.**
- **Bordes/sombras:** radios suaves (8px inputs/cards, 6px botones), sombras sutiles (`shadow-sm`), bordes finos.
- **Iconos Lucide**, significado fijo por icono.
- **Accesibilidad:** teclado completo (Tab/Enter/Esc), aria-labels en iconos, errores con icono + texto (no solo color).

### 7.4 Lo que NO hacer

Sidebars de 20 ítems planos · tablas de 12 columnas en mobile · modales sobre modales · spinners para esperar 200ms · texto gris claro sobre fondo gris claro · animaciones que retrasan · avisos vacíos ("Algo salió mal") · confirmaciones innecesarias · forzar orden lineal cuando se puede saltar.

---

## 8. Convenciones de código

- **TypeScript estricto** (`strict: true`).
- **ESLint + Prettier** compartidos en el monorepo.
- **Naming:** archivos `kebab-case`, clases `PascalCase`, funciones/variables `camelCase`, constantes `SCREAMING_SNAKE_CASE`.
- **Commits convencionales:** `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Branch por feature, PR con review antes de `main`.
- **Tests obligatorios en lógica de dominio** (la calculadora de costo, ante todo). Verificables a mano.
- **Dinero y cantidades en `decimal`**, nunca float.
- **Migraciones nunca destructivas** sin backup confirmado y plan de rollback.
- **Variables de entorno tipadas y validadas** al arranque (Zod).
- Logs estructurados, sin `console.log` en producción.

---

## 9. Estado del proyecto — CERRADO (actualizado 03/07/2026)

**El producto está cerrado y entregable.** Cubre el ciclo completo (leche → producción con costo → stock → despacho → cobranza/cuenta corriente → finanzas), más trazabilidad, reportes y un Home con calendario. Todo verificado E2E y validado **responsive** (desktop + móvil).

- **Arquitectura:** solo web (NestJS `apps/api` puerto 4000 + Next.js `apps/web` puerto 3010), PostgreSQL única base (55432), monorepo pnpm + Turbo. Sin colas/Redis. Esquema sincronizado desde las entidades (`synchronize: true`, sin migraciones versionadas).
- **Lo que vive en el código:** auth/usuarios, recepción de leche, silos, recetas versionadas + simulador, producción con la **calculadora de costo** (real vs estándar, decimal exacto, costeo encadenado leche→masa→producto), inventario + FEFO, trazabilidad bidireccional, ventas/despacho (precio a mano, baja stock, remito, notas de crédito), finanzas (cobranzas, pagos a tambos y proveedores unificados, caja y bancos, cheques, conciliación, flujo de caja, rentabilidad), reportes, datos maestros e Inicio.
- **Calidad:** tests de dominio verdes (calculadora de costo + producción + FEFO), typecheck API + web limpios, build de producción OK.

### 9.1 Trabajo posterior a la primera entrega (pulido, sin cambio de alcance)

Desde la v1 (19/06) se hizo solo pulido sobre el producto cerrado, sin agregar módulos:

- **Finanzas simplificada:** resumen más directo y **pagos unificados** (tambos + proveedores) pensados para el administrativo.
- **Marca:** login con panel verde de marca + logo, e **isotipo (hoja + vaca) junto a "Las Marías"** en el sidebar y el header mobile.
- **Home "Para resolver"** ahora suma silos casi vacíos, cheques por vencer y comprobantes vencidos; saludo con la fecha de hoy.
- **Pulido responsive/móvil** en casi todas las pantallas: chips/KPIs que encogen en mobile, controles de formulario (precio + moneda + IVA) que apilan en pantallas chicas, títulos con `break-words`, scroll al tope al abrir/editar un formulario.
- **Tutorial de capacitación en video** (`tutorial/`, ~8:52 min, botón por botón) grabado y **entregado al dueño**. No es parte del software; es material de onboarding.

### 9.2 Puntos abiertos

- **Puesta en producción (no de producto):** limpiar la base demo y cargar datos reales, backups, hosting/modo producción.
- **Decisión del dueño sobre el costeo encadenado (toca el corazón del sistema):** el `default_cost` de la Masa quedó en **NULL** para que la muzzarella herede el **costo real** del lote de masa (leche→masa→queso), como pide §5.5. Falta confirmar si el negocio prefiere eso o un **precio de masa cargado a mano**. Nada se toca de la calculadora sin esa confirmación.

**No hay fases siguientes planificadas.**

---

*Documento maestro — Quesería Las Marías, Argentina. Producto cerrado (v1 junio 2026, pulido al 03/07/2026).*
