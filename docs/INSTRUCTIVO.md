# Instructivo — Sistema de Gestión Láctea "Las Marías"

Guía rápida de qué hace la app, cómo usarla y cómo dejarla con datos de ejemplo
para demostración o capacitación.

---

## 1. ¿Qué es?

Es la plataforma que reemplaza las planillas de Excel de la planta. Acompaña el
ciclo completo: **desde que entra la leche hasta que el producto llega al cliente.**

Pensada para que la use cualquiera sin entrenamiento técnico: operarios, repartidores,
vendedores y administrativos. Todo está en español y en términos del negocio
(no "registros" ni "entidades", sino "recepción de leche", "queso cremoso", "pedido").

---

## 2. Cómo entrar

1. Abrí la app en el navegador (`http://localhost:3000` en desarrollo).
2. Ingresá con tu usuario. Para pruebas:
   - **Usuario:** `admin@lasmarias.local`
   - **Contraseña:** `Admin123!Cambiar`
3. Caés en **Inicio**, el tablero con los números del día.

> En desarrollo, el login tiene un botón **"Administrador"** que completa los datos solo.

---

## 3. Las pantallas, una por una

La barra oscura de la izquierda es el menú. Cada ítem es un módulo:

| Módulo | Para qué sirve |
|--------|----------------|
| **Inicio** | Tablero con KPIs del día (leche recibida, producciones, pedidos, a cobrar, alertas de stock) y accesos rápidos. |
| **Recepción de leche** | Cargar cada ingreso de leche cruda: productor, litros y análisis de calidad. Si la calidad excede los límites, el sistema **bloquea** la recepción automáticamente. Genera el código de lote solo. |
| **Recetas** | Definir cómo se hace cada producto (rendimiento, insumos, subproductos). Incluye un **simulador** para probar costos sin abrir una orden real. |
| **Producción** | Abrir una orden eligiendo receta y lotes de leche a consumir; al cerrarla se cargan las salidas reales y se genera el stock con su lote. |
| **Inventario** | Stock por producto y lote, con **FEFO** (sale primero lo que vence antes) y alertas de vencimiento/stock bajo. Más el historial de movimientos. |
| **Compras** | Proveedores y órdenes de compra. |
| **Ventas y pedidos** | Tomar pedidos con cliente, productos y fecha de reparto sugerida por zona. Muestra el **total en vivo** mientras se carga. |
| **Comprobantes** | Facturas y cuentas por cobrar. |
| **Asistencia** | Marcaciones y horas de los empleados. |
| **Reportes** | Reportes operativos y comerciales. |
| **Administración** | Zonas de reparto, listas de precios, usuarios y configuración. |

---

## 4. Flujo típico (de la leche al cliente)

1. **Recepción de leche** → llega el camión, se cargan litros y calidad → se crea el lote.
2. **Producción** → se abre una orden con ese lote y una receta → al cerrar, queda el queso en stock.
3. **Inventario** → el queso aparece con su lote y vencimiento.
4. **Ventas** → se toma un pedido del cliente; el sistema sugiere la fecha de reparto y calcula el total.
5. **Comprobantes** → se factura el pedido y queda en cuentas por cobrar.

---

## 5. Cargar datos de ejemplo (para que "se vea")

Para mostrar la app poblada (demo o capacitación) hay un cargador que crea zonas,
productos, productores, proveedores, clientes, listas de precios, recepciones y pedidos
**de ejemplo**, usando la propia API (respeta todas las validaciones).

**Requisitos:** la API tiene que estar corriendo (ver sección 6).

```bash
pnpm --filter api seed:demo
```

Al terminar, entrá a la app y vas a ver las pantallas con contenido real:
pedidos con totales, clientes por zona, stock, recepciones, etc.

> **Ojo:** el cargador NO borra nada y no deduplica por nombre. Si lo corrés varias
> veces, vas a tener productores/clientes repetidos. Corrélo una sola vez sobre una
> base limpia.

---

## 6. Cómo levantar el entorno (desarrollo)

1. **Base de datos y cache** (Docker):
   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```
   Levanta PostgreSQL (puerto **55432**) y Redis (**6379**).

2. **Migraciones y usuario admin** (la primera vez):
   ```bash
   pnpm --filter api migration:run
   pnpm --filter api seed
   ```

3. **API** (backend, queda en el puerto **4000**):
   ```bash
   pnpm --filter api dev
   ```

4. **Web** (frontend, queda en el puerto **3000**):
   ```bash
   pnpm --filter web dev
   ```

5. (Opcional) Datos de ejemplo: `pnpm --filter api seed:demo`

---

## 7. Credenciales y puertos de un vistazo

| Qué | Valor |
|-----|-------|
| Usuario admin | `admin@lasmarias.local` / `Admin123!Cambiar` |
| Web | `http://localhost:3000` |
| API | `http://localhost:4000` (rutas bajo `/api`) |
| PostgreSQL | `localhost:55432` (db/usuario/pass: `lasmarias` / `lasmarias` / `lasmarias_dev`) |
| Redis | `localhost:6379` |

---

*Lácteos Las Marías — Pergamino, Buenos Aires.*
