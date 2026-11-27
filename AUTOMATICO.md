# Publicación automática

La web ya no se toca a mano. Un workflow de GitHub Actions hace cada 6 horas esto:

1. Lee **Internet Archive** y detecta sesiones nuevas, duraciones, tamaños y portadas.
2. Lee el feed de **YouTube** y actualiza los 15 resubidos, vistas, duración y miniaturas.
3. Lee **Twitch** y actualiza seguidores y el último directo.
4. Recalcula los contadores (sesiones, horas, GB), la última sesión, el rango de años y los destacados.
5. Regenera `assets/js/data.js` y los números fijos de `index.html`, `site.webmanifest`, `sitemap.xml` y `robots.txt`.
6. Publica la carpeta `dist/` en **GitHub Pages**.

No hacen falta claves, tokens ni base de datos. Todo usa datos públicos.
La única excepción son las credenciales FTP de ByetHost, que se guardan como
secrets de GitHub si eliges publicar allí.

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

### 3. Activa Pages (solo si vas a usar GitHub Pages)

En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Si solo quieres publicar en ByetHost, sáltate este paso y ve directamente a la
sección **Publicar en ByetHost por FTP**.

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
apuntar directamente a GitHub Pages. Si quieres seguir usando ByetHost, usa el
workflow por FTP que viene incluido: `.github/workflows/deploy-byethost.yml`.

---

## Publicar en ByetHost por FTP

**No tienes que subir nada a ByetHost a mano.** Subes el proyecto a GitHub una vez
y GitHub Actions actualiza la web y sube `dist/` a la carpeta pública de ByetHost
cada 6 horas.

### 1. Averigua los datos FTP

En el panel de ByetHost busca **FTP** o **File Manager**. Normalmente son:

- Servidor: `ftp.byethost12.com` (o el que indique tu panel).
- Usuario: algo como `b12_12345678`.
- Contraseña: la de tu cuenta FTP.
- Carpeta pública: `htdocs/` (en ByetHost suele ser `htdocs`, no `public_html`).

Puedes comprobarlo entrando con FileZilla: el `index.html` actual debe estar dentro
de esa carpeta.

### 2. Guarda las credenciales en GitHub

En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**.

Crea estos secrets:

| Secret | Valor |
|---|---|
| `FTP_SERVER` | `ftp.byethost12.com` (el de tu panel) |
| `FTP_USERNAME` | tu usuario FTP |
| `FTP_PASSWORD` | tu contraseña FTP |
| `FTP_REMOTE_DIR` | `htdocs/` (opcional, debe terminar en `/`) |
| `FTP_PROTOCOL` | `ftp` (opcional; prueba `ftps` si falla) |
| `FTP_PORT` | `21` (opcional) |

Los secrets no se ven en el código ni en los logs. No los pongas en `index.html`
ni en ningún archivo del repositorio.

Si al entrar por FTP ya estás dentro de la carpeta pública (ves `index.html` en la
raíz), pon `FTP_REMOTE_DIR` con valor `/`. Si ves una carpeta `htdocs`, deja el
valor por defecto `htdocs/`.

### 3. Lanza la primera subida

Ve a **Actions → Actualizar y publicar en ByetHost → Run workflow**.

El workflow:

1. Lee Archive, YouTube y Twitch.
2. Regenera `data.js`, `index.html`, sitemap, etc.
3. Prepara `dist/`.
4. Sube **el contenido de `dist/`** a `htdocs/` por FTP.
5. Repite todo cada 6 horas.

Abre tu dominio y comprueba que la portada nueva está ahí. A partir de ese momento
no vuelves a subir archivos manualmente.

### Si el FTP falla

- Revisa que `FTP_REMOTE_DIR` sea exactamente la carpeta donde está el `index.html`
  actual (normalmente `htdocs/`).
- Comprueba usuario y contraseña entrando con FileZilla.
- Si tu hosting usa FTP seguro, crea `FTP_PROTOCOL` con valor `ftps`.
- Algunos paneles de ByetHost bloquean FTP hasta que lo activas o creas un usuario FTP.
- El workflow no borra archivos antiguos (`dangerous-clean-slate: false`), así que
  una primera subida nunca te deja la web vacía.

### Si solo quieres ByetHost

Puedes desactivar el workflow de GitHub Pages en **Actions → Actualizar y publicar →
⋯ → Disable workflow**. El de ByetHost seguirá funcionando solo.

Si quieres las dos copias (GitHub Pages y ByetHost), deja los dos workflows activos.

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
