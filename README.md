# Mi Wiki personal

Wiki personal sin framework, lista para publicar en Netlify. La lectura es pública; crear y editar páginas requiere iniciar sesión como administrador.

## Contenido desde código

Las páginas iniciales están en `content/*.md` y su menú en `content/manifest.json`. Puedes editarlos y subirlos al repositorio como cualquier archivo Markdown.

## Contenido desde la wiki

Al iniciar sesión se habilitan **Editar** y **Nueva página**. En el editor puedes marcar **Solo administradores** para que una página requiera iniciar sesión. La navegación conserva el título de la página, pero su contenido y su historial solo se sirven mediante la API tras validar la sesión. Cada publicación crea o actualiza `content/<slug>.md` y `content/manifest.json` en la rama configurada de GitHub. GitHub crea un commit con ambos archivos y Netlify vuelve a desplegar el sitio. En desarrollo local, los mismos archivos se actualizan directamente en `content/`.

Para adjuntar un PDF, abre una página ya publicada con **Editar** o **Editar código**, elige el archivo y pulsa **Adjuntar a esta página**. Se añade un enlace de descarga al contenido; publica los cambios para guardar el enlace. Se admiten PDFs de hasta 4 MB. Los adjuntos se guardan en `content/attachments/` y se sirven mediante la API, con la misma restricción de acceso que tenga su página. En un repositorio público, los adjuntos también serán accesibles desde GitHub: usa un repositorio privado si deben ser confidenciales.

En el editor visual, selecciona texto y elige un color predeterminado en la barra de formato. Los colores se conservan al publicar; el editor de código también los muestra mediante la sintaxis `{{color:#d1242f|texto}}`.

En pantallas estrechas, **Explorar** y **Apariencia** abren paneles desde la cabecera; el artículo conserva todo el ancho disponible y la búsqueda permanece accesible.

## Publicar en Netlify

1. Sube esta carpeta a un repositorio Git y conéctalo a Netlify.
2. Netlify detectará `netlify.toml`; el directorio de publicación es la raíz y las funciones están en `netlify/functions`.
3. En **Site configuration → Environment variables**, crea estas variables antes de publicar:

   - `WIKI_ADMIN_USER`: tu usuario administrador.
   - `WIKI_ADMIN_PASSWORD`: una contraseña larga y única.
   - `WIKI_SESSION_SECRET`: una cadena aleatoria larga para firmar sesiones.
   - `GITHUB_TOKEN`: un token de GitHub con permiso **Contents: Read and write** para el repositorio.
   - `GITHUB_OWNER`: propietario del repositorio.
   - `GITHUB_REPO`: nombre del repositorio.
   - `GITHUB_BRANCH`: rama que recibirá los commits (opcional; por defecto, `main`).

El token se usa solo en la función de Netlify; nunca se envía al navegador. La rama debe permitir que el token cree commits. Durante el desarrollo local, si no existen variables de acceso, el usuario y la contraseña son `admin` / `admin`; no dejes esos valores en un sitio público.

Si el token, el repositorio o la rama no están configurados correctamente, el editor mostrará un error claro y la función registrará el detalle en los logs de Netlify.

Las páginas marcadas como **Solo administradores** quedan protegidas tanto en la API como frente al acceso directo a sus archivos Markdown e historiales. El manifiesto de navegación permanece público, por lo que el título y la configuración de acceso de las páginas pueden verse; no guardes contraseñas ni secretos dentro del manifiesto. Si el repositorio de GitHub es público, sus archivos también son públicos: usa un repositorio privado para proteger la confidencialidad del contenido.
