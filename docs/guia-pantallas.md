# Guía de la app — Lácteos Las Marías

> Para recorrer con el cliente. Lenguaje simple, una sección por pantalla.
> La app reemplaza el Excel y cubre todo el circuito:
> **leche → producción (con costo) → stock → venta → cobranza/pagos → números.**

---

## ¿Qué es la app, en una frase?

Un sistema donde cargás **una vez** cada cosa que pasa en la planta (entra leche, se elabora, se vende, se cobra) y el sistema **calcula y conecta todo solo**: el costo de cada queso, el stock, lo que te deben, lo que le debés a los tambos y cómo viene la plata. Nada se carga dos veces y nada se calcula a mano.

El menú de la izquierda sigue el **orden natural del trabajo**, de arriba hacia abajo.

---

## 1. Inicio
La pantalla de bienvenida / centro de comando. De un vistazo:
- **Plata:** cuánto te deben (a cobrar), la caja del mes y las ventas del mes.
- **La planta hoy:** litros de leche recibidos hoy, kg producidos hoy, ventas de hoy y lotes por vencer.
- **Para resolver:** lo urgente (deuda vencida, stock bajo, lotes por vencer).
- **Calendario:** lo que viene (cobros por vencer y vencimientos de lote).

No se carga nada acá; es solo para mirar y saltar a donde haga falta.

## 2. Recepción de leche
Cada vez que **entra leche** de un tambo, se carga acá: fecha, tambo, transporte, remito, litros y los análisis de calidad.
- Calcula sola la **diferencia de litros** (lo recibido vs. lo que dice el remito).
- Si un análisis se pasa de los límites (o hay antibióticos / falla la prueba de alcohol), la recepción queda **bloqueada automáticamente** y avisa antes de guardar.
- Cada recepción aceptada genera un **lote de leche** que después se usa en producción.

## 3. Producción
Donde se **elabora**: se abre una orden con una receta, se eligen los lotes de leche (o de masa) a usar y, al cerrar, se cargan los kilos reales obtenidos.
- Acá vive la **calculadora de costo**: muestra el costo real del lote, el costo por kg y lo compara contra lo esperado por la receta.
- Soporta **dos pasos**: leche → masa, y después masa → mozzarella/queso (la masa es un stock intermedio con su propio costo).
- Al cerrar la orden, **baja la leche del stock** y **genera el lote de producto**.

## 4. Stock
Vista de todo lo que hay, agrupado por tipo (materia prima, en proceso, producto terminado, subproductos, insumos, envases).
- El stock **no se carga a mano**: sube con producción/ingresos y baja con ventas.
- Se puede **ingresar insumos** (fermento, sal, envases), **dar de baja** (merma, descarte, vencido) y hacer **conteo físico** (ajusta a lo que contaste).
- Cada ítem puede tener un **aviso de stock bajo** (se define desde la fila): cuando baja del mínimo, se marca en amarillo.

## 5. Ventas
Donde se **vende y se entrega** mercadería a un cliente.
- Se elige cliente, productos, cantidad y precio; el total se calcula solo.
- Al confirmar, **baja el stock** (por FEFO: primero lo que vence antes) y, según el cliente, **cobra al contado** o lo deja en **cuenta corriente**.
- Genera el **remito imprimible** y permite registrar **devoluciones** (con nota de crédito que repone stock).

## 6. Cuenta corriente
El **debe y haber de cada cliente**: cuánto te debe, hace cuánto (al día / 31-60 / +60 días) y registro de **cobros**.
- Cada cobro baja el saldo del cliente y entra como **ingreso en el flujo de caja**.
- Exportable a Excel.

## 7. Pagos a tambos
El **espejo** de la cuenta corriente, pero del lado de la leche: cuánto **le debés a cada tambo** (litros recibidos × precio) y los **pagos** que hacés.
- Cada pago baja el saldo del tambo y entra como **egreso en el flujo de caja**.
- Vista por mes (liquidación mensual).

## 8. Flujo de caja
La **plata que entra y sale**: ingresos (cobros) y egresos (gastos y pagos), con el neto del período.
- Los cobros y pagos entran solos; los **gastos** (sueldos, energía, fletes…) se cargan a mano.
- Exportable a Excel.

## 9. Reportes
Números para tomar decisiones, en pestañas: **producción** (kg, litros, costo), **ventas** (por cliente y por producto), **rentabilidad** (margen) y **rendimiento** (real vs. esperado de cada orden).
- Todo por rango de fechas y exportable a Excel. Solo lectura.

## 10. Trazabilidad
El **viaje de un lote** en un solo recorrido: de qué leche salió (tambo y recepción) y a qué clientes llegó el producto.
- Se elige un lote (buscando por producto, tambo o fecha) y se ve el recorrido completo.
- También se llega con el botón **"Ver recorrido"** desde Producción y Recepción.

## 11. Recetas
Las **fórmulas de fabricación** de cada producto: rendimiento esperado, insumos con su costo y subproductos.
- Es lo que **alimenta la calculadora de costo**.
- Tiene **versionado** (si cambiás una receta, los lotes viejos conservan la versión con la que se hicieron) y un **simulador** para probar costos sin abrir una orden real.

## 12. Datos maestros
Los **catálogos base**: productos, clientes, tambos, cámaras/sectores, listas de precio y **Configuración**.
- En **Configuración** se editan los **datos de la empresa** (los que salen en el remito) y los **límites de calidad** de la leche.
- Todo se da de alta, se edita y se desactiva desde acá. Es lo que hace que la app sea **autoadministrable** sin depender de un técnico.

---

### Cómo se conecta todo (el hilo)
> Entra leche (Recepción) → se elabora con su costo (Producción + Recetas) → queda en Stock → se vende y baja stock (Ventas) → si es a crédito, queda en Cuenta corriente y se cobra → la leche se le paga al tambo (Pagos a tambos) → todo el dinero se ve en Flujo de caja → y los números se miran en Reportes, Trazabilidad e Inicio.
