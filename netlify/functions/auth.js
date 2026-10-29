const crypto = require('crypto');
const json = (status, body) => ({ statusCode: status, headers: {'content-type':'application/json'}, body: JSON.stringify(body) });
const tokenFor = secret => { const payload = Buffer.from(JSON.stringify({role:'admin', exp:Date.now()+1000*60*60*12})).toString('base64url'); const sig = crypto.createHmac('sha256',secret).update(payload).digest('base64url'); return `${payload}.${sig}`; };
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405,{error:'Método no permitido'});
  const {WIKI_ADMIN_USER:user,WIKI_ADMIN_PASSWORD:pass,WIKI_SESSION_SECRET:secret}=process.env;
  if (!user || !pass || !secret) return json(500,{error:'Falta configurar WIKI_ADMIN_USER, WIKI_ADMIN_PASSWORD y WIKI_SESSION_SECRET en Netlify'});
  try { const {username,password}=JSON.parse(event.body||'{}'); if(username!==user||password!==pass)return json(401,{error:'Credenciales incorrectas'}); return json(200,{token:tokenFor(secret)}); } catch { return json(400,{error:'Solicitud inválida'}); }
};
