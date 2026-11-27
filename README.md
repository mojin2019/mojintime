# MOJIN TIME — La Carpa

Web personal y archivo sonoro de **Mojin Time**. Una sola página, sin backend, lista para subir a cualquier hosting estático.

## Qué incluye

- `index.html` — la web completa (hero, archivo, especiales, YouTube, Twitch, sobre mí, redes).
- `assets/css/main.css` — todo el diseño, efectos y responsive.
- `assets/css/fonts.css` + `assets/fonts/` — tipografías autoalojadas (Anton, Manrope, JetBrains Mono).
- `assets/js/data.js` — **229 sesiones** de La Carpa con fecha, duración, tamaño, portada y enlaces a Internet Archive; **15 vídeos** del canal de YouTube; datos de Twitch y redes.
- `assets/js/app.js` — reproductor personalizado, visualizador, búsqueda, filtros, favoritos, mini reproductor, modales de YouTube/Twitch y efectos.
- `assets/img/` — logo, banners, portadas y miniaturas optimizadas.
- `404.html`, `site.webmanifest`, `robots.txt`, `sitemap.xml`.

## Cómo subirla

1. Descomprime el ZIP.
2. Sube **el contenido** de la carpeta a la raíz pública de tu hosting (`public_html`, `www`, `htdocs`…). El `index.html` debe quedar en la raíz, no dentro de una subcarpeta.
3. Abre tu dominio. No hace falta PHP, base de datos ni instalar nada.

Funciona en cualquier hosting estático: ByetHost, Hostinger, Netlify, Vercel, GitHub Pages, Cloudflare Pages, etc. Para que el reproductor de Twitch funcione, la web debe abrirse desde `http://` o `https://` (no desde `file://`).

## Cambiar el dominio

La web está preparada para `https://mojintime.byethost12.com/`. Si la subes a otro dominio, busca y reemplaza esa URL en:

- `index.html` (canonical, Open Graph, Twitter Card y JSON-LD).
- `robots.txt` y `sitemap.xml`.

El reproductor de Twitch detecta solo el dominio actual, así que no hay que tocar nada más.

## Cómo funciona el audio

Las 229 sesiones (110,8 GB) **no están dentro del ZIP**. Se reproducen en streaming directamente desde Internet Archive, que permite CORS y rangos de bytes:

`https://archive.org/details/mojin-time-la-carpa`

El reproductor guarda en `localStorage` la última sesión, el minuto, el volumen, la velocidad, el modo aleatorio y las favoritas. No se envía nada a ningún servidor.

## Actualizar el archivo

`assets/js/data.js` se generó a partir del metadata de Internet Archive y del feed de YouTube. No necesitas regenerarlo para publicar. Si quieres añadir o editar sesiones, abre `data.js`: cada sesión es un objeto dentro de `sessions`; para los vídeos, cada entrada vive en `videos`.

## Créditos y notas

- Logo, banners y nombre: **Mojin Time**.
- Sesiones alojadas en **Internet Archive**; la música pertenece a sus autores.
- Datos públicos de **Twitch**, **YouTube**, **Instagram**, **TikTok** e **Internet Archive**.
- Tipografías: Anton, Manrope y JetBrains Mono, distribuidas bajo SIL Open Font License.
- Diseño y desarrollo: HTML, CSS y JavaScript sin frameworks ni dependencias externas.
- No hay cookies, analítica ni rastreo.

**La carpa nunca cierra.**
