const crypto = require('crypto');
const secret = () => process.env.WIKI_SESSION_SECRET || 'cambia-esta-clave-antes-de-publicar';
const json = (status, body) => ({ statusCode: status, headers: {'content-type':'application/json'}, body: JSON.stringify(body) });
const tokenFor = () => { const payload = Buffer.from(JSON.stringify({role:'admin', exp:Date.now()+1000*60*60*12})).toString('base64url'); const sig = crypto.createHmac('sha256',secret()).update(payload).digest('base64url'); return `${payload}.${sig}`; };
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405,{error:'Método no permitido'});
  try { const {username,password}=JSON.parse(event.body||'{}'); const user=process.env.WIKI_ADMIN_USER||'admin', pass=process.env.WIKI_ADMIN_PASSWORD||'admin'; if(username!==user||password!==pass)return json(401,{error:'Credenciales incorrectas'}); return json(200,{token:tokenFor()}); } catch { return json(400,{error:'Solicitud inválida'}); }
};
