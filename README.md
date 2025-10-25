# ¿Qué departamento es? — Juego de mapa (Colombia)

Juego simple de preguntas donde se muestra un mapa de Colombia con los **departamentos sin nombre visible**. Arriba aparece el nombre de un departamento (p. ej. "Córdoba") y la persona debe hacer clic en el departamento correcto. Si acierta el área se pinta en verde y el juego avanza; si falla, el área clicada se pinta en rojo brevemente.

Este proyecto incluye un **SVG de demostración simplificado** para probar la mecánica. Para un juego real, sustituye ese SVG por un mapa preciso de los 32 departamentos.

## Ejecutar

- Abre `index.html` en tu navegador.
- Nota: algunos navegadores bloquean `fetch()` en `file://`. Si el mapa no carga, sirve la carpeta con un servidor estático simple (por ejemplo, `python -m http.server 8000`) y visita `http://localhost:8000/`.

## Estructura

- `index.html` — Maquetación básica y contenedores.
- `styles.css` — Estilos del layout y del mapa (colores, estados correcto/incorrecto).
- `app.js` — Lógica del juego: carga del SVG, orden aleatorio, validación de clics, marcador.
- `assets/colombia.svg` — Mapa preciso (departamentos) de SimpleMaps.
- `assets/colombia-demo.svg` — Mapa simplificado de ejemplo (para pruebas).

## Cambiar o actualizar el mapa

1. Consigue un SVG con los límites de los **departamentos de Colombia** (no regiones naturales). Asegúrate de que cada departamento sea un elemento independiente (por ejemplo, un `<path>` o `<polygon>`).
2. Edita el SVG para que cada elemento clicable tenga un atributo `data-name` con el **nombre del departamento** tal como quieres que aparezca en pantalla. Ejemplos válidos:

   ```xml
   <path d="…" data-name="Córdoba" />
   <path d="…" data-name="Antioquia" />
   <path d="…" data-name="Valle del Cauca" />
   ```

3. Guarda ese archivo como `assets/colombia.svg` (o cambia el nombre y añade la ruta a la lista `CANDIDATE_SVGS` en `app.js`).

### Recomendaciones del SVG

- Mantén un único `<svg>` con `viewBox` definido para que escale bien.
- Usa un contenedor `<g>` por departamento o un `<path>` por departamento.
- No dibujes textos/etiquetas encima; el juego muestra el nombre arriba.
- Los estilos de interacción (`.region:hover`, `.region.correct`, etc.) se aplican por clase `.region`. El script ya añade `class="region"` a todo elemento que tenga `data-name`, pero puedes incluirlo tú mismo si prefieres.

## Aclaración

El ejemplo usa **departamentos**, porque “Córdoba” es un departamento. Si quieres usar **regiones naturales** (Caribe, Andina, Pacífica, Orinoquía, Amazonía, Insular), el mismo mecanismo funciona: usa un SVG con esas 6 regiones y pon `data-name` con sus nombres.

## Licencia del mapa

- `assets/colombia.svg` proviene de SimpleMaps y se distribuye bajo los términos indicados en https://simplemaps.com/resources/svg-license. Atribución apreciada: SimpleMaps (simplemaps.com).
- Si sustituyes el SVG, respeta la licencia del recurso que utilices (idealmente dominio público u open data compatible).
