// Juego: ¿Qué departamento es?
// Ahora soporta SVGs de Wikimedia que usan <title> por elemento/grupo.

// Por defecto intentamos usar el mapa preciso (si no existe, cae al demo):
const CANDIDATE_SVGS = [
  'assets/colombia.svg',
  'assets/colombia-wikimedia.svg',
  'assets/colombia-demo.svg',
];

let MAP_SRC = 'assets/colombia-demo.svg';

/** Utilidades **/
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Estado del juego **/
const state = {
  order: [],
  index: 0,
  correct: 0,
  wrong: 0,
  initialTotal: 0,
  mode: 'free', // 'free' | 'timed'
  durationMs: 0,
  endAt: 0,
  timerId: null,
  startAt: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  finished: false,
};

function setTargetName(name) {
  $('#target-name').textContent = name ?? '—';
}

function updateScore() {
  $('#score-correct').textContent = String(state.correct);
  $('#score-wrong').textContent = String(state.wrong);
}

function setDisabled(el, disabled) {
  if (!el) return;
  el.classList.toggle('disabled', !!disabled);
}

/** Lista de departamentos válidos (y variantes aceptadas) **/
const VALID_DEPARTMENTS = [
  'Amazonas','Antioquia','Arauca','Atlántico','Bolívar','Boyacá','Caldas','Caquetá','Casanare','Cauca','Cesar','Chocó','Córdoba','Cundinamarca','Guainía','Guaviare','Huila','La Guajira','Magdalena','Meta','Nariño','Norte de Santander','Putumayo','Quindío','Risaralda','San Andrés y Providencia','Santander','Sucre','Tolima','Valle del Cauca','Vaupés','Vichada',
  // Distrito Capital (variantes comunes)
  'Bogotá, D.C.','Bogotá D.C.','Bogotá D.C','Bogotá','Distrito Capital'
];

function norm(s) {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

const VALID_SET = new Set(VALID_DEPARTMENTS.map(norm));
const EXCLUDED_ASK = new Set([ norm('San Andrés y Providencia') ]);

function getTitleFor(el) {
  // Busca un <title> en el elemento o sus ancestros cercanos
  let node = el;
  for (let depth = 0; depth < 3 && node; depth++, node = node.parentElement) {
    const t = node.querySelector(':scope > title');
    if (t && t.textContent) return t.textContent.trim();
    const titleAttr = node.getAttribute('title');
    if (titleAttr) return titleAttr.trim();
    const label = node.getAttribute('inkscape:label') || node.getAttribute('data-label');
    if (label) return label.trim();
  }
  return null;
}

/** Carga del SVG y preparación **/
async function loadMap() {
  const stage = $('#svg-stage');
  if (!stage) throw new Error('Contenedor SVG no encontrado');
  stage.innerHTML = '<div class="loading">Cargando mapa…</div>';

  // Intento progresivo con candidatos
  let res;
  for (const src of CANDIDATE_SVGS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await fetch(src, { cache: 'no-store' });
      if (r.ok) { MAP_SRC = src; res = r; break; }
    } catch (_) { /* ignore */ }
  }
  if (!res) {
    throw new Error('No se pudo cargar ningún mapa SVG');
  }
  if (!res.ok) throw new Error('No se pudo cargar el mapa SVG');
  const svgText = await res.text();
  stage.innerHTML = svgText;

  // Normalizar: agregar clase .region a todas las capas clicables
  const svg = $('svg', stage);
  if (!svg) throw new Error('SVG inválido');

  // Asegurar que el SVG se escale correctamente dentro de su contenedor
  // 1) Forzar preserveAspectRatio para que se vea completo (letterbox si hace falta)
  try { svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); } catch (_) {}
  // 2) Si falta viewBox (p.ej. algunos SVGs lo traen mal escrito), infiérelo desde width/height
  if (!svg.getAttribute('viewBox')) {
    const w = parseFloat(svg.getAttribute('width')) || 1000;
    const h = parseFloat(svg.getAttribute('height')) || 1000;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }

  // 1) Preferimos elementos con [data-name]
  let regions = $$('[data-name]', svg);

  // 2) Si no hay suficientes, intentamos inferir desde atributos comunes
  if (regions.length < 10) {
    // Priorizar paths/polygons/rects dentro de la capa principal si existe
    const scope = svg.querySelector('#features') || svg;
    const candidates = $$('path,polygon,rect,g', scope);
    const used = new Set();
    candidates.forEach((el) => {
      if (el.hasAttribute('data-name')) return;
      // a) Atributo 'name' (común en SimpleMaps)
      const byNameAttr = el.getAttribute('name');
      if (byNameAttr) {
        let base = el; // en mapas SimpleMaps cada path es un departamento
        const key = 'name:' + (base.getAttribute('id') || '') + ':' + byNameAttr;
        if (!used.has(key)) {
          used.add(key);
          base.setAttribute('data-name', byNameAttr.trim());
        }
        return;
      }

      // b) <title> o atributos tipo label (Wikimedia/Inkscape)
      const title = getTitleFor(el);
      if (!title) return;
      const n = norm(title);
      if (!VALID_SET.has(n)) return;

      // Determinar el elemento clicable base: usar <g> si existe, si no el propio
      let base = el.closest('g') || el;
      // Evitar duplicados por grupo
      const key = base.outerHTML.length + ':' + (base.getAttribute('id') || '') + ':' + title;
      if (used.has(key)) return;
      used.add(key);

      base.setAttribute('data-name', title);
    });
    regions = $$('[data-name]', svg);
  }

  regions.forEach((r) => r.classList.add('region'));

  return { svg, regions };
}

/** Lógica principal del juego **/
function buildOrder(regions) {
  // A partir de los nombres en data-name
  const names = regions.map((r) => r.getAttribute('data-name'))
    .filter((n) => !EXCLUDED_ASK.has(norm(n)));
  return shuffle(names);
}

function nextTarget() {
  if (state.index >= state.order.length) {
    // Juego terminado
    state.finished = true;
    setTargetName('¡Completado!');
    // Deshabilitar todo
    $$('.region').forEach((r) => setDisabled(r, true));
    // Si estamos en modo 1 minuto, mostrar resultados con el tiempo usado
    if (state.mode === 'timed') {
      clearTimer();
      const now = Date.now();
      const used = state.startAt ? Math.max(0, Math.min(state.durationMs, now - state.startAt)) : state.durationMs;
      showResults(used);
    }
    return null;
  }
  const name = state.order[state.index];
  setTargetName(name);
  return name;
}

function attachHandlers(svg, regions) {
  const byName = new Map(regions.map((r) => [r.getAttribute('data-name'), r]));

  regions.forEach((el) => {
    el.addEventListener('click', () => {
      const targetName = state.order[state.index];
      if (!targetName) return;
      const clickedName = el.getAttribute('data-name');

      if (clickedName === targetName) {
        // Correcto
        el.classList.remove('wrong');
        el.classList.add('correct');
        setDisabled(el, true);
        state.correct += 1;
        state.index += 1;
        updateScore();

        // Avanzar al siguiente tras un breve delay
        setTimeout(() => {
          nextTarget();
        }, 400);
      } else {
        // Error: marcar el clic en rojo brevemente
        state.wrong += 1;
        updateScore();
        el.classList.add('wrong');
        setTimeout(() => el.classList.remove('wrong'), 550);
      }
    });
  });
}

async function startGame() {
  try {
    const { svg, regions } = await loadMap();
    // Reiniciar estado de puntaje/orden
    state.correct = 0;
    state.wrong = 0;
    state.index = 0;
    state.order = buildOrder(regions);
    state.initialTotal = state.order.length;
    state.finished = false;
    updateScore();
    // Reset zoom
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    applyZoom();

    // Habilitar todas las regiones y limpiar estilos
    regions.forEach((r) => {
      r.classList.remove('correct', 'wrong', 'disabled');
      setDisabled(r, false);
    });

    // Deshabilitar regiones excluidas para que no generen clics erróneos
    regions.forEach((r) => {
      const n = r.getAttribute('data-name');
      if (n && EXCLUDED_ASK.has(norm(n))) setDisabled(r, true);
    });

    attachHandlers(svg, regions);
    nextTarget();

    // Timer segun modo
    setupTimer();
  } catch (err) {
    console.error(err);
    const stage = $('#svg-stage');
    if (stage) stage.innerHTML = '<div class="error">No se pudo cargar el mapa.</div>';
  }
}

/** Modo y temporizador **/
function msToClock(ms) {
  if (ms < 0) ms = 0;
  const s = Math.ceil(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function setupTimer() {
  clearTimer();
  const timerEl = $('#timer');
  if (state.mode === 'timed' && state.durationMs > 0) {
    state.startAt = Date.now();
    state.endAt = state.startAt + state.durationMs;
    timerEl.textContent = msToClock(state.durationMs);
    state.timerId = setInterval(() => {
      const remaining = state.endAt - Date.now();
      timerEl.textContent = msToClock(remaining);
      if (remaining <= 0) {
        clearTimer();
        if (!state.finished) onTimeUp();
      }
    }, 200);
  } else {
    timerEl.textContent = '—';
  }
}

function clearTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

/** Zoom **/
function applyZoom() {
  const svgEl = $('#svg-stage svg');
  if (!svgEl) return;
  const z = Math.max(1, Math.min(3, state.zoom));
  svgEl.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${z})`;
}

function onTimeUp() {
  if (state.finished) return; // evitar sobrescribir resultados si ya se completó
  // Deshabilitar interacción
  $$('.region').forEach((r) => setDisabled(r, true));
  setTargetName('—');
  // Mostrar resultados con tiempo total usado = duración completa
  showResults(state.durationMs);
}

function showResults(usedMs) {
  // Avance debe contar solo aciertos
  const solved = Math.min(state.correct, state.initialTotal);
  const pct = state.initialTotal ? Math.round((solved / state.initialTotal) * 100) : 0;
  $('#res-correct').textContent = String(state.correct);
  $('#res-wrong').textContent = String(state.wrong);
  $('#res-progress').textContent = `${solved}/${state.initialTotal}`;
  $('#res-progresspct').textContent = `${pct}%`;
  // Para tiempo usado, mostramos hacia abajo (floor) para no redondear a 01:00 si fue < 60s
  $('#res-time').textContent = msToClockFloor(usedMs);
  const bar = $('#res-progressbar');
  if (bar) bar.style.width = `${pct}%`;
  const trophy = $('#res-trophy');
  if (trophy) {
    const finishedAll = solved >= state.initialTotal && state.initialTotal > 0;
    trophy.textContent = (finishedAll && usedMs < state.durationMs) ? '🏆' : '';
  }
  showOverlay('#overlay-results');
}

// Representación de reloj con redondeo hacia abajo (para tiempos usados)
function msToClockFloor(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function enterTimed() {
  state.mode = 'timed';
  state.durationMs = 60_000;
  const b = $('#btn-timed');
  if (b) b.classList.add('active');
  startGame();
}

function exitTimedEarlyAndShowResults() {
  clearTimer();
  const now = Date.now();
  const used = state.startAt ? Math.max(0, Math.min(state.durationMs, now - state.startAt)) : 0;
  showResults(used);
}

/** Overlays y UI **/
function showOverlay(sel) {
  $(sel).classList.remove('hidden');
}
function hideOverlay(sel) {
  $(sel).classList.add('hidden');
}

/** Botón Pasar **/
function skipCurrent() {
  const targetName = state.order[state.index];
  if (!targetName) return;
  state.wrong += 1;
  updateScore();
  // Re-encolar al final y avanzar
  state.order.push(targetName);
  state.index += 1;
  nextTarget();
}

document.addEventListener('DOMContentLoaded', () => {
  // Inicia en modo libre por defecto
  state.mode = 'free';
  state.durationMs = 0;
  startGame();

  // Controles básicos
  $('#btn-reset').addEventListener('click', () => {
    clearTimer();
    startGame();
  });
  $('#btn-skip-map').addEventListener('click', () => skipCurrent());
  // Zoom controls
  $('#zoom-in').addEventListener('click', () => { state.zoom = Math.min(3, (state.zoom + 0.25)); applyZoom(); });
  $('#zoom-out').addEventListener('click', () => { state.zoom = Math.max(1, (state.zoom - 0.25)); applyZoom(); });
  // Botón Modo 1 minuto (toggle)
  $('#btn-timed').addEventListener('click', () => {
    if (state.mode !== 'timed') {
      enterTimed();
    } else {
      exitTimedEarlyAndShowResults();
    }
  });

  // Overlays: resultados
  $('#again-same').addEventListener('click', () => {
    hideOverlay('#overlay-results');
    enterTimed();
  });
  // Cerrar resultados (X) vuelve a modo libre
  $('#results-close').addEventListener('click', () => {
    hideOverlay('#overlay-results');
    state.mode = 'free';
    state.durationMs = 0;
    const b = $('#btn-timed');
    if (b) b.classList.remove('active');
    startGame();
  });

  // Panning con arrastre dentro del área del mapa
  setupPanning();
});

/** Panning (arrastrar para mover el mapa) **/
function setupPanning() {
  const viewport = document.querySelector('.svg-viewport');
  if (!viewport) return;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let suppressClick = false;
  let pointerActive = false; // verdadero solo si hicimos pointerdown válido
  const DRAG_THRESHOLD = 12; // píxeles, para evitar micro-movimientos

  // Soporte de pinza (pinch) para zoom dentro del mapa
  const activePointers = new Map(); // pointerId -> {x, y}
  let pinching = false;
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let pinchStartPanX = 0;
  let pinchStartPanY = 0;
  let pinchPivotX = 0;
  let pinchPivotY = 0;

  const svgEl = () => document.querySelector('#svg-stage svg');
  const clampZoom = (z) => Math.max(1, Math.min(3, z));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const getTwoPointers = () => {
    const it = Array.from(activePointers.values());
    return it.length >= 2 ? [it[0], it[1]] : null;
  };

  const beginPinchIfNeeded = () => {
    const pts = getTwoPointers();
    if (!pts || pinching) return;
    pinching = true;
    pinchStartDist = dist(pts[0], pts[1]);
    pinchStartZoom = state.zoom;
    pinchStartPanX = state.panX;
    pinchStartPanY = state.panY;
    const center = mid(pts[0], pts[1]);
    pinchPivotX = center.x;
    pinchPivotY = center.y;
    suppressClick = true;
    viewport.classList.add('is-dragging');
  };

  const updatePinch = () => {
    if (!pinching) return;
    const pts = getTwoPointers();
    if (!pts) return;
    const currentDist = dist(pts[0], pts[1]);
    if (pinchStartDist <= 0) return;
    const factor = currentDist / pinchStartDist;
    const newZoom = clampZoom(pinchStartZoom * factor);

    // Mantener el punto de pinza (pivot) estable en pantalla
    const svg = svgEl();
    if (svg) {
      const rect = svg.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      // Vector desde el centro visual del SVG hasta el pivot, en coords sin escalar
      const vx = (pinchPivotX - centerX) / (pinchStartZoom || 1);
      const vy = (pinchPivotY - centerY) / (pinchStartZoom || 1);
      const dz = newZoom - pinchStartZoom;
      const dx = -(dz) * vx;
      const dy = -(dz) * vy;
      state.panX = pinchStartPanX + dx;
      state.panY = pinchStartPanY + dy;
    }
    state.zoom = newZoom;
    applyZoom();
  };

  const onPointerDown = (e) => {
    // Evitar interferir con controles interactivos (botones, etc.)
    const target = e.target;
    if (target.closest && (target.closest('.zoom-controls') || target.closest('button'))) return;
    // Solo botón principal o toque
    if (e.button !== undefined && e.button !== 0) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // En desktop (mouse) no capturamos el puntero para no romper los clicks
    // sobre las regiones del SVG. Mantener captura solo para touch/pen.
    if (e.pointerType && e.pointerType !== 'mouse') {
      try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
    }
    // Si pasamos a 2 punteros, comenzamos pinza
    if (activePointers.size >= 2) {
      // cancelar cualquier arrastre de un dedo
      dragging = false;
      pointerActive = false;
      beginPinchIfNeeded();
      return;
    }
    dragging = false; // se activará al pasar el umbral
    pointerActive = true;
    suppressClick = false;
    startX = e.clientX;
    startY = e.clientY;
    originX = state.panX;
    originY = state.panY;
  };
  const onPointerMove = (e) => {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinching) {
      updatePinch();
      return;
    }
    if (!pointerActive) return; // ignorar movimientos si no hubo pointerdown válido
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        dragging = true;
        suppressClick = true;
        viewport.classList.add('is-dragging');
      } else {
        return;
      }
    }
    state.panX = originX + dx;
    state.panY = originY + dy;
    applyZoom();
  };
  const onPointerUp = (e) => {
    if (activePointers.has(e.pointerId)) activePointers.delete(e.pointerId);
    try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
    if (pinching && activePointers.size < 2) {
      pinching = false;
      viewport.classList.remove('is-dragging');
    }
    if (dragging) {
      dragging = false;
      viewport.classList.remove('is-dragging');
    }
    // limpiar el flag de supresión al terminar el gesto
    suppressClick = false;
    pointerActive = false;
  };
  const onClickCapture = (e) => {
    if (suppressClick) {
      e.stopImmediatePropagation();
      e.preventDefault();
      suppressClick = false;
    }
  };

  // Registrar una sola vez
  if (!viewport._panReady) {
    viewport.addEventListener('click', onClickCapture, true); // captura
    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    viewport.addEventListener('pointerleave', onPointerUp);
    viewport._panReady = true;
  }

  // Zoom con scroll en desktop: acerca/aleja manteniendo el cursor como pivote
  const onWheel = (e) => {
    // Evitar hacer zoom si hay modificadores extraños, pero permitir ctrl+wheel también
    // Solo prevenir comportamiento por defecto dentro del mapa
    e.preventDefault();
    const svg = svgEl();
    if (!svg) return;
    // Factor de zoom por paso de rueda (suave)
    const base = 1.12;
    const direction = e.deltaY < 0 ? 1 : -1; // rueda arriba: acercar
    const targetZoom = clampZoom(state.zoom * (direction > 0 ? base : (1 / base)));
    if (targetZoom === state.zoom) return;

    // Mantener el punto bajo el cursor estable en pantalla
    const rect = svg.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const vx = (e.clientX - centerX) / (state.zoom || 1);
    const vy = (e.clientY - centerY) / (state.zoom || 1);
    const dz = targetZoom - state.zoom;
    const dx = -(dz) * vx;
    const dy = -(dz) * vy;
    state.panX += dx;
    state.panY += dy;
    state.zoom = targetZoom;
    applyZoom();
  };

  // Registrar listener de wheel (solo una vez)
  if (!viewport._wheelReady) {
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport._wheelReady = true;
  }
}
