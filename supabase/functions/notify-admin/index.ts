import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
serve(async (req) => {
  const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  try{
    const auth=req.headers.get('Authorization'); if(!auth) throw new Error('Nao autorizado');
    const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
    const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error('Nao autorizado');
    const body=await req.json(); if(body.request_id!==user.id) throw new Error('Solicitacao invalida');
    const resendKey=Deno.env.get('RESEND_API_KEY'); const adminEmail=Deno.env.get('ADMIN_EMAIL');
    if(resendKey&&adminEmail){await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:Deno.env.get('FROM_EMAIL'),to:[adminEmail],subject:'Nova solicitacao de acesso',text:`Existe uma nova solicitacao pendente. Entre no painel administrativo para analisar. ID: ${user.id}`})});}
    // SMS opcional via Twilio, somente por secrets do Supabase.
    const sid=Deno.env.get('TWILIO_ACCOUNT_SID'),token=Deno.env.get('TWILIO_AUTH_TOKEN'),from=Deno.env.get('TWILIO_FROM'),to=Deno.env.get('ADMIN_PHONE');
    if(sid&&token&&from&&to){const f=new URLSearchParams({From:from,To:to,Body:'Nova solicitacao de acesso pendente no Opera-o.'});await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:'POST',headers:{Authorization:'Basic '+btoa(`${sid}:${token}`),'Content-Type':'application/x-www-form-urlencoded'},body:f});}
    return new Response(JSON.stringify({ok:true}),{headers:{...cors,'Content-Type':'application/json'}});
  }catch(e){return new Response(JSON.stringify({error:String(e)}),{status:400,headers:{...cors,'Content-Type':'application/json'}})}
});
