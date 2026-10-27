/* Lector de actas parciales (PDF) del sistema académico de UNIPAZ.
   Funciona en el navegador (window.Parser) y en Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Parser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function groupLines(items, tol) {
    tol = tol || 2;
    const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of sorted) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= tol) last.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    }
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x);
      l.text = l.items.map(i => i.str.trim()).filter(Boolean).join(' ');
    }
    return lines;
  }

  const num = s => {
    const v = parseFloat(String(s).replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  };

  /** Interpreta UNA página. items = [{str,x,y}] */
  function parsePage(items) {
    items = items.filter(i => i.str && i.str.trim());
    const lines = groupLines(items);
    const meta = {};
    let headerLine = null;

    for (const l of lines) {
      const t = l.text;
      let m;
      if ((m = t.match(/Curso acad[eé]mico:\s*(\S+)/i))) meta.periodo = m[1];
      if ((m = t.match(/Convocatoria:\s*(.+)$/i))) meta.convocatoria = m[1].trim();
      if ((m = t.match(/Asignatura:\s*(.+?)\s*\((\d+)\)/i))) { meta.asignatura = m[1].trim(); meta.codigo = m[2]; }
      if ((m = t.match(/Grupo:\s*(.+?)\s*\((\d+)\)/i))) { meta.grupo = m[1].trim(); meta.grupoCodigo = m[2]; }
      if (/C[aá]lculo definitiva/i.test(t)) {
        const re = /N(\d+):\s*(\d+(?:[.,]\d+)?)\s*%/g; let w; meta.cortes = [];
        while ((w = re.exec(t))) meta.cortes.push({ id: 'N' + w[1], peso: num(w[2]) });
      }
      if ((m = t.match(/,\s*a\s+(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+de\s+(\d{4})/i))) meta.fecha = `${m[1]} de ${m[2]} de ${m[3]}`;
      if (/\bDNI\b/.test(t) && /FALTAS/.test(t)) headerLine = l;
    }
    if (!headerLine) return { meta, students: [] };

    const hx = {};
    for (const it of headerLine.items) {
      const s = it.str.trim().toUpperCase();
      if (s === 'DNI') hx.dni = it.x;
      else if (s.startsWith('NOMBRE')) hx.nombre = it.x;
      else if (s === 'PLAN') hx.plan = it.x;
      else if (s === 'EXP') hx.exp = it.x;
      else if (s.startsWith('PARCIAL')) hx.parc = it.x;
      else if (s.startsWith('CALIFICA')) hx.calif = it.x;
      else if (s === 'FALTAS') hx.faltas = it.x;
    }
    // Bordes de columna derivados del encabezado (con valores por defecto del formato conocido)
    const E = {
      dniEnd: (hx.nombre || 123) - 15,
      nameEnd: (hx.plan || 320) - 30,
      planEnd: (hx.exp || 359) - 12,
      expEnd: (hx.parc || 392) - 8,
      parcEnd: (hx.calif || 452) - 8,
      califEnd: (hx.faltas || 530) - 5,
    };
    const body = items.filter(i => i.y < headerLine.y - 3);
    // Pie de la tabla: firma de profesores, fecha, numeración de página
    const footLines = groupLines(body).filter(l => /Profesores que firman|,\s*a\s+\d{1,2}\s+de\s+\S+\s+de\s+\d{4}|^Pag\b/i.test(l.text));
    const tableBottom = footLines.length ? Math.max(...footLines.map(l => l.y)) + 3 : -Infinity;
    const dnis = body
      .filter(i => i.x < E.dniEnd && /^\d{5,12}$/.test(i.str.trim()))
      .sort((a, b) => b.y - a.y);

    const students = dnis.map((d, idx) => {
      const top = d.y + 3;
      const bottom = idx + 1 < dnis.length ? dnis[idx + 1].y + 3 : tableBottom;
      const blk = body.filter(i => i.y <= top && i.y > bottom);
      const col = (a, b) => blk.filter(i => i.x >= a && i.x < b);
      const nombre = col(E.dniEnd, E.nameEnd).sort((a, b) => b.y - a.y || a.x - b.x)
        .map(i => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
      const plan = (col(E.nameEnd, E.planEnd)[0] || {}).str;
      const exp = (col(E.planEnd, E.expEnd)[0] || {}).str;
      const cortes = {};
      for (const p of col(E.expEnd, E.parcEnd)) {
        const id = p.str.trim().toUpperCase();
        if (!/^N\d+$/.test(id)) continue;
        const same = arr => arr.filter(i => Math.abs(i.y - p.y) <= 3)[0];
        const c = same(col(E.parcEnd, E.califEnd));
        const f = same(col(E.califEnd, Infinity));
        cortes[id] = { nota: c ? num(c.str) : null, faltas: f ? (num(f.str) || 0) : 0 };
      }
      return { dni: d.str.trim(), nombre, plan: plan ? plan.trim() : '', exp: exp ? exp.trim() : '', cortes };
    });
    return { meta, students };
  }

  /** Une las páginas de un mismo PDF. pages = [[{str,x,y}], ...] */
  function parseActa(pages, fileName) {
    const out = { meta: {}, students: [], archivo: fileName || '' };
    for (const p of pages) {
      const r = parsePage(p);
      for (const k in r.meta) if (out.meta[k] === undefined) out.meta[k] = r.meta[k];
      out.students.push(...r.students);
    }
    if (!out.meta.cortes || !out.meta.cortes.length) {
      const ids = new Set(); out.students.forEach(s => Object.keys(s.cortes).forEach(k => ids.add(k)));
      out.meta.cortes = [...ids].sort().map(id => ({ id, peso: Math.round(100 / ids.size) }));
    }
    out.meta.cortes.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
    return out;
  }

  /** Lee un PDF con pdf.js (pdfjsLib) y devuelve el acta interpretada. */
  async function readPdf(data, pdfjsLib, fileName) {
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      pages.push(tc.items.map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5] })));
    }
    const acta = parseActa(pages, fileName);
    if (!acta.students.length || !acta.meta.asignatura) {
      throw new Error('No parece un acta parcial de UNIPAZ (no se encontraron estudiantes o asignatura).');
    }
    return acta;
  }

  /** Junta varias actas en cursos (asignatura+grupo) y elimina duplicados por DNI. */
  function mergeActas(actas) {
    const cursos = new Map(); let duplicados = 0;
    for (const a of actas) {
      const key = `${a.meta.codigo}|${a.meta.grupoCodigo || a.meta.grupo}|${a.meta.periodo}`;
      if (!cursos.has(key)) cursos.set(key, { key, meta: a.meta, students: new Map(), archivos: [] });
      const c = cursos.get(key);
      c.archivos.push(a.archivo);
      for (const s of a.students) { if (c.students.has(s.dni)) duplicados++; c.students.set(s.dni, s); }
    }
    return {
      duplicados,
      cursos: [...cursos.values()].map(c => ({ key: c.key, meta: c.meta, archivos: c.archivos, students: [...c.students.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) })),
    };
  }

  return { groupLines, parsePage, parseActa, readPdf, mergeActas };
});
