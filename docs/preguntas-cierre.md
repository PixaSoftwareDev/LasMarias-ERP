# Preguntas para cerrar la app con el cliente

> Para la reunión donde navegamos la app juntos. El objetivo: entender **cómo
> trabaja hoy de verdad** (no como "debería"), para decidir qué **mejorar,
> adaptar o borrar**. Preguntar abierto, dejar que cuente el flujo, y al final
> de cada área anotar: ¿esto lo usan? ¿falta algo? ¿sobra algo?

> **Tip de oro:** ante cada pantalla preguntar tres cosas — *¿esto lo hacés hoy
> así? ¿qué te falta para que te sirva? ¿hay algo acá que no usarías nunca?*

---

## 0. El flujo general (arrancar por acá, antes de tocar la app)
- Contame **un día normal** en la planta, de la mañana a la tarde: ¿qué pasa primero, qué después?
- ¿Quién carga los datos hoy? ¿Vos, un administrativo, el de planta? ¿Cuántas personas tocarían el sistema?
- ¿Qué venís haciendo hoy en el Excel y qué te gustaría dejar de hacer a mano?
- De todo lo que hacés, ¿qué es lo que **más tiempo te quita** o **más errores te trae**?

## 1. Recepción de leche
- ¿Cuántas entradas de leche tenés por día? ¿De cuántos tambos?
- ¿Anotás transporte/chofer y remito siempre, o no hace falta?
- **Análisis de calidad:** ¿qué medís en el día a día? ¿Temperatura, pH, acidez? ¿Tenés **grasa, proteína, RCS, UFC**, o eso lo manda el laboratorio aparte y rara vez se carga?
- ¿Querés que el sistema **bloquee** la leche que no cumple, o preferís que solo avise y vos decidís?
- ¿Cuáles serían tus límites reales de aceptación (temperatura, pH, etc.)?

## 2. Producción / Recetas
- ¿Elaboran en **un paso** (leche → queso) o en **dos** (leche → masa → mozzarella)? ¿Siempre igual?
- ¿Qué productos hacen? ¿Cuántas recetas distintas?
- ¿Tenés los **costos** de cada insumo (fermento, cuajo, sal, mano de obra, energía, envase)? ¿Querés cargarlos para tener el costo real, o por ahora alcanza con la leche?
- ¿Aprovechan **subproductos** (suero, ricota)? ¿Les ponen un valor?
- ¿Cuánto te importa ver el **costo por kg** y el desvío contra lo esperado? ¿Lo mirarías seguido?

## 3. Stock
- ¿Hoy controlás stock de algún modo o vas "a ojo"?
- ¿De qué cosas te quedás sin querer (fermento, sal, envases…)? → para definir **avisos de stock bajo**.
- ¿Necesitás saber **en qué cámara** está cada cosa, o no hace falta?
- ¿Hacés **conteo físico** cada tanto? ¿Con qué frecuencia?
- ¿Te pasa tener que **dar de baja** por vencimiento/rotura/merma? ¿Lo registrás?

## 4. Ventas
- ¿Cómo vendés: el cliente viene, repartís, ambos?
- ¿El precio es **fijo por cliente** (lista) o lo ponés a mano en cada venta?
- ¿Trabajás con **lista de precios** distinta por tipo de cliente (mayorista/minorista)?
- ¿Entregás **remito**? ¿Te sirve el que genera la app o necesita otros datos / formato?
- ¿Tenés **devoluciones** seguido? ¿Cómo las manejás hoy?
- ¿Vendés al **contado**, en **cuenta corriente**, o las dos? ¿Qué proporción?

## 5. Cuenta corriente (lo que te deben)
- ¿Llevás cuenta corriente de clientes? ¿En qué (Excel, cuaderno)?
- ¿Manejás **plazos de pago** (30 días, etc.) o es "cuando pueden"?
- ¿Te sirve ver la **deuda vencida** y la antigüedad, o con el saldo total alcanza?
- ¿Cómo registrás los **cobros** hoy?

## 6. Pagos a tambos (lo que le debés a la leche)
- ¿Cómo le **comprás** la leche al tambo: precio fijo por litro, o ajustado por calidad (grasa/proteína/RCS)? ¿Tambo propio?  *(esto define si reactivamos la "liquidación al tambo")*
- ¿Liquidás **mensual**? ¿Cómo calculás hoy cuánto pagarle?
- ¿Te sirve ver "cuánto le debo a cada tambo" como está, o necesitás algo más?

## 7. Plata / Flujo de caja
- ¿Llevás la caja (lo que entra y sale) en algún lado?
- ¿Qué **gastos** cargarías (sueldos, energía, fletes, mantenimiento…)?
- ¿Te interesa ver el **neto del mes** y exportarlo para el contador?

## 8. Reportes y números
- ¿Qué números mirás hoy para tomar decisiones? ¿Cuáles te gustaría tener y no tenés?
- ¿Te sirve **producción por día/mes, ventas por cliente/producto, rentabilidad, rendimiento**? ¿Sobra alguno?
- ¿Exportás a Excel para alguien (contador, socio)?

## 9. Trazabilidad
- Si te reclaman por un producto, ¿hoy podés saber **de qué leche salió** y a **qué clientes fue**? ¿Lo necesitás por algún control/bromatología?
- ¿Te resulta claro el recorrido como está?

## 10. Usuarios y acceso
- ¿Lo vas a usar **solo vos**, o varios empleados con distintos permisos?  *(hoy está pensado para un admin; si necesitan varios, lo agregamos)*
- ¿Hay cosas que **no** querés que vea/toque un empleado (plata, costos)?

## 11. Puesta en marcha (para "dejarla andando")
- ¿Dónde va a correr: una **PC del lugar** siempre prendida, o un servidor / nube?
- ¿Tenés conexión estable? ¿Qué pasa si se corta la luz?
- **Backups:** ¿quién se encargaría de que no se pierdan los datos? *(hay que dejar un respaldo automático antes de soltarla)*
- ¿Necesitás cargar los **datos reales iniciales** (tambos, clientes, productos, recetas, precios) antes de arrancar? ¿Los tenés en una planilla?

---

## Cierre de la reunión — checklist para nosotros
Al terminar de navegar, definir para cada área:
- ✅ **Queda como está** (lo usan, les sirve).
- ✏️ **Adaptar** (sirve pero hay que cambiar algo concreto → anotar qué).
- ➕ **Falta** (necesitan algo que no está → anotar qué y por qué).
- 🗑️ **Borrar / esconder** (no lo usan, es ruido → simplificar).

Y dejar acordado: **qué datos reales cargan ellos**, **dónde va a correr** y **cuándo** sería el arranque real.
