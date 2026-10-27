# Tablero Docente

Herramienta web para docentes: sube las **actas parciales (PDF)** del sistema académico y obtén automáticamente:

- **Inasistencia (Art. 34):** % de faltas, faltas que le quedan a cada estudiante y quién pierde o está en riesgo (límite 15 %, o 25 % con justificación).
- **Nota mínima** que necesita cada estudiante en el siguiente corte para aprobar (los pesos 30/30/40 se leen del acta).
- **Alertas** (crítica, alta, atención) con el motivo, y un aviso listo para copiar y enviar al estudiante.
- **Gráficos y estadística** del grupo: promedios, desviación, distribución, correlación faltas ↔ notas.
- **Exportación** a Excel, CSV o PDF (imprimir).

## Privacidad
Todo se procesa **en el navegador**. Los PDFs y los datos de los estudiantes no se suben a ningún servidor ni se guardan.
**Nunca subas actas reales a este repositorio.**

## Uso
Abre la dirección de GitHub Pages del repositorio, arrastra uno o varios PDFs y revisa las pestañas por asignatura.
Antes de interpretar los resultados, confirma en *Parámetros* la **intensidad horaria** de cada asignatura (no viene en el acta).

## Reglas aplicadas
Pierde la asignatura (0.0) quien supera el 15 % de inasistencia sin justificar; con enfermedad o fuerza mayor comprobada el límite es 25 %.
Nota mínima = (aprobatoria − acumulado ponderado) ÷ peso de lo que falta, redondeada hacia arriba a un decimal.

## Para desarrolladores
Aplicación estática sin paso de compilación (`index.html`, `js/`, `css/`, `vendor/`). Las pruebas (`tests/`) usan `node --test`.
Librerías incluidas en `vendor/`: pdf.js, Chart.js, SheetJS.
