const { getStore } = require('@netlify/blobs');
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

exports.handler = async event => {
  const q = event.queryStringParameters || {};
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'PUT') {
    return response(405, { error: 'Método no permitido' });
  }

  if (event.httpMethod === 'PUT') {
    const secret = process.env.WIKI_SESSION_SECRET;
    if (!secret) return response(500, { error: 'Falta configurar WIKI_SESSION_SECRET en Netlify' });
    if (!admin(event, secret)) return response(401, { error: 'No autorizado' });
  }

  try {
    const store = getStore('wiki-content');
    if (event.httpMethod === 'GET') {
      if (q.type === 'manifest') {
        return response(200, { manifest: await store.get('manifest', { type: 'json' }) || { pages: [], categories: [] } });
      }
      if (q.slug) {
        const content = await store.get(`pages/${q.slug}`);
        return content ? response(200, { content }) : response(404, { error: 'No existe una versión guardada' });
      }
      return response(400, { error: 'Falta página' });
    }

    let input;
    try { input = JSON.parse(event.body || '{}'); }
    catch { return response(400, { error: 'La solicitud contiene JSON no válido' }); }
    const { slug, content, manifest } = input;
    if (!/^[a-z0-9-]+$/.test(slug || '') || typeof content !== 'string' || !manifest) {
      return response(400, { error: 'Datos inválidos' });
    }

    await store.set(`pages/${slug}`, content);
    await store.setJSON('manifest', manifest);
    return response(200, { ok: true });
  } catch (error) {
    console.error('Error al acceder al almacenamiento de Wiki Blobs:', error);
    return response(500, { error: 'No se pudo acceder al almacenamiento de Netlify. Revisa la configuración y los logs de la función.' });
  }
};
