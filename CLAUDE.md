# Sistema de Gestión Láctea — Lácteos Las Marías

> **Para Claude (Code):** Este documento es la especificación maestra del proyecto. Usalo como fuente de verdad para arquitectura, alcance, stack, y especialmente para el criterio de UX/UI. Si una decisión técnica no está acá, priorizá la simplicidad para el usuario final por encima de la elegancia técnica.

---

## 0. Contexto y filosofía del proyecto

Lácteos Las Marías es una planta láctea en Pergamino (Buenos Aires, Argentina). Hoy trabajan con planillas de Excel. Los usuarios del sistema no son perfiles técnicos: son operarios de planta con las manos ocupadas y a veces mojadas, repartidores en la ruta usando el celular, vendedores tomando pedidos por teléfono y administrativos.

**Esto define todo:**

- La interfaz tiene que ser **comprensible sin entrenamiento técnico**. Si un operario nuevo no entiende una pantalla en 30 segundos, la pantalla está mal.
- **Nada de jerga de software.** No decimos "registro", decimos "recepción de leche". No "entidad", sino "cliente". No "ítem", sino "queso cremoso".
- **Optimizar para el celular** donde haya uso de planta o ruta. Optimizar para el desktop donde sea administrativo.
- **El error de un usuario nunca debe romper nada.** Confirmaciones claras, deshacer cuando se pueda, validaciones antes de guardar.

---

## 1. Resumen del producto

Plataforma integral para el ciclo completo de la lechería: desde que la leche entra a la planta hasta que el producto se entrega al cliente. Cubre producción, inventario, ventas, compras, RRHH con asistencia biométrica y reportes.

### Lo que diferencia este sistema de un ERP genérico

- **Modelo de datos específico de lácteos:** lotes, recetas con rendimiento variable según calidad de leche, subproductos (ricota, suero), maduración como inventario en proceso, cadena de frío y trazabilidad bidireccional.
- **Costeo con subproductos:** el queso no carga todo el costo de la leche porque parte del valor está en el suero y la ricota que se obtienen del mismo proceso.
- **Trazabilidad bidireccional:** de la leche al cliente, y del cliente a la leche.
- **Calendario de reparto integrado al pedido:** al tomar un pedido, el sistema asigna automáticamente la próxima fecha de reparto válida según la zona del cliente.

---

## 2. Stack tecnológico (fijado)

### Backend
- **Node.js 22 LTS** + **TypeScript** estricto.
- **NestJS** como framework (módulos, DI, testabilidad).
- **TypeORM** con migraciones versionadas en código.
- **PostgreSQL 16** como base transaccional principal (uso de JSONB para campos flexibles, particiones para tablas grandes como recepciones y movimientos).
- **Redis 7** para cache, sesiones y broker de cola.
- **BullMQ** para tareas asincrónicas (PDFs, reportes pesados, notificaciones, sincronización offline).
- **Zod** para validación de schemas en runtime, compartido entre backend, frontend y formularios.
- **Jest + Supertest** para tests.

### Frontend Web
- **React 18** + **Next.js 14** (App Router).
- **TailwindCSS** + **shadcn/ui** + **Radix** para componentes accesibles.
- **TanStack Query** para estado del servidor.
- **React Hook Form + Zod** para formularios.
- **Recharts** para gráficos de dashboards.

### Frontend Mobile
- **React Native** con soporte offline (SQLite local + cola de sincronización).
- Lectura de QR con cámara nativa.

### Infraestructura
- **Docker** para todo (dev y prod).
- **Nginx** como reverse proxy + Let's Encrypt para HTTPS.
- **GitHub Actions** para CI/CD (tests automáticos en cada PR, deploy automático a staging, manual a prod).
- **Sentry** para errores en runtime, **Grafana** para métricas.
- **pgBackRest** para backups de PostgreSQL (snapshot diario + WAL continuo).
- Almacenamiento de archivos en S3 o equivalente (PDFs, fotos, exportaciones, backups).

### Microservicio biométrico
- Lectores **ZKTeco** conectados a un microservicio que publica eventos a la cola.
- Capaz de desplegarse en Raspberry Pi local en planta para sobrevivir a cortes de internet.

---

## 3. Arquitectura

Cuatro capas:

1. **Clientes:** web (administración, comercial, reportes), móvil (operarios y reparto), dispositivos biométricos.
2. **Aplicación:** API REST para CRUD estándar + GraphQL para reportes y dashboards complejos. Workers BullMQ para tareas pesadas. Módulos de dominio con lógica de negocio separada de la capa HTTP.
3. **Datos:** PostgreSQL como base de verdad, Redis para cache y cola, S3 para archivos.
4. **Infraestructura:** Cloud (preferentemente AWS o equivalente), monitoreo, backups automáticos.

### Reglas de arquitectura

- **Dominio separado del transporte.** La lógica de costeo, trazabilidad y producción no debe vivir en controllers; vive en servicios de dominio testeables sin levantar HTTP.
- **Inmutabilidad en órdenes cerradas.** Una orden de producción cerrada no se edita: se hace una corrección con tracking de auditoría (autor, fecha, motivo).
- **Auditoría obligatoria en entidades sensibles:** producción, ventas, recepciones, liquidaciones a productores, pagos. Toda creación/modificación/borrado queda registrada con usuario y timestamp.
- **Idempotencia en endpoints de escritura desde móvil**, porque la sincronización offline puede reenviar.

---

## 4. Módulos (alcance funcional)

### 4.1 Recepción de leche
Carga de cada ingreso de leche cruda con productor, vehículo, conductor, litros, temperatura, análisis de calidad (grasa, proteína, RCS, UFC, prueba de alcohol, pH, antibióticos), generación automática de código de lote, bloqueo automático si la calidad excede límites, liquidación al productor según litros/calidad/precio acordado, reportes de volumen y calidad por productor.

### 4.2 Recetas y configuración de productos
Receta formal por producto con rendimiento base, sensibilidad a la calidad de la leche, lista de insumos (por litro de leche, por kg de producto principal o fijos por orden), subproductos esperados con destino (otro producto, venta a chanchería, descarte) y merma estándar. Versionado de recetas (al cerrar una orden, queda congelada la versión vigente). Simulador para probar rendimiento y costo sin abrir orden real. Copiar receta para variantes.

### 4.3 Producción (núcleo del sistema)
Apertura de orden con elección de producto (dispara receta), operario, hora de inicio y lotes de leche a consumir. Pre-cálculo automático de insumos requeridos y salidas esperadas ajustadas a calidad real. Carga de salidas reales con comparación contra esperado y alerta si excede umbral. Mano de obra imputada automáticamente desde las marcaciones biométricas del período. Cada producto resultante recibe un lote vinculado al lote de leche origen. Cierre inmutable; modificaciones requieren rol Gerente y quedan auditadas.

### 4.4 Inventario y trazabilidad
Inventario por lote con fecha de elaboración, vencimiento y cantidad. Asignación a cámara/sector físico. **FEFO** (First Expired First Out) en despacho: el sistema sugiere o fuerza el lote con vencimiento más próximo. Stock de materias primas (fermentos, cuajo, sal, envases, etiquetas, limpieza). Stock mínimo configurable con alertas. Inventario físico desde el celular con reporte de diferencias. **Trazabilidad bidireccional**: de lote a productor y a clientes, y al revés. Generación automática de **QR por lote** imprimible y escaneable desde la app.

### 4.5 Compras y proveedores
Proveedores con datos fiscales y cuenta corriente. Órdenes de compra con workflow de aprobación. Recepción de mercadería contra orden con control de cantidades. Facturas de compra manuales o importadas. Cuentas por pagar con antigüedad. Los productores de leche son un tipo especial de proveedor con liquidación automática.

### 4.6 Ventas y comprobantes
Múltiples listas de precios (mayorista, minorista, distribuidor) con vigencias y descuentos. Comprobantes con detalle, IVA, totales y numeración por punto de venta. Cuentas por cobrar con antigüedad y recordatorios automáticos. Devoluciones con ajuste de stock y nota de crédito.

**4.6.1 Toma de pedidos con calendario de reparto**

Carga del pedido (cliente, items, observaciones, descuentos), fecha de reparto **sugerida automáticamente** según la zona del cliente y editable entre opciones válidas. Validación de horario de corte: si el pedido se carga después del cutoff, avanza al siguiente reparto. Validación de crédito y stock proyectado. Reserva de stock contra la fecha de reparto. Estados: tomado, confirmado, preparado, cargado, en reparto, entregado, cancelado. Pedidos recurrentes por plantilla. Modificación editable hasta estado preparado. Vista por fecha de reparto para el sector despacho. Notificación al cliente (email, WhatsApp o ambos). Reportes de cumplimiento.

### 4.7 Costos y finanzas
Costo estándar y costo real por producto a partir de órdenes cerradas. **Costeo con subproductos**: resta el valor de suero/ricota del costo del queso para no inflar el costo del producto principal. Rentabilidad por producto, canal, cliente y período. Variaciones con desglose (materia prima, mano de obra, rendimiento). Flujo de caja proyectado. Conciliación bancaria por import de extracto. Exportación al contador.

### 4.8 RRHH y asistencia biométrica
Empleados con datos personales, sector, turno, costo hora. Marcaciones biométricas con cómputo automático de horas trabajadas, horas extra, ausentismo. Cruce con producción para calcular productividad por sector. Marcación manual con geolocalización como fallback.

### 4.9 Reportes y BI
Dashboard principal con KPIs en tiempo real (leche recibida hoy, queso producido, stock crítico, empleados presentes, alertas activas). Reportes operativos, comerciales y financieros. Exportación a PDF, Excel y CSV. Constructor visual de reportes ad-hoc sin SQL.

### 4.10 Administración
Usuarios y roles (Administrador, Gerente, Operario, Vendedor, Repartidor, Contable, etc.). Configuración general (límites de calidad, formatos de lote, reglas de costeo, turnos). Vista de backups con prueba de restauración. Configuración de notificaciones.

**4.10.1 Configuración del calendario de reparto**

Días de reparto por zona, horario de corte, excepciones de calendario (feriados, suspensiones, refuerzos), asignación de clientes a zona, reagendamiento automático con notificación cuando se marca una excepción, vista calendario mensual por zona.

### 4.11 Notificaciones y alertas
Sistema transversal de alertas: stock bajo, vencimientos próximos, desvíos de rendimiento, morosos, calidad fuera de límite, pedidos sin preparar. Canales: in-app, email, WhatsApp. Configuración por rol y por usuario.

---

## 5. UX / UI — Principios y guías de diseño

> **Esta sección no es decorativa. Es tan obligatoria como el stack técnico.** El éxito del proyecto depende de que un operario con las manos ocupadas, un repartidor en la ruta y una vendedora atendiendo el teléfono puedan usar el sistema sin trabarse.

### 5.1 Principios rectores

1. **Simple antes que completo.** Mejor una pantalla con tres acciones claras que con doce opciones poco usadas. Las acciones secundarias van en un menú "Más" o detrás de un click extra.
2. **Una acción primaria por pantalla.** En cada vista hay un solo botón visualmente dominante (el que el 80% de la gente va a apretar). Los demás son secundarios.
3. **Lo importante, grande. Lo accesorio, chico.** Jerarquía visual real: tamaños de fuente que se distinguen de lejos, no tres variantes de gris que se confunden.
4. **El sistema avisa antes de que el usuario se equivoque.** Validación en vivo, mensajes específicos ("el stock proyectado para el 14/5 es de 3 unidades, el pedido es de 8") y nunca después de hacer click en guardar.
5. **Cero jerga técnica.** Nada de "submit", "request", "entity", "registro", "instancia". Todo en español, en términos del negocio: "guardar pedido", "ver recepción del 12 de mayo", "este queso vence el viernes".
6. **Feedback inmediato.** Cada acción tiene una respuesta visible en menos de 100ms (loading state, animación sutil, confirmación). El usuario nunca queda sin saber si su click hizo algo.
7. **Errores que ayudan, no que culpan.** En lugar de "Error 422: validation failed", decir "Falta cargar la cantidad de litros".
8. **Modo móvil con manos ocupadas.** Botones grandes (mínimo 44x44px de área táctil), formularios con teclado numérico cuando corresponde, posibilidad de escanear QR en vez de tipear, autocompletado agresivo.

### 5.2 Sistema visual

**Paleta de colores**

- **Base neutra clara** como fondo principal. Blanco roto (`#FAFAF9`) o gris muy claro (`#F5F5F4`). Nada de fondos saturados.
- **Color primario** para acciones principales y elementos de marca. Sugerencia: un verde profesional (`#16A34A` o similar), por la asociación con lácteo/campo, pero el equipo de Las Marías puede definirlo.
- **Color de acento** sobrio para destacar puntos clave (un azul slate o un naranja terroso).
- **Colores semánticos consistentes en todo el sistema**:
  - Verde (`#16A34A`) = OK, confirmado, en stock.
  - Amarillo (`#EAB308`) = atención, próximo a vencer, stock bajo.
  - Rojo (`#DC2626`) = error, vencido, fuera de límite, urgente.
  - Azul (`#2563EB`) = informativo, en proceso.
- **Texto principal** en gris muy oscuro (`#0C0A09`), nunca negro puro. Texto secundario en gris medio (`#57534E`).
- **Contraste WCAG AA mínimo** en todos los textos.

**Tipografía**

- Fuente sans-serif moderna y muy legible. **Inter**, **Geist**, o el system font stack. Nada de fuentes decorativas.
- Escala tipográfica clara y limitada:
  - `text-3xl` (30px) para títulos de página.
  - `text-xl` (20px) para secciones.
  - `text-base` (16px) para texto general.
  - `text-sm` (14px) para metadatos.
- **No usar más de 3 tamaños en una misma pantalla.**
- Peso 400 para texto, 500-600 para énfasis, 700 sólo para números importantes (KPIs).

**Espaciado**

- Sistema de espaciado basado en múltiplos de 4px (escala de Tailwind por defecto).
- **Respiro generoso** entre elementos. Mejor pecar de mucho espacio que de poco.
- Padding mínimo de cards: 16px en mobile, 24px en desktop.

**Bordes y sombras**

- Border radius consistente: 8px para inputs y cards, 6px para botones, 12px para modales.
- Sombras sutiles, no dramáticas. `shadow-sm` para cards en reposo, `shadow-md` para elementos elevados (modales, dropdowns).
- Bordes finos (`border-stone-200`) en lugar de sombras cuando alcance.

**Iconografía**

- **Lucide Icons** (viene con shadcn/ui). Stroke fino y consistente.
- Cada icono tiene un significado fijo en todo el sistema: el icono de "lote" siempre es el mismo, el de "alerta" también.
- Tamaño estándar: 16px inline, 20px en botones, 24px en navegación principal.

### 5.3 Componentes clave

**Navegación**

- En desktop, **sidebar fija** con los 11 módulos, agrupados con separadores. Iconos grandes y labels visibles (no esconder texto detrás de tooltips). Usuario actual y logout abajo.
- En mobile, **bottom navigation** con los 4-5 módulos más usados según rol (el operario ve Producción, Inventario, Recepción, Asistencia; el repartidor ve Hoja de ruta, Pedidos, Stock, Mi cuenta).
- **Migas de pan (breadcrumbs)** en pantallas internas para que el usuario sepa siempre dónde está.

**Dashboard**

- KPIs en cards grandes con número dominante, label corto debajo y micro-trend a la derecha (flecha + %).
- Máximo 6 KPIs por dashboard. Si hay más, se segmentan en pestañas.
- Cada KPI es clickeable y lleva al reporte detallado.
- Lista de alertas activas siempre visible en la parte superior, agrupadas por criticidad.

**Tablas y listas**

- **Listas sobre tablas** en mobile. Cada fila es una card con la info clave (3-4 datos máximo) y un chevron para ver detalle.
- En desktop, tablas con columnas claras, ordenamiento por click en header, filtros encima.
- **Paginación o scroll infinito**, nunca cargar 5000 filas de una.
- Búsqueda siempre disponible, con debounce y resultados en vivo.
- Estado vacío (cuando no hay resultados) con un mensaje claro y un CTA si corresponde ("No hay recepciones esta semana. Cargar una nueva").

**Formularios**

- Una columna en mobile, máximo dos en desktop.
- Labels arriba del campo, no flotantes.
- Inputs grandes (altura mínima 44px) con buen padding interno.
- **Validación en blur** (cuando el usuario sale del campo), no después de submit.
- Botón primario abajo, alineado a la derecha en desktop, full-width en mobile.
- **Sticky save bar** en formularios largos: una barra fija abajo con "Guardar" y "Cancelar" que sigue al scroll.
- Autosave para borradores en formularios largos (apertura de orden de producción, por ejemplo).

**Modales y diálogos**

- Solo para confirmaciones críticas (eliminar, cerrar orden, anular pago).
- Título corto en imperativo ("¿Cerrar esta orden?"), explicación breve debajo, dos botones claros (acción destructiva en rojo, cancelar en gris).
- Nunca abrir un modal dentro de un modal.

**Estados de carga**

- **Skeleton loaders** en cards y listas, no spinners genéricos en el centro de la pantalla.
- En acciones puntuales (botón "Guardar"), el botón se deshabilita y muestra un spinner pequeño + texto "Guardando...".
- **Optimistic UI** donde tenga sentido (marcar pedido como entregado se ve inmediato, después se sincroniza).

**Notificaciones in-app**

- Toast en la esquina inferior derecha (desktop) o arriba (mobile).
- Verde para éxito, rojo para error, amarillo para advertencia.
- Autodismiss en 4 segundos para éxitos, persistente con botón cerrar para errores.

### 5.4 Patrones específicos por contexto

**App de operario en planta (móvil)**

- Pantalla principal: dos o tres botones gigantes ("Nueva recepción", "Abrir orden de producción", "Marcar asistencia").
- Lectura de QR como primer recurso en lugar de tipeo manual.
- Confirmaciones visuales claras (un check verde a pantalla completa por 1 segundo después de guardar).
- Modo offline transparente: si no hay internet, el sistema lo dice arriba ("Sin conexión — se sincronizará después") pero no bloquea el uso.

**App de repartidor (móvil)**

- Pantalla principal: hoja de ruta del día con clientes en orden de visita.
- Cada cliente es una card con nombre, dirección (clickeable para abrir en Google Maps), items a entregar y monto a cobrar.
- Botón grande "Entregado" + opción "No estaba" o "Devolvió".
- Resumen al final del día con totales y cobros pendientes.

**Vendedor tomando pedidos (web o móvil)**

- Buscador de cliente al inicio, autocompletado por nombre o razón social.
- Items con búsqueda rápida y atajos para "lo de siempre" (basado en histórico).
- Fecha de reparto sugerida ya cargada, con opción de cambiar entre las válidas.
- Stock proyectado visible en cada item antes de confirmar.
- Total grande al final, con desglose colapsable.

**Dashboard gerencial (desktop)**

- KPIs arriba, gráficos en grilla debajo.
- Filtros globales en la parte superior (período, sector, producto).
- Posibilidad de exportar cualquier gráfico a PNG/PDF/Excel.

### 5.5 Accesibilidad

- **Soporte de teclado completo** en todas las pantallas (Tab, Enter, Esc).
- Aria labels en iconos sin texto.
- Contraste mínimo AA en todos los componentes.
- Tamaño de fuente base configurable (preferencia del usuario).
- Mensajes de error no dependen sólo del color (siempre tienen icono + texto).

### 5.6 Lo que NO hacer

- ❌ Sidebars con 20 items, todos al mismo nivel visual.
- ❌ Tablas densas de 12 columnas en mobile.
- ❌ Modales encima de modales.
- ❌ Spinners en el centro de la pantalla para esperar 200ms.
- ❌ Texto gris claro sobre fondo gris claro porque "queda lindo".
- ❌ Animaciones gratuitas que retrasan al usuario.
- ❌ Avisos vacíos como "Error" o "Algo salió mal".
- ❌ Toasts que tapan los botones que el usuario quería apretar.
- ❌ Confirmaciones de cosas que no necesitan confirmación.
- ❌ Forzar al usuario a usar el sistema en orden lineal cuando podría saltar pasos.

---

## 6. Seguridad, backups y continuidad

### Seguridad
- Autenticación JWT con refresh tokens, sesiones expirables.
- Passwords con bcrypt (rondas 12+).
- Roles y permisos granulares, principio de menor privilegio.
- Auditoría inmutable de acciones críticas.
- Rate limiting en API.
- HTTPS obligatorio con Let's Encrypt.
- Headers de seguridad: HSTS, CSP, X-Frame-Options.
- Datos sensibles cifrados en reposo (passwords, biometría).
- Verificación OWASP Top 10.
- Dependencias monitoreadas con Dependabot.

### Backups
- Backup completo diario con retención de 30 días.
- WAL continuo para PITR de últimas 24 horas.
- Copia geo-redundante en S3.
- Prueba mensual automática de restore.
- **RTO objetivo: 4 horas. RPO objetivo: 1 hora.**

### Continuidad
- Failover a servidor alternativo si cae el principal.
- App móvil offline para que la planta siga operando sin internet.
- Marcación manual con geolocalización como fallback si fallan los lectores biométricos.

---

## 7. Plan de desarrollo sugerido (fases)

> **Importante:** El alcance total es grande. Recomendado entregar por fases con go-live independiente por módulo para validar con usuarios reales antes de seguir.

### Fase 0 — Cimientos (2-3 semanas)
- Setup del monorepo (backend, frontend web, frontend mobile, shared schemas).
- CI/CD básico con tests automáticos.
- Sistema de autenticación y roles.
- Modelo de datos base: usuarios, clientes, productos, lotes.
- Design system implementado en shadcn/ui con la paleta y tipografía definidas.

### Fase 1 — Operación de planta (4-6 semanas)
- Recepción de leche con análisis de calidad.
- Recetas y configuración de productos.
- Producción con cálculo de costos.
- Inventario y trazabilidad bidireccional con QR.
- App móvil para operarios.

### Fase 2 — Operación comercial (4-6 semanas)
- Calendario de reparto (admin).
- Toma de pedidos.
- Listas de precios y comprobantes.
- Cuentas por cobrar.
- App móvil para repartidores.

### Fase 3 — Operación administrativa (3-4 semanas)
- Compras y proveedores.
- Liquidación a productores.
- Cuentas por pagar.
- Conciliación bancaria.

### Fase 4 — RRHH y reportes (3-4 semanas)
- Asistencia biométrica + integración ZKTeco.
- Cruce de productividad.
- Dashboard principal y reportes operativos/comerciales/financieros.
- Constructor de reportes ad-hoc.

### Fase 5 — Pulido y go-live total (2-3 semanas)
- Migración de datos desde Excels.
- Capacitación in-situ.
- Monitoreo intensivo post go-live.

---

## 8. Convenciones de código

- **TypeScript estricto** en todo. `strict: true` en tsconfig.
- **ESLint + Prettier** con config compartida en monorepo.
- **Naming**: archivos en `kebab-case`, clases en `PascalCase`, funciones y variables en `camelCase`, constantes en `SCREAMING_SNAKE_CASE`.
- **Commits convencionales**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- **Branch por feature** con PR review obligatorio antes de merge a `main`.
- **Tests obligatorios** en lógica de dominio (costeo, trazabilidad, calendario de reparto). Mínimo 80% de cobertura en módulos críticos.
- **Migraciones de DB nunca destructivas** sin un backup confirmado y sin un plan de rollback.
- **Logs estructurados en JSON** con nivel apropiado (no `console.log` en producción).
- **Variables de entorno tipadas y validadas** al arranque del proceso.

---

## 9. Entregables del proyecto

- Código fuente con licencia perpetua y exclusiva para Las Marías.
- Export completo de la base en SQL y CSV en caso de cancelación.
- Documentación técnica editable.
- Manuales en PDF y videos cortos por módulo, accesibles desde el sistema.
- Sesión presencial al go-live de cada módulo + sesión de seguimiento a los 30 días.

---

## 10. Garantía post go-live

- Cobertura sin costo adicional para bugs, correcciones de seguridad y errores de cálculo.
- No incluye nuevas funcionalidades ni cambios de alcance (se cotizan como evolutivos).

---

## 11. Para arrancar (instrucciones a Claude Code)

1. **Leé este documento completo antes de generar código.** Si algo no está claro, preguntá; no inventes.
2. **Confirmá el alcance de la fase actual** antes de empezar a programar. No mezcles fases.
3. **Generá primero el setup del monorepo y el design system** (Fase 0) y validá con el equipo antes de avanzar.
4. **Cada PR debe respetar las guías de UX de la sección 5.** Si una pantalla viola los principios, revisala antes de pedir review.
5. **Cuando dudes entre simple y completo, elegí simple.** Siempre se puede agregar después; sacar es más caro.
6. **Si una pantalla necesita más de un párrafo para explicarse, está mal diseñada.** Refactorizala.

---

*Documento preparado para Lácteos Las Marías — Pergamino, Buenos Aires — Mayo 2026*
