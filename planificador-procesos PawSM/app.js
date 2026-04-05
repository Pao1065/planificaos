/* ============================================================
   PLANIFICAOS — app.js
   Cerebro del sistema: navegación, procesos, simulación,
   conexión con algoritmos, modo práctica
   ============================================================ */

/* ============================================================
   1. ESTADO GLOBAL
   Por qué: toda la app necesita acceder a estos datos,
   tenerlos en un objeto central evita bugs de variables sueltas
   ============================================================ */
const estado = {
  seccionActual: 'inicio',
  procesos: [],           // lista de procesos ingresados
  contadorProceso: 0,     // para nombrar A, B, C...
  algoActual: 'fcfs',     // algoritmo seleccionado
  quantum: 3,             // para Round Robin
  // Modo aprendizaje
  teoriaActual: 'fcfs',
  pasoActual: 0,
  totalPasos: 0,
  autoPlay: null,         // intervalo del modo automático
  // Modo práctica
  ejercicioActual: null,
  respuestaUsuario: [],
  procesoSeleccionado: null,
  estrellas: 0,
  nivel: 1,
  comodines: 3,
  // Samy
  sonidoActivo: true,
};

/* ============================================================
   2. COLORES por proceso (se reusan cíclicamente)
   ============================================================ */
const COLORES = [
  '#00ffaa', '#4488ff', '#ffaa00', '#ff6688',
  '#aa66ff', '#00ddff', '#ffdd44', '#66ff66'
];

/* ============================================================
   3. NAVEGACIÓN ENTRE SECCIONES
   Por qué display:none/block: más simple que rutas,
   perfecto para una SPA educativa sin servidor
   ============================================================ */
function mostrarSeccion(nombre) {
  // Ocultar todas las secciones
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
  // Mostrar la pedida
  document.getElementById('seccion-' + nombre).classList.add('activa');
  // Actualizar botones del nav
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => {
    if (b.textContent.toLowerCase().includes(nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase()) ||
        b.getAttribute('onclick')?.includes(nombre)) {
      b.classList.add('active');
    }
  });
  estado.seccionActual = nombre;
  // Acciones especiales al entrar a cada sección
  if (nombre === 'aprende') cargarTeoria(estado.teoriaActual);
  if (nombre === 'practica') iniciarPractica();
  if (nombre === 'simula' && estado.procesos.length === 0) inicializarProcesos();
}

/* ============================================================
   4. GESTIÓN DE PROCESOS
   ============================================================ */
const LETRAS = ['A','B','C','D','E','F','G','H'];

function inicializarProcesos() {
  // Procesos de ejemplo como en el PDF del inge
  estado.procesos = [
    { id: 0, nombre: 'A', cpu: 2, llegada: 0, prioridad: 2 },
    { id: 1, nombre: 'B', cpu: 4, llegada: 1, prioridad: 3 },
    { id: 2, nombre: 'C', cpu: 6, llegada: 2, prioridad: 1 },
  ];
  estado.contadorProceso = 3;
  renderizarProcesos();
}

function renderizarProcesos() {
  const lista = document.getElementById('lista-procesos');
  lista.innerHTML = '';
  estado.procesos.forEach((p, i) => {
    const fila = document.createElement('div');
    fila.className = 'proceso-fila';
    fila.innerHTML = `
      <span class="nombre-proceso" style="color:${COLORES[i % COLORES.length]}">${p.nombre}</span>
      <input type="number" value="${p.cpu}"      min="1" max="99"
             onchange="actualizarProceso(${i},'cpu',this.value)"       title="Tiempo CPU"/>
      <input type="number" value="${p.llegada}"  min="0" max="99"
             onchange="actualizarProceso(${i},'llegada',this.value)"   title="Tiempo llegada"/>
      <input type="number" value="${p.prioridad}" min="1" max="10"
             onchange="actualizarProceso(${i},'prioridad',this.value)" title="Prioridad (1=mayor)"/>
      <button class="btn-eliminar" onclick="eliminarProceso(${i})" title="Eliminar">✕</button>
    `;
    lista.appendChild(fila);
  });
}

function agregarProceso() {
  if (estado.procesos.length >= 8) {
    samyAlerta('¡Máximo 8 procesos! Con más de 8 el Gantt se vuelve ilegible.');
    return;
  }
  const nombre = LETRAS[estado.contadorProceso % LETRAS.length];
  estado.procesos.push({
    id: estado.contadorProceso,
    nombre,
    cpu: 3,
    llegada: 0,
    prioridad: 1
  });
  estado.contadorProceso++;
  renderizarProcesos();
  reproducirSonido('pop');
}

function eliminarProceso(i) {
  if (estado.procesos.length <= 1) {
    samyAlerta('Necesitás al menos un proceso para simular.');
    return;
  }
  estado.procesos.splice(i, 1);
  renderizarProcesos();
}

function actualizarProceso(i, campo, valor) {
  estado.procesos[i][campo] = parseInt(valor) || 0;
}

function actualizarCampos() {
  const algo = document.querySelector('input[name="algo-sim"]:checked')?.value || 'fcfs';
  estado.algoActual = algo;
  const qCampo = document.getElementById('quantum-campo');
  // El quantum solo aparece en Round Robin
  if (algo === 'rr') {
    qCampo.classList.remove('hidden');
    samyHabla('Round Robin necesita un quantum: cuánto tiempo máximo puede usar la CPU cada proceso antes de ceder el turno.');
  } else {
    qCampo.classList.add('hidden');
  }
}

function limpiarSimulacion() {
  document.getElementById('gantt-container').innerHTML =
    '<div class="gantt-placeholder"><span>El diagrama aparecerá aquí después de simular</span></div>';
  document.getElementById('metricas-container').classList.add('hidden');
  samyNormal();
}

/* ============================================================
   5. EJECUTAR SIMULACIÓN
   Por qué separado: cada algoritmo es una función pura
   que recibe procesos y devuelve un timeline. App.js solo
   muestra el resultado, no calcula nada.
   ============================================================ */
function ejecutarSimulacion() {
  if (estado.procesos.length === 0) {
    samyAlerta('No hay procesos. Agregá al menos uno antes de simular.');
    return;
  }
  const invalido = estado.procesos.find(p => p.cpu <= 0);
  if (invalido) {
    samyAlerta(`El proceso ${invalido.nombre} tiene tiempo CPU 0. Todos necesitan al menos 1ms.`);
    return;
  }

  const { algo1, algo2, mezcla } = obtenerAlgoritmos();
  const quantum = parseInt(document.getElementById('quantum-val')?.value) || 3;
  const procesos = estado.procesos.map(p => ({ ...p }));

  let timeline = [];
  let etiqueta = '';

  try {
    if (mezcla) {
      // Verificar compatibilidad antes de simular
      if (!verificarCompatibilidad(algo1, algo2)) return;
      const key = `${algo1}-${algo2}`;
      const resultado = MATRIZ_MEZCLA[key];
      if (resultado?.tipo === 'no') {
        samyAlerta(resultado.msg);
        return;
      }
      timeline = ejecutarMezcla(procesos, algo1, algo2, quantum);
      etiqueta = `${algo1.toUpperCase()} + ${algo2.toUpperCase()}`;
    } else {
      timeline = ejecutarUno(algo1, procesos, quantum);
      etiqueta = algo1.toUpperCase();
    }
  } catch(e) {
    samyAlerta('Ocurrió un error al simular: ' + e.message);
    return;
  }

  dibujarGantt(timeline, procesos, etiqueta);
  calcularMetricas(timeline, procesos);
  samyExplicarResultado(algo1, timeline, procesos, mezcla ? algo2 : null);
  reproducirSonido('success');
}

/* ============================================================
   6. DIBUJAR GANTT ANIMADO
   El Gantt se construye celda por celda con un delay
   para que el estudiante vea el proceso en tiempo real
   ============================================================ */
function dibujarGantt(timeline, procesos, algo) {
  const container = document.getElementById('gantt-container');
  container.innerHTML = '';

  // Calcular duración total
  const duracion = timeline.reduce((s, t) => s + t.duracion, 0);
  const anchoBase = Math.min(Math.max(Math.floor(580 / duracion), 28), 56);

  // Una fila por proceso + fila de ejecución global
  const filaEjecucion = document.createElement('div');
  filaEjecucion.style.cssText = 'margin-bottom:6px;';

  const labelEjec = document.createElement('div');
  labelEjec.className = 'gantt-fila-label';
  labelEjec.innerHTML = `<span class="gantt-nombre" style="font-size:10px;color:var(--texto-apagado)">CPU</span><div class="gantt-bloques" id="bloques-cpu"></div>`;
  filaEjecucion.appendChild(labelEjec);
  container.appendChild(filaEjecucion);

  // Escala de tiempo
  const escalaDiv = document.createElement('div');
  escalaDiv.className = 'gantt-escala';
  escalaDiv.id = 'gantt-escala';
  container.appendChild(escalaDiv);

  // Filas individuales por proceso
  procesos.forEach((p, i) => {
    const fila = document.createElement('div');
    fila.style.cssText = 'margin-top:8px;';
    fila.innerHTML = `
      <div class="gantt-fila-label">
        <span class="gantt-nombre" style="color:${COLORES[i % COLORES.length]}">${p.nombre}</span>
        <div class="gantt-bloques" id="bloques-${p.nombre}"></div>
      </div>`;
    container.appendChild(fila);
  });

  // Animar bloque por bloque
  let tiempo = 0;
  let idx = 0;

  function animarBloque() {
    if (idx >= timeline.length) {
      // Dibujar escala al terminar
      dibujarEscala(timeline, anchoBase);
      samyContenta();
      return;
    }
    const bloque = timeline[idx];

    // Bloque en la fila CPU
    for (let t = 0; t < bloque.duracion; t++) {
      const cel = document.createElement('div');
      cel.className = 'gantt-bloque';
      cel.style.width = anchoBase + 'px';
      if (bloque.proceso === 'idle') {
        cel.classList.add('idle');
        cel.textContent = '—';
      } else {
        const pi = procesos.findIndex(p => p.nombre === bloque.proceso);
        cel.style.background = COLORES[pi % COLORES.length];
        cel.textContent = bloque.proceso;
        cel.title = `${bloque.proceso} | t=${tiempo + t}`;
      }
      document.getElementById('bloques-cpu')?.appendChild(cel);
    }

    // Bloque en la fila del proceso correspondiente
    if (bloque.proceso !== 'idle') {
      procesos.forEach((p, i) => {
        const contenedor = document.getElementById('bloques-' + p.nombre);
        if (!contenedor) return;
        for (let t = 0; t < bloque.duracion; t++) {
          const cel = document.createElement('div');
          cel.className = 'gantt-bloque';
          cel.style.width = anchoBase + 'px';
          if (p.nombre === bloque.proceso) {
            cel.style.background = COLORES[i % COLORES.length];
            cel.textContent = p.nombre;
          } else {
            // Este proceso estaba esperando
            cel.classList.add('idle');
            cel.style.background = 'transparent';
            cel.style.border = '1px dashed var(--negro-borde)';
          }
          contenedor.appendChild(cel);
        }
      });
    }

    tiempo += bloque.duracion;
    idx++;
    setTimeout(animarBloque, 180); // 180ms entre bloques = animación visible
  }

  animarBloque();
}

function dibujarEscala(timeline, anchoBase) {
  const esc = document.getElementById('gantt-escala');
  if (!esc) return;
  esc.innerHTML = '';
  // Espacio para la etiqueta del proceso
  const spacer = document.createElement('div');
  spacer.style.width = '36px';
  esc.appendChild(spacer);

  let t = 0;
  timeline.forEach(bloque => {
    const tick = document.createElement('div');
    tick.className = 'gantt-tick';
    tick.style.width = (anchoBase * bloque.duracion) + 'px';
    tick.textContent = t;
    esc.appendChild(tick);
    t += bloque.duracion;
  });
  // Tick final
  const last = document.createElement('div');
  last.className = 'gantt-tick';
  last.textContent = t;
  esc.appendChild(last);
}

/* ============================================================
   7. CALCULAR MÉTRICAS
   Tiempo de espera = inicio - llegada (para no-preemptivos)
   Tiempo de retorno = fin - llegada
   ============================================================ */
function calcularMetricas(timeline, procesos) {
  const container = document.getElementById('metricas-container');
  const tbody = document.getElementById('metricas-body');
  const tfoot = document.getElementById('metricas-foot');
  container.classList.remove('hidden');
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  // Calcular inicio y fin por proceso desde el timeline
  const info = {};
  procesos.forEach(p => {
    info[p.nombre] = { inicio: Infinity, fin: 0 };
  });

  let t = 0;
  timeline.forEach(bloque => {
    if (bloque.proceso !== 'idle' && info[bloque.proceso]) {
      info[bloque.proceso].inicio = Math.min(info[bloque.proceso].inicio, t);
      info[bloque.proceso].fin    = Math.max(info[bloque.proceso].fin,    t + bloque.duracion);
    }
    t += bloque.duracion;
  });

  let sumEspera = 0, sumRetorno = 0;

  procesos.forEach((p, i) => {
    const d = info[p.nombre];
    if (d.inicio === Infinity) return;
    const espera   = d.inicio - p.llegada;
    const retorno  = d.fin    - p.llegada;
    sumEspera  += espera;
    sumRetorno += retorno;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:${COLORES[i % COLORES.length]};font-weight:600">${p.nombre}</td>
      <td>${p.llegada}</td>
      <td>${p.cpu}</td>
      <td>${d.inicio}</td>
      <td>${d.fin}</td>
      <td>${espera}</td>
      <td>${retorno}</td>
    `;
    tbody.appendChild(tr);
  });

  const n = procesos.length;
  tfoot.innerHTML = `
    <tr>
      <td colspan="5" style="text-align:right;color:var(--texto-apagado)">Promedios:</td>
      <td>${(sumEspera / n).toFixed(2)}</td>
      <td>${(sumRetorno / n).toFixed(2)}</td>
    </tr>
  `;
}

/* ============================================================
   8. MODO APRENDIZAJE — teoría paso a paso
   ============================================================ */
const TEORIA = {
  fcfs: {
    nombre: 'FCFS — First Come First Served',
    tipo: 'No apropiativo',
    descripcion: 'El proceso que llega primero es el primero en ejecutarse. Simple como una fila de banco.',
    ventajas: ['Muy fácil de implementar', 'Sin inanición (todos eventualmente ejecutan)', 'Justo en orden de llegada'],
    desventajas: ['Convoy effect: procesos cortos esperan detrás de largos', 'No considera prioridades ni duración'],
    restriccion: null,
    pasos: [
      { titulo: 'Los procesos llegan', desc: 'Cada proceso tiene un tiempo de llegada. FCFS los ordena exactamente por ese tiempo.', highlight: [] },
      { titulo: 'Ordenar por llegada', desc: 'Se forma una cola: el que llegó primero está al frente. Si dos llegan al mismo tiempo, se usa el orden alfabético.', highlight: ['A'] },
      { titulo: 'Ejecutar A completo', desc: 'El proceso A tomó la CPU. En FCFS nadie lo puede interrumpir. Corre hasta terminar.', highlight: ['A'] },
      { titulo: 'Ejecutar B completo', desc: 'Ahora le toca a B. Aunque C ya llegó, B llegó antes.', highlight: ['B'] },
      { titulo: 'Ejecutar C completo', desc: 'Finalmente C. El Gantt quedó: A→B→C.', highlight: ['C'] },
      { titulo: 'Calcular métricas', desc: 'Tiempo de espera = inicio − llegada. Tiempo de retorno = fin − llegada. FCFS puede tener espera alta si hay procesos largos primero.', highlight: [] },
    ],
    ejemplo: { procesos: [{n:'A',cpu:2,llegada:0},{n:'B',cpu:4,llegada:1},{n:'C',cpu:6,llegada:2}] }
  },
  sjf: {
    nombre: 'SJF — Shortest Job First',
    tipo: 'No apropiativo',
    descripcion: 'Entre los procesos disponibles, ejecuta primero el que tiene menor tiempo de CPU. Minimiza el tiempo promedio de espera.',
    ventajas: ['Tiempo de espera promedio mínimo', 'Eficiente para lotes de procesos'],
    desventajas: ['Inanición: procesos largos pueden esperar indefinidamente', 'Necesita conocer el tiempo de CPU de antemano'],
    restriccion: null,
    pasos: [
      { titulo: '¿Quiénes están disponibles?', desc: 'En t=0 solo llegó A. No hay opción, A ejecuta primero aunque dure más.', highlight: ['A'] },
      { titulo: 'A termina, ¿quién sigue?', desc: 'En t=2 llegaron B (cpu=4) y C (cpu=6). El más corto es B.', highlight: ['B'] },
      { titulo: 'B termina, sigue C', desc: 'Solo queda C. Ejecuta hasta terminar.', highlight: ['C'] },
      { titulo: 'SJF vs FCFS', desc: 'Con estos procesos coincide, pero con más procesos SJF elige siempre el más corto disponible, reduciendo la espera promedio.', highlight: [] },
    ],
    ejemplo: { procesos: [{n:'A',cpu:2,llegada:0},{n:'B',cpu:4,llegada:1},{n:'C',cpu:6,llegada:2}] }
  },
  srt: {
    nombre: 'SRT — Shortest Remaining Time',
    tipo: 'Apropiativo',
    descripcion: 'Versión apropiativa de SJF. Si llega un proceso con menos tiempo restante que el actual, lo interrumpe. El más corto siempre gana.',
    ventajas: ['Mínimo tiempo de espera promedio teórico', 'Respuesta rápida para procesos cortos'],
    desventajas: ['Inanición de procesos largos', 'Overhead por cambios de contexto frecuentes', 'Necesita conocer tiempos de CPU'],
    restriccion: 'No se puede mezclar con FCFS ni Prioridades No Apropiativas',
    pasos: [
      { titulo: 'Apropiativo = puede interrumpir', desc: 'A diferencia de SJF, SRT revisa en cada instante si hay alguien más corto. Si lo hay, interrumpe al actual.', highlight: [] },
      { titulo: 'C llega en t=0, tiene cpu=6', desc: 'C ejecuta porque es el único. Tiempo restante de C: 6.', highlight: ['C'] },
      { titulo: 'B llega en t=1 con cpu=4', desc: 'Restante de C=5, restante de B=4. B es más corto → interrumpe a C!', highlight: ['B'] },
      { titulo: 'A llega en t=2 con cpu=2', desc: 'Restante de B=3, restante de A=2. A interrumpe a B!', highlight: ['A'] },
      { titulo: 'A termina en t=4', desc: 'A fue el más corto, terminó primero. Ahora B tiene restante=3, C tiene restante=5. Sigue B.', highlight: ['A','B'] },
      { titulo: 'B termina, sigue C', desc: 'Finalmente C termina. Los cambios de contexto tienen costo, pero el tiempo promedio es óptimo.', highlight: ['C'] },
    ],
    ejemplo: { procesos: [{n:'A',cpu:2,llegada:2},{n:'B',cpu:4,llegada:1},{n:'C',cpu:6,llegada:0}] }
  },
  prioridades: {
    nombre: 'Planificación por Prioridades',
    tipo: 'No apropiativo (esta variante)',
    descripcion: 'Cada proceso tiene una prioridad. El de mayor prioridad (número más bajo = más urgente) ejecuta primero.',
    ventajas: ['Permite diferenciar urgencia de procesos', 'Flexible: el sistema puede asignar prioridades dinámicamente'],
    desventajas: ['Inanición: procesos de baja prioridad nunca ejecutan', 'Solución: envejecimiento (aumentar prioridad con el tiempo)'],
    restriccion: null,
    pasos: [
      { titulo: 'Prioridad 1 = más urgente', desc: 'La prioridad más baja numéricamente es la más importante. Como en una sala de emergencias.', highlight: [] },
      { titulo: 'C tiene prioridad 1 — va primero', desc: 'Aunque C llegó después, su prioridad 1 lo pone al frente de la cola.', highlight: ['C'] },
      { titulo: 'A tiene prioridad 2 — segundo', desc: 'Con C terminado, A tiene la siguiente mejor prioridad.', highlight: ['A'] },
      { titulo: 'B tiene prioridad 3 — último', desc: 'B espera hasta que todos los de mayor prioridad terminen.', highlight: ['B'] },
      { titulo: 'Riesgo de inanición', desc: 'Si siguen llegando procesos de alta prioridad, B nunca ejecuta. El envejecimiento soluciona esto aumentando la prioridad de los que esperan mucho.', highlight: [] },
    ],
    ejemplo: { procesos: [{n:'A',cpu:2,llegada:0,prioridad:2},{n:'B',cpu:4,llegada:0,prioridad:3},{n:'C',cpu:6,llegada:0,prioridad:1}] }
  },
  rr: {
    nombre: 'Round Robin (RR)',
    tipo: 'Apropiativo',
    descripcion: 'Cada proceso recibe un quantum de tiempo. Si no termina, va al final de la cola. Justo y democrático.',
    ventajas: ['Muy justo: todos reciben tiempo de CPU equitativamente', 'Sin inanición', 'Buena respuesta para sistemas interactivos'],
    desventajas: ['Si el quantum es muy pequeño: demasiados cambios de contexto', 'Si el quantum es muy grande: se comporta como FCFS'],
    restriccion: null,
    pasos: [
      { titulo: '¿Qué es el quantum?', desc: 'El quantum (cuanto) es el tiempo máximo que un proceso puede usar la CPU antes de ceder. En este ejemplo: 3ms.', highlight: [] },
      { titulo: 'A recibe 3ms de quantum', desc: 'A tiene cpu=2, termina antes del quantum. Libera la CPU en t=2.', highlight: ['A'] },
      { titulo: 'B recibe quantum', desc: 'B tiene cpu=4. Usa 3ms, queda con 1ms restante. Va al final de la cola.', highlight: ['B'] },
      { titulo: 'C recibe quantum', desc: 'C tiene cpu=6. Usa 3ms, queda con 3ms restante. Cola: [B(1), C(3)].', highlight: ['C'] },
      { titulo: 'B recibe su último quantum', desc: 'B solo necesita 1ms más. Termina. Cola: [C(3)].', highlight: ['B'] },
      { titulo: 'C termina', desc: 'C usa su último quantum de 3ms y termina. Todos ejecutaron de forma equitativa.', highlight: ['C'] },
    ],
    ejemplo: { procesos: [{n:'A',cpu:2,llegada:0},{n:'B',cpu:4,llegada:0},{n:'C',cpu:6,llegada:0}] }
  }
};

function cargarTeoria(algo) {
  estado.teoriaActual = algo;
  estado.pasoActual = 0;

  // Actualizar botones
  document.querySelectorAll('.algo-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.algo === algo);
  });

  const t = TEORIA[algo];
  if (!t) return;
  estado.totalPasos = t.pasos.length;

  // Panel de información
  const info = document.getElementById('teoria-info');
  info.innerHTML = `
    <span class="tag-tipo">${t.tipo}</span>
    <h3>${t.nombre}</h3>
    <p>${t.descripcion}</p>
    <p><strong style="color:var(--verde-claro)">Ventajas:</strong></p>
    <ul>${t.ventajas.map(v => `<li>${v}</li>`).join('')}</ul>
    <p style="margin-top:10px"><strong style="color:var(--texto-apagado)">Desventajas:</strong></p>
    <ul>${t.desventajas.map(d => `<li>${d}</li>`).join('')}</ul>
    ${t.restriccion ? `<p style="margin-top:12px;color:#ffaa44;font-size:13px">⚠️ ${t.restriccion}</p>` : ''}
  `;

  renderizarPaso(algo, 0);

  // Samy explica
  setTimeout(() => {
    samyHabla(`¡Vamos a aprender ${t.nombre.split('—')[0].trim()}! ${t.descripcion}`);
  }, 300);
}

function renderizarPaso(algo, paso) {
  const t = TEORIA[algo];
  if (!t || paso >= t.pasos.length) return;
  const p = t.pasos[paso];

  document.getElementById('paso-indicador').textContent =
    `Paso ${paso + 1} / ${t.pasos.length}`;

  // Simular el algoritmo para el ejemplo
  const procs = t.ejemplo.procesos.map(x => ({
    nombre: x.n, cpu: x.cpu, llegada: x.llegada || 0,
    prioridad: x.prioridad || 1, id: x.n
  }));

  // Dibujar Gantt educativo del ejemplo
  const visual = document.getElementById('teoria-visual');
  visual.innerHTML = `
    <div style="margin-bottom:16px">
      <span style="font-family:var(--font-mono);font-size:12px;color:var(--texto-apagado)">
        Paso ${paso + 1}: 
      </span>
      <strong style="color:var(--cian);font-size:15px">${p.titulo}</strong>
      <p style="margin-top:8px;color:var(--texto-suave);font-size:14px">${p.desc}</p>
    </div>
    ${dibujarGanttEstatico(procs, algo, paso, t)}
    <div style="margin-top:16px">
      ${dibujarTablaEjemplo(procs)}
    </div>
  `;

  samyHabla(p.desc);
}

function dibujarGanttEstatico(procs, algo, paso, teoria) {
  // Simular el algoritmo completo
  let timeline = [];
  try {
    const copias = procs.map(p => ({ ...p, nombre: p.nombre, cpu: p.cpu, llegada: p.llegada, prioridad: p.prioridad }));
    switch (algo) {
      case 'fcfs':        timeline = fcfs(copias);           break;
      case 'sjf':         timeline = sjf(copias);            break;
      case 'srt':         timeline = srt(copias);            break;
      case 'prioridades': timeline = prioridades(copias);    break;
      case 'rr':          timeline = roundRobin(copias, 3);  break;
    }
  } catch(e) { return '<p style="color:var(--rojo)">Error al simular el ejemplo.</p>'; }

  if (!timeline.length) return '';

  const duracion = timeline.reduce((s,t) => s + t.duracion, 0);
  const ancho = Math.min(Math.max(Math.floor(400 / duracion), 28), 52);

  // Cuántos bloques mostrar según el paso
  const bloquesMostrar = Math.min(paso + 1, timeline.length);

  let html = '<div style="overflow-x:auto"><div style="display:flex;gap:1px;flex-wrap:nowrap;margin-bottom:4px">';
  let acum = 0;
  timeline.forEach((bloque, i) => {
    const visible = i < bloquesMostrar;
    const color = bloque.proceso === 'idle' ? 'var(--negro-borde)' :
      COLORES[procs.findIndex(p => p.nombre === bloque.proceso) % COLORES.length];

    for (let t = 0; t < bloque.duracion; t++) {
      html += `
        <div style="
          width:${ancho}px;height:36px;border-radius:4px;
          background:${visible ? color : 'var(--negro-panel)'};
          border:1px solid ${visible ? color : 'var(--negro-borde)'};
          display:flex;align-items:center;justify-content:center;
          font-family:var(--font-mono);font-size:12px;font-weight:600;
          color:${visible ? 'var(--negro)' : 'var(--texto-apagado)'};
          opacity:${visible ? 1 : 0.3};
          transition:all 0.3s;
        ">${visible && bloque.proceso !== 'idle' ? bloque.proceso : (visible ? '—' : '?')}</div>
      `;
    }
    acum += bloque.duracion;
  });
  html += '</div>';

  // Escala de tiempo
  html += '<div style="display:flex;gap:1px">';
  acum = 0;
  timeline.forEach((bloque, i) => {
    html += `<div style="width:${ancho * bloque.duracion}px;font-family:var(--font-mono);font-size:10px;color:var(--texto-apagado);text-align:left">${acum}</div>`;
    acum += bloque.duracion;
  });
  html += `<div style="font-family:var(--font-mono);font-size:10px;color:var(--texto-apagado)">${acum}</div>`;
  html += '</div></div>';
  return html;
}

function dibujarTablaEjemplo(procs) {
  let html = `
    <table style="border-collapse:collapse;font-family:var(--font-mono);font-size:12px;width:100%">
    <tr>
      <th style="padding:4px 12px;background:var(--negro-panel);color:var(--texto-apagado);border:1px solid var(--negro-borde)">Proceso</th>
      <th style="padding:4px 12px;background:var(--negro-panel);color:var(--texto-apagado);border:1px solid var(--negro-borde)">CPU</th>
      <th style="padding:4px 12px;background:var(--negro-panel);color:var(--texto-apagado);border:1px solid var(--negro-borde)">Llegada</th>
      ${procs[0].prioridad !== undefined ? '<th style="padding:4px 12px;background:var(--negro-panel);color:var(--texto-apagado);border:1px solid var(--negro-borde)">Prioridad</th>' : ''}
    </tr>`;
  procs.forEach((p, i) => {
    const color = COLORES[i % COLORES.length];
    html += `<tr>
      <td style="padding:4px 12px;border:1px solid var(--negro-borde);color:${color};font-weight:600">${p.nombre}</td>
      <td style="padding:4px 12px;border:1px solid var(--negro-borde);color:var(--texto-suave)">${p.cpu}</td>
      <td style="padding:4px 12px;border:1px solid var(--negro-borde);color:var(--texto-suave)">${p.llegada}</td>
      ${p.prioridad !== undefined ? `<td style="padding:4px 12px;border:1px solid var(--negro-borde);color:var(--texto-suave)">${p.prioridad}</td>` : ''}
    </tr>`;
  });
  html += '</table>';
  return html;
}

function pasoSiguiente() {
  if (estado.pasoActual < estado.totalPasos - 1) {
    estado.pasoActual++;
    renderizarPaso(estado.teoriaActual, estado.pasoActual);
    reproducirSonido('click');
  } else {
    samyContenta();
    samyHabla('¡Completaste todos los pasos! Ya entendés cómo funciona este algoritmo. ¡Ahora probalo en el simulador!');
  }
}

function pasoAnterior() {
  if (estado.pasoActual > 0) {
    estado.pasoActual--;
    renderizarPaso(estado.teoriaActual, estado.pasoActual);
    reproducirSonido('click');
  }
}

function reproducirAuto() {
  if (estado.autoPlay) {
    clearInterval(estado.autoPlay);
    estado.autoPlay = null;
    return;
  }
  estado.autoPlay = setInterval(() => {
    if (estado.pasoActual < estado.totalPasos - 1) {
      pasoSiguiente();
    } else {
      clearInterval(estado.autoPlay);
      estado.autoPlay = null;
    }
  }, 2500);
}

/* ============================================================
   9. MODO PRÁCTICA / JUEGO
   ============================================================ */
const EJERCICIOS = [
  /* ── NIVEL 1: FCFS ── */
  {
    titulo: 'Ejercicio 1 — FCFS Básico', algo: 'fcfs', nivel: 1,
    procesos: [{n:'A',cpu:3,llegada:0},{n:'B',cpu:2,llegada:1},{n:'C',cpu:4,llegada:2}],
    descripcion: 'Armá el Gantt usando FCFS. El primero en llegar es el primero en ejecutar. ¡Sin interrupciones!'
  },
  {
    titulo: 'Ejercicio 2 — FCFS con CPU idle', algo: 'fcfs', nivel: 1,
    procesos: [{n:'A',cpu:2,llegada:0},{n:'B',cpu:3,llegada:5},{n:'C',cpu:2,llegada:8}],
    descripcion: 'FCFS con llegadas tardías. ¡Ojo! La CPU puede quedar idle entre procesos si nadie llegó todavía.'
  },
  {
    titulo: 'Ejercicio 3 — FCFS con 4 procesos', algo: 'fcfs', nivel: 1,
    procesos: [{n:'A',cpu:4,llegada:0},{n:'B',cpu:2,llegada:1},{n:'C',cpu:3,llegada:2},{n:'D',cpu:1,llegada:3}],
    descripcion: 'FCFS con cuatro procesos. Ordená por tiempo de llegada y ejecutá completo cada uno.'
  },

  /* ── NIVEL 2: SJF ── */
  {
    titulo: 'Ejercicio 4 — SJF Clásico', algo: 'sjf', nivel: 2,
    procesos: [{n:'A',cpu:6,llegada:0},{n:'B',cpu:2,llegada:0},{n:'C',cpu:4,llegada:0}],
    descripcion: 'Todos llegan en t=0. SJF: entre los disponibles, siempre ejecuta el de menor tiempo de CPU.'
  },
  {
    titulo: 'Ejercicio 5 — SJF con llegadas', algo: 'sjf', nivel: 2,
    procesos: [{n:'A',cpu:7,llegada:0},{n:'B',cpu:2,llegada:2},{n:'C',cpu:4,llegada:4},{n:'D',cpu:1,llegada:5}],
    descripcion: 'SJF no apropiativo. A empieza solo, pero cuando terminan llegan más. ¿Cuál tiene menos CPU disponible?'
  },
  {
    titulo: 'Ejercicio 6 — SJF empate', algo: 'sjf', nivel: 2,
    procesos: [{n:'A',cpu:3,llegada:0},{n:'B',cpu:3,llegada:0},{n:'C',cpu:3,llegada:0}],
    descripcion: 'Todos tienen el mismo CPU y llegan juntos. En empate SJF usa FCFS. ¿Cómo queda el orden?'
  },

  /* ── NIVEL 3: SRT ── */
  {
    titulo: 'Ejercicio 7 — SRT Básico', algo: 'srt', nivel: 3,
    procesos: [{n:'A',cpu:6,llegada:0},{n:'B',cpu:2,llegada:2},{n:'C',cpu:4,llegada:4}],
    descripcion: 'SRT es apropiativo. Si llega uno más corto que el restante del actual, lo interrumpe. ¡Ojo con los cambios!'
  },
  {
    titulo: 'Ejercicio 8 — SRT múltiples interrupciones', algo: 'srt', nivel: 3,
    procesos: [{n:'A',cpu:8,llegada:0},{n:'B',cpu:4,llegada:1},{n:'C',cpu:2,llegada:2},{n:'D',cpu:1,llegada:3}],
    descripcion: 'SRT con 4 procesos. Cada nueva llegada puede interrumpir. ¡Seguí el tiempo restante de cada uno!'
  },

  /* ── NIVEL 3: PRIORIDADES ── */
  {
    titulo: 'Ejercicio 9 — Prioridades Básico', algo: 'prioridades', nivel: 3,
    procesos: [{n:'A',cpu:3,llegada:0,prioridad:2},{n:'B',cpu:2,llegada:0,prioridad:1},{n:'C',cpu:4,llegada:0,prioridad:3}],
    descripcion: 'Prioridad 1 = más urgente. Todos llegan juntos. ¿Quién ejecuta primero?'
  },
  {
    titulo: 'Ejercicio 10 — Prioridades con llegadas', algo: 'prioridades', nivel: 3,
    procesos: [{n:'A',cpu:4,llegada:0,prioridad:3},{n:'B',cpu:3,llegada:2,prioridad:1},{n:'C',cpu:2,llegada:4,prioridad:2}],
    descripcion: 'Prioridades no apropiativo. A empieza solo pero después llegan B y C con mayor prioridad. ¿Terminan o esperan?'
  },

  /* ── NIVEL 4: ROUND ROBIN ── */
  {
    titulo: 'Ejercicio 11 — RR quantum=2', algo: 'rr', nivel: 4,
    procesos: [{n:'A',cpu:4,llegada:0},{n:'B',cpu:3,llegada:0},{n:'C',cpu:5,llegada:0}],
    descripcion: 'Round Robin con quantum=2. Cada proceso recibe 2ms, si no termina vuelve al final. ¡Contá las rondas!'
  },
  {
    titulo: 'Ejercicio 12 — RR quantum=3', algo: 'rr', nivel: 4,
    procesos: [{n:'A',cpu:2,llegada:0},{n:'B',cpu:4,llegada:0},{n:'C',cpu:6,llegada:0}],
    descripcion: 'Round Robin con quantum=3. Idéntico al ejemplo del PDF del inge. ¡Recordá que si termina antes del quantum, libera!'
  },
  {
    titulo: 'Ejercicio 13 — RR con llegadas tardías', algo: 'rr', nivel: 4,
    procesos: [{n:'A',cpu:3,llegada:0},{n:'B',cpu:5,llegada:2},{n:'C',cpu:2,llegada:4}],
    descripcion: 'RR con llegadas en diferentes momentos. Los que llegan se agregan al final de la cola cuando es su turno.'
  },

  /* ── NIVEL 5: MEZCLAS ── */
  {
    titulo: 'Ejercicio 14 — Prioridades + FCFS', algo: 'prioridades', nivel: 5,
    procesos: [{n:'A',cpu:3,llegada:0,prioridad:2},{n:'B',cpu:2,llegada:0,prioridad:2},{n:'C',cpu:4,llegada:0,prioridad:1}],
    descripcion: '¡Nivel experto! C tiene prioridad 1 (va primero). A y B tienen la misma prioridad → desempate por FCFS (llegada).'
  },
  {
    titulo: 'Ejercicio 15 — SJF + Prioridades', algo: 'sjf', nivel: 5,
    procesos: [{n:'A',cpu:4,llegada:0,prioridad:1},{n:'B',cpu:4,llegada:0,prioridad:2},{n:'C',cpu:2,llegada:0,prioridad:1}],
    descripcion: '¡Desafío final! C y A tienen igual prioridad pero C es más corto → SJF desempata. ¿Podés armar el Gantt correcto?'
  },
];

let ejercicioIdx = 0;

function iniciarPractica() {
  actualizarHUD();
  cargarEjercicio(EJERCICIOS[ejercicioIdx % EJERCICIOS.length]);
}

function cargarEjercicio(ej) {
  estado.ejercicioActual = ej;
  estado.respuestaUsuario = [];
  estado.procesoSeleccionado = null;

  // Calcular la respuesta correcta
  const procs = ej.procesos.map(p => ({
    nombre: p.n, cpu: p.cpu, llegada: p.llegada || 0, prioridad: p.prioridad || 1
  }));
  let timeline = [];
  try {
    switch (ej.algo) {
      case 'fcfs':        timeline = fcfs(procs);              break;
      case 'sjf':         timeline = sjf(procs);               break;
      case 'srt':         timeline = srt(procs);               break;
      case 'prioridades': timeline = prioridades(procs);       break;
      case 'rr':          timeline = roundRobin(procs, 2);     break;
    }
  } catch(e) {}

  // Convertir timeline a secuencia plana
  estado.respuestaCorrecta = [];
  timeline.forEach(bloque => {
    for (let i = 0; i < bloque.duracion; i++) {
      estado.respuestaCorrecta.push(bloque.proceso);
    }
  });
  const duracion = estado.respuestaCorrecta.length;
  estado.respuestaUsuario = new Array(duracion).fill(null);

  // Renderizar enunciado
  document.getElementById('ejercicio-titulo').textContent = ej.titulo;
  document.getElementById('ejercicio-algo-tag').textContent = ej.algo.toUpperCase();

  const tablaDiv = document.getElementById('ejercicio-tabla');
  let html = `<p style="margin-bottom:12px;color:var(--texto-suave);font-size:13px">${ej.descripcion}</p>`;
  html += '<table style="border-collapse:collapse;font-family:var(--font-mono);font-size:13px">';
  html += '<tr><th style="padding:5px 14px;background:var(--negro-panel);color:var(--texto-apagado);border:1px solid var(--negro-borde)">Proceso</th><th style="padding:5px 14px;background:var(--negro-panel);color:var(--texto-apagado);border:1px solid var(--negro-borde)">CPU</th><th style="padding:5px 14px;background:var(--negro-panel);color:var(--texto-apagado);border:1px solid var(--negro-borde)">Llegada</th>';
  if (ej.algo === 'prioridades') html += '<th style="padding:5px 14px;background:var(--negro-panel);color:var(--texto-apagado);border:1px solid var(--negro-borde)">Prioridad</th>';
  html += '</tr>';
  ej.procesos.forEach((p, i) => {
    html += `<tr>
      <td style="padding:5px 14px;border:1px solid var(--negro-borde);color:${COLORES[i % COLORES.length]};font-weight:600">${p.n}</td>
      <td style="padding:5px 14px;border:1px solid var(--negro-borde);color:var(--texto-suave)">${p.cpu}</td>
      <td style="padding:5px 14px;border:1px solid var(--negro-borde);color:var(--texto-suave)">${p.llegada || 0}</td>
      ${ej.algo === 'prioridades' ? `<td style="padding:5px 14px;border:1px solid var(--negro-borde);color:var(--texto-suave)">${p.prioridad}</td>` : ''}
    </tr>`;
  });
  html += '</table>';
  tablaDiv.innerHTML = html;

  // Renderizar Gantt interactivo vacío
  const ganttPractica = document.getElementById('gantt-practica');
  ganttPractica.innerHTML = '';
  for (let i = 0; i < duracion; i++) {
    const cel = document.createElement('div');
    cel.className = 'celda-gantt';
    cel.dataset.idx = i;
    cel.textContent = i;
    cel.style.fontSize = '10px';
    cel.style.color = 'var(--texto-apagado)';
    cel.onclick = () => colocarEnCelda(i);
    ganttPractica.appendChild(cel);
  }

  // Etiquetas de tiempo debajo
  const escala = document.createElement('div');
  escala.style.cssText = 'display:flex;gap:6px;padding:4px 0;font-family:var(--font-mono);font-size:10px;color:var(--texto-apagado)';
  for (let i = 0; i <= duracion; i++) {
    const t = document.createElement('span');
    t.style.width = '48px';
    t.textContent = i;
    escala.appendChild(t);
  }
  ganttPractica.parentElement.appendChild(escala);

  // Paleta de procesos
  const palette = document.getElementById('procesos-palette');
  palette.innerHTML = '';
  ej.procesos.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'palette-proceso';
    btn.textContent = p.n;
    btn.style.background = COLORES[i % COLORES.length];
    btn.onclick = () => seleccionarProceso(p.n, btn);
    palette.appendChild(btn);
  });
  // Botón idle
  const idleBtn = document.createElement('button');
  idleBtn.className = 'palette-proceso';
  idleBtn.textContent = '—';
  idleBtn.style.background = 'var(--negro-borde)';
  idleBtn.style.color = 'var(--texto)';
  idleBtn.onclick = () => seleccionarProceso('idle', idleBtn);
  palette.appendChild(idleBtn);

  // Ocultar resultado anterior
  document.getElementById('resultado-practica').classList.add('hidden');

  samyHabla(`¡${ej.titulo}! ${ej.descripcion} Seleccioná un proceso de la paleta y hacé clic en cada celda.`);
}

function seleccionarProceso(nombre, btn) {
  estado.procesoSeleccionado = nombre;
  document.querySelectorAll('.palette-proceso').forEach(b => b.classList.remove('activo'));
  btn.classList.add('activo');
  reproducirSonido('click');
}

function colocarEnCelda(idx) {
  if (!estado.procesoSeleccionado) {
    samyAlerta('Primero seleccioná un proceso de la paleta de abajo.');
    return;
  }
  estado.respuestaUsuario[idx] = estado.procesoSeleccionado;

  // Actualizar visual de la celda
  const celdas = document.querySelectorAll('.celda-gantt');
  const celda = celdas[idx];
  celda.textContent = estado.procesoSeleccionado === 'idle' ? '—' : estado.procesoSeleccionado;
  celda.classList.add('ocupada');
  celda.classList.remove('correcta', 'incorrecta');

  // Color del proceso
  const ej = estado.ejercicioActual;
  const pi = ej.procesos.findIndex(p => p.n === estado.procesoSeleccionado);
  if (pi >= 0) {
    celda.style.background = COLORES[pi % COLORES.length] + '44';
    celda.style.color = COLORES[pi % COLORES.length];
    celda.style.borderColor = COLORES[pi % COLORES.length];
    celda.style.fontSize = '14px';
  } else {
    celda.style.background = 'var(--negro-panel)';
    celda.style.color = 'var(--texto-apagado)';
    celda.style.borderColor = 'var(--negro-borde)';
    celda.style.fontSize = '10px';
  }
  reproducirSonido('click');
}

function verificarRespuesta() {
  const respuesta = estado.respuestaUsuario;
  const correcta  = estado.respuestaCorrecta;

  if (respuesta.includes(null)) {
    samyAlerta('¡Faltan celdas! Completá todo el Gantt antes de verificar.');
    return;
  }

  let aciertos = 0;
  const celdas = document.querySelectorAll('.celda-gantt');

  respuesta.forEach((r, i) => {
    const bien = r === correcta[i];
    if (bien) aciertos++;
    celdas[i].classList.remove('ocupada');
    celdas[i].classList.add(bien ? 'correcta' : 'incorrecta');
  });

  const total  = respuesta.length;
  const pct    = Math.round((aciertos / total) * 100);
  const ganar  = aciertos === total;

  if (ganar) {
    estado.estrellas += 3;
    reproducirSonido('success');
    samyContenta();
    samyHabla('¡PERFECTO! ¡Ganás 3 estrellas! Dominás este algoritmo. ¡Probá el siguiente!');
  } else {
    const perdidas = total - aciertos;
    estado.estrellas = Math.max(0, estado.estrellas - 1);
    reproducirSonido('error');
    samyAlerta(`Tuviste ${aciertos} de ${total} celdas correctas (${pct}%). Las rojas son las incorrectas. ¡Seguís aprendiendo!`);
  }

  actualizarHUD();

  const resultado = document.getElementById('resultado-practica');
  resultado.classList.remove('hidden', 'correcto', 'incorrecto');
  resultado.classList.add(ganar ? 'correcto' : 'incorrecto');
  resultado.innerHTML = ganar
    ? `⭐ ¡Excelente! Gantt correcto al 100%. +3 estrellas`
    : `❌ ${aciertos}/${total} celdas correctas (${pct}%). Revisá las celdas en rojo e intentá de nuevo.`;
}

function usarComodin() {
  if (estado.comodines <= 0) {
    samyAlerta('No te quedan comodines. ¡Seguí practicando para ganar más!');
    return;
  }
  // Buscar la primera celda incorrecta o vacía
  const correcta = estado.respuestaCorrecta;
  const respuesta = estado.respuestaUsuario;
  let pista = -1;
  for (let i = 0; i < respuesta.length; i++) {
    if (respuesta[i] !== correcta[i]) { pista = i; break; }
  }
  if (pista === -1) {
    samyHabla('¡Todo está correcto! No necesitás comodín.');
    return;
  }
  estado.comodines--;
  actualizarHUD();
  reproducirSonido('click');
  samyHabla(`Comodín usado 🃏 En la celda ${pista} debería ir "${correcta[pista] === 'idle' ? '—(idle)' : correcta[pista]}". ¡Seguí vos el resto!`);
}

function nuevoEjercicio() {
  ejercicioIdx = (ejercicioIdx + 1) % EJERCICIOS.length;
  if (ejercicioIdx === 0) estado.nivel++;
  cargarEjercicio(EJERCICIOS[ejercicioIdx]);
  actualizarHUD();
  reproducirSonido('pop');
}

function actualizarHUD() {
  document.getElementById('estrellas-display').textContent  = `⭐ ${estado.estrellas}`;
  document.getElementById('nivel-display').textContent      = estado.nivel;
  document.getElementById('comodines-display').textContent  = `🃏 ${estado.comodines}`;
}

/* ============================================================
   10. MEZCLA DE ALGORITMOS
   ============================================================ */

/* Matriz completa de compatibilidad
   'ok'      = se pueden mezclar perfectamente
   'parcial' = funciona pero con limitaciones
   'no'      = incompatibles, no tiene sentido combinarlos
*/
const MATRIZ_MEZCLA = {
  'fcfs-fcfs':        { tipo: 'self' },
  'fcfs-sjf':         { tipo: 'ok',      msg: 'FCFS + SJF: los procesos se ordenan por llegada, y en caso de empate gana el más corto. ¡Compatible!' },
  'fcfs-srt':         { tipo: 'no',      msg: 'FCFS nunca interrumpe a nadie. SRT interrumpe constantemente. Son filosofías opuestas y se contradicen.' },
  'fcfs-prioridades': { tipo: 'ok',      msg: 'FCFS + Prioridades: entre los que llegaron primero, gana el de mayor prioridad. ¡Muy usado en sistemas reales!' },
  'fcfs-rr':          { tipo: 'no',      msg: 'FCFS atiende hasta terminar. RR interrumpe cada quantum. No se pueden combinar sin contradecirse.' },

  'sjf-fcfs':         { tipo: 'ok',      msg: 'SJF + FCFS: el más corto ejecuta primero, y si hay empate en duración, gana el que llegó antes.' },
  'sjf-sjf':          { tipo: 'self' },
  'sjf-srt':          { tipo: 'parcial', msg: 'SJF no apropiativo + SRT apropiativo: SJF elige al inicio, SRT puede interrumpir si llega uno más corto. Funciona pero genera comportamiento mixto.' },
  'sjf-prioridades':  { tipo: 'ok',      msg: 'SJF + Prioridades: entre los más cortos, gana el de mayor prioridad. ¡Excelente combinación para sistemas de lotes!' },
  'sjf-rr':           { tipo: 'no',      msg: 'SJF elige por duración sin interrumpir. RR interrumpe por tiempo fijo. Sus criterios se contradicen.' },

  'srt-fcfs':         { tipo: 'no',      msg: 'SRT interrumpe constantemente. FCFS nunca interrumpe. Son filosofías opuestas.' },
  'srt-sjf':          { tipo: 'parcial', msg: 'SRT apropiativo + SJF no apropiativo: comportamiento mixto. SRT puede interrumpir pero SJF no. Genera ambigüedad.' },
  'srt-srt':          { tipo: 'self' },
  'srt-prioridades':  { tipo: 'ok',      msg: 'SRT + Prioridades: entre los de menor tiempo restante, gana el de mayor prioridad. ¡Compatible y usado en Linux!' },
  'srt-rr':           { tipo: 'ok',      msg: 'SRT + Round Robin: SRT para procesos de diferente prioridad, RR entre los de igual tiempo restante. ¡Combinación avanzada!' },

  'prioridades-fcfs':         { tipo: 'ok',      msg: 'Prioridades + FCFS: gana la mayor prioridad y en empate el que llegó primero. ¡Clásico!' },
  'prioridades-sjf':          { tipo: 'ok',      msg: 'Prioridades + SJF: si hay empate en prioridad, ejecuta el más corto. ¡Muy eficiente!' },
  'prioridades-srt':          { tipo: 'ok',      msg: 'Prioridades + SRT: mayor prioridad primero con capacidad de interrumpir. ¡Poderoso!' },
  'prioridades-prioridades':  { tipo: 'self' },
  'prioridades-rr':           { tipo: 'ok',      msg: 'Prioridades + RR: entre los de igual prioridad se aplica Round Robin. ¡El más justo y completo!' },

  'rr-fcfs':          { tipo: 'no',      msg: 'RR interrumpe cada quantum. FCFS nunca interrumpe. Sus lógicas son opuestas.' },
  'rr-sjf':           { tipo: 'no',      msg: 'RR rota por tiempo fijo. SJF elige por duración. Sus criterios se contradicen.' },
  'rr-srt':           { tipo: 'ok',      msg: 'RR + SRT: quantum fijo con posibilidad de interrumpir si hay uno más corto. ¡Avanzado!' },
  'rr-prioridades':   { tipo: 'ok',      msg: 'RR + Prioridades: quantum equitativo entre procesos de igual prioridad. ¡Muy justo!' },
  'rr-rr':            { tipo: 'self' },
};

/* Estado del modo actual */
let modoMezcla = false;

function cambiarModo(modo) {
  modoMezcla = (modo === 'mezcla');
  document.getElementById('modo-simple').classList.toggle('hidden', modoMezcla);
  document.getElementById('modo-mezcla').classList.toggle('hidden', !modoMezcla);
  document.getElementById('tab-simple').classList.toggle('active', !modoMezcla);
  document.getElementById('tab-mezcla').classList.toggle('active',  modoMezcla);

  if (modoMezcla) {
    validarMezcla();
    samyHabla('Modo mezcla activado. Elegí dos algoritmos y te digo si son compatibles antes de simular.');
  } else {
    actualizarCampos();
    samyNormal();
  }
}

function validarMezcla() {
  const algo1 = document.querySelector('input[name="algo-1"]:checked')?.value;
  const algo2 = document.querySelector('input[name="algo-2"]:checked')?.value;
  if (!algo1 || !algo2) return;

  // Mostrar/ocultar quantum si RR está en la mezcla
  const qCampo = document.getElementById('quantum-campo');
  if (algo1 === 'rr' || algo2 === 'rr') {
    qCampo.classList.remove('hidden');
  } else {
    qCampo.classList.add('hidden');
  }

  // Mismo algoritmo
  if (algo1 === algo2) {
    mostrarEstadoMezcla('incompatible', '✗', 'Seleccioná dos algoritmos diferentes para mezclar.');
    samyAlerta('¡Seleccioná dos algoritmos diferentes! No tiene sentido mezclar un algoritmo consigo mismo.');
    return;
  }

  const key = `${algo1}-${algo2}`;
  const resultado = MATRIZ_MEZCLA[key];
  if (!resultado) return;

  switch (resultado.tipo) {
    case 'ok':
      mostrarEstadoMezcla('compatible', '✓', resultado.msg);
      samyNormal();
      samyHabla(resultado.msg);
      break;
    case 'parcial':
      mostrarEstadoMezcla('parcial', '⚠', resultado.msg);
      samyEstado('alerta');
      samyHabla(resultado.msg);
      break;
    case 'no':
      mostrarEstadoMezcla('incompatible', '✗', resultado.msg);
      samyAlerta(resultado.msg);
      break;
  }
}

function mostrarEstadoMezcla(tipo, icono, msg) {
  const status = document.getElementById('mezcla-status');
  const iconoEl = document.getElementById('mezcla-icono');
  const msgEl = document.getElementById('mezcla-msg');
  status.className = `mezcla-status ${tipo}`;
  iconoEl.textContent = icono;
  msgEl.textContent = msg;
}

function obtenerAlgoritmos() {
  if (!modoMezcla) {
    const algo = document.querySelector('input[name="algo-sim"]:checked')?.value || 'fcfs';
    return { algo1: algo, algo2: null, mezcla: false };
  }
  const algo1 = document.querySelector('input[name="algo-1"]:checked')?.value;
  const algo2 = document.querySelector('input[name="algo-2"]:checked')?.value;
  return { algo1, algo2, mezcla: true };
}

function verificarCompatibilidad(algo1, algo2) {
  const key = `${algo1}-${algo2}`;
  const resultado = MATRIZ_MEZCLA[key];
  if (!resultado) return true;
  return resultado.tipo !== 'no';
}

/* ============================================================
   EJECUTAR CON MEZCLA
   La mezcla funciona así: el algoritmo principal decide el
   ORDEN de los procesos, el secundario decide el DESEMPATE
   ============================================================ */
function ejecutarMezcla(procesos, algo1, algo2, quantum) {
  // Prioridades + RR: la más útil y común
  if ((algo1 === 'prioridades' && algo2 === 'rr') ||
      (algo1 === 'rr' && algo2 === 'prioridades')) {
    return mezclaRRPrioridades(procesos, quantum);
  }
  // Prioridades + SJF: prioridad primero, empate por duración
  if ((algo1 === 'prioridades' && algo2 === 'sjf') ||
      (algo1 === 'sjf' && algo2 === 'prioridades')) {
    return mezclaPrioridadesSJF(procesos);
  }
  // Prioridades + FCFS: prioridad primero, empate por llegada
  if ((algo1 === 'prioridades' && algo2 === 'fcfs') ||
      (algo1 === 'fcfs' && algo2 === 'prioridades')) {
    return mezclaPrioridadesFCFS(procesos);
  }
  // FCFS + SJF: llegada primero, empate por duración
  if ((algo1 === 'fcfs' && algo2 === 'sjf') ||
      (algo1 === 'sjf' && algo2 === 'fcfs')) {
    return mezclaFCFSSJF(procesos);
  }
  // SRT + Prioridades
  if ((algo1 === 'srt' && algo2 === 'prioridades') ||
      (algo1 === 'prioridades' && algo2 === 'srt')) {
    return mezclaSRTPrioridades(procesos);
  }
  // RR + Prioridades (igual que Prioridades + RR)
  if ((algo1 === 'rr' && algo2 === 'srt') ||
      (algo1 === 'srt' && algo2 === 'rr')) {
    return srt(procesos); // SRT ya es lo más apropiativo
  }
  // Fallback: usar el algoritmo principal
  return ejecutarUno(algo1, procesos, quantum);
}

function ejecutarUno(algo, procesos, quantum) {
  switch (algo) {
    case 'fcfs':        return fcfs(procesos);
    case 'sjf':         return sjf(procesos);
    case 'srt':         return srt(procesos);
    case 'prioridades': return prioridades(procesos);
    case 'rr':          return roundRobin(procesos, quantum);
    default:            return fcfs(procesos);
  }
}

/* --- Implementaciones de mezclas --- */

// Prioridades + RR: grupos por prioridad, dentro de cada grupo RR
function mezclaRRPrioridades(procesos, quantum) {
  const q = quantum || 3;
  // Agrupar por prioridad
  const prioridades_unicas = [...new Set(procesos.map(p => p.prioridad))].sort((a,b) => a - b);
  const timeline = [];
  let tiempoGlobal = 0;

  prioridades_unicas.forEach(prio => {
    const grupo = procesos
      .filter(p => p.prioridad === prio)
      .map(p => ({ ...p, llegada: Math.max(p.llegada, tiempoGlobal) }));
    const tl = roundRobin(grupo, q);
    tl.forEach(bloque => {
      timeline.push(bloque);
      tiempoGlobal += bloque.duracion;
    });
  });
  return timeline;
}

// Prioridades + SJF: ordenar por prioridad, desempate por duración
function mezclaPrioridadesSJF(procesos) {
  let pendientes = procesos.slice();
  const timeline = [];
  let tiempo = 0;

  while (pendientes.length > 0) {
    const disponibles = pendientes.filter(p => p.llegada <= tiempo);
    if (disponibles.length === 0) {
      const sig = pendientes.reduce((m,p) => p.llegada < m.llegada ? p : m);
      timeline.push({ proceso: 'idle', duracion: sig.llegada - tiempo });
      tiempo = sig.llegada;
      continue;
    }
    // Ordenar: primero por prioridad, luego por cpu
    const elegido = disponibles.reduce((mejor, p) => {
      if (p.prioridad < mejor.prioridad) return p;
      if (p.prioridad === mejor.prioridad && p.cpu < mejor.cpu) return p;
      return mejor;
    });
    timeline.push({ proceso: elegido.nombre, duracion: elegido.cpu });
    tiempo += elegido.cpu;
    pendientes = pendientes.filter(p => p.nombre !== elegido.nombre);
  }
  return timeline;
}

// Prioridades + FCFS: ordenar por prioridad, desempate por llegada
function mezclaPrioridadesFCFS(procesos) {
  let pendientes = procesos.slice();
  const timeline = [];
  let tiempo = 0;

  while (pendientes.length > 0) {
    const disponibles = pendientes.filter(p => p.llegada <= tiempo);
    if (disponibles.length === 0) {
      const sig = pendientes.reduce((m,p) => p.llegada < m.llegada ? p : m);
      timeline.push({ proceso: 'idle', duracion: sig.llegada - tiempo });
      tiempo = sig.llegada;
      continue;
    }
    const elegido = disponibles.reduce((mejor, p) => {
      if (p.prioridad < mejor.prioridad) return p;
      if (p.prioridad === mejor.prioridad && p.llegada < mejor.llegada) return p;
      return mejor;
    });
    timeline.push({ proceso: elegido.nombre, duracion: elegido.cpu });
    tiempo += elegido.cpu;
    pendientes = pendientes.filter(p => p.nombre !== elegido.nombre);
  }
  return timeline;
}

// FCFS + SJF: llegada primero, desempate por duración
function mezclaFCFSSJF(procesos) {
  const ordenados = procesos.slice().sort((a, b) => {
    if (a.llegada !== b.llegada) return a.llegada - b.llegada;
    return a.cpu - b.cpu;
  });
  const timeline = [];
  let tiempo = 0;
  ordenados.forEach(p => {
    if (p.llegada > tiempo) {
      timeline.push({ proceso: 'idle', duracion: p.llegada - tiempo });
      tiempo = p.llegada;
    }
    timeline.push({ proceso: p.nombre, duracion: p.cpu });
    tiempo += p.cpu;
  });
  return timeline;
}

// SRT + Prioridades: apropiativo, desempate por prioridad
function mezclaSRTPrioridades(procesos) {
  const restante = {};
  procesos.forEach(p => { restante[p.nombre] = p.cpu; });
  const timeline = [];
  const duracionTotal = procesos.reduce((s,p) => s + p.cpu, 0);
  const llegadaMax    = Math.max(...procesos.map(p => p.llegada));

  for (let t = 0; t <= duracionTotal + llegadaMax; t++) {
    const disponibles = procesos.filter(p => p.llegada <= t && restante[p.nombre] > 0);
    if (disponibles.length === 0) {
      timeline.push({ proceso: 'idle', duracion: 1 });
      continue;
    }
    // Elegir: menor restante, desempate por prioridad
    const elegido = disponibles.reduce((mejor, p) => {
      if (restante[p.nombre] < restante[mejor.nombre]) return p;
      if (restante[p.nombre] === restante[mejor.nombre] && p.prioridad < mejor.prioridad) return p;
      return mejor;
    });
    timeline.push({ proceso: elegido.nombre, duracion: 1 });
    restante[elegido.nombre]--;
    if (procesos.every(p => restante[p.nombre] === 0)) break;
  }
  return comprimirTimeline(timeline);
}

/* ============================================================
   11. EXPLICACIÓN DE SAMY TRAS SIMULAR
   ============================================================ */
function samyExplicarResultado(algo, timeline, procesos, algo2) {
  const n = procesos.length;
  const duracion = timeline.reduce((s,t) => s + t.duracion, 0);
  if (algo2) {
    samyContenta();
    samyHabla(`¡Simulación ${algo.toUpperCase()} + ${algo2.toUpperCase()} lista! Los ${n} procesos se ejecutaron con la mezcla de ambos algoritmos. Duración total: ${duracion}ms.`);
    return;
  }
  const msgs = {
    fcfs: `¡Simulación FCFS lista! Los ${n} procesos se ejecutaron en orden de llegada. Duración total: ${duracion}ms.`,
    sjf:  `¡Simulación SJF lista! El proceso más corto disponible siempre ejecutó primero. Duración: ${duracion}ms.`,
    srt:  `¡Simulación SRT lista! Cada vez que llegó un proceso más corto, interrumpió al actual. Duración: ${duracion}ms.`,
    prioridades: `¡Simulación por Prioridades lista! El proceso con menor número de prioridad ejecutó primero. Duración: ${duracion}ms.`,
    rr:   `¡Simulación Round Robin lista! Cada proceso recibió su quantum de forma equitativa. Duración: ${duracion}ms.`,
  };
  samyContenta();
  samyHabla(msgs[algo] || '¡Simulación completada!');
}

/* ============================================================
   12. SONIDOS — Web Audio API
   Por qué: no necesitamos archivos MP3, el navegador genera
   los sonidos matemáticamente. Sin dependencias externas.
   ============================================================ */
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function reproducirSonido(tipo) {
  if (!estado.sonidoActivo) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (tipo) {
      case 'click':
        osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(); osc.stop(ctx.currentTime + 0.08);
        break;
      case 'success':
        // Melodía ascendente: do-mi-sol
        [261, 329, 392].forEach((freq, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = freq;
          g.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
          g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + i * 0.12 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.2);
          o.start(ctx.currentTime + i * 0.12);
          o.stop(ctx.currentTime + i * 0.12 + 0.2);
        });
        break;
      case 'error':
        osc.frequency.value = 180;
        osc.type = 'sawtooth';
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(); osc.stop(ctx.currentTime + 0.25);
        break;
      case 'pop':
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.07, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(); osc.stop(ctx.currentTime + 0.1);
        break;
    }
  } catch(e) { /* Silencioso si el navegador no soporta */ }
}

function toggleSonido() {
  estado.sonidoActivo = !estado.sonidoActivo;
  const btn = document.getElementById('vol-btn');
  btn.textContent = estado.sonidoActivo ? '🔊' : '🔇';
  if (estado.sonidoActivo) {
    reproducirSonido('click');
    iniciarMusica();
  } else {
    detenerMusica();
  }
  guardarProgreso();
}

/* ============================================================
   14. MÚSICA DE FONDO — HTML5 Audio
   Usa el archivo sonidos/musica.mp3
   Descargarlo gratis de musopen.org (dominio público)
   Recomendado: Shostakovich Waltz No.2 o Vivaldi Invierno
   ============================================================ */
let musicaAudio  = null;
let musicaActiva = false;

function iniciarMusica() {
  if (!estado.sonidoActivo || musicaActiva) return;
  try {
    if (!musicaAudio) {
      musicaAudio        = new Audio('sonidos/musica.mp3');
      musicaAudio.loop   = true;   // repetir en bucle
      musicaAudio.volume = 0;      // empieza en 0 para el fade in

      /* Si el archivo no existe, silencio total sin error visible */
      musicaAudio.onerror = () => {
        musicaActiva = false;
        musicaAudio  = null;
      };
    }
    musicaAudio.play().then(() => {
      musicaActiva = true;
      subirVolumenSuave();
    }).catch(() => {
      /* Navegador bloqueó — se activa al primer clic del usuario */
    });
  } catch(e) {}
}

/* Fade in: sube de 0 a 0.18 en ~2.7 segundos */
function subirVolumenSuave() {
  if (!musicaAudio) return;
  musicaAudio.volume = 0;
  let vol = 0;
  const intervalo = setInterval(() => {
    vol = Math.min(vol + 0.01, 0.18);
    musicaAudio.volume = vol;
    if (vol >= 0.18) clearInterval(intervalo);
  }, 150);
}

/* Fade out: baja suavemente antes de pausar */
function detenerMusica() {
  if (!musicaAudio || !musicaActiva) return;
  let vol = musicaAudio.volume;
  const intervalo = setInterval(() => {
    vol = Math.max(vol - 0.02, 0);
    musicaAudio.volume = vol;
    if (vol <= 0) {
      musicaAudio.pause();
      musicaActiva = false;
      clearInterval(intervalo);
    }
  }, 80);
}

/* ============================================================
   15. LOCALSTORAGE — guardar progreso
   Por qué: el navegador ya tiene una mini-base de datos
   incorporada. Sin servidor, sin instalación.
   ============================================================ */
function guardarProgreso() {
  try {
    const datos = {
      estrellas:    estado.estrellas,
      nivel:        estado.nivel,
      comodines:    estado.comodines,
      sonidoActivo: estado.sonidoActivo,
      ultimaVez:    new Date().toLocaleDateString('es-ES'),
    };
    localStorage.setItem('planificaos_progreso', JSON.stringify(datos));
  } catch(e) {}
}

function cargarProgreso() {
  try {
    const raw = localStorage.getItem('planificaos_progreso');
    if (!raw) return;
    const datos = JSON.parse(raw);
    estado.estrellas    = datos.estrellas    || 0;
    estado.nivel        = datos.nivel        || 1;
    estado.comodines    = datos.comodines    || 3;
    estado.sonidoActivo = datos.sonidoActivo !== false;
    actualizarHUD();
    if (datos.ultimaVez) {
      setTimeout(() => {
        samyHabla(`¡Bienvenido de vuelta! Tenés ${datos.estrellas} estrellas y estás en el nivel ${datos.nivel}. ¡Seguimos aprendiendo!`);
      }, 1000);
    }
  } catch(e) {}
}

/* ============================================================
   16. MARCA — by PawSM
   Incrustada en múltiples capas del sistema.
   ============================================================ */

/* Verificar integridad de la marca al iniciar */
(function protegerMarca() {
  const MARCA = 'PlanificaOS — by PawSM';
  const ANIO  = new Date().getFullYear();
  /* Registrar en consola con estilo — los devs verán la autoría */
  console.log(
    `%c🐢 ${MARCA} © ${ANIO}`,
    'color:#00ffaa;background:#0a0f0a;font-size:14px;padding:6px 12px;border-radius:4px;font-family:monospace;border:1px solid #1D9E75'
  );
  console.log(
    '%cSistema educativo de Algoritmos de Planificación de Procesos',
    'color:#a0c8a0;font-size:12px;font-family:monospace'
  );
  /* Guardar referencia interna — usada por el footer */
  window.__planificaos = { autor: 'PawSM', version: '1.0', marca: MARCA };
})();

/* ============================================================
   13. INICIALIZACIÓN
   Por qué al final: espera que todo el HTML esté cargado
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  cargarProgreso();
  inicializarProcesos();

  /* Inyectar footer con marca — no se puede quitar sin tocar el JS */
  const footer = document.createElement('footer');
  footer.id = 'pawsm-footer';
  footer.innerHTML = `
    <span class="pawsm-marca">
      🐢 PlanificaOS
      <span class="pawsm-sep">·</span>
      <span class="pawsm-by">by</span>
      <strong class="pawsm-nombre">PawSM</strong>
      <span class="pawsm-sep">·</span>
      Sistema educativo de Planificación de Procesos
    </span>
  `;
  document.body.appendChild(footer);

  /* Guardar progreso automáticamente cada 30 segundos */
  setInterval(guardarProgreso, 30000);

  /* Samy dice hola al cargar */
  const esRetorno = !!localStorage.getItem('planificaos_progreso');
  if (!esRetorno) {
    setTimeout(() => {
      samyHabla('¡Bienvenido a PlanificaOS! Soy Samy y te voy a guiar. ¿Empezamos por Aprender o directamente a Simular?');
    }, 800);
  }

  /* Iniciar música suavemente al primer clic del usuario
     Por qué: los navegadores bloquean audio sin interacción previa */
  document.addEventListener('click', function iniciarAudioAlClic() {
    if (estado.sonidoActivo) iniciarMusica();
    document.removeEventListener('click', iniciarAudioAlClic);
  }, { once: true });
});