/* Carga de notas desde Excel/CSV y generación de la plantilla modelo.
   Recibe la librería SheetJS (XLSX) como parámetro para funcionar en el navegador y en Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ExcelIO = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ORD = { 1: '1er Corte', 2: '2do Corte', 3: '3er Corte', 4: '4to Corte' };
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const isEmpty = v => v === null || v === undefined || String(v).trim() === '';
  const toNum = v => {
    if (isEmpty(v)) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const slug = s => norm(s).replace(/\s+/g, '-').slice(0, 24) || 'sin-codigo';

  /** Clasifica un encabezado de columna. */
  function classify(h) {
    const n = norm(h); if (!n) return null;
    if (/^(documento|numero de documento|cedula|dni|identificacion|nit)\b/.test(n) || n === 'id') return { t: 'dni' };
    if (/^(estudiante|nombre|nombres|alumno|nombre del alumno|nombre del estudiante)\b/.test(n)) return { t: 'nombre' };
    if (/^(asignatura|materia)\b/.test(n)) return { t: 'asignatura' };
    if (/^codigo\b/.test(n)) return { t: 'codigo' };
    if (/^grupo\b/.test(n)) return { t: 'grupo' };
    if (/^(periodo|curso academico|semestre)\b/.test(n)) return { t: 'periodo' };
    const m = n.match(/(?:^|\s)([1-4])\s*(?:er|ro|do|to|ero|o)?\s*corte/) || n.match(/corte\s*([1-4])/) || n.match(/(?:^|\s)n\s?([1-4])(?:\s|$)/);
    if (m) return { t: /falta|inasist/.test(n) ? 'faltas' : 'nota', k: 'N' + m[1] };
    return null;
  }

  function findHeader(rows) {
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const cols = (rows[i] || []).map(classify);
      if (cols.some(c => c && c.t === 'nombre') && cols.some(c => c && (c.t === 'nota' || c.t === 'faltas'))) return i;
    }
    return -1;
  }

  /** Lee la hoja "Curso" (pares etiqueta/valor). */
  function readCourseSheet(rows) {
    const o = { pesos: {} };
    for (const r of rows) {
      if (!r || isEmpty(r[0])) continue; const k = norm(r[0]), v = r[1];
      if (isEmpty(v)) continue;
      let m;
      if (/^asignatura|^materia/.test(k)) o.asignatura = String(v).trim();
      else if (/^codigo/.test(k)) o.codigo = String(v).trim();
      else if (/^grupo/.test(k)) o.grupo = String(v).trim();
      else if (/^(periodo|curso academico|semestre)/.test(k)) o.periodo = String(v).trim();
      else if (/^intensidad|^horas/.test(k)) o.horas = toNum(v);
      else if ((m = k.match(/^peso.*?([1-4])/)) || (m = k.match(/([1-4]).*peso/))) o.pesos['N' + m[1]] = toNum(String(v).replace('%', ''));
    }
    return o;
  }

  /** Convierte un libro de Excel/CSV en actas internas ({meta, students, archivo}). */
  function parseWorkbook(XLSX, data, fileName) {
    const wb = XLSX.read(data, { type: 'array' });
    const sheets = wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: true }) }));
    const curso = readCourseSheet((sheets.find(s => /^curso/i.test(norm(s.name))) || { rows: [] }).rows);
    const cand = sheets.filter(s => !/^(instrucciones|curso)/i.test(norm(s.name)));
    cand.sort((a, b) => (/notas/i.test(norm(b.name)) ? 1 : 0) - (/notas/i.test(norm(a.name)) ? 1 : 0));
    let sheet = null, hi = -1;
    for (const s of cand) { hi = findHeader(s.rows); if (hi >= 0) { sheet = s; break; } }
    if (!sheet) throw new Error('No encontré la tabla de notas. Usa la plantilla (botón "Descargar plantilla de Excel"): necesita columnas Estudiante y 1er Corte (nota)…');

    const cols = sheet.rows[hi].map(classify);
    const warnings = [];
    const idx = (t, k) => cols.findIndex(c => c && c.t === t && (k === undefined || c.k === k));
    const ci = { dni: idx('dni'), nombre: idx('nombre'), asignatura: idx('asignatura'), codigo: idx('codigo'), grupo: idx('grupo'), periodo: idx('periodo') };
    const ids = [...new Set(cols.filter(c => c && (c.t === 'nota' || c.t === 'faltas')).map(c => c.k))].sort();
    const defW = ids.length === 3 ? { N1: 30, N2: 30, N3: 40 } : Object.fromEntries(ids.map(k => [k, Math.round(100 / ids.length)]));
    const pesos = ids.map(k => ({ id: k, peso: curso.pesos[k] != null ? curso.pesos[k] : defW[k] }));
    const suma = pesos.reduce((a, p) => a + p.peso, 0);
    if (Math.abs(suma - 100) > 0.5) throw new Error(`Los pesos de los cortes suman ${suma}%, deben sumar 100%. Revisa la hoja "Curso".`);

    const grupos = new Map(); let leidas = 0;
    for (let r = hi + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] || []; const get = i => (i >= 0 ? row[i] : null);
      const nombre = String(get(ci.nombre) == null ? '' : get(ci.nombre)).trim();
      if (!nombre) continue;
      if (/^ejemplo\b/i.test(nombre)) { warnings.push(`Fila ${r + 1} ("${nombre}") parece de ejemplo y se omitió.`); continue; }
      const dniRaw = get(ci.dni);
      const dni = isEmpty(dniRaw) ? 'sin-doc-' + (r + 1) : (typeof dniRaw === 'number' ? String(Math.round(dniRaw)) : String(dniRaw).trim());
      const asignatura = (String(get(ci.asignatura) || '').trim() || curso.asignatura || 'ASIGNATURA SIN NOMBRE').toUpperCase();
      const grupo = (String(get(ci.grupo) || '').trim() || curso.grupo || '').toUpperCase();
      const periodo = String(get(ci.periodo) || '').trim() || curso.periodo || '';
      const codigo = String(get(ci.codigo) || '').trim() || curso.codigo || slug(asignatura);
      const key = [codigo, grupo, periodo].join('|');
      if (!grupos.has(key)) grupos.set(key, { codigo, asignatura, grupo, periodo, students: [] });
      const cortes = {};
      for (const id of ids) {
        let nota = toNum(get(idx('nota', id))), f = toNum(get(idx('faltas', id)));
        if (nota != null && (nota < 0 || nota > 5)) { warnings.push(`Fila ${r + 1} (${nombre}): la nota ${nota} de ${ORD[+id.slice(1)]} está fuera de 0–5 y se ignoró.`); nota = null; }
        if (f != null && f < 0) { warnings.push(`Fila ${r + 1} (${nombre}): faltas negativas en ${ORD[+id.slice(1)]}; se tomaron como 0.`); f = null; }
        cortes[id] = { nota, faltas: f == null ? 0 : f };
      }
      grupos.get(key).students.push({ dni, nombre: nombre.toUpperCase(), plan: '', exp: '', cortes });
      leidas++;
    }
    if (!leidas) throw new Error('La tabla de notas no tiene estudiantes. Revisa que las filas estén debajo de los encabezados.');
    const actas = [...grupos.values()].map(g => ({
      archivo: fileName || '', warnings,
      meta: { asignatura: g.asignatura, codigo: g.codigo, grupo: g.grupo, grupoCodigo: g.grupo, periodo: g.periodo, convocatoria: '', fecha: 'cargado desde Excel', cortes: pesos.map(p => ({ ...p })), horas: curso.horas || null, origen: 'excel' },
      students: g.students,
    }));
    return actas;
  }

  /** Crea la plantilla modelo (libro con Instrucciones, Curso y Notas). */
  function buildTemplate(XLSX) {
    const wb = XLSX.utils.book_new();
    const ins = [
      ['PLANTILLA PARA CARGAR NOTAS – Tablero Docente'], [''],
      ['Úsala solo si no tienes el acta parcial en PDF de UNIPAZ (si la tienes, súbela directamente).'], [''],
      ['1. En la hoja "Curso" escribe los datos de tu asignatura, los pesos de cada corte (deben sumar 100) y la intensidad horaria total según el microcurrículo (32, 48 o 64 horas; equivale a 2, 3 o 4 horas semanales).'],
      ['2. En la hoja "Notas" escribe un estudiante por fila. Borra las 3 filas de ejemplo (las que empiezan por "EJEMPLO").'],
      ['3. Notas con decimales de 0 a 5 (coma o punto). Si un corte aún no se ha calificado, deja la nota VACÍA (no escribas 0).'],
      ['4. Faltas: número de horas o clases perdidas en ese corte. Si no hubo, deja vacío o pon 0.'],
      ['5. No cambies los nombres de las columnas. Si tu asignatura tiene solo 2 cortes, borra las columnas del 3er Corte y ajusta los pesos.'],
      ['6. Guarda el archivo y arrástralo a la herramienta.'], [''],
      ['Nota: puedes poner varias asignaturas en la misma hoja añadiendo las columnas opcionales Asignatura, Grupo y Periodo.'],
    ];
    const wsI = XLSX.utils.aoa_to_sheet(ins); wsI['!cols'] = [{ wch: 120 }];
    const wsC = XLSX.utils.aoa_to_sheet([
      ['Dato', 'Valor'], ['Asignatura', 'NOMBRE DE LA ASIGNATURA'], ['Código', ''], ['Grupo', 'GRUPO DIURNO'], ['Periodo', '2026-2S'],
      ['Peso 1er Corte (%)', 30], ['Peso 2do Corte (%)', 30], ['Peso 3er Corte (%)', 40], ['Intensidad horaria total (32, 48 o 64 horas)', 48],
    ]); wsC['!cols'] = [{ wch: 36 }, { wch: 36 }];
    const head = ['Documento', 'Estudiante', '1er Corte (nota)', '1er Corte (faltas)', '2do Corte (nota)', '2do Corte (faltas)', '3er Corte (nota)', '3er Corte (faltas)'];
    const wsN = XLSX.utils.aoa_to_sheet([head,
      ['1000000001', 'EJEMPLO PEREZ, ANA', 4.2, 1, 3.8, 0, null, null],
      ['1000000002', 'EJEMPLO ROJAS, CARLOS', 2.9, 4, 1.7, 2, null, null],
      ['1000000003', 'EJEMPLO LUNA, DIANA', 3.5, 0, 3.1, 1, null, null]]);
    wsN['!cols'] = [{ wch: 14 }, { wch: 36 }, ...Array(6).fill({ wch: 18 })];
    XLSX.utils.book_append_sheet(wb, wsI, 'Instrucciones'); XLSX.utils.book_append_sheet(wb, wsC, 'Curso'); XLSX.utils.book_append_sheet(wb, wsN, 'Notas');
    return wb;
  }

  return { parseWorkbook, buildTemplate, classify, ORD };
});
