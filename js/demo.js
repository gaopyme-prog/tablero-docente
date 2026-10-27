/* Datos de EJEMPLO 100% inventados (nombres y documentos ficticios) para probar la herramienta. */
(function (root) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const AP = ['Alvarez', 'Benitez', 'Castaño', 'Duarte', 'Escobar', 'Fuentes', 'Galindo', 'Herrera', 'Ibarra', 'Jimenez', 'Lozano', 'Mejia', 'Naranjo', 'Ospina', 'Pardo', 'Quintero', 'Ramirez', 'Soto', 'Torres', 'Uribe'];
  const NO = ['Ana María', 'Carlos Andrés', 'Diana', 'Elías', 'Fabiola', 'Gabriel', 'Hernán', 'Isabela', 'Julián', 'Karen', 'Laura', 'Mateo', 'Natalia', 'Óscar', 'Paula', 'Rafael', 'Sofía', 'Tomás'];
  const nota = (base, v) => Math.max(1, Math.min(5, Math.round((base + (rnd() - 0.5) * v) * 10) / 10));
  function curso(asig, cod, grupo, gcod, n, perfil) {
    const students = [];
    for (let i = 0; i < n; i++) {
      const base = perfil === 'fuerte' ? 3.9 + rnd() * 0.8 : 2.2 + rnd() * 2.2;
      const f1 = rnd() < (perfil === 'fuerte' ? 0.2 : 0.55) ? Math.floor(rnd() * (perfil === 'fuerte' ? 2 : 5)) : 0;
      const f2 = rnd() < (perfil === 'fuerte' ? 0.2 : 0.5) ? Math.floor(rnd() * (perfil === 'fuerte' ? 2 : 4)) : 0;
      students.push({
        dni: String(1000000000 + Math.floor(rnd() * 99999999)), nombre: `${pick(AP).toUpperCase()} ${pick(AP).toUpperCase()}, ${pick(NO).toUpperCase()}`,
        plan: '00D', exp: String(100 + i),
        cortes: { N1: { nota: nota(base, 1.4), faltas: f1 }, N2: { nota: nota(base - 0.2, 1.8), faltas: f2 }, N3: { nota: null, faltas: 0 } },
      });
    }
    students.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return { key: `${cod}|${gcod}|DEMO`, archivos: ['(ejemplo)'], students,
      meta: { asignatura: asig, codigo: cod, grupo, grupoCodigo: gcod, periodo: 'EJEMPLO', convocatoria: 'ORDINARIA', fecha: 'datos ficticios',
        cortes: [{ id: 'N1', peso: 30 }, { id: 'N2', peso: 30 }, { id: 'N3', peso: 40 }] } };
  }
  // Casos que muestran cada tipo de alerta
  const forzar = (c, i, n1, n2, fa, fb) => { const s = c.students[i]; s.cortes.N1 = { nota: n1, faltas: fa }; s.cortes.N2 = { nota: n2, faltas: fb }; };
  root.DemoData = () => {
    seed = 7; const A = curso('ASIGNATURA DE EJEMPLO A', '990001', 'GRUPO DIURNO', '000000001', 16, 'fuerte'), B = curso('ASIGNATURA DE EJEMPLO B', '990002', 'GRUPO NOCTURNO', '000000002', 18, 'mixto');
    forzar(A, 3, 4.1, 3.6, 3, 3);   // 6 faltas: en riesgo
    forzar(B, 1, 3.4, 3.0, 4, 4);   // 8 faltas: supera el límite
    forzar(B, 5, 2.9, 1.7, 3, 3);   // 6 faltas y necesita ~4.1
    forzar(B, 8, 1.5, 1.2, 1, 0);   // ya no alcanza a aprobar
    forzar(B, 11, 3.8, 3.5, 2, 3);  // 5 faltas
    return [A, B];
  };
})(window);
