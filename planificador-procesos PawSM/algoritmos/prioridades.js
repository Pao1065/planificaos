/* ============================================================
   PRIORIDADES — Planificación por Prioridades
   Lógica: entre los disponibles, ejecutar el de menor número
           de prioridad (1 = más urgente, como en el PDF del inge)
   Tipo: No apropiativo (ejecuta completo una vez elegido)
   Devuelve: array de { proceso, duracion }
   ============================================================ */
function prioridades(procesos) {
  let pendientes = procesos.slice();
  const timeline = [];
  let tiempo = 0;

  while (pendientes.length > 0) {
    // Filtrar los que ya llegaron
    const disponibles = pendientes.filter(p => p.llegada <= tiempo);

    if (disponibles.length === 0) {
      // CPU idle hasta que llegue el próximo
      const siguiente = pendientes.reduce((min, p) =>
        p.llegada < min.llegada ? p : min
      );
      timeline.push({ proceso: 'idle', duracion: siguiente.llegada - tiempo });
      tiempo = siguiente.llegada;
      continue;
    }

    // Elegir el de MENOR número de prioridad (más urgente)
    // Desempate: si tienen la misma prioridad, FCFS (llegada)
    const elegido = disponibles.reduce((mejor, p) => {
      if (p.prioridad < mejor.prioridad) return p;
      if (p.prioridad === mejor.prioridad && p.llegada < mejor.llegada) return p;
      return mejor;
    });

    // Ejecutar completo
    timeline.push({ proceso: elegido.nombre, duracion: elegido.cpu });
    tiempo += elegido.cpu;

    // Quitar de pendientes
    pendientes = pendientes.filter(p => p.nombre !== elegido.nombre);
  }

  return timeline;
}