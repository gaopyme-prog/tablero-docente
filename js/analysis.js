/* Motor de análisis: asistencia (Art. 34), nota mínima por corte, alertas y estadística.
   Lógica pura, sin DOM. Funciona en el navegador (window.Analysis) y en Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Analysis = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    horas: 48,             // intensidad horaria total de la asignatura (EDITABLE por el docente)
    limite: 15,            // % máximo de inasistencia sin justificar (Art. 34)
    limiteJustificado: 25, // % máximo con enfermedad/fuerza mayor comprobada
    aprobatoria: 3.0,
    notaMax: 5.0,
    alertaQuedan: 2,       // alerta cuando le quedan <= N faltas
    notaExigente: 4.0,     // nota requerida >= esto se considera crítica
  };

  const ORD = { 1: '1er Corte', 2: '2do Corte', 3: '3er Corte', 4: '4to Corte' };
  const corteLabel = id => ORD[parseInt(String(id).replace(/\D/g, ''), 10)] || String(id);
  const corteList = ids => ids.map(corteLabel).join(' y ');
  const EPS = 1e-9;
  const maxFaltas = (horas, pct) => Math.floor((horas * pct) / 100 + EPS);
  const ceil1 = x => Math.ceil(x * 10 - EPS) / 10;
  const round = (x, d) => { const f = Math.pow(10, d); return Math.round((x + Number.EPSILON) * f) / f; };

  /** Analiza a UN estudiante. */
  function analyzeStudent(st, meta, cfg, justificado) {
    cfg = Object.assign({}, DEFAULTS, cfg);
    const cortes = meta.cortes;
    const faltas = cortes.reduce((a, c) => a + ((st.cortes[c.id] && st.cortes[c.id].faltas) || 0), 0);
    const notas = {};
    let acc = 0, gradedW = 0, pendW = 0; const pend = [];
    for (const c of cortes) {
      const v = st.cortes[c.id] ? st.cortes[c.id].nota : null;
      notas[c.id] = v;
      if (v === null || v === undefined) { pendW += c.peso / 100; pend.push(c.id); }
      else { acc += (c.peso / 100) * v; gradedW += c.peso / 100; }
    }

    // ---- Asistencia
    const pct = (faltas / cfg.horas) * 100;
    const limitePct = justificado ? cfg.limiteJustificado : cfg.limite;
    const max = maxFaltas(cfg.horas, limitePct);
    const quedan = max - faltas;
    let asistencia = 'ok';
    if (faltas > max) asistencia = 'perdida';
    else if (quedan <= cfg.alertaQuedan) asistencia = 'riesgo';
    const recuperable = asistencia === 'perdida' && !justificado && faltas <= maxFaltas(cfg.horas, cfg.limiteJustificado);

    // ---- Nota
    let nota, need = null, needLabel = '', definitiva = null, promedioActual = null, proyeccion = null;
    if (gradedW > 0) promedioActual = acc / gradedW;
    if (pendW === 0) {
      definitiva = acc;
      nota = definitiva + EPS >= cfg.aprobatoria ? 'aprobada' : 'reprobada';
    } else {
      need = (cfg.aprobatoria - acc) / pendW;
      proyeccion = promedioActual; // si mantiene su promedio en lo que falta
      if (need <= 0) nota = 'asegurada';
      else if (need > cfg.notaMax + EPS) nota = 'imposible';
      else if (need >= cfg.notaExigente) nota = 'critica';
      else if (need >= cfg.notaExigente - 0.5) nota = 'exigente';
      else nota = 'normal';
      needLabel = need <= 0 ? 'Ya aprobó' : need > cfg.notaMax + EPS ? 'No alcanza' : ceil1(need).toFixed(1);
    }

    // ---- Severidad y motivos
    const motivos = [];
    let sev = 0; // 0 ok, 1 media, 2 alta, 3 crítica
    const up = (n, txt) => { sev = Math.max(sev, n); motivos.push(txt); };
    if (asistencia === 'perdida') {
      up(3, `Superó el límite de inasistencia: ${faltas} falta(s) (${round(pct, 1)}%), máximo ${max}.` +
        (recuperable ? ` Si presenta justificación válida (enfermedad/fuerza mayor) el límite sube a ${maxFaltas(cfg.horas, cfg.limiteJustificado)}.` : ''));
    } else if (asistencia === 'riesgo') {
      up(2, `En riesgo por inasistencia: ${faltas} falta(s) (${round(pct, 1)}%), le ${quedan === 1 ? 'queda 1 falta' : `quedan ${quedan} faltas`} antes de perder la asignatura.`);
    } else if (pct >= limitePct * 2 / 3) {
      up(1, `Inasistencia de ${round(pct, 1)}%, acercándose al límite de ${limitePct}%.`);
    }
    if (nota === 'imposible') up(3, `Ni con ${cfg.notaMax.toFixed(1)} en lo que falta alcanza ${cfg.aprobatoria.toFixed(1)} (acumulado ${round(acc, 2)}).`);
    else if (nota === 'reprobada') up(3, `Definitiva ${round(definitiva, 2)}: reprueba.`);
    else if (nota === 'critica') up(2, `Necesita ${needLabel} en ${corteList(pend)} para aprobar (acumulado ${round(acc, 2)}).`);
    else if (nota === 'exigente') up(1, `Necesita ${needLabel} en ${corteList(pend)} para aprobar.`);

    return {
      dni: st.dni, nombre: st.nombre, notas, faltas, pct, max, quedan, limitePct, justificado: !!justificado,
      asistencia, recuperable, acumulado: acc, promedioActual, pendientes: pend, siguiente: pend[0] || null,
      need, needLabel, nota, definitiva, definitivaEfectiva: asistencia === 'perdida' ? 0 : definitiva,
      proyeccion, severidad: ['ok', 'media', 'alta', 'critica'][sev], sevNum: sev, motivos,
    };
  }

  // ---- Estadística básica
  const clean = a => a.filter(v => v !== null && v !== undefined && Number.isFinite(v));
  const mean = a => { a = clean(a); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
  const median = a => { a = clean(a).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const sd = a => { a = clean(a); if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
  const min = a => { a = clean(a); return a.length ? Math.min(...a) : null; };
  const max_ = a => { a = clean(a); return a.length ? Math.max(...a) : null; };
  function pearson(x, y) {
    const n = Math.min(x.length, y.length); const px = [], py = [];
    for (let i = 0; i < n; i++) if (Number.isFinite(x[i]) && Number.isFinite(y[i])) { px.push(x[i]); py.push(y[i]); }
    if (px.length < 3) return null;
    const mx = mean(px), my = mean(py); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < px.length; i++) { sxy += (px[i] - mx) * (py[i] - my); sxx += (px[i] - mx) ** 2; syy += (py[i] - my) ** 2; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function histogram(values, max = 5, step = 1) {
    const bins = []; for (let a = 0; a < max; a += step) bins.push({ from: a, to: a + step, n: 0 });
    for (const v of clean(values)) { const i = Math.min(bins.length - 1, Math.floor(v / step + EPS)); bins[i].n++; }
    return bins;
  }

  /** Analiza todo un curso. justMap: {dni: true} */
  function analyzeCourse(course, cfg, justMap) {
    cfg = Object.assign({}, DEFAULTS, cfg); justMap = justMap || {};
    const rows = course.students.map(s => analyzeStudent(s, course.meta, cfg, justMap[s.dni]));
    const cortes = course.meta.cortes;
    const porCorte = cortes.map(c => {
      const v = rows.map(r => r.notas[c.id]);
      return { id: c.id, peso: c.peso, n: clean(v).length, media: mean(v), mediana: median(v), desv: sd(v), min: min(v), max: max_(v),
        aprueban: clean(v).filter(x => x >= cfg.aprobatoria).length };
    });
    const sevCount = { ok: 0, media: 0, alta: 0, critica: 0 };
    rows.forEach(r => sevCount[r.severidad]++);
    const ultimo = cortes.filter(c => porCorte.find(p => p.id === c.id).n > 0).slice(-1)[0];
    const prev = ultimo ? cortes[cortes.indexOf(ultimo) - 1] : null;
    let mejoran = 0, empeoran = 0, igual = 0;
    if (ultimo && prev) rows.forEach(r => {
      const a = r.notas[prev.id], b = r.notas[ultimo.id];
      if (a == null || b == null) return;
      if (b > a + EPS) mejoran++; else if (b < a - EPS) empeoran++; else igual++;
    });
    const promedios = rows.map(r => r.promedioActual);
    const stats = {
      n: rows.length, porCorte, sevCount,
      promedioGrupo: mean(promedios), medianaGrupo: median(promedios), desvGrupo: sd(promedios),
      sobreAprobatoria: clean(promedios).filter(x => x >= cfg.aprobatoria).length,
      faltasMedia: mean(rows.map(r => r.faltas)), faltasTotal: rows.reduce((a, r) => a + r.faltas, 0),
      sinFaltas: rows.filter(r => r.faltas === 0).length,
      asistPerdida: rows.filter(r => r.asistencia === 'perdida').length,
      asistRiesgo: rows.filter(r => r.asistencia === 'riesgo').length,
      notaImposible: rows.filter(r => r.nota === 'imposible' || r.nota === 'reprobada').length,
      notaCritica: rows.filter(r => r.nota === 'critica').length,
      correlFaltasNota: pearson(rows.map(r => r.faltas), promedios),
      comparacion: ultimo && prev ? { de: prev.id, a: ultimo.id, mejoran, empeoran, igual } : null,
      histograma: histogram(promedios),
    };
    return { cfg, rows, stats };
  }

  const titleCase = s => (s || '').toLowerCase().replace(/(^|[\s\-'’.,])([a-záéíóúüñ])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y)\b/g, w => w.toLowerCase()).replace(/\s+,/g, ',').replace(/^./, c => c.toUpperCase());

  return { DEFAULTS, corteLabel, corteList, maxFaltas, ceil1, analyzeStudent, analyzeCourse, mean, median, sd, pearson, histogram, titleCase };
});
