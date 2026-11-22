# Tablero Docente · Control académico

> 🤖 Aplicativo desarrollado con apoyo de inteligencia artificial, de uso libre para docentes. Las propuestas y correcciones son bienvenidas (pestañas *Issues* o *Pull requests*).

**Abrir la herramienta:** https://gaopyme-prog.github.io/tablero-docente/

## ¿Qué es?
Una página web para docentes de UNIPAZ que lee las **actas parciales de notas (PDF)** que entrega el sistema académico, o un **Excel** propio con las notas, y convierte esa información en un tablero de control del curso: quién está en riesgo de perder por faltas, qué nota necesita cada estudiante en el siguiente corte y cómo va el grupo en general.

## ¿Para qué sirve? (finalidad)
Que el docente detecte **a tiempo** a los estudiantes en riesgo académico y pueda avisarles antes de que sea tarde. Hacer este cálculo a mano, estudiante por estudiante y asignatura por asignatura, toma horas; la herramienta lo hace en segundos y con las reglas del reglamento estudiantil.

**Dirigido a:** docentes y coordinadores de programa.

## ¿Qué entrega?
- **Inasistencia (Art. 34):** porcentaje de faltas, faltas que le quedan a cada estudiante y quién pierde o está en riesgo (límite 15 %, o 25 % con justificación comprobada).
- **Nota mínima** que necesita cada estudiante en el siguiente corte para aprobar (los pesos, por ejemplo 30/30/40, se leen del acta).
- **Alertas por nivel** (crítica, alta, atención) con el motivo, y un **mensaje listo para copiar** y enviar al estudiante.
- **Gráficos y estadística** del grupo: promedios, desviación, distribución de notas y relación entre faltas y notas.
- **Exportación** a Excel, CSV o PDF (imprimir).

## ¿Cómo se usa?
1. Abra el enlace de la herramienta en Chrome, Edge o Firefox.
2. Arrastre a la zona indicada uno o varios PDF de actas parciales (pueden ser de distintas asignaturas) o su Excel de notas.
   - Si sus notas están en otra fuente, pulse **Descargar plantilla de Excel**, pegue allí sus datos y súbala.
   - Para conocerla sin datos reales, pulse **Probar con datos de ejemplo**.
3. La herramienta le pregunta la **intensidad horaria** de cada asignatura según el microcurrículo (32, 48 o 64 horas, u otra). Este dato no viene en el acta y de él depende el máximo de faltas. Se recuerda en el navegador.
4. Revise las pestañas por asignatura: alertas, tabla de estudiantes, gráficos.
5. Copie los avisos para los estudiantes o exporte el resultado.

## Reglas que aplica
- Pierde la asignatura (0.0) quien supera el 15 % de inasistencia sin justificar; con enfermedad o fuerza mayor comprobada el límite es 25 %. Estar exactamente en el límite no hace perder.
- Nota mínima = (nota aprobatoria − acumulado ponderado) ÷ peso de lo que falta, redondeada hacia arriba a un decimal.
- Es una herramienta de apoyo: verifique siempre contra el registro oficial de asistencia y el reglamento vigente.

## Privacidad
Todo se procesa **dentro del navegador** del docente. Los PDF y los datos de los estudiantes **no se suben a ningún servidor** ni se guardan en este repositorio. **Nunca suba actas reales a este repositorio.**

## Plantilla de Excel
Hojas *Curso* (asignatura, grupo, pesos, intensidad horaria) y *Notas* (un estudiante por fila, con nota y faltas de cada corte). Admite 2, 3 o 4 cortes y varias asignaturas en una misma hoja.

## Archivos del repositorio
| Archivo / carpeta | Función |
|---|---|
| `index.html` | Página principal |
| `js/parser.js` | Lee el PDF del acta |
| `js/excel.js` | Lee el Excel o CSV |
| `js/analysis.js` | Calcula inasistencia, nota mínima, alertas y estadística |
| `js/app.js`, `js/demo.js` | Interfaz y datos de ejemplo |
| `css/style.css` | Diseño con colores institucionales |
| `vendor/` | Librerías incluidas: pdf.js, Chart.js, SheetJS |
| `assets/plantilla_notas_tablero_docente.xlsx` | Plantilla modelo |

Aplicación estática, sin instalación ni servidor. Para poner el logo de UNIPAZ, suba a `assets/` una imagen llamada `logo.png`.

## Créditos y soporte
Idea y dirección: **Omar Guerrero Avilés**, docente de tiempo completo de la Escuela de Ciencias, UNIPAZ (Instituto Universitario de la Paz), Barrancabermeja. Desarrollado con apoyo de inteligencia artificial.
Soporte: omar.guerreroav@unipaz.edu.co
