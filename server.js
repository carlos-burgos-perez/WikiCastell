// Servidor local para probar la wiki sin instalar la CLI de Netlify.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const port = Number(process.env.PORT || 8888);
const contentDir = path.join(root, 'content');
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
const valid = req => { const [payload,sig] = (req.headers.authorization || '').replace('Bearer ','').split('.'); if(!payload || !sig) return false; const expected=crypto.createHmac('sha256',secret).update(payload).digest('base64url'); if(sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return false; try{return JSON.parse(Buffer.from(payload,'base64url')).exp>Date.now()}catch{return false} };
const body = req => new Promise(resolve => { let raw=''; req.on('data',d=>raw+=d); req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch{resolve(null)}}); });

http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if(url.pathname === '/api/auth' && req.method === 'POST') { const input=await body(req); const user=process.env.WIKI_ADMIN_USER||'admin', pass=process.env.WIKI_ADMIN_PASSWORD||'admin'; if(!input || input.username!==user || input.password!==pass)return send(res,401,{error:'Credenciales incorrectas'}); const payload=Buffer.from(JSON.stringify({role:'admin',exp:Date.now()+43200000})).toString('base64url'); return send(res,200,{token:`${payload}.${crypto.createHmac('sha256',secret).update(payload).digest('base64url')}`}); }
  if(url.pathname === '/api/wiki') {
    try {
      if (req.method === 'GET' && url.searchParams.get('type') === 'manifest') return send(res, 200, {manifest:readManifest()});
      const slug = url.searchParams.get('slug');
      if (req.method === 'GET' && /^[a-z0-9-]+$/.test(slug || '')) {
        try { return send(res, 200, {content:fs.readFileSync(path.join(contentDir, `${slug}.md`), 'utf8')}); }
        catch (error) { if (error.code === 'ENOENT') return send(res, 404, {error:'No existe una versión guardada'}); throw error; }
      }
      if (req.method === 'PUT') {
        if (!valid(req)) return send(res, 401, {error:'No autorizado'});
        const input = await body(req);
        if (!input || !/^[a-z0-9-]+$/.test(input.slug || '') || typeof input.content !== 'string' ||
            !input.manifest || !Array.isArray(input.manifest.pages) || !Array.isArray(input.manifest.categories)) return send(res, 400, {error:'Datos inválidos'});
        writeFileAtomically(path.join(contentDir, `${input.slug}.md`), input.content);
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
        const temporary = `${pageFile}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.deleted`;
        const previousManifest = fs.readFileSync(manifestFile, 'utf8');
        try {
          fs.renameSync(pageFile, temporary);
        } catch (error) {
          if (error.code === 'ENOENT') return send(res, 404, {error:'No existe una versión guardada de la página'});
          throw error;
        }
        let manifestUpdated = false;
        try {
          writeFileAtomically(manifestFile, `${JSON.stringify(input.manifest, null, 2)}\n`);
          manifestUpdated = true;
          fs.unlinkSync(temporary);
        } catch (error) {
          try {
            if (manifestUpdated) writeFileAtomically(manifestFile, previousManifest);
            if (fs.existsSync(temporary)) fs.renameSync(temporary, pageFile);
          } catch (rollbackError) {
            console.error('No se pudo restaurar la página tras un error al eliminarla:', rollbackError);
            throw new Error('Falló la eliminación y no se pudieron restaurar los archivos originales.');
          }
          throw error;
        }
        return send(res, 200, {ok:true});
      }
      return send(res, 400, {error:'Solicitud inválida'});
    } catch (error) {
      console.error('Error al guardar contenido de Wiki:', error);
      return send(res, 500, {error:'No se pudo acceder a los archivos de content/. Comprueba los permisos y el formato de los archivos.'});
    }
  }
  const relative=url.pathname==='/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, ''); const file=path.resolve(root,relative); if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('No encontrado');} res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Wiki disponible en http://localhost:${port}`));
