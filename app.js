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
  const wrapper = $('#map-wrapper');
  wrapper.innerHTML = '<div class="loading">Cargando mapa…</div>';

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
  wrapper.innerHTML = svgText;

  // Normalizar: agregar clase .region a todas las capas clicables
  const svg = $('svg', wrapper);
  if (!svg) throw new Error('SVG inválido');

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
  const names = regions.map((r) => r.getAttribute('data-name'));
  return shuffle(names);
}

function nextTarget() {
  if (state.index >= state.order.length) {
    // Juego terminado
    setTargetName('¡Completado!');
    // Deshabilitar todo
    $$('.region').forEach((r) => setDisabled(r, true));
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
    // Reiniciar estado
    state.correct = 0;
    state.wrong = 0;
    state.index = 0;
    state.order = buildOrder(regions);
    updateScore();

    // Habilitar todas las regiones y limpiar estilos
    regions.forEach((r) => {
      r.classList.remove('correct', 'wrong', 'disabled');
      setDisabled(r, false);
    });

    attachHandlers(svg, regions);
    nextTarget();
  } catch (err) {
    console.error(err);
    $('#map-wrapper').innerHTML = '<div class="error">No se pudo cargar el mapa.</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('#btn-reset').addEventListener('click', () => startGame());
  startGame();
});
