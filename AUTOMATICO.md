# Publicación automática

La web ya no se toca a mano. Un workflow de GitHub Actions hace cada 6 horas esto:

1. Lee **Internet Archive** y detecta sesiones nuevas, duraciones, tamaños y portadas.
2. Lee el feed de **YouTube** y actualiza los 15 resubidos, vistas, duración y miniaturas.
3. Lee **Twitch** y actualiza seguidores y el último directo.
4. Recalcula los contadores (sesiones, horas, GB), la última sesión, el rango de años y los destacados.
5. Regenera `assets/js/data.js` y los números fijos de `index.html`, `site.webmanifest`, `sitemap.xml` y `robots.txt`.
6. Publica la carpeta `dist/` en **GitHub Pages**.

No hacen falta claves, tokens ni base de datos. Todo usa datos públicos.

---

## Ponerlo en marcha una sola vez

### 1. Crea el repositorio

En GitHub crea un repositorio **público** llamado, por ejemplo, `mojintime`.
No marques "Add a README" (ya existe uno).

> GitHub Pages gratis para repositorios públicos. En privados hace falta un plan de pago.

### 2. Sube esta carpeta

Desde `D:\IA\MojinTime-Website`:

```powershell
git remote add origin https://github.com/TU_USUARIO/mojintime.git
git push -u origin main
```

Si GitHub te pide iniciar sesión, usa el navegador o un token personal. También puedes subir el contenido con GitHub Desktop.

### 3. Activa Pages

En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### 4. Lanza la primera publicación

Ve a **Actions → Actualizar y publicar → Run workflow**.

En unos minutos la web estará en:

```text
https://TU_USUARIO.github.io/mojintime/
```

A partir de ahí se actualiza sola. También se publica cada vez que hagas `git push` a `main`.

---

## Dominio propio

Si tienes un dominio (por ejemplo `mojintime.com`):

1. En **Settings → Pages → Custom domain**, escribe el dominio y guarda.
2. En tu proveedor de DNS crea el registro que te indique GitHub
   (normalmente un `CNAME` a `TU_USUARIO.github.io`).
3. En **Settings → Secrets and variables → Actions → Variables**, crea:
   - Nombre: `SITE_URL`
   - Valor: `https://tudominio.com/`
4. Ejecuta otra vez el workflow. Se generará el archivo `CNAME` y las URLs canónicas,
   Open Graph, sitemap y robots apuntarán al dominio nuevo.

El subdominio gratuito de ByetHost no permite cambiar el DNS, así que no se puede
apuntar directamente a GitHub Pages. Opciones:

- usar la URL `TU_USUARIO.github.io/mojintime`;
- usar un dominio propio;
- o pedir un workflow alternativo por FTP para seguir publicando en ByetHost.

---

## Probar y actualizar en tu PC

Necesitas Node.js 20 o superior.

```powershell
npm run actualizar   # lee Archive/YouTube/Twitch y regenera data.js + HTML
npm run build        # crea dist/ listo para publicar
npm run preview      # abre la web en http://127.0.0.1:4173
```

Para probar exactamente lo que se publica:

```powershell
npm run auto
npm run preview:dist
```

---

## Qué se actualiza y qué es editorial

Automático:

- sesiones nuevas de Internet Archive;
- los 15 vídeos más recientes de YouTube;
- seguidores de Twitch y último directo;
- contadores, años, última sesión y portada "La última";
- hasta 4 especiales recientes en la fila de Especiales (los que no estén ya fijados);
- textos y metadatos con números.

Editorial (se conserva aunque se regenere):

- títulos personalizados de sesiones ya existentes (por ejemplo "All Raid Long 2.0 · Parte 1");
- portadas locales de `assets/img/covers/`;
- los especiales fijados a mano en `featured`;
- textos de Sobre mí, Twitch y Redes.

Si quieres fijar un especial que añadió la automatización, quita su propiedad `"auto": true`
en `assets/js/data.js` y se conservará para siempre.

---

## Si algo falla

- **Actions en rojo**: abre el log. Casi siempre es un fallo temporal de Archive o YouTube;
  vuelve a lanzar el workflow.
- **La web no cambia**: comprueba que Pages esté en "GitHub Actions" y que el workflow
  haya terminado en verde. Fuerza recarga con `Ctrl + F5`.
- **Quiero actualizar ya**: Actions → Actualizar y publicar → Run workflow.
- **No quiero que se ejecute solo**: desactiva el workflow en la pestaña Actions o cambia
  el `cron` de `.github/workflows/auto-update.yml`.

El archivo `assets/js/data.js` guarda la fecha de la última generación en `meta.generatedAt`.
