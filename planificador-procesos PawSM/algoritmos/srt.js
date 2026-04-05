/* ============================================================
   SRT — Shortest Remaining Time
   Lógica: en cada instante, ejecutar el que tiene MENOS
           tiempo restante. Si llega uno más corto → interrumpe.
   Tipo: Apropiativo (puede interrumpir al proceso actual)
   Devuelve: array de { proceso, duracion } (bloques comprimidos)
   ============================================================ */
function srt(procesos) {
  // Construir mapa de tiempo restante por proceso
  const restante = {};
  procesos.forEach(p => { restante[p.nombre] = p.cpu; });

  const timeline = [];
  let tiempo = 0;
  const duracionTotal = procesos.reduce((s, p) => s + p.cpu, 0);
  const llegadaMax    = Math.max(...procesos.map(p => p.llegada));
  const fin           = duracionTotal + llegadaMax + 1;

  let procesando = null; // proceso actual en CPU

  for (let t = 0; t <= fin; t++) {
    // Procesos disponibles en este instante
    const disponibles = procesos.filter(p =>
      p.llegada <= t && restante[p.nombre] > 0
    );

    if (disponibles.length === 0) {
      // CPU idle
      if (procesando !== null) procesando = null;
      agregarBloque(timeline, 'idle');
      continue;
    }

    // Elegir el de menor tiempo restante
    const elegido = disponibles.reduce((min, p) =>
      restante[p.nombre] < restante[min.nombre] ? p : min
    );

    // Ejecutar 1 unidad de tiempo
    agregarBloque(timeline, elegido.nombre);
    restante[elegido.nombre]--;

    // Verificar si todos terminaron
    const pendientes = procesos.filter(p => restante[p.nombre] > 0);
    if (pendientes.length === 0) break;
  }

  return comprimirTimeline(timeline);
}

/* Agrega 1 unidad al timeline sin comprimir */
function agregarBloque(timeline, proceso) {
  timeline.push({ proceso, duracion: 1 });
}

/* Comprime bloques consecutivos del mismo proceso
   Por qué: el Gantt queda más limpio con bloques grandes
   en vez de cientos de bloques de duracion=1 */
function comprimirTimeline(timeline) {
  if (timeline.length === 0) return [];
  const comprimido = [{ ...timeline[0] }];
  for (let i = 1; i < timeline.length; i++) {
    const ultimo = comprimido[comprimido.length - 1];
    if (ultimo.proceso === timeline[i].proceso) {
      ultimo.duracion++;
    } else {
      comprimido.push({ ...timeline[i] });
    }
  }
  return comprimido;
}