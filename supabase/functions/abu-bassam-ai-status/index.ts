const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-pro-token',
  'Access-Control-Allow-Methods':'GET,OPTIONS'
};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
async function authenticatedUser(req:Request){
  const header=req.headers.get('authorization')||'';
  const match=/^Bearer\s+(.+)$/i.exec(header);
  const url=Deno.env.get('SUPABASE_URL')||'';
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!match?.[1]||!url||!serviceKey)return null;
  const response=await fetch(`${url}/auth/v1/user`,{headers:{Authorization:`Bearer ${match[1]}`,apikey:serviceKey}});
  if(!response.ok)return null;
  const user=await response.json().catch(()=>null);
  return user&&typeof user.id==='string'?user:null;
}
async function digest(value:string){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))}
async function sameToken(a:string,b:string){if(!a||!b||a.length>512||b.length>512)return false;const [x,y]=await Promise.all([digest(a),digest(b)]);let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i+=1)diff|=x[i%x.length]^y[i%y.length];return diff===0}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='GET')return json({error:'Method not allowed'},405);
  const authUser=await authenticatedUser(req);
  if(!authUser)return json({error:'Unauthorized'},401);
  const expected=Deno.env.get('AI_APP_TOKEN')||'';
  if(!expected)return json({error:'AI service is not configured'},503);
  if(!await sameToken(req.headers.get('x-pro-token')||'',expected))return json({error:'Unauthorized'},401);
  return json({openaiKeyConfigured:!!Deno.env.get('OPENAI_API_KEY'),geminiKeyConfigured:!!Deno.env.get('GEMINI_API_KEY'),proTokenConfigured:true});
});
