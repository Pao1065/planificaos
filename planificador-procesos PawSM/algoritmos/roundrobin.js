/* ============================================================
   ROUND ROBIN — RR
   Lógica: cada proceso recibe un quantum de tiempo.
           Si no termina, va al final de la cola circular.
   Tipo: Apropiativo (interrumpe cuando se acaba el quantum)
   Devuelve: array de { proceso, duracion }
   ============================================================ */
function roundRobin(procesos, quantum) {
  // Por qué quantum por parámetro: es configurable por el usuario
  const q = quantum || 3;

  // Copia con tiempo restante
  const trabajos = procesos
    .slice()
    .sort((a, b) => a.llegada - b.llegada)
    .map(p => ({ ...p, restante: p.cpu }));

  const timeline = [];
  const cola = [];          // cola circular de procesos listos
  let tiempo = 0;
  let indice = 0;           // índice en trabajos (llegadas)

  // Agregar procesos que llegan en t=0
  while (indice < trabajos.length && trabajos[indice].llegada <= tiempo) {
    cola.push(trabajos[indice]);
    indice++;
  }

  while (cola.length > 0) {
    const proceso = cola.shift(); // sacar del frente

    // Cuánto ejecuta: mínimo entre quantum y lo que le queda
    const ejecutar = Math.min(q, proceso.restante);

    timeline.push({ proceso: proceso.nombre, duracion: ejecutar });
    tiempo += ejecutar;
    proceso.restante -= ejecutar;

    // Agregar procesos que llegaron durante esta ejecución
    while (indice < trabajos.length && trabajos[indice].llegada <= tiempo) {
      cola.push(trabajos[indice]);
      indice++;
    }

    // Si el proceso no terminó, vuelve al final de la cola
    if (proceso.restante > 0) {
      cola.push(proceso);
    }

    // Si la cola quedó vacía pero aún hay procesos sin llegar
    if (cola.length === 0 && indice < trabajos.length) {
      // CPU idle hasta el próximo proceso
      const prox = trabajos[indice];
      timeline.push({ proceso: 'idle', duracion: prox.llegada - tiempo });
      tiempo = prox.llegada;
      cola.push(prox);
      indice++;
    }
  }

  return timeline;
}