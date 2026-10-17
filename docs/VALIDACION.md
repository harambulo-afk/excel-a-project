# Validación de la versión 0.1.0

Fecha: 17 de octubre de 2026. Datos de prueba ficticios de un estudio eléctrico.

## Pruebas automáticas

`node --test`: **32 pruebas aprobadas**, sin fallos.

Cubren fechas y años bisiestos, calendarios de 5/6/7 días, fines de semana, pausa de almuerzo, duraciones fraccionarias, hitos, jerarquía, IDs duplicados, ciclos, cuatro tipos de relación, desfases, escape de texto XML, límites del archivo, fórmulas almacenadas y lectura de la plantilla XLSX distribuida.

Las regresiones incluyen exportación de la duración pendiente y remapeo de los IDs originales a UID consecutivos. Estos campos evitan pérdidas de duración y vínculos observadas durante las pruebas de importación.

## Navegador

Se comprobó el flujo con Chrome en Windows:

- Carga de la plantilla real: 10 filas de tareas y selección de la hoja Tareas.
- Descarga de XML y navegación entre tabla y Gantt.
- Bloqueo ante ID duplicado, predecesora inexistente y archivo XLSX corrupto.
- Un conflicto de secuencia exige revisar y aceptar los avisos antes de exportar.
- El texto de una tarea que contiene etiquetas HTML se muestra como texto, sin ejecutarlo.
- Sin excepciones JavaScript en el flujo comprobado.
- Vista de escritorio y móvil de 390 píxeles, sin desbordamiento horizontal de la página. Las tablas se desplazan dentro de su panel.
- Apertura de `dist/index.html` por archivo local con el navegador sin conexión: carga del XLSX y habilitación de exportación correctas.

## Importación real en Microsoft Project

Se abrió el XML generado como proyecto nuevo en **Microsoft Project de escritorio, versión COM 16.0**, mediante su interfaz de automatización.

El ejemplo contiene 10 tareas: 2 resúmenes, 8 tareas de detalle, 2 hitos y 7 dependencias FC. Se compararon todas las filas con los datos previos a la exportación. Coincidieron nombres, inicio, fin, duración en minutos, jerarquía, condición de resumen, contacto, avance físico, modo automático y los 7 vínculos. Los IDs originales quedaron conservados en Notas.

La exportación usa UID consecutivos. Project omitió un vínculo en una prueba anterior con UID salteados; por eso se remapean tanto las tareas como sus predecesoras. El ID original del Excel sigue disponible en Notas.

La duración pendiente se exporta explícitamente, junto con avance por duración cero y duración real cero. El avance físico es un campo separado y no se interpreta como ejecución real del cronograma.

## Alcance de esta comprobación

Esta prueba de importación cubre el ejemplo descrito y esa instalación de Project. Los cuatro tipos de relación y los calendarios alternativos cuentan con pruebas de conversión, pero no constituyen una certificación de todos los consumidores o versiones de MSPDI.

Antes de usar un cronograma contractual, verifica en el programa de destino las fechas, calendario y dependencias. Project puede reprogramar tareas al resolver la lógica. El conversor no calcula ruta crítica, holguras, costos ni nivelación de recursos.

No se incluyeron archivos reales de clientes en el repositorio ni en la distribución.
