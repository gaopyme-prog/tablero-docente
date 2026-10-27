/* Tablero Docente: interfaz. Todo ocurre en el navegador; no se envía ningún dato. */
(function () {
  'use strict';
  const { DEFAULTS, analyzeCourse, titleCase, corteLabel, corteList } = Analysis;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = v => (v == null ? '—' : v.toFixed(1));
  const f2 = v => (v == null ? '—' : v.toFixed(2));

  // Paleta institucional UNIPAZ (azul y verde del logo) + colores semánticos de alerta
  const C = { azul: '#233672', azulCl: '#8DA0D6', verde: '#00883A', verdeCl: '#7FC79B', rojo: '#B3261E', naranja: '#D9730D', ambar: '#E0A100', gris: '#8A8F9C' };
  const SEV = { critica: { label: 'Crítica', color: C.rojo }, alta: { label: 'Alta', color: C.naranja }, media: { label: 'Atención', color: C.ambar }, ok: { label: 'Sin alerta', color: C.verde } };
  const CORTE_COLORS = [C.azul, C.verde, C.azulCl, C.verdeCl];

  const state = { actas: [], cursos: [], demo: false, active: '__all__', just: {}, anon: false, sort: { col: 'sev', dir: -1 }, sev: '', q: '', charts: {}, an: {} };

  // ---------- Parámetros por asignatura (se recuerdan en el navegador; no contienen datos de estudiantes)
  const cfgKey = c => 'tablero.cfg.' + c.meta.codigo;
  function getCfg(c) {
    const base = Object.assign({}, DEFAULTS, c.meta.horas ? { horas: c.meta.horas } : {});
    try { return Object.assign(base, JSON.parse(localStorage.getItem(cfgKey(c)) || '{}')); } catch (e) { return base; }
  }
  function setCfg(c, cfg) { try { localStorage.setItem(cfgKey(c), JSON.stringify(cfg)); } catch (e) { /* modo privado */ } }

  // ---------- Carga de archivos
  const log = (msg, cls) => { const li = document.createElement('li'); li.className = cls || ''; li.textContent = msg; $('#log').appendChild(li); };
  const isPdf = f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
  const isXls = f => /\.(xlsx|xls|csv)$/i.test(f.name);
  async function handleFiles(files) {
    $('#log').innerHTML = ''; state.demo = false;
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    let ok = 0;
    for (const f of files) {
      try {
        let nuevas;
        if (isPdf(f)) nuevas = [await Parser.readPdf(new Uint8Array(await f.arrayBuffer()), pdfjsLib, f.name)];
        else if (isXls(f)) nuevas = ExcelIO.parseWorkbook(XLSX, new Uint8Array(await f.arrayBuffer()), f.name);
        else { log(`✗ ${f.name}: formato no admitido. Usa PDF (acta de UNIPAZ) o Excel (.xlsx, .xls, .csv).`, 'err'); continue; }
        for (const acta of nuevas) {
          state.actas.push(acta); ok++;
          log(`✓ ${f.name}: ${titleCase(acta.meta.asignatura)} · ${titleCase(acta.meta.grupo || '')} · ${acta.students.length} estudiantes`, 'ok');
          (acta.warnings || []).slice(0, 6).forEach(w => log(`   ⚠ ${w}`, 'warn')); 
        }
      } catch (e) {
        const extra = isPdf(f) ? ' Si tu PDF es de otro sistema, pasa tus notas a la plantilla de Excel.' : '';
        log(`✗ ${f.name}: ${e.message || 'no se pudo leer'}${extra}`, 'err');
      }
    }
    if (ok) buildFromActas();
  }
  function buildFromActas() {
    const m = Parser.mergeActas(state.actas);
    state.cursos = m.cursos;
    if (m.duplicados) log(`ℹ ${m.duplicados} registro(s) repetido(s) (el mismo acta subida más de una vez) se contaron una sola vez.`, 'warn');
    afterLoad();
  }
  function afterLoad() {
    $('#app').hidden = false; $('#btnClear').hidden = false;
    if (!state.cursos.some(c => c.key === state.active)) state.active = state.cursos.length > 1 ? '__all__' : (state.cursos[0] && state.cursos[0].key);
    render();
  }

  // ---------- Cálculo
  function recompute() { state.an = {}; for (const c of state.cursos) state.an[c.key] = analyzeCourse(c, getCfg(c), state.just[c.key]); }
  const cursoName = c => `${titleCase(c.meta.asignatura)}`;
  const dispName = (r, i) => (state.anon ? `Estudiante ${String(i + 1).padStart(2, '0')}` : titleCase(r.nombre));
  function shortName(r, i) {
    if (state.anon) return 'Est. ' + String(i + 1).padStart(2, '0');
    const [ap, no] = titleCase(r.nombre).split(',').map(s => (s || '').trim());
    return `${(ap || '').split(' ')[0]}, ${(no || '').split(' ')[0]}`.replace(/,\s*$/, '');
  }

  // ---------- Render principal
  function render() {
    recompute();
    Object.values(state.charts).forEach(ch => ch.destroy()); state.charts = {};
    renderTabs();
    if (state.active === '__all__') renderSummary(); else renderCourse(state.cursos.find(c => c.key === state.active));
  }
  function renderTabs() {
    const tabs = [];
    if (state.cursos.length > 1) tabs.push(`<button class="tab" role="tab" data-k="__all__" aria-selected="${state.active === '__all__'}">Resumen general</button>`);
    for (const c of state.cursos) {
      const a = state.an[c.key]; const n = a.stats.sevCount.critica + a.stats.sevCount.alta;
      tabs.push(`<button class="tab" role="tab" data-k="${esc(c.key)}" aria-selected="${state.active === c.key}">${esc(cursoName(c))} <small>· ${esc(titleCase(c.meta.grupo || ''))}${n ? ` · ⚠ ${n}` : ''}</small></button>`);
    }
    $('#tabs').innerHTML = tabs.join('');
  }

  // ---------- Resumen general (varias asignaturas)
  function renderSummary() {
    const rowsAll = state.cursos.flatMap(c => state.an[c.key].rows.map((r, i) => ({ c, r, i })));
    const tot = k => rowsAll.filter(x => x.r.severidad === k).length;
    const perd = rowsAll.filter(x => x.r.asistencia === 'perdida').length, ries = rowsAll.filter(x => x.r.asistencia === 'riesgo').length;
    let html = `<div class="head"><div><h2>Resumen general</h2><p>${state.cursos.length} asignaturas · ${rowsAll.length} estudiantes${state.demo ? ' · <b>datos de ejemplo</b>' : ''}</p></div>${toolbarExport()}</div>`;
    html += `<div class="kpis">
      <div class="kpi"><b>${rowsAll.length}</b><span>Estudiantes</span></div>
      <div class="kpi rojo"><b>${tot('critica')}</b><span>Alertas críticas</span></div>
      <div class="kpi nar"><b>${tot('alta')}</b><span>Alertas altas</span></div>
      <div class="kpi nar"><b>${perd}</b><span>Superan el límite de faltas</span></div>
      <div class="kpi"><b>${ries}</b><span>En riesgo por faltas</span></div></div>`;
    html += `<h2 class="sec">Asignaturas</h2><div class="card"><div class="tablewrap"><table><thead><tr><th>Asignatura</th><th>Grupo</th><th>Estudiantes</th><th>Promedio</th><th>Crítica</th><th>Alta</th><th>Atención</th><th>Sin alerta</th><th>Pierden por faltas</th><th>En riesgo faltas</th></tr></thead><tbody>`;
    for (const c of state.cursos) {
      const s = state.an[c.key].stats;
      html += `<tr><td><a href="#" data-go="${esc(c.key)}">${esc(cursoName(c))}</a></td><td>${esc(titleCase(c.meta.grupo || ''))}</td><td>${s.n}</td><td>${f2(s.promedioGrupo)}</td>
        <td>${s.sevCount.critica}</td><td>${s.sevCount.alta}</td><td>${s.sevCount.media}</td><td>${s.sevCount.ok}</td><td>${s.asistPerdida}</td><td>${s.asistRiesgo}</td></tr>`;
    }
    html += `</tbody></table></div></div>`;
    html += `<h2 class="sec">Gráficos</h2><div class="charts"><div class="card"><h3>Alertas por asignatura</h3><div class="cbox" style="height:300px"><canvas id="chSevCursos"></canvas></div></div>
      <div class="card"><h3>Promedio actual del grupo por asignatura</h3><div class="cbox" style="height:300px"><canvas id="chProm"></canvas></div></div></div>`;
    html += `<h2 class="sec">Estudiantes con alerta crítica o alta</h2>` + alertsHtml(rowsAll.filter(x => x.r.sevNum >= 2), true);
    $('#view').innerHTML = html;
    const labels = state.cursos.map(c => cursoName(c) + ' · ' + titleCase((c.meta.grupo || '').replace(/^GRUPO\s*/i, '')));
    chart('chSevCursos', { type: 'bar', data: { labels, datasets: ['critica', 'alta', 'media', 'ok'].map(k => ({ label: SEV[k].label, data: state.cursos.map(c => state.an[c.key].stats.sevCount[k]), backgroundColor: SEV[k].color })) },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'Estudiantes' }, ticks: { precision: 0 } } } } });
    chart('chProm', { type: 'bar', data: { labels, datasets: [{ label: 'Promedio', data: state.cursos.map(c => state.an[c.key].stats.promedioGrupo), backgroundColor: C.azul }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, lineMarker: { lines: [{ axis: 'y', value: 3, color: C.rojo, label: '3.0' }] } }, scales: { y: { min: 0, max: 5 } } } });
    wireCommon();
  }

  // ---------- Vista de una asignatura
  function renderCourse(c) {
    const a = state.an[c.key], s = a.stats, cfg = a.cfg;
    const pend = c.meta.cortes.filter(x => a.rows.some(r => r.pendientes.includes(x.id)));
    const sig = pend.length ? pend[0].id : null;
    let html = `<div class="head"><div><h2>${esc(cursoName(c))} <small style="color:var(--txt2);font-weight:500">· ${esc(titleCase(c.meta.grupo || ''))} (${esc(c.meta.codigo)})</small></h2>
      <p>${[c.meta.periodo, titleCase(c.meta.convocatoria || ''), c.meta.origen === 'excel' ? 'datos cargados desde Excel' : (c.meta.fecha ? 'acta del ' + c.meta.fecha : ''), 'pesos: ' + c.meta.cortes.map(x => `${corteLabel(x.id)} ${x.peso}%`).join(' · ')].filter(Boolean).map(esc).join(' · ')}${state.demo ? ' · <b>datos de ejemplo</b>' : ''}</p></div>${toolbarExport()}</div>`;
    html += paramsHtml(cfg);
    html += `<div class="kpis">
      <div class="kpi"><b>${s.n}</b><span>Estudiantes</span></div>
      <div class="kpi ver"><b>${f2(s.promedioGrupo)}</b><span>Promedio actual del grupo</span></div>
      <div class="kpi rojo"><b>${s.sevCount.critica}</b><span>Alertas críticas</span></div>
      <div class="kpi nar"><b>${s.sevCount.alta}</b><span>Alertas altas</span></div>
      <div class="kpi nar"><b>${s.asistPerdida}</b><span>Superan el límite de faltas</span></div>
      <div class="kpi"><b>${s.asistRiesgo}</b><span>En riesgo por faltas</span></div></div>`;
    const withAlert = a.rows.map((r, i) => ({ c, r, i })).filter(x => x.r.sevNum >= 1).sort((x, y) => y.r.sevNum - x.r.sevNum);
    html += `<h2 class="sec">Alertas (${withAlert.length})</h2>` + alertsHtml(withAlert, false);
    html += `<h2 class="sec">Detalle por estudiante</h2><div class="card">
      <div class="tools no-print"><input type="search" id="q" placeholder="Buscar nombre o documento" value="${esc(state.q)}">
      <select id="fsev"><option value="">Todas las alertas</option>${['critica', 'alta', 'media', 'ok'].map(k => `<option value="${k}" ${state.sev === k ? 'selected' : ''}>${SEV[k].label}</option>`).join('')}</select>
      <label><input type="checkbox" id="anon" ${state.anon ? 'checked' : ''}> Ocultar nombres (para proyectar)</label></div>
      <div class="tablewrap"><table id="tbl"></table></div>
      <p class="hint">Marca "Justificada" cuando el estudiante presente enfermedad o fuerza mayor comprobada: el límite sube al ${cfg.limiteJustificado}%.</p></div>`;
    html += `<h2 class="sec">Gráficos</h2><div class="charts">
      <div class="card"><h3>Faltas vs. límite permitido</h3><div class="cbox" id="bx1"><canvas id="ch1"></canvas></div></div>
      <div class="card"><h3>${sig ? `Nota mínima necesaria en ${corteLabel(sig)}` : 'Definitiva por estudiante'}</h3><div class="cbox" id="bx3"><canvas id="ch3"></canvas></div></div>
      <div class="card"><h3>Notas por corte (ordenadas por promedio)</h3><div class="cbox" id="bx2"><canvas id="ch2"></canvas></div></div>
      <div class="card"><h3>Mapa de riesgo: faltas vs. nota mínima</h3><div class="cbox" style="height:380px"><canvas id="ch4"></canvas></div></div>
      <div class="card"><h3>Distribución de alertas</h3><div class="cbox" style="height:320px"><canvas id="ch5"></canvas></div></div>
      <div class="card"><h3>Distribución de promedios</h3><div class="cbox" style="height:320px"><canvas id="ch6"></canvas></div></div>
      <div class="card"><h3>Promedio del grupo por corte</h3><div class="cbox" style="height:320px"><canvas id="ch7"></canvas></div></div></div>`;
    html += `<h2 class="sec">Estadística del grupo</h2>` + statsHtml(c, a);
    $('#view').innerHTML = html;
    drawTable(c); drawCharts(c, a, sig); wireCommon(); wireCourse(c);
  }

  const toolbarExport = () => `<div class="row no-print"><button class="btn azul sm" data-act="xlsx">⬇ Excel</button><button class="btn ghost sm" data-act="csv">⬇ CSV</button><button class="btn ghost sm" data-act="print">🖨 Imprimir / PDF</button></div>`;

  function paramsHtml(cfg) {
    const f = (k, l, step, min, max) => `<label>${l}<input type="number" data-p="${k}" value="${cfg[k]}" step="${step}" min="${min}" ${max ? `max="${max}"` : ''}></label>`;
    return `<details class="params no-print" ${state.paramsOpen ? 'open' : ''}><summary>Parámetros de esta asignatura</summary><div class="params-grid">
      ${f('horas', 'Intensidad horaria total (horas)', 1, 1)}${f('limite', 'Límite de inasistencia (%)', 1, 1, 100)}${f('limiteJustificado', 'Límite con justificación (%)', 1, 1, 100)}
      ${f('aprobatoria', 'Nota aprobatoria', 0.1, 0, 5)}${f('alertaQuedan', 'Alertar si quedan ≤ (faltas)', 1, 0)}${f('notaExigente', 'Nota "exigente" desde', 0.1, 0, 5)}</div>
      <p class="hint">⚠ La intensidad horaria <b>no viene en el acta</b>: confírmala para esta asignatura (por defecto ${DEFAULTS.horas} h). Se recuerda en este navegador.</p></details>`;
  }

  function alertsHtml(list, showCurso) {
    if (!list.length) return `<div class="empty">✓ Ningún estudiante con alertas con los parámetros actuales.</div>`;
    list = list.slice().sort((x, y) => y.r.sevNum - x.r.sevNum || x.r.faltas - y.r.faltas);
    return `<div class="alerts">` + list.map(({ c, r, i }, k) => `<div class="al ${r.severidad}">
      <div class="who"><strong>${esc(dispName(r, i))}</strong><span class="badge b-${r.severidad}">${SEV[r.severidad].label}</span></div>
      ${showCurso ? `<small style="color:var(--txt2)">${esc(cursoName(c))} · ${esc(titleCase(c.meta.grupo || ''))}</small>` : ''}
      <ul>${r.motivos.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
      <div class="acts no-print"><button class="btn ghost sm" data-copy="${esc(c.key)}::${i}">Copiar aviso</button>
      <label><input type="checkbox" data-just="${esc(c.key)}::${esc(r.dni)}" ${r.justificado ? 'checked' : ''}> Justificada</label></div></div>`).join('') + `</div>`;
  }

  // ---------- Tabla
  function drawTable(c) {
    const a = state.an[c.key]; const cortes = c.meta.cortes;
    const sigId = (cortes.find(x => a.rows.some(r => r.pendientes.includes(x.id))) || {}).id;
    let list = a.rows.map((r, i) => ({ r, i }));
    if (state.sev) list = list.filter(x => x.r.severidad === state.sev);
    const q = state.q.trim().toLowerCase(); if (q) list = list.filter(x => x.r.nombre.toLowerCase().includes(q) || x.r.dni.includes(q));
    const keyFn = { nombre: x => x.r.nombre, faltas: x => x.r.faltas, pct: x => x.r.pct, quedan: x => x.r.quedan, acum: x => x.r.acumulado, need: x => (x.r.need == null ? -99 : x.r.need), sev: x => x.r.sevNum * 1000 + x.r.faltas + (x.r.need || 0) };
    cortes.forEach(k => { keyFn['n:' + k.id] = x => (x.r.notas[k.id] == null ? -1 : x.r.notas[k.id]); });
    const kf = keyFn[state.sort.col] || keyFn.sev;
    list.sort((x, y) => { const a1 = kf(x), b1 = kf(y); const d = typeof a1 === 'string' ? a1.localeCompare(b1, 'es') : a1 - b1; return d * state.sort.dir; });
    const th = (col, label) => `<th data-col="${col}" class="${state.sort.col === col ? 'sorted' : ''}" data-dir="${state.sort.dir > 0 ? '▲' : '▼'}">${label}</th>`;
    let h = `<thead><tr>${th('nombre', 'Estudiante')}${cortes.map(k => th('n:' + k.id, `${corteLabel(k.id)} <small>${k.peso}%</small>`)).join('')}${th('faltas', 'Faltas')}${th('pct', '% inasist.')}${th('quedan', 'Le quedan')}<th>Asistencia</th>${th('acum', 'Acumulado')}${th('need', sigId ? `Nota mín. ${corteLabel(sigId)}` : 'Definitiva')}<th>Estado nota</th>${th('sev', 'Alerta')}<th>Justificada</th></tr></thead><tbody>`;
    const asisB = { ok: ['b-ok', 'Normal'], riesgo: ['b-alta', 'En riesgo'], perdida: ['b-critica', 'Pierde (0.0)'] };
    const notaB = { aprobada: ['b-ok', 'Aprobada'], reprobada: ['b-critica', 'Reprobada'], asegurada: ['b-ok', 'Ya aprobó'], normal: ['b-gris', 'Normal'], exigente: ['b-media', 'Exigente'], critica: ['b-alta', 'Crítica'], imposible: ['b-critica', 'No alcanza'] };
    for (const { r, i } of list) {
      const needCell = r.pendientes.length ? `<b class="${r.nota === 'critica' || r.nota === 'imposible' ? 'low' : ''}">${esc(r.needLabel)}</b>` : f2(r.definitiva);
      h += `<tr><td>${esc(dispName(r, i))}</td>${cortes.map(k => `<td class="${r.notas[k.id] != null && r.notas[k.id] < a.cfg.aprobatoria ? 'low' : ''}">${f1(r.notas[k.id])}</td>`).join('')}
        <td>${r.faltas}</td><td>${r.pct.toFixed(1)}%</td><td class="${r.quedan < 0 ? 'low' : ''}">${r.quedan}</td><td><span class="badge ${asisB[r.asistencia][0]}">${asisB[r.asistencia][1]}</span></td>
        <td>${f2(r.acumulado)}</td><td>${needCell}</td><td><span class="badge ${notaB[r.nota][0]}">${notaB[r.nota][1]}</span></td>
        <td><span class="badge b-${r.severidad}">${SEV[r.severidad].label}</span></td>
        <td><input type="checkbox" data-just="${esc(c.key)}::${esc(r.dni)}" ${r.justificado ? 'checked' : ''} aria-label="Justificada"></td></tr>`;
    }
    $('#tbl').innerHTML = h + '</tbody>';
  }

  // ---------- Estadística
  function statsHtml(c, a) {
    const s = a.stats, cfg = a.cfg;
    const rows = s.porCorte.filter(p => p.n > 0).map(p => `<tr><td>${corteLabel(p.id)} <small>${p.peso}%</small></td><td>${p.n}</td><td>${f2(p.media)}</td><td>${f2(p.mediana)}</td><td>${f2(p.desv)}</td><td>${f1(p.min)}</td><td>${f1(p.max)}</td><td>${p.n ? Math.round(p.aprueban / p.n * 100) : 0}%</td></tr>`).join('');
    const r = s.correlFaltasNota; let corr = 'Sin datos suficientes.';
    if (r != null) { const ab = Math.abs(r); const fz = ab < .2 ? 'prácticamente nula' : ab < .4 ? 'débil' : ab < .6 ? 'moderada' : 'fuerte'; corr = `r = ${r.toFixed(2)} (${fz}${ab >= .2 ? (r < 0 ? ': a más faltas, menor promedio' : ': a más faltas, mayor promedio') : ''})`; }
    const cmp = s.comparacion ? `${s.comparacion.mejoran} mejoraron · ${s.comparacion.empeoran} bajaron · ${s.comparacion.igual} igual (${corteLabel(s.comparacion.de)} → ${corteLabel(s.comparacion.a)})` : '—';
    return `<div class="stat-grid"><div class="card"><h3>Notas por corte</h3><div class="tablewrap"><table><thead><tr><th>Corte</th><th>n</th><th>Media</th><th>Mediana</th><th>Desv.</th><th>Mín.</th><th>Máx.</th><th>≥ ${cfg.aprobatoria.toFixed(1)}</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div class="card"><h3>Resumen del grupo</h3><ul class="stat-list">
        <li><span>Promedio actual (ponderado)</span><b>${f2(s.promedioGrupo)}</b></li><li><span>Mediana / desviación estándar</span><b>${f2(s.medianaGrupo)} / ${f2(s.desvGrupo)}</b></li>
        <li><span>Con promedio ≥ ${cfg.aprobatoria.toFixed(1)} hoy</span><b>${s.sobreAprobatoria} de ${s.n}</b></li>
        <li><span>Faltas: promedio por estudiante / total</span><b>${f2(s.faltasMedia)} / ${s.faltasTotal}</b></li><li><span>Estudiantes sin ninguna falta</span><b>${s.sinFaltas}</b></li>
        <li><span>Ya no alcanzan a aprobar</span><b>${s.notaImposible}</b></li><li><span>Necesitan ≥ ${cfg.notaExigente.toFixed(1)} para aprobar</span><b>${s.notaCritica}</b></li>
        <li><span>Evolución entre cortes</span><b style="text-align:right">${cmp}</b></li>
        <li><span>Correlación faltas ↔ promedio</span><b style="text-align:right">${corr}</b></li></ul>
        ${s.n < 30 ? '<p class="hint">Con pocos estudiantes la correlación es solo orientativa.</p>' : ''}</div></div>`;
  }

  // ---------- Gráficos
  const lineMarker = { id: 'lineMarker', afterDatasetsDraw(ch, _a, o) {
    if (!o || !o.lines) return; const { ctx, chartArea, scales } = ch;
    for (const l of o.lines) { const ax = l.axis === 'y' ? scales.y : scales.x; if (!ax) continue; const p = ax.getPixelForValue(l.value);
      ctx.save(); ctx.strokeStyle = l.color || C.rojo; ctx.fillStyle = l.color || C.rojo; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.beginPath();
      if (l.axis === 'y') { ctx.moveTo(chartArea.left, p); ctx.lineTo(chartArea.right, p); } else { ctx.moveTo(p, chartArea.top); ctx.lineTo(p, chartArea.bottom); }
      ctx.stroke(); ctx.setLineDash([]); ctx.font = '600 11px system-ui';
      if (l.label) {
        const w = ctx.measureText(l.label).width;
        if (l.axis === 'y') ctx.fillText(l.label, chartArea.left + 6, p - 4);                       // a la izquierda, sobre la línea
        else { const x = p + 5 + w > chartArea.right ? p - w - 5 : p + 5; ctx.fillText(l.label, x, chartArea.bottom - 6); } // abajo, sin salirse del gráfico
      }
      ctx.restore(); } } };
  Chart.register(lineMarker);
  Chart.defaults.font.family = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'; Chart.defaults.color = '#3a4150';
  function chart(id, cfg) { const el = document.getElementById(id); if (!el) return; if (state.charts[id]) state.charts[id].destroy(); state.charts[id] = new Chart(el, cfg); }
  const boxH = (id, n, per, min) => { const b = document.getElementById(id); if (b) b.style.height = Math.max(min || 280, n * per + 70) + 'px'; };
  const asisColor = r => r.asistencia === 'perdida' ? C.rojo : r.asistencia === 'riesgo' ? C.naranja : r.pct >= r.limitePct * 2 / 3 ? C.ambar : C.verde;

  function drawCharts(c, a, sig) {
    const rows = a.rows.map((r, i) => ({ r, i })), cfg = a.cfg, n = rows.length;
    // 1 Faltas vs límite
    const o1 = rows.slice().sort((x, y) => y.r.faltas - x.r.faltas); boxH('bx1', n, 24);
    chart('ch1', { type: 'bar', data: { labels: o1.map(x => shortName(x.r, x.i)), datasets: [{ data: o1.map(x => x.r.faltas), backgroundColor: o1.map(x => asisColor(x.r)) }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, lineMarker: { lines: [{ axis: 'x', value: Analysis.maxFaltas(cfg.horas, cfg.limite) + 0.5, label: `Límite ${cfg.limite}% (${Analysis.maxFaltas(cfg.horas, cfg.limite)} faltas)` }] },
        tooltip: { callbacks: { label: t => { const r = o1[t.dataIndex].r; return `${r.faltas} falta(s) · ${r.pct.toFixed(1)}% · le quedan ${r.quedan}`; } } } }, scales: { x: { title: { display: true, text: 'Faltas acumuladas' }, ticks: { precision: 0 }, suggestedMax: Analysis.maxFaltas(cfg.horas, cfg.limite) + 2 } } } });
    // 3 Nota mínima (o definitiva)
    boxH('bx3', n, 24);
    if (sig) {
      const o3 = rows.filter(x => x.r.pendientes.length).sort((x, y) => (y.r.need ?? 0) - (x.r.need ?? 0));
      chart('ch3', { type: 'bar', data: { labels: o3.map(x => shortName(x.r, x.i)), datasets: [{ data: o3.map(x => Math.max(0, Math.min(cfg.notaMax, x.r.need))), backgroundColor: o3.map(x => ({ imposible: C.rojo, critica: C.naranja, exigente: C.ambar, normal: C.azul, asegurada: C.verde })[x.r.nota]) }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, lineMarker: { lines: [{ axis: 'x', value: cfg.notaExigente, color: C.naranja, label: `${cfg.notaExigente.toFixed(1)} exigente` }] },
          tooltip: { callbacks: { label: t => { const r = o3[t.dataIndex].r; return `Necesita ${r.needLabel} en ${corteList(r.pendientes)}`; } } } }, scales: { x: { min: 0, max: cfg.notaMax, title: { display: true, text: `Nota mínima en ${corteLabel(sig)} para llegar a ${cfg.aprobatoria.toFixed(1)}` } } } } });
    } else {
      const o3 = rows.slice().sort((x, y) => y.r.definitiva - x.r.definitiva);
      chart('ch3', { type: 'bar', data: { labels: o3.map(x => shortName(x.r, x.i)), datasets: [{ data: o3.map(x => x.r.definitiva), backgroundColor: o3.map(x => x.r.nota === 'aprobada' ? C.verde : C.rojo) }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, lineMarker: { lines: [{ axis: 'x', value: cfg.aprobatoria, label: cfg.aprobatoria.toFixed(1) }] } }, scales: { x: { min: 0, max: 5 } } } });
    }
    // 2 Notas por corte
    const o2 = rows.slice().sort((x, y) => (x.r.promedioActual ?? 0) - (y.r.promedioActual ?? 0)); boxH('bx2', 0, 0, 340);
    const graded = c.meta.cortes.filter(k => a.stats.porCorte.find(p => p.id === k.id).n > 0);
    chart('ch2', { type: 'bar', data: { labels: o2.map(x => shortName(x.r, x.i)), datasets: graded.map((k, j) => ({ label: `${corteLabel(k.id)} (${k.peso}%)`, data: o2.map(x => x.r.notas[k.id]), backgroundColor: CORTE_COLORS[j % 4] })) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { lineMarker: { lines: [{ axis: 'y', value: cfg.aprobatoria, label: cfg.aprobatoria.toFixed(1) }] } }, scales: { y: { min: 0, max: 5 }, x: { ticks: { maxRotation: 60, minRotation: 45, autoSkip: false } } } } });
    // 4 Mapa de riesgo
    const pts = rows.filter(x => x.r.need != null);
    chart('ch4', { type: 'scatter', data: { datasets: [{ data: pts.map(x => ({ x: x.r.faltas, y: Math.max(0, Math.min(cfg.notaMax + 0.15, x.r.need)), k: x })), pointRadius: 7, pointHoverRadius: 9, backgroundColor: pts.map(x => SEV[x.r.severidad].color) }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, lineMarker: { lines: [{ axis: 'x', value: Analysis.maxFaltas(cfg.horas, cfg.limite) + 0.5, label: 'Límite de faltas' }, { axis: 'y', value: cfg.notaExigente, color: C.naranja, label: 'Exigente' }] },
        tooltip: { callbacks: { label: t => { const k = t.raw.k; return `${dispName(k.r, k.i)}: ${k.r.faltas} faltas, nota mín. ${k.r.needLabel}`; } } } },
        scales: { x: { title: { display: true, text: 'Faltas acumuladas' }, min: -1, ticks: { stepSize: 1, callback: v => (v >= 0 && Number.isInteger(v) ? v : '') } }, y: { title: { display: true, text: `Nota mínima en ${sig ? corteLabel(sig) : 'lo que falta'}` }, min: 0, max: cfg.notaMax + 0.5, ticks: { stepSize: 1, callback: v => (v <= cfg.notaMax ? v : '') } } } } });
    // 5 Distribución de alertas
    const sc = a.stats.sevCount;
    chart('ch5', { type: 'doughnut', data: { labels: ['critica', 'alta', 'media', 'ok'].map(k => `${SEV[k].label} (${sc[k]})`), datasets: [{ data: ['critica', 'alta', 'media', 'ok'].map(k => sc[k]), backgroundColor: ['critica', 'alta', 'media', 'ok'].map(k => SEV[k].color) }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } });
    // 6 Histograma
    chart('ch6', { type: 'bar', data: { labels: a.stats.histograma.map(b => `${b.from.toFixed(1)}–${b.to.toFixed(1)}`), datasets: [{ data: a.stats.histograma.map(b => b.n), backgroundColor: a.stats.histograma.map(b => (b.to <= cfg.aprobatoria ? C.naranja : C.azul)) }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 }, title: { display: true, text: 'Estudiantes' } }, x: { title: { display: true, text: 'Promedio actual' } } } } });
    // 7 Promedio por corte
    const pc = a.stats.porCorte.filter(p => p.n > 0);
    chart('ch7', { type: 'bar', data: { labels: pc.map(p => corteLabel(p.id)), datasets: [{ label: 'Media', data: pc.map(p => p.media), backgroundColor: C.azul }, { label: 'Mediana', data: pc.map(p => p.mediana), backgroundColor: C.verde }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { lineMarker: { lines: [{ axis: 'y', value: cfg.aprobatoria, label: cfg.aprobatoria.toFixed(1) }] } }, scales: { y: { min: 0, max: 5 } } } });
  }

  // ---------- Interacciones
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); return Promise.resolve();
  }
  function avisoText(c, i) {
    const r = state.an[c.key].rows[i], cfg = state.an[c.key].cfg; const nombre = titleCase((r.nombre.split(',')[1] || r.nombre).trim().split(' ')[0]);
    const p = [`Hola ${nombre}, te escribo por la asignatura ${titleCase(c.meta.asignatura)} (${titleCase(c.meta.grupo || '')}).`];
    p.push(`Llevas ${r.faltas} ${r.faltas === 1 ? 'falta' : 'faltas'} (${r.pct.toFixed(1)}% de la intensidad horaria). Según el Art. 34 del reglamento estudiantil, superar el ${cfg.limite}% sin justificación implica perder la asignatura (máximo ${maxF(r)} faltas).`);
    if (r.asistencia === 'perdida') p.push(r.recuperable ? 'Ya superaste ese límite; si tienes una justificación válida (enfermedad o fuerza mayor) debes presentarla dentro de los 5 días hábiles siguientes ante la coordinación académica.' : 'Por favor acércate a la coordinación académica para revisar tu situación.');
    else if (r.asistencia === 'riesgo') p.push(`Te ${r.quedan === 1 ? 'queda 1 falta' : `quedan ${r.quedan} faltas`} antes de llegar al límite. Es importante que no vuelvas a faltar.`);
    if (r.pendientes.length && r.nota !== 'asegurada') p.push(r.nota === 'imposible' ? `Con las notas actuales ya no alcanzas la nota aprobatoria (${cfg.aprobatoria.toFixed(1)}). Hablemos de las opciones disponibles.` : `Para aprobar necesitas al menos ${r.needLabel} en ${corteList(r.pendientes)}.`);
    p.push('Quedo atento para ayudarte.'); return p.join('\n\n');
  }
  const maxF = r => r.max;

  function wireCommon() {
    $('#view').querySelectorAll('[data-act]').forEach(b => b.onclick = () => ({ xlsx: exportXlsx, csv: exportCsv, print: () => window.print() })[b.dataset.act]());
    $('#view').querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); state.active = a.dataset.go; render(); window.scrollTo(0, 0); });
    $('#view').querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { const [k, i] = b.dataset.copy.split('::'); const c = state.cursos.find(x => x.key === k); copy(avisoText(c, +i)).then(() => { const t = b.textContent; b.textContent = '¡Copiado!'; setTimeout(() => (b.textContent = t), 1400); }); });
    $('#view').querySelectorAll('[data-just]').forEach(cb => cb.onchange = () => { const [k, dni] = cb.dataset.just.split('::'); (state.just[k] = state.just[k] || {})[dni] = cb.checked; const y = window.scrollY; render(); window.scrollTo(0, y); });
  }
  function wireCourse(c) {
    $('#q').oninput = e => { state.q = e.target.value; drawTable(c); wireTableOnly(c); };
    $('#fsev').onchange = e => { state.sev = e.target.value; drawTable(c); wireTableOnly(c); };
    $('#anon').onchange = e => { state.anon = e.target.checked; render(); };
    document.querySelector('details.params').addEventListener('toggle', e => { state.paramsOpen = e.target.open; });
    document.querySelectorAll('[data-p]').forEach(inp => inp.onchange = () => {
      const cfg = getCfg(c); const v = parseFloat(inp.value); if (!Number.isFinite(v) || v < 0) { inp.value = cfg[inp.dataset.p]; return; }
      cfg[inp.dataset.p] = v; setCfg(c, cfg); const y = window.scrollY; render(); window.scrollTo(0, y);
    });
    wireTableOnly(c);
  }
  function wireTableOnly(c) {
    $('#tbl').querySelectorAll('th[data-col]').forEach(th => th.onclick = () => { const col = th.dataset.col; state.sort = { col, dir: state.sort.col === col ? -state.sort.dir : (col === 'nombre' ? 1 : -1) }; drawTable(c); wireTableOnly(c); });
    $('#tbl').querySelectorAll('[data-just]').forEach(cb => cb.onchange = () => { const [k, dni] = cb.dataset.just.split('::'); (state.just[k] = state.just[k] || {})[dni] = cb.checked; const y = window.scrollY; render(); window.scrollTo(0, y); });
  }

  // ---------- Exportación
  function courseRows(c) {
    const a = state.an[c.key]; const cortes = c.meta.cortes;
    const sig = (cortes.find(x => a.rows.some(r => r.pendientes.includes(x.id))) || {}).id;
    const head = ['Documento', 'Estudiante', ...cortes.map(k => `${corteLabel(k.id)} (${k.peso}%)`), 'Faltas', '% inasistencia', 'Faltas máx. permitidas', 'Le quedan', 'Justificada', 'Estado asistencia', 'Acumulado ponderado', sig ? `Nota mínima ${corteLabel(sig)}` : 'Definitiva', 'Estado nota', 'Alerta', 'Motivos'];
    const lab = { ok: 'Normal', riesgo: 'En riesgo', perdida: 'PIERDE (0.0)' };
    const body = a.rows.map((r, i) => [r.dni, state.anon ? dispName(r, i) : titleCase(r.nombre), ...cortes.map(k => r.notas[k.id]), r.faltas, +r.pct.toFixed(1), r.max, r.quedan, r.justificado ? 'Sí' : 'No', lab[r.asistencia], +r.acumulado.toFixed(2),
      r.pendientes.length ? r.needLabel : +r.definitiva.toFixed(2), r.nota, SEV[r.severidad].label, r.motivos.join(' | ')]);
    return [head, ...body];
  }
  const today = () => new Date().toISOString().slice(0, 10);
  function exportXlsx() {
    const wb = XLSX.utils.book_new();
    const res = [['Asignatura', 'Grupo', 'Estudiantes', 'Promedio', 'Crítica', 'Alta', 'Atención', 'Sin alerta', 'Pierden por faltas', 'En riesgo faltas', 'Intensidad horaria usada']];
    state.cursos.forEach(c => { const s = state.an[c.key].stats; res.push([titleCase(c.meta.asignatura), titleCase(c.meta.grupo || ''), s.n, s.promedioGrupo == null ? '' : +s.promedioGrupo.toFixed(2), s.sevCount.critica, s.sevCount.alta, s.sevCount.media, s.sevCount.ok, s.asistPerdida, s.asistRiesgo, state.an[c.key].cfg.horas]); });
    const w0 = XLSX.utils.aoa_to_sheet(res); w0['!cols'] = res[0].map(() => ({ wch: 18 })); XLSX.utils.book_append_sheet(wb, w0, 'Resumen');
    const used = new Set();
    state.cursos.forEach(c => { const rows = courseRows(c); const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = rows[0].map((_, j) => ({ wch: j === 1 ? 34 : j === rows[0].length - 1 ? 70 : 14 }));
      let nm = titleCase(c.meta.asignatura).replace(/[\\/?*\[\]:]/g, '').slice(0, 28); let k = 2, base = nm; while (used.has(nm)) nm = `${base.slice(0, 25)} ${k++}`; used.add(nm); XLSX.utils.book_append_sheet(wb, ws, nm); });
    XLSX.writeFile(wb, `tablero-docente_${today()}.xlsx`);
  }
  function exportCsv() {
    const c = state.cursos.find(x => x.key === state.active) || state.cursos[0];
    const csv = courseRows(c).map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a');
    a.href = url; a.download = `${titleCase(c.meta.asignatura).replace(/\s+/g, '_')}_${today()}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  // ---------- Arranque
  const drop = $('#drop'), file = $('#file');
  file.onclick = e => e.stopPropagation();
  drop.onclick = () => file.click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
  file.onchange = () => { handleFiles([...file.files]); file.value = ''; };
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => handleFiles([...e.dataTransfer.files]));
  $('#tabs').onclick = e => { const b = e.target.closest('.tab'); if (!b) return; state.active = b.dataset.k; render(); };
  $('#btnDemo').onclick = () => { $('#log').innerHTML = ''; state.actas = []; state.just = {}; state.cursos = DemoData(); state.demo = true; log('ℹ Cargados datos de ejemplo (ficticios).', 'warn'); afterLoad(); };
  $('#btnTpl').onclick = () => XLSX.writeFile(ExcelIO.buildTemplate(XLSX), 'plantilla_notas_tablero_docente.xlsx');
  (function repoLink() { // si está publicado en GitHub Pages, enlaza al repositorio para proponer mejoras
    const h = location.hostname, m = /^([^.]+)\.github\.io$/.exec(h), repo = location.pathname.split('/')[1];
    if (m && repo) { const a = $('#repoLink'); a.href = `https://github.com/${m[1]}/${repo}`; a.hidden = false; }
  })();
  $('#btnClear').onclick = () => { state.actas = []; state.cursos = []; state.just = {}; state.q = ''; state.sev = ''; state.demo = false; $('#app').hidden = true; $('#btnClear').hidden = true; $('#log').innerHTML = ''; $('#view').innerHTML = ''; };
  window.__tablero = state; // útil para depuración y pruebas
  window.__tableroLoad = cursos => { state.cursos = cursos; state.actas = []; afterLoad(); };
})();
