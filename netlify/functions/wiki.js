const crypto = require('crypto');

const response = (status, body) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

function admin(event, secret) {
  const value = event.headers?.authorization || '';
  const [payload, sig] = value.replace('Bearer ', '').split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const given = Buffer.from(sig);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url')).exp > Date.now(); }
  catch { return false; }
}

function githubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const missing = [
    ['GITHUB_TOKEN', token],
    ['GITHUB_OWNER', owner],
    ['GITHUB_REPO', repo]
  ].filter(([, value]) => !value?.trim()).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Netlify no está proporcionando a esta función: ${missing.join(', ')}. Comprueba el alcance Functions y el contexto del deploy.`);
  }
  return { token: token.trim(), owner: owner.trim(), repo: repo.trim(), branch: branch.trim() };
}

function repositoryUrl(config, path) {
  return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${path}`;
}

async function githubRequest(config, path, options = {}) {
  const result = await fetch(repositoryUrl(config, path), {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${config.token}`,
      'x-github-api-version': '2022-11-28',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const text = await result.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`GitHub devolvió una respuesta no válida (${result.status}).`); }
  if (!result.ok) {
    const error = new Error(data.message || `GitHub respondió con el error ${result.status}.`);
    error.status = result.status;
    throw error;
  }
  return data;
}

async function readFile(config, filePath) {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const result = await githubRequest(config, `contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}`);
  if (result.encoding !== 'base64' || typeof result.content !== 'string') {
    throw new Error(`GitHub no devolvió el archivo ${filePath} en formato base64.`);
  }
  return Buffer.from(result.content.replace(/\s/g, ''), 'base64').toString('utf8');
}

async function commitFiles(config, files, message) {
  const branch = encodeURIComponent(config.branch);
  const reference = await githubRequest(config, `git/ref/heads/${branch}`);
  const parentSha = reference.object.sha;
  const parentCommit = await githubRequest(config, `git/commits/${parentSha}`);
  const tree = await githubRequest(config, 'git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: parentCommit.tree.sha,
      tree: files.map(file => ({
        path: file.path,
        mode: '100644',
        type: 'blob',
        content: file.content
      }))
    })
  });
  const commit = await githubRequest(config, 'git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] })
  });
  await githubRequest(config, `git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false })
  });
}

function githubError(error) {
  if (error.status === 401 || error.status === 403) {
    return 'GitHub ha rechazado el token. Comprueba que tiene permiso Contents: Read and write para este repositorio.';
  }
  if (error.status === 404) {
    return 'No se encontró el repositorio o la rama. Comprueba GITHUB_OWNER, GITHUB_REPO y GITHUB_BRANCH, y el acceso del token.';
  }
  if (error.status === 409 || error.status === 422) {
    return 'GitHub no pudo actualizar la rama. Comprueba si está protegida o si ha cambiado durante el guardado.';
  }
  return 'No se pudo acceder al repositorio de GitHub. Revisa la configuración y los logs de la función.';
}

exports.handler = async event => {
  const query = event.queryStringParameters || {};
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'PUT') {
    return response(405, { error: 'Método no permitido' });
  }

  if (event.httpMethod === 'PUT') {
    const secret = process.env.WIKI_SESSION_SECRET;
    if (!secret) return response(500, { error: 'Falta configurar WIKI_SESSION_SECRET en Netlify' });
    if (!admin(event, secret)) return response(401, { error: 'No autorizado' });
  }

  let config;
  try { config = githubConfig(); }
  catch (error) { return response(500, { error: error.message }); }

  try {
    if (event.httpMethod === 'GET') {
      if (query.type === 'manifest') {
        try {
          const manifest = JSON.parse(await readFile(config, 'content/manifest.json'));
          return response(200, { manifest });
        } catch (error) {
          if (error.status === 404) return response(200, { manifest: { pages: [], categories: [] } });
          throw error;
        }
      }
      if (!/^[a-z0-9-]+$/.test(query.slug || '')) return response(400, { error: 'Falta una página válida' });
      try {
        return response(200, { content: await readFile(config, `content/${query.slug}.md`) });
      } catch (error) {
        if (error.status === 404) return response(404, { error: 'No existe una versión guardada' });
        throw error;
      }
    }

    let input;
    try { input = JSON.parse(event.body || '{}'); }
    catch { return response(400, { error: 'La solicitud contiene JSON no válido' }); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return response(400, { error: 'Datos inválidos' });
    }
    const { slug, content, manifest } = input;
    if (!/^[a-z0-9-]+$/.test(slug || '') || typeof content !== 'string' ||
        !manifest || !Array.isArray(manifest.pages) || !Array.isArray(manifest.categories)) {
      return response(400, { error: 'Datos inválidos' });
    }

    await commitFiles(config, [
      { path: `content/${slug}.md`, content },
      { path: 'content/manifest.json', content: `${JSON.stringify(manifest, null, 2)}\n` }
    ], `Save wiki page: ${slug}`);
    return response(200, { ok: true });
  } catch (error) {
    console.error('Error al guardar páginas en GitHub:', error);
    return response(500, { error: githubError(error) });
  }
};
