(() => {
  'use strict';
  const cfg = window.APP_CONFIG || {};
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('SEU-PROJETO')) {
    document.body.innerHTML = '<main class="shell"><div class="card"><h2>Configuracao pendente</h2><p>Preencha o arquivo <b>config.js</b> com a URL e a chave publica do Supabase.</p></div></main>'; return;
  }
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  let profile = null, channel = null;
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const msg = (el,text,type='') => { el.textContent=text; el.className='message '+type; };
  const friendlyAuthError = error => {
    const raw = String(error?.message || error || '').toLowerCase();
    if (raw.includes('email not confirmed')) return 'O e-mail ainda nao foi confirmado. Abra a mensagem enviada pelo sistema e confirme o cadastro.';
    if (raw.includes('invalid login') || raw.includes('invalid credentials')) return 'Nickname ou senha incorretos.';
    if (raw.includes('not approved')) return 'Acesso ainda nao aprovado pela administradora.';
    return 'Nao foi possivel entrar. Confira o nickname, a senha e a confirmacao do e-mail.';
  };

  document.querySelectorAll('[data-auth-tab]').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('[data-auth-tab]').forEach(x=>x.classList.toggle('active',x===b));
    $('loginForm').classList.toggle('hidden',b.dataset.authTab!=='login');
    $('requestForm').classList.toggle('hidden',b.dataset.authTab!=='request');
    msg($('loginMessage'),''); msg($('requestMessage'),'');
  });

  $('loginForm').onsubmit=async e=>{
    e.preventDefault(); msg($('loginMessage'),'Entrando...');
    const nickname=$('loginNickname').value.trim().toLowerCase();
    const password=$('loginPassword').value;
    try {
      const response=await fetch(`${cfg.SUPABASE_URL}/functions/v1/username-login`,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':cfg.SUPABASE_ANON_KEY},
        body:JSON.stringify({nickname,password})
      });
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||'Invalid login credentials');
      const {error}=await db.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
      if(error) throw error;
      await routeSession();
    } catch(error){ msg($('loginMessage'),friendlyAuthError(error),'error'); }
  };

  $('requestForm').onsubmit=async e=>{
    e.preventDefault(); msg($('requestMessage'),'Enviando...');
    const nickname=$('requestNickname').value.trim().toLowerCase();
    const payload={
      email:$('requestEmail').value.trim().toLowerCase(),
      password:$('requestPassword').value,
      options:{
        emailRedirectTo:location.origin+location.pathname,
        data:{
          full_name:$('requestName').value.trim(),
          nickname,
          phone:$('requestPhone').value.trim(),
          requested_role:$('requestRole').value,
          reason:$('requestReason').value.trim()
        }
      }
    };
    const {error}=await db.auth.signUp(payload);
    if(error){
      const text=String(error.message||'');
      if(text.toLowerCase().includes('duplicate')||text.toLowerCase().includes('already')) return msg($('requestMessage'),'Esse e-mail ou nickname ja foi cadastrado.','error');
      return msg($('requestMessage'),text,'error');
    }
    e.target.reset();
    msg($('requestMessage'),'Solicitacao enviada. Confirme o e-mail recebido e aguarde a aprovacao da administradora.','success');
  };

  $('pendingLogout').onclick=$('logoutButton').onclick=()=>db.auth.signOut();
  $('newRecordButton').onclick=()=>$('recordForm').classList.toggle('hidden');
  $('recordForm').onsubmit=async e=>{e.preventDefault();const {error}=await db.from('records').insert({title:$('recordTitle').value.trim(),description:$('recordDescription').value.trim()});if(error)return alert(error.message);e.target.reset();e.target.classList.add('hidden');};

  async function routeSession(){
    const {data:{session}}=await db.auth.getSession();
    $('authView').classList.toggle('hidden',!!session); $('appView').classList.add('hidden'); $('pendingView').classList.add('hidden');
    if(!session)return;
    const {data,error}=await db.from('profiles').select('*').eq('id',session.user.id).single();
    if(error||!data||data.status!=='approved'){$('authView').classList.add('hidden');$('pendingView').classList.remove('hidden');return;}
    profile=data; $('appView').classList.remove('hidden'); $('userBadge').textContent=`${profile.full_name} · @${profile.nickname} · ${profile.role}`;
    buildNav(); subscribe(); renderAll();
  }
  function buildNav(){const pages=[['dashboard','Painel'],['records','Registros'],['audit','Historico']];if(profile.role==='admin')pages.splice(1,0,['requests','Autorizacoes']);$('navigation').innerHTML='';pages.forEach(([id,label],i)=>{const b=document.createElement('button');b.textContent=label;b.className=i===0?'active':'';b.onclick=()=>{document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));$(id+'Page').classList.add('active');document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderAll();};$('navigation').appendChild(b);});}
  async function renderAll(){
    if(!profile)return;
    const [{data:records},{data:audits},{data:reqs}]=await Promise.all([
      db.from('records').select('*').order('created_at',{ascending:false}),
      db.from('audit_log').select('*').order('created_at',{ascending:false}).limit(100),
      profile.role==='admin'?db.from('profiles').select('*').eq('status','pending').order('created_at',{ascending:false}):Promise.resolve({data:[]})
    ]);
    $('metrics').innerHTML=`<div class="metric">Registros<b>${records?.length||0}</b></div><div class="metric">Pendentes<b>${reqs?.length||0}</b></div><div class="metric">Atualizacao<b>Tempo real</b></div>`;
    renderRecords(records||[]); renderAudit(audits||[]); if(profile.role==='admin')renderRequests(reqs||[]);
  }
  function renderRecords(rows){$('recordsList').innerHTML=rows.length?rows.map(r=>`<article class="item"><div class="item-head"><div><b>${esc(r.title)}</b><p>${esc(r.description)}</p><small>${new Date(r.created_at).toLocaleString('pt-BR')}</small></div><span class="status">${esc(r.status)}</span></div>${profile.role!=='cliente'?`<div class="actions"><button class="danger" data-delete="${r.id}">Excluir</button></div>`:''}</article>`).join(''):'<div class="empty">Nenhum registro.</div>';document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Excluir este registro?'))await db.from('records').delete().eq('id',b.dataset.delete);});}
  function renderRequests(rows){
    $('requestsList').innerHTML=rows.length?rows.map(r=>`<article class="item request-card"><div class="item-head"><div><b>${esc(r.full_name)}</b><div class="request-grid"><span><strong>Nickname:</strong> @${esc(r.nickname)}</span><span><strong>E-mail:</strong> ${esc(r.email)}</span><span><strong>Celular:</strong> ${esc(r.phone||'Nao informado')}</span><span><strong>Perfil:</strong> ${esc(r.requested_role)}</span><span><strong>Solicitado em:</strong> ${new Date(r.created_at).toLocaleString('pt-BR')}</span><span><strong>Confirmacao do e-mail:</strong> necessaria para o primeiro login</span></div><p><strong>Motivo:</strong> ${esc(r.request_reason||'Nao informado')}</p></div><span class="status">Pendente</span></div><label class="decision-label">Observacao da decisao<textarea data-note="${r.id}" rows="2" maxlength="500" placeholder="Opcional: motivo da aprovacao ou rejeicao"></textarea></label><div class="actions"><button class="approve" data-approve="${r.id}">Aprovar</button><button class="danger" data-reject="${r.id}">Rejeitar</button></div></article>`).join(''):'<div class="empty">Nenhuma solicitacao pendente.</div>';
    document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>decide(b.dataset.approve,'approved'));
    document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>decide(b.dataset.reject,'rejected'));
  }
  async function decide(id,status){const note=document.querySelector(`[data-note="${id}"]`)?.value.trim()||'';const {error}=await db.rpc('decide_access_v2',{target_user:id,new_status:status,decision_note:note});if(error)alert(error.message);}
  function renderAudit(rows){const html=rows.length?rows.map(a=>`<div class="item"><div class="item-head"><b>${esc(a.action)}</b><span class="status">${new Date(a.created_at).toLocaleString('pt-BR')}</span></div><p>${esc(a.details||'Sem detalhes adicionais')}</p><small>Identificador da acao: ${esc(a.id)}</small></div>`).join(''):'<div class="empty">Sem historico.</div>';$('auditList').innerHTML=html;$('activityList').innerHTML=html;}
  function subscribe(){if(channel)db.removeChannel(channel);channel=db.channel('app-live').on('postgres_changes',{event:'*',schema:'public',table:'records'},renderAll).on('postgres_changes',{event:'*',schema:'public',table:'profiles'},renderAll).on('postgres_changes',{event:'*',schema:'public',table:'audit_log'},renderAll).subscribe();}
  db.auth.onAuthStateChange(()=>setTimeout(routeSession,0)); routeSession();
})();
