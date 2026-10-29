const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');
const response=(status,body)=>({statusCode:status,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
function admin(event,secret){const value=event.headers.authorization||'';const [payload,sig]=value.replace('Bearer ','').split('.');if(!payload||!sig)return false;const expected=crypto.createHmac('sha256',secret).update(payload).digest('base64url');const given=Buffer.from(sig), wanted=Buffer.from(expected);if(given.length!==wanted.length||!crypto.timingSafeEqual(given,wanted))return false;try{return JSON.parse(Buffer.from(payload,'base64url')).exp>Date.now()}catch{return false}}
exports.handler=async event=>{const store=getStore('wiki-content');const q=event.queryStringParameters||{};
  if(event.httpMethod==='GET'){if(q.type==='manifest')return response(200,{manifest:await store.get('manifest',{type:'json'})||{pages:[],categories:[]}});if(q.slug){const content=await store.get(`pages/${q.slug}`);return content?response(200,{content}):response(404,{error:'No existe una versión guardada'})}return response(400,{error:'Falta página'});}
  if(event.httpMethod!=='PUT')return response(405,{error:'Método no permitido'});
  const secret=process.env.WIKI_SESSION_SECRET;
  if(!secret)return response(500,{error:'Falta configurar WIKI_SESSION_SECRET en Netlify'});
  if(!admin(event,secret))return response(401,{error:'No autorizado'});
  try{const {slug,content,manifest}=JSON.parse(event.body||'{}');if(!/^[a-z0-9-]+$/.test(slug||'')||typeof content!=='string'||!manifest)return response(400,{error:'Datos inválidos'});await store.set(`pages/${slug}`,content);await store.setJSON('manifest',manifest);return response(200,{ok:true});}catch{return response(400,{error:'No se pudieron guardar los cambios'});}
};
