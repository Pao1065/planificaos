/* ============================================================
   SAMY.JS — La tortuguita guía
   Controla: globo de diálogo, estados visuales y voz
   Por qué Web Speech API: el navegador habla sin instalar nada
   ============================================================ */

/* Temporizador para ocultar el globo automáticamente */
let samyTimer = null;

/* ============================================================
   CAMBIAR ESTADO VISUAL DE SAMY
   Muestra uno de los 3 SVGs y oculta los otros
   ============================================================ */
function samyEstado(estado) {
  document.getElementById('samy-normal')?.classList.add('hidden');
  document.getElementById('samy-contenta')?.classList.add('hidden');
  document.getElementById('samy-alerta')?.classList.add('hidden');

  const el = document.getElementById('samy-' + estado);
  if (el) el.classList.remove('hidden');
}

function samyNormal()   { samyEstado('normal');   }
function samyContenta() { samyEstado('contenta'); }
function samyAlerta()   { samyEstado('alerta');   }

/* ============================================================
   MOSTRAR GLOBO DE DIÁLOGO
   ============================================================ */
function mostrarGlobo(texto, duracion) {
  const bubble = document.getElementById('samy-bubble');
  const parrafo = document.getElementById('samy-texto');
  if (!bubble || !parrafo) return;

  parrafo.textContent = texto;
  bubble.classList.remove('hidden');

  // Limpiar timer anterior si existía
  if (samyTimer) clearTimeout(samyTimer);

  // Ocultar después de `duracion` ms (mínimo 3s, máximo 8s)
  const ms = duracion || Math.max(3000, Math.min(texto.length * 60, 8000));
  samyTimer = setTimeout(() => {
    bubble.classList.add('hidden');
    // Volver a normal si estaba en otro estado
    samyNormal();
  }, ms);
}

/* ============================================================
   SAMY HABLA — globo + voz del navegador
   ============================================================ */
function samyHabla(texto) {
  samyNormal();
  /* Agregar pausitas naturales para que suene más tierna */
  const textoConPausas = texto
    .replace(/\. /g, '... ')       // pausa después de punto
    .replace(/¡/g,  '¡ ')          // pausa después de apertura
    .replace(/\?/g, '?... ');      // pausa después de pregunta
  mostrarGlobo(texto);
  hablarConVoz(textoConPausas);
}

function samyAlerta(texto) {
  samyEstado('alerta');
  mostrarGlobo(texto, 6000);
  hablarConVoz(texto);
}

/* ============================================================
   VOZ — Web Speech API
   Por qué: gratis, sin archivos, funciona en Chrome/Edge/Firefox
   El navegador tiene voces en español instaladas
   ============================================================ */
function hablarConVoz(texto) {
  if (!window.speechSynthesis) return;
  if (typeof estado !== 'undefined' && !estado.sonidoActivo) return;

  window.speechSynthesis.cancel();

  /* Crear AudioContext para procesar la voz */
  let actx = null;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
  } catch(e) {}

  const utterance  = new SpeechSynthesisUtterance(texto);
  utterance.lang   = 'es-ES';
  utterance.rate   = 0.78;
  utterance.pitch  = 2;
  utterance.volume = actx ? 0 : 1; /* si procesamos con audio, silenciamos la original */

  const intentar = () => {
    const voces = window.speechSynthesis.getVoices();
    if (!voces.length) { setTimeout(intentar, 100); return; }

    const candidatas = voces.filter(v => v.lang.startsWith('es'));
    const voz =
      candidatas.find(v => /sabina|luciana|paulina|valeria|camila|sofia|maria|laura|elena|ana/i.test(v.name)) ||
      candidatas.find(v => /female|mujer|femenin/i.test(v.name)) ||
      candidatas.find(v => v.name.includes('Google')) ||
      candidatas[0];
    if (voz) utterance.voice = voz;

    /* Si tenemos AudioContext, conectar la voz a un procesador de tono */
    if (actx) {
      try {
        /* MediaStreamDestination: captura la voz como stream de audio */
        const dest   = actx.createMediaStreamDestination();
        const source = actx.createMediaStreamSource(dest.stream);

        /* BiquadFilter paso alto: elimina frecuencias graves */
        const hipass = actx.createBiquadFilter();
        hipass.type            = 'highpass';
        hipass.frequency.value = 180; /* corta graves debajo de 180Hz */

        /* Ganancia final */
        const gainNode = actx.createGain();
        gainNode.gain.value = 1.4;

        source.connect(hipass);
        hipass.connect(gainNode);
        gainNode.connect(actx.destination);

        utterance.volume = 1;
      } catch(e) {
        utterance.volume = 1;
      }
    }

    window.speechSynthesis.speak(utterance);
  };

  intentar();
}

/* ============================================================
   SAMY REACCIONA A EVENTOS DEL SISTEMA
   Estas funciones son llamadas desde app.js
   ============================================================ */

/* Samy festeja cuando el estudiante acierta */
function samyCelebrar() {
  samyContenta();
  const frases = [
    '¡Excelente! ¡Lo lograste! ¡Sos un crack de los algoritmos!',
    '¡Perfecto! ¡Ese Gantt está impecable! ¡3 estrellas para vos!',
    '¡Brillante! ¡El inge estaría orgulloso!',
    '¡Súper bien! ¡Dominás este algoritmo como un pro!',
  ];
  const frase = frases[Math.floor(Math.random() * frases.length)];
  mostrarGlobo(frase, 5000);
  hablarConVoz(frase);
}

/* Samy da pista suave cuando hay error */
function samyDarPista(mensaje) {
  samyEstado('alerta');
  mostrarGlobo(mensaje, 7000);
  hablarConVoz(mensaje);
}

/* Samy explica una restricción de mezcla */
function samyRestriccion(algo1, algo2, motivo) {
  samyEstado('alerta');
  const texto = `No se puede mezclar ${algo1} con ${algo2}. ${motivo}`;
  mostrarGlobo(texto, 8000);
  hablarConVoz(texto);
}

/* ============================================================
   INICIALIZACIÓN DE VOCES
   Por qué: Chrome carga las voces de forma asíncrona,
   hay que esperar al evento voiceschanged
   ============================================================ */
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    // Voces cargadas y listas
    window.speechSynthesis.getVoices();
  };
}