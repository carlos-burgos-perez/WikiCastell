# Guía de uso de la wiki

Bienvenido a la Wiki Vermell. Esta guía explica paso a paso cómo leerla, cómo crear y editar páginas si eres administrador y cómo se guarda la información.

## Antes de empezar

La wiki está pensada para consultar información. **Las páginas se pueden leer sin iniciar sesión.** Solo hace falta una cuenta de administrador para crear o cambiar contenido.

## Para cualquier persona: consultar la wiki

### Abrir una página

1. Mira el menú **Explorar**, en el lado izquierdo.
2. Busca el título de la página debajo de su categoría.
3. Haz clic en el título. El contenido aparecerá en el centro.
4. Si una página tiene apartados, puedes usar su índice para saltar directamente a uno.
5. Haz clic en **Contenido** para abrir el índice general. Haz clic en el logotipo **Wiki Vermell** para volver al inicio.

### Buscar

1. Escribe una palabra o parte del título en el cuadro de búsqueda de arriba.
2. Haz clic en **Buscar**.
3. La wiki abrirá la primera página cuyo título coincida.

La búsqueda encuentra páginas por su título; no busca palabras dentro del contenido. Si no encuentra una página, prueba con menos palabras o búscala en el menú.

### Cambiar la apariencia

En el panel **Apariencia** puedes elegir:

- **Normal** o **Grande** para cambiar el tamaño de letra.
- **Claro** u **Oscuro** para cambiar los colores.

Estos ajustes solo cambian cómo ves la wiki en tu navegador; no modifican ninguna página.

## Para administradores

### Las credenciales y cómo protegerlas

En la web publicada, el usuario y la contraseña de administrador son valores privados, por lo que se recomienda consultar estas al desarrollador de la pagina. En caso de perder una contraseña, se puede consultar de nuevo o recuperar comunicándose con el desarrollador de la página (Carlos Burgos).

### Iniciar sesión y salir

1. Haz clic en **Acceder**, arriba a la derecha.
2. Escribe el usuario y la contraseña que te ha facilitado el responsable.
3. Haz clic en **Iniciar sesión**.
4. Al entrar verás las opciones de edición y el botón **Crear página**.
5. Para salir, haz clic en **Cerrar sesión**.

La sesión se conserva en ese navegador durante un máximo de 12 horas. Al cerrar sesión, vuelve al modo de lectura.

### Crear una página nueva

1. Inicia sesión.
2. Haz clic en **Crear página** en el menú de la izquierda. Si quieres crearla dentro de otra, abre esa página y haz clic en **Crear subpágina**.
3. Escribe un **Título**. Es el nombre visible de la página y es obligatorio.
4. Escribe o elige una **Categoría**. También es obligatorio. Las categorías existentes aparecen como sugerencias; puedes escribir una nueva.
5. Si aparece **Página superior**, elige una página para que esta nueva quede dentro de ella. Déjalo sin seleccionar si quieres una página normal dentro de la categoría.
6. Si quieres, añade un **Resumen** corto.
7. Escribe el contenido en el editor visual.
8. Revisa el resultado y haz clic en **Publicar cambios** una sola vez. Espera a que termine el guardado.

El título determina la dirección de la página. Por ejemplo, **Lista de socios** se convierte en `lista-de-socios`. Usa títulos distintos para no confundir páginas. La dirección de una página existente no cambia al editarla.

Una página publicada puede tardar un poco en aparecer para todo el mundo mientras se actualiza la web.

### Editar una página

1. Abre la página que quieras cambiar.
2. Haz clic en **Editar** para usar el editor visual o en **Editar código** para escribir Markdown (formato de código).
3. Puedes cambiar el título, la categoría, el resumen, la página superior y el contenido.
4. Indica la **Posición en la categoría** para decidir dónde aparecerá la página. La primera posición aparece antes que las demás. Si la página es una subpágina, la posición se aplica entre las subpáginas de su nivel.
5. Revisa los cambios y pulsa **Publicar cambios**.

Al cambiar la categoría, la página aparecerá al final de la nueva categoría; puedes cambiar su posición antes de publicar. Si cambias el título, se mantiene la dirección existente. La navegación y el índice respetan el orden guardado.

Si eliges una **Página superior**, la página aparecerá como subpágina en el menú lateral, pero no se insertará automáticamente en el contenido de su página superior. Para enlazarla en el punto que quieras, escribe el enlace en el editor de código o selecciona texto en el editor visual y usa **Enlace**.

### Editar solo un apartado

Si una página tiene apartados, puede aparecer un enlace **editar** junto a cada título. Haz clic para abrir ese apartado, cambia solo lo necesario y pulsa **Guardar sección**. Así no tienes que abrir y modificar todo el artículo.

### Dar formato en el editor visual

1. Haz clic dentro del texto y selecciona las palabras que quieres cambiar.
2. Usa la barra del editor:

- **B**: negrita.

- **I**: cursiva.

- **Título**: crear un apartado.

- **Lista**: crear una lista con puntos.

- **Cita**: destacar una cita.

- **Enlace**: enlazar texto a una dirección web.

- **Tabla**, **Imagen** y **Desplegable**: insertar esos elementos.

1. Para una tabla, indica el número de columnas y filas y luego sustituye los textos de ejemplo.
2. Para una imagen, proporciona una dirección web que empiece por `https://` o `http://`. La imagen debe estar alojada en una dirección accesible; el editor no sube archivos desde el ordenador.
3. El desplegable muestra su contenido cuando el lector abre el bloque.

### Usar el editor de código

El editor de código permite escribir Markdown. Muestra una vista previa a la derecha. Para crear un enlace manual a otra página de la wiki, pon el enlace justo donde quieras que aparezca y usa su dirección corta (`slug`) como destino, empezando por `#`. Por ejemplo, `[Ver tesorería](#tesoreria)`. Al pulsarlo, se abrirá esa página dentro de la wiki. Los enlaces a direcciones web siguen abriéndose en otra pestaña.

En el editor visual también puedes seleccionar el texto, pulsar **Enlace** e introducir `#slug` como dirección. Por ejemplo, `#tesoreria` abre la página **Tesorería**.

Para anidar apartados en el índice de la página, usa niveles de título Markdown: `## Apartado`, `### Subapartado`, `#### Apartado de tercer nivel` y así hasta `######`. Cada nivel aparece más sangrado que el anterior. También puedes escribir `- Primer elemento` para crear una lista. Para poner negrita o cursiva, selecciona el texto en el editor visual y pulsa **B** o **I**.

Para una tabla sencilla, escribe estas líneas en el editor:

- Encabezado: `| Nombre | Cargo |`
- Separador: `| --- | --- |`
- Primera fila: `| Ana | Secretaria |`
- Segunda fila: `| Luis | Tesorero |`

Cuando termines, revisa la vista previa y pulsa **Publicar cambios**. Si no estás seguro, pulsa **Cancelar** para cerrar sin guardar.

### Qué hacer si algo falla

- **No puedo iniciar sesión:** comprueba que usuario y contraseña estén escritos tal como te los dieron. Si sigue fallando, pide al propietario que revise las credenciales.
- **No veo los botones de edición:** comprueba si has iniciado sesión. Si no, el navegador está en modo lectura.
- **El guardado muestra un error de GitHub o Netlify:** no pulses publicar repetidamente. Copia el texto del error y envíaselo al responsable de la wiki; no incluyas contraseñas, tokens ni nada que pueda comprometer la seguridad.
- **La página no aparece al instante:** espera a que la web termine el despliegue y vuelve a cargarla.
- **He publicado un cambio incorrecto:** avisa al responsable. Los cambios se guardan en GitHub; la wiki no tiene un botón para deshacer ni para eliminar página.

Si se encuentra algún error fuera de los especificados o alguna mejor que se desee implementar, por favor, anótese en la página de [sugerencias y mejoras](#sugerencias-y-mejoras)

## Información para desarrolladores

Se podrá observar el [changelog](#changelog) en su página correspondiente.

### Cómo está organizado el proyecto

- `index.html`: estructura de la web, navegación, formularios de acceso y editores.
- `app.js`: navegación, búsqueda, inicio de sesión, edición, conversión Markdown y conexión con la API.
- `interface.js` y los archivos CSS: detalles de la interfaz y estilos.
- `content/manifest.json`: títulos, direcciones, categorías, resúmenes y páginas superiores.
- `content/*.md`: contenido de cada página. El nombre del archivo coincide con el `slug`; por ejemplo, `content/guia-de-uso-de-la-wiki.md`.
- `netlify/functions/auth.js`: valida las credenciales de administrador y entrega una sesión firmada.
- `netlify/functions/wiki.js`: lee el manifiesto y las páginas desde GitHub y guarda los cambios en el repositorio.
- `server.js`: servidor sencillo para probar la web localmente.
- `netlify.toml`: configuración de publicación y ruta de las funciones de Netlify.

La aplicación es JavaScript sin framework ni proceso de compilación. Se puede iniciar en local con `node server.js` o `npm run dev`; por defecto escucha en `http://localhost:8888`.

### Cómo se guarda una página

1. El navegador envía el título, el contenido y el manifiesto a `PUT /api/wiki`.
2. La función comprueba la sesión de administrador.
3. La función de Netlify usa la API de GitHub para añadir o actualizar `content/<slug>.md` y `content/manifest.json` en un mismo commit.
4. La referencia de la rama se actualiza sin forzarla. Si otra edición cambia la rama a la vez o la rama está protegida, el guardado puede fallar en vez de sobrescribir esos cambios.
5. Netlify debe estar conectado a esa rama para que el commit inicie un nuevo despliegue.

En local, `server.js` escribe directamente los archivos de `content/`. No se necesita un token de GitHub para esa prueba local.

### Variables privadas de Netlify

Configura estas variables en Netlify, con alcance **Functions** y para el contexto de despliegue que se usa:

- `WIKI_ADMIN_USER`: usuario administrador.
- `WIKI_ADMIN_PASSWORD`: contraseña de administrador.
- `WIKI_SESSION_SECRET`: secreto utilizado para firmar sesiones; los tokens duran 12 horas.
- `GITHUB_TOKEN`: token privado con permiso **Contents: Read and write** en el repositorio.
- `GITHUB_OWNER`: propietario del repositorio.
- `GITHUB_REPO`: nombre del repositorio.
- `GITHUB_BRANCH`: rama de destino; si no se define, se usa `main`.

Después de cambiar variables, crea un nuevo despliegue. **Nunca guardes los valores privados en `content/`, el frontend, el repositorio ni esta guía.**

### Añadir una página manualmente

1. Crea `content/mi-pagina.md` con el contenido Markdown.
2. Añade un objeto en `pages` dentro de `content/manifest.json`, con `slug`, `title`, `category` y, si conviene, `summary` y `parent`.
3. Asegúrate de que la categoría esté incluida en `categories`.
4. Haz commit y publica los cambios en la rama que Netlify despliega.

El `slug` solo puede contener letras minúsculas sin acentos, números y guiones. Mantén el nombre del archivo y el `slug` iguales.

### Seguridad y límites conocidos

- La lectura de páginas es pública; no uses la wiki como almacén de secretos ni des por privada la información publicada.
- El token de GitHub solo debe existir como variable de entorno de la función. Nunca debe enviarse al navegador.
- En desarrollo local, `admin` / `admin` es solo un valor de prueba si no se han definido credenciales.
- No hay una función de eliminación de páginas ni un historial visual para restaurar versiones. GitHub conserva los commits para que un desarrollador autorizado pueda revisar y recuperar cambios.
- Si el guardado falla, revisa el mensaje del editor y los registros de `wiki` en Netlify. No registres ni compartas el token.