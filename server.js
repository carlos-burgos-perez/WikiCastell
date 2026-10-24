// Servidor local para probar la wiki sin instalar la CLI de Netlify.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const port = Number(process.env.PORT || 8888);
const dataFile = path.join(root, '.local-wiki-data.json');
const secret = process.env.WIKI_SESSION_SECRET || 'solo-desarrollo-local';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/markdown; charset=utf-8'};
const readData = () => { try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch { return {manifest:{pages:[],categories:[]},pages:{}}; } };
const writeData = data => fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
const send = (res, status, data) => { res.writeHead(status, {'content-type':'application/json','cache-control':'no-store'}); res.end(JSON.stringify(data)); };
const valid = req => { const [payload,sig] = (req.headers.authorization || '').replace('Bearer ','').split('.'); if(!payload || !sig) return false; const expected=crypto.createHmac('sha256',secret).update(payload).digest('base64url'); if(sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return false; try{return JSON.parse(Buffer.from(payload,'base64url')).exp>Date.now()}catch{return false} };
const body = req => new Promise(resolve => { let raw=''; req.on('data',d=>raw+=d); req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch{resolve(null)}}); });

http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if(url.pathname === '/api/auth' && req.method === 'POST') { const input=await body(req); const user=process.env.WIKI_ADMIN_USER||'admin', pass=process.env.WIKI_ADMIN_PASSWORD||'admin'; if(!input || input.username!==user || input.password!==pass)return send(res,401,{error:'Credenciales incorrectas'}); const payload=Buffer.from(JSON.stringify({role:'admin',exp:Date.now()+43200000})).toString('base64url'); return send(res,200,{token:`${payload}.${crypto.createHmac('sha256',secret).update(payload).digest('base64url')}`}); }
  if(url.pathname === '/api/wiki') { const data=readData(); if(req.method==='GET' && url.searchParams.get('type')==='manifest')return send(res,200,{manifest:data.manifest}); const slug=url.searchParams.get('slug'); if(req.method==='GET' && slug)return data.pages[slug] ? send(res,200,{content:data.pages[slug]}) : send(res,404,{error:'No existe una versión guardada'}); if(req.method==='PUT') { if(!valid(req))return send(res,401,{error:'No autorizado'}); const input=await body(req); if(!input || !/^[a-z0-9-]+$/.test(input.slug||'') || typeof input.content!=='string')return send(res,400,{error:'Datos inválidos'}); data.pages[input.slug]=input.content; data.manifest=input.manifest; writeData(data); return send(res,200,{ok:true}); } return send(res,400,{error:'Solicitud inválida'}); }
  const relative=url.pathname==='/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, ''); const file=path.resolve(root,relative); if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('No encontrado');} res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Wiki disponible en http://localhost:${port}`));
