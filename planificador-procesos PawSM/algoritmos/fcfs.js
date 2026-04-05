/* ============================================================
   FCFS — First Come First Served
   Lógica: ordenar por tiempo de llegada y ejecutar completo
   Tipo: No apropiativo (nadie interrumpe al proceso actual)
   Devuelve: array de { proceso, duracion }
   ============================================================ */
function fcfs(procesos) {
  // Ordenar por tiempo de llegada
  // Por qué slice(): no mutamos el array original
  const cola = procesos.slice().sort((a, b) => a.llegada - b.llegada);
  const timeline = [];
  let tiempo = 0;

  cola.forEach(p => {
    // Si el proceso llega después del tiempo actual, la CPU estuvo idle
    if (p.llegada > tiempo) {
      timeline.push({ proceso: 'idle', duracion: p.llegada - tiempo });
      tiempo = p.llegada;
    }
    // Ejecutar el proceso completo sin interrupciones
    timeline.push({ proceso: p.nombre, duracion: p.cpu });
    tiempo += p.cpu;
  });

  return timeline;
}