// Servidor local para probar la wiki sin instalar la CLI de Netlify.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const port = Number(process.env.PORT || 8888);
const contentDir = path.join(root, 'content');
const historyDir = path.join(contentDir, 'history');
const manifestFile = path.join(contentDir, 'manifest.json');
const secret = process.env.WIKI_SESSION_SECRET || 'solo-desarrollo-local';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/markdown; charset=utf-8'};
const readManifest = () => JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const writeFileAtomically = (file, content) => {
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, file);
};
const send = (res, status, data) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(JSON.stringify(data)); };
const valid = req => { const [payload,sig] = (req.headers.authorization || '').replace('Bearer ','').split('.'); if(!payload || !sig) return false; const expected=crypto.createHmac('sha256',secret).update(payload).digest('base64url'); if(sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return false; try{const claims=JSON.parse(Buffer.from(payload,'base64url'));return claims.role==='admin'&&claims.exp>Date.now()}catch{return false} };
const isAdminOnly = slug => readManifest().pages.some(page => page.slug === slug && page.adminOnly === true);
const body = (req, maxBytes = 8 * 1024 * 1024) => new Promise(resolve => {
  const chunks = [];
  let size = 0;
  let exceeded = false;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > maxBytes) { exceeded = true; return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (exceeded) return resolve(null);
    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
    catch { resolve(null); }
  });
});
const sendPdf = (res, filename, content) => {
  res.writeHead(200, {
    'content-type':'application/pdf',
    'content-disposition':`attachment; filename="${filename}"`,
    'cache-control':'no-store'
  });
  res.end(content);
};
const attachmentName = filename => {
  const base = filename.replace(/\.pdf$/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'documento';
  return `${base}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`;
};

http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if(url.pathname === '/api/auth' && req.method === 'POST') { const input=await body(req); const user=process.env.WIKI_ADMIN_USER||'admin', pass=process.env.WIKI_ADMIN_PASSWORD||'admin'; if(!input || input.username!==user || input.password!==pass)return send(res,401,{error:'Credenciales incorrectas'}); const payload=Buffer.from(JSON.stringify({role:'admin',exp:Date.now()+43200000})).toString('base64url'); return send(res,200,{token:`${payload}.${crypto.createHmac('sha256',secret).update(payload).digest('base64url')}`}); }
  if(url.pathname === '/api/wiki') {
    try {
      if (req.method === 'GET' && url.searchParams.has('attachment')) {
        const slug = url.searchParams.get('slug');
        const filename = url.searchParams.get('attachment');
        if (!/^[a-z0-9-]+$/.test(slug || '') || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.pdf$/i.test(filename || '')) {
          return send(res, 400, {error:'Falta un adjunto PDF válido'});
        }
        if (!readManifest().pages.some(page => page.slug === slug)) return send(res, 404, {error:'La página no existe'});
        if (isAdminOnly(slug) && !valid(req)) return send(res, 401, {error:'Se requiere una sesión de administrador para ver esta página'});
        try {
          const content = fs.readFileSync(path.join(contentDir, 'attachments', slug, filename));
          return sendPdf(res, filename, content);
        } catch (error) {
          if (error.code === 'ENOENT') return send(res, 404, {error:'No existe ese PDF'});
          throw error;
        }
      }
      if (req.method === 'GET' && url.searchParams.get('type') === 'manifest') return send(res, 200, {manifest:readManifest()});
      if (req.method === 'POST' && url.searchParams.get('attachment') === 'upload') {
        if (!valid(req)) return send(res, 401, {error:'No autorizado'});
        const input = await body(req);
        if (!input || !/^[a-z0-9-]+$/.test(input.slug || '') || typeof input.filename !== 'string' ||
            !input.filename.trim() || input.filename.length > 255 || !/\.pdf$/i.test(input.filename) ||
            typeof input.contentBase64 !== 'string' || input.contentBase64.length > 6 * 1024 * 1024 ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.contentBase64)) {
          return send(res, 400, {error:'El archivo debe ser un PDF válido de hasta 4 MB'});
        }
        const pdf = Buffer.from(input.contentBase64, 'base64');
        if (pdf.length > 4 * 1024 * 1024 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
          return send(res, 400, {error:'El archivo debe ser un PDF válido de hasta 4 MB'});
        }
        if (!readManifest().pages.some(page => page.slug === input.slug)) {
          return send(res, 404, {error:'La página ya no existe'});
        }
        const filename = attachmentName(input.filename.trim().split(/[\\/]/).pop());
        const directory = path.join(contentDir, 'attachments', input.slug);
        fs.mkdirSync(directory, {recursive:true});
        const file = path.join(directory, filename);
        const temporary = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
        fs.writeFileSync(temporary, pdf);
        fs.renameSync(temporary, file);
        return send(res, 200, {filename});
      }
      if (req.method === 'PATCH') {
        if (!valid(req)) return send(res, 401, {error:'No autorizado'});
        const input = await body(req);
        if (!input || !Array.isArray(input.categories) ||
            input.categories.some(category => typeof category !== 'string' || !category.trim() || category.trim().length > 80) ||
            new Set(input.categories.map(category => category.trim().toLocaleLowerCase('es'))).size !== input.categories.length) {
          return send(res, 400, {error:'La lista de categorías no es válida'});
        }
        const categories = input.categories.map(category => category.trim());
        if (input.hiddenCategories !== undefined &&
            (!Array.isArray(input.hiddenCategories) ||
             input.hiddenCategories.some(category => typeof category !== 'string' || !categories.includes(category)) ||
             new Set(input.hiddenCategories).size !== input.hiddenCategories.length)) {
          return send(res, 400, {error:'La lista de categorías ocultas no es válida'});
        }
        const manifest = readManifest();
        if (input.renameCategory !== undefined) {
          if (input.deleteCategory !== undefined || typeof input.renameCategory !== 'string' ||
              !manifest.categories.includes(input.renameCategory) || typeof input.newCategoryName !== 'string' ||
              !input.newCategoryName.trim() || input.newCategoryName.trim().length > 80 ||
              categories.length !== manifest.categories.length || categories.includes(input.renameCategory) ||
              !categories.includes(input.newCategoryName.trim()) ||
              manifest.categories.filter(category => category !== input.renameCategory).some(category => !categories.includes(category))) {
            return send(res, 400, {error:'El cambio de nombre de la categoría no es válido'});
          }
          manifest.pages = manifest.pages.map(page => page.category === input.renameCategory
            ? { ...page, category: input.newCategoryName.trim() }
            : page);
          manifest.hiddenCategories = (manifest.hiddenCategories || []).map(category =>
            category === input.renameCategory ? input.newCategoryName.trim() : category
          );
        } else if (input.deleteCategory !== undefined) {
          if (typeof input.deleteCategory !== 'string' || !manifest.categories.includes(input.deleteCategory) ||
              categories.includes(input.deleteCategory) ||
              manifest.categories.filter(category => category !== input.deleteCategory).some(category => !categories.includes(category)) ||
              categories.length !== manifest.categories.length - 1) {
            return send(res, 400, {error:'La categoría que se quiere eliminar no es válida'});
          }
          const pagesInCategory = manifest.pages.filter(page => page.category === input.deleteCategory);
          if (pagesInCategory.length && (typeof input.movePagesTo !== 'string' ||
              !categories.includes(input.movePagesTo) || input.movePagesTo === input.deleteCategory)) {
            return send(res, 400, {error:'Elige una categoría de destino válida para conservar las páginas'});
          }
          if (pagesInCategory.length) {
            manifest.pages = manifest.pages.map(page => page.category === input.deleteCategory
              ? { ...page, category: input.movePagesTo }
              : page);
          }
        } else if (manifest.categories.some(category => !categories.includes(category)) ||
            manifest.pages.some(page => !categories.includes(page.category))) {
          return send(res, 400, {error:'No se pueden quitar categorías que todavía tienen páginas'});
        }
        manifest.categories = categories;
        if (input.hiddenCategories !== undefined) manifest.hiddenCategories = input.hiddenCategories;
        else if (input.deleteCategory !== undefined) manifest.hiddenCategories = (manifest.hiddenCategories || []).filter(category => category !== input.deleteCategory);
        else if (!Array.isArray(manifest.hiddenCategories)) manifest.hiddenCategories = [];
        writeFileAtomically(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
        return send(res, 200, {ok:true});
      }
      if (req.method === 'GET' && url.searchParams.has('history')) {
        const historySlug = url.searchParams.get('history');
        if (!/^[a-z0-9-]+$/.test(historySlug || '')) return send(res, 400, {error:'Falta una página válida'});
        if (isAdminOnly(historySlug) && !valid(req)) return send(res, 401, {error:'Se requiere una sesión de administrador para ver esta página'});
        try {
          const history = JSON.parse(fs.readFileSync(path.join(historyDir, `${historySlug}.json`), 'utf8'));
          if (!history || !Array.isArray(history.revisions)) throw new Error('El historial de la página no tiene un formato válido.');
          return send(res, 200, history);
        } catch (error) {
          if (error.code === 'ENOENT') return send(res, 200, {revisions:[]});
          throw error;
        }
      }
      const slug = url.searchParams.get('slug');
      if (req.method === 'GET' && /^[a-z0-9-]+$/.test(slug || '')) {
        if (isAdminOnly(slug) && !valid(req)) return send(res, 401, {error:'Se requiere una sesión de administrador para ver esta página'});
        try { return send(res, 200, {content:fs.readFileSync(path.join(contentDir, `${slug}.md`), 'utf8')}); }
        catch (error) { if (error.code === 'ENOENT') return send(res, 404, {error:'No existe una versión guardada'}); throw error; }
      }
      if (req.method === 'PUT') {
        if (!valid(req)) return send(res, 401, {error:'No autorizado'});
        const input = await body(req);
        if (!input || !/^[a-z0-9-]+$/.test(input.slug || '') || typeof input.content !== 'string' ||
            !input.manifest || !Array.isArray(input.manifest.pages) || !Array.isArray(input.manifest.categories)) return send(res, 400, {error:'Datos inválidos'});
        const currentManifest = readManifest();
        const previousPage = currentManifest.pages.find(page => page.slug === input.slug);
        const nextPage = input.manifest.pages.find(page => page.slug === input.slug);
        const pageFile = path.join(contentDir, `${input.slug}.md`);
        let previousContent = null;
        try { previousContent = fs.readFileSync(pageFile, 'utf8'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        let history;
        if (previousPage && nextPage && previousContent !== null &&
            (previousContent !== input.content || previousPage.title !== nextPage.title)) {
          const historyFile = path.join(historyDir, `${input.slug}.json`);
          try {
            history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
            if (!history || !Array.isArray(history.revisions)) throw new Error('El historial de la página no tiene un formato válido.');
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            history = {revisions:[]};
          }
          history.revisions.push({timestamp:new Date().toISOString(), title:previousPage.title, content:previousContent});
          fs.mkdirSync(historyDir, {recursive:true});
          writeFileAtomically(historyFile, `${JSON.stringify(history, null, 2)}\n`);
        }
        writeFileAtomically(pageFile, input.content);
        writeFileAtomically(manifestFile, `${JSON.stringify(input.manifest, null, 2)}\n`);
        return send(res, 200, {ok:true});
      }
      if (req.method === 'DELETE') {
        if (!valid(req)) return send(res, 401, {error:'No autorizado'});
        const input = await body(req);
        const currentManifest = readManifest();
        if (!input || !/^[a-z0-9-]+$/.test(input.slug || '') ||
            !input.manifest || !Array.isArray(input.manifest.pages) || !Array.isArray(input.manifest.categories)) {
          return send(res, 400, {error:'Datos inválidos'});
        }
        if (!currentManifest.pages.some(page => page.slug === input.slug)) return send(res, 404, {error:'La página ya no existe'});
        if (input.manifest.pages.some(page => page.slug === input.slug) ||
            input.manifest.pages.some(page => page.parent === input.slug) || !input.manifest.pages.length) {
          return send(res, 400, {error:'El manifiesto no elimina la página correctamente'});
        }
        const pageFile = path.join(contentDir, `${input.slug}.md`);
        const historyFile = path.join(historyDir, `${input.slug}.json`);
        const temporary = `${pageFile}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.deleted`;
        let previousHistory = null;
        try { previousHistory = fs.readFileSync(historyFile, 'utf8'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        const previousManifest = fs.readFileSync(manifestFile, 'utf8');
        try {
          fs.renameSync(pageFile, temporary);
        } catch (error) {
          if (error.code === 'ENOENT') return send(res, 404, {error:'No existe una versión guardada de la página'});
          throw error;
        }
        let manifestUpdated = false;
        let historyRemoved = false;
        try {
          writeFileAtomically(manifestFile, `${JSON.stringify(input.manifest, null, 2)}\n`);
          manifestUpdated = true;
          if (previousHistory !== null) {
            fs.unlinkSync(historyFile);
            historyRemoved = true;
          }
          fs.unlinkSync(temporary);
        } catch (error) {
          try {
            if (manifestUpdated) writeFileAtomically(manifestFile, previousManifest);
            if (fs.existsSync(temporary)) fs.renameSync(temporary, pageFile);
            if (historyRemoved) writeFileAtomically(historyFile, previousHistory);
          } catch (rollbackError) {
            console.error('No se pudo restaurar la página tras un error al eliminarla:', rollbackError);
            throw new Error('Falló la eliminación y no se pudieron restaurar los archivos originales.');
          }
          throw error;
        }
        fs.rmSync(path.join(contentDir, 'attachments', input.slug), {recursive:true, force:true});
        return send(res, 200, {ok:true});
      }
      return send(res, 400, {error:'Solicitud inválida'});
    } catch (error) {
      console.error('Error al guardar contenido de Wiki:', error);
      return send(res, 500, {error:'No se pudo acceder a los archivos de content/. Comprueba los permisos y el formato de los archivos.'});
    }
  }
  const relative=url.pathname==='/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const contentMatch = relative.match(/^content\/([a-z0-9-]+)\.md$/);
  const historyMatch = relative.match(/^content\/history\/([a-z0-9-]+)\.json$/);
  if (relative.startsWith('content/attachments/') ||
      (contentMatch && isAdminOnly(contentMatch[1])) || (historyMatch && isAdminOnly(historyMatch[1]))) { res.writeHead(404); return res.end('No encontrado'); }
  const file=path.resolve(root,relative); if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('No encontrado');} res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Wiki disponible en http://localhost:${port}`));
