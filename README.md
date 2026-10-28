# Tablero Docente

> 🤖 **Aplicativo desarrollado con inteligencia artificial, disponible para su uso y mejora.** Propuestas y correcciones son bienvenidas (pestaña *Issues* o *Pull requests* del repositorio).

Herramienta web para docentes: sube las **actas parciales (PDF)** del sistema académico, o tu propio **Excel** con las notas (hay una plantilla modelo descargable), y obtén automáticamente:

- **Inasistencia (Art. 34):** % de faltas, faltas que le quedan a cada estudiante y quién pierde o está en riesgo (límite 15 %, o 25 % con justificación).
- **Nota mínima** que necesita cada estudiante en el siguiente corte para aprobar (los pesos 30/30/40 se leen del acta).
- **Alertas** (crítica, alta, atención) con el motivo, y un aviso listo para copiar y enviar al estudiante.
- **Gráficos y estadística** del grupo: promedios, desviación, distribución, correlación faltas ↔ notas.
- **Exportación** a Excel, CSV o PDF (imprimir).

## Privacidad
Todo se procesa **en el navegador**. Los PDFs y los datos de los estudiantes no se suben a ningún servidor ni se guardan.
**Nunca subas actas reales a este repositorio.**

## Fuentes de datos
- **PDF** del acta parcial de UNIPAZ (se lee automáticamente).
- **Excel / CSV** con la plantilla modelo (botón *Descargar plantilla de Excel*): hojas *Curso* (asignatura, grupo, pesos, intensidad horaria) y *Notas* (un estudiante por fila, con nota y faltas de cada corte). Permite 2, 3 o 4 cortes y varias asignaturas en una misma hoja.

## Uso
Abre la dirección de GitHub Pages del repositorio, arrastra uno o varios PDFs y revisa las pestañas por asignatura.
Antes de mostrar resultados, la herramienta **pregunta la intensidad horaria** de cada asignatura según su microcurrículo (**32, 48 o 64 horas**, u otra): no viene en el acta y de ella depende el máximo de faltas. La respuesta se recuerda en el navegador y siempre se pide confirmarla.

## Reglas aplicadas
Pierde la asignatura (0.0) quien supera el 15 % de inasistencia sin justificar; con enfermedad o fuerza mayor comprobada el límite es 25 %.
Nota mínima = (aprobatoria − acumulado ponderado) ÷ peso de lo que falta, redondeada hacia arriba a un decimal.

## Para desarrolladores
Aplicación estática sin paso de compilación (`index.html`, `js/`, `css/`, `vendor/`). `js/parser.js` lee el PDF, `js/excel.js` el Excel y `js/analysis.js` calcula alertas y estadística. Las pruebas (`tests/`) usan `node --test`.
Librerías incluidas en `vendor/`: pdf.js, Chart.js, SheetJS.
