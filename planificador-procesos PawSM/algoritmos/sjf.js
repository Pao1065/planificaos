/* ============================================================
   SJF — Shortest Job First
   Lógica: entre los procesos YA llegados, ejecutar el más corto
   Tipo: No apropiativo (una vez que empieza, termina)
   Devuelve: array de { proceso, duracion }
   ============================================================ */
function sjf(procesos) {
  // Copia para no mutar el original
  let pendientes = procesos.slice();
  const timeline = [];
  let tiempo = 0;

  while (pendientes.length > 0) {
    // Filtrar los que ya llegaron
    const disponibles = pendientes.filter(p => p.llegada <= tiempo);

    if (disponibles.length === 0) {
      // Nadie llegó todavía — CPU idle hasta el próximo proceso
      const siguiente = pendientes.reduce((min, p) =>
        p.llegada < min.llegada ? p : min
      );
      timeline.push({ proceso: 'idle', duracion: siguiente.llegada - tiempo });
      tiempo = siguiente.llegada;
      continue;
    }

    // Elegir el de menor tiempo de CPU entre los disponibles
    const elegido = disponibles.reduce((min, p) =>
      p.cpu < min.cpu ? p : min
    );

    // Ejecutar completo (no apropiativo)
    timeline.push({ proceso: elegido.nombre, duracion: elegido.cpu });
    tiempo += elegido.cpu;

    // Quitar de pendientes
    pendientes = pendientes.filter(p => p.nombre !== elegido.nombre);
  }

  return timeline;
}