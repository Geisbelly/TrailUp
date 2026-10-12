/* Social (revisão 04 #5) — chat da guilda, chat privado e perfil público.
   Textos de mobile/src/components/social/{GuildChatModal,PrivateChatModal,SocialProfileModal}.tsx
   Uso: Social.guilda({vazio}) · Social.privado(nome) · Social.perfil(nome, {estado:'sem-conquistas'|'erro'}) · Social.fechar() */
(function(){
  const I={
    x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    forum:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10l3-3h3"/><path d="M21 11a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h6l4 3z"/></svg>',
    send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>',
    sword:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 17.5L21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2"/></svg>',
    help:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/></svg>',
    lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    msg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/></svg>',
    alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.01"/></svg>',
  };
  /* cor de assinatura de cada perfil, clareada para ler sobre o fundo escuro */
  const ACC={nenhum:'#6f90eb',seeker:'#2fc4b8',survivor:'#9aa8b5',daredevil:'#ff5a6e',mastermind:'#8f78ff',conqueror:'#6f90eb',socializer:'#ff8a63',achiever:'#e8c766'};
  const NOME_PERFIL={seeker:'Seeker · Explorador',survivor:'Survivor · Sobrevivente',daredevil:'Daredevil · Ousado',mastermind:'Mastermind · Estrategista',conqueror:'Conqueror · Conquistador',socializer:'Socializer · Socializador',achiever:'Achiever · Realizador'};
  /* sugestao_material.py */
  const SOBRE_PERFIL={seeker:'Curiosidade, conexões inesperadas e exploração: aprende melhor descobrindo caminhos.',survivor:'Persistência diante do difícil: rende quando o desafio aperta e há algo a superar.',daredevil:'Risco e ritmo: prefere desafios rápidos e decisões no calor do momento.',mastermind:'Estratégia e lógica: gosta de entender o porquê e planejar a solução.',conqueror:'Superação e competição: quer vencer o desafio e provar domínio.',socializer:'Aprender junto: conversa, troca e colaboração com a turma.',achiever:'Metas e conclusão: gosta de completar tudo e colecionar conquistas.'};
  const GUILDAS={'Legião Azul':8,'Exploradores do Norte':7,'Fênix Rubra':6};
  const PESSOAS={
    'Marina S.':{p:'seeker',on:true,ap:'marina.s',g:'Exploradores do Norte',sobre:'Gosto de mapas e de achar o caminho mais curto.',cq:[['completion','Primeiro Tópico','Jornada','Conclua seu primeiro tópico da trilha.',10],['trophy','Fronteira Avançada','Desempenho','Complete 2 tópicos seguidos sem errar nenhuma questão de atividade.',40],['compass','Explorador de Perfis','Exploração','Experimente a trilha em 5 turmas diferentes.',35]]},
    'Zuri & Mateo':{p:'socializer',on:false,ap:'zuri.mateo',g:'Fênix Rubra',sobre:'Estudamos em dupla.'},
    'Diego A.':{p:'conqueror',on:true,ap:'diego.a',g:'Legião Azul',sobre:'Arena é comigo.'},
    'Bianca L.':{p:'achiever',on:true,ap:'bianca.l',g:'Exploradores do Norte'},
    'Théo M.':{p:'seeker',on:false,ap:'theo.m',g:null},
    'Rafael N.':{p:'conqueror',on:true,ap:'rafael.n',g:'Legião Azul'},
    'Kwame R.':{p:'achiever',on:true,ap:'kwame.r',g:'Exploradores do Norte'},
  };
  const CQ_PADRAO=[['completion','Primeiro Tópico','Jornada','Conclua seu primeiro tópico da trilha.',10],['calendar','Sequência de 3 dias','Constância','Estude 3 dias seguidos.',15]];
  /* perfil de quem não está na lista: lê a arte rosto-<perfil> do card da pessoa na tela */
  const perfilDaTela=n=>{for(const el of document.querySelectorAll('[data-perfil]')){if(el.dataset.perfil!==n)continue;const box=el.closest('.person-card,.invite-card,li,tr,.p-item,.who')||el;const img=el.tagName==='IMG'?el:box.querySelector('img[src*="rosto-"]');const m=img&&img.getAttribute('src').match(/rosto-(\w+)/);if(m)return m[1];if(box.querySelector('.initials'))return 'nenhum'}return null};
  /* sem perfil definido: iniciais no lugar do rosto (regra do Ranking) */
  const ini=n=>n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const rosto=(x,cls,extra='')=>x.p==='nenhum'?`<span class="${cls} sx-ini" ${extra}>${ini(x.n)}</span>`:`<img class="${cls}" src="assets/rosto-${x.p}.png" alt="" ${extra} />`;
  const pessoa=n=>{const b=PESSOAS[n]||{};const p=b.p||perfilDaTela(n)||'seeker';
    return {n,p,on:b.on??false,ap:b.ap||n.toLowerCase().replace(/[^a-z]+/g,'.').replace(/\.$/,''),g:b.g===undefined?null:b.g,sobre:b.sobre||'',cq:b.cq||CQ_PADRAO}};

  const QUESTOES=[
    {t:'Se 3x + 7 = 22, quanto vale x?',alt:['3','5','7','15'],ok:'5'},
    {t:'Isole o x em 5x − 4 = 21',ok:'5'},
    {t:'Em 2x = 10, x vale 5.',vf:true,ok:'Verdadeiro'},
  ];
  const BASE_GUILDA=[
    {a:'Diego A.',p:'conqueror',h:'14:02',t:'Alguém já fez a missão 2 da Semana das Equações?'},
    {a:'Rafael N.',p:'conqueror',h:'14:03',share:{k:'desafio',t:'Precisão · 3 questões de Equações'}},
    {a:'Diego A.',p:'conqueror',h:'14:05',share:{k:'questao',q:0}},
    {a:'Bianca L.',p:'achiever',h:'14:06',share:{k:'questao',q:2}},
    {a:'Rafael N.',p:'conqueror',h:'14:08',share:{k:'bloqueada'}},
    {a:'Amina T.',p:'conqueror',h:'14:10',t:'Fiz! Faltou só a de precisão.',me:true},
  ];
  const BASE_PRIVADO=n=>[{a:n,h:'13:40',t:'Viu que abriu a arena?'},{a:'Amina T.',h:'13:41',t:'Vi! Tô em 4º.',me:true},{a:n,h:'13:42',t:'Bora fazer um duelo de Equações depois?'}];
  const MODOS=['todos','velocidade','precisao','duelo','duplo'];

  const css=`
  .sx-bg{position:fixed;inset:68px 0 0 0;z-index:80;background:rgba(3,7,20,.62);backdrop-filter:blur(2px);display:flex;justify-content:flex-end;animation:sxF .18s}
  .sx-bg.center{inset:0;justify-content:center;align-items:center;padding:24px}
  @keyframes sxF{from{opacity:0}}@keyframes sxS{from{transform:translateX(40px);opacity:0}}@keyframes sxU{from{transform:translateY(14px);opacity:0}}
  .sx-panel{width:440px;max-width:100%;height:100%;background:#121e3f;border-left:1px solid #4d6fcb;display:flex;flex-direction:column;animation:sxS .22s;font-family:inherit;color:#f3f4f7}
  .sx-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid #28428a}
  .sx-head svg{width:24px;height:24px;color:var(--sx)}
  .sx-head .av{width:40px;height:40px;border-radius:50%;border:2px solid var(--sx);object-fit:cover;cursor:pointer}
  .sx-head h3{margin:0;font:800 16px/1.2 inherit;font-family:inherit}
  .sx-head small{display:flex;align-items:center;gap:5px;font-size:11.5px;color:rgba(243,244,247,.62);margin-top:2px}
  .sx-dot{width:8px;height:8px;border-radius:50%;background:#68677c;display:inline-block}.sx-dot.on{background:#62db9b}
  .sx-x{margin-left:auto;width:34px;height:34px;border-radius:50%;border:1px solid #28428a;background:#192a57;color:#f3f4f7;display:grid;place-items:center;cursor:pointer}
  .sx-x svg{width:16px;height:16px;color:#f3f4f7}
  .sx-msgs{flex:1;overflow-y:auto;padding:16px 16px 8px;display:flex;flex-direction:column;gap:9px;scrollbar-width:thin;scrollbar-color:#28428a transparent}
  .sx-m{max-width:84%;align-self:flex-start;background:#192a57;border:1px solid #28428a;border-radius:4px 14px 14px 14px;padding:9px 12px}
  .sx-m.me{align-self:flex-end;background:color-mix(in srgb,var(--sx) 22%,#121e3f);border-color:color-mix(in srgb,var(--sx) 45%,#28428a);border-radius:14px 4px 14px 14px}
  .sx-m b{display:block;font-size:11px;font-weight:800;color:var(--ac,var(--sx))}
  .sx-m p{margin:3px 0 0;font-size:13.5px;line-height:1.45}
  .sx-m time{display:block;text-align:right;font-size:9.5px;color:rgba(243,244,247,.55);margin-top:4px}
  .sx-share{display:flex;gap:9px;align-items:center;border:1px solid var(--sx);border-radius:9px;padding:9px;margin-top:6px;background:rgba(11,19,40,.35);text-align:left;width:100%;color:inherit;font:inherit;cursor:pointer}
  .sx-share[disabled]{cursor:default;opacity:.8;border-color:#4d6fcb}
  .sx-share svg{width:20px;height:20px;color:var(--sx);flex:none}
  .sx-share em{display:block;font-style:normal;font-size:9.5px;font-weight:800;letter-spacing:.05em;color:var(--sx)}
  .sx-share strong{display:block;font-size:13px;font-weight:600;margin-top:2px}
  .sx-share small{display:block;font-size:10.5px;color:rgba(243,244,247,.62);margin-top:3px}
  .sx-ans{border:1px solid #28428a;border-radius:9px;padding:8px;margin-top:6px}
  .sx-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .sx-opt{border:1px solid var(--sx);border-radius:8px;padding:7px 11px;background:transparent;color:#f3f4f7;font:inherit;font-size:12.5px;cursor:pointer}
  .sx-opt:hover{background:color-mix(in srgb,var(--sx) 18%,transparent)}
  .sx-in{flex:1;min-width:0;min-height:36px;border:1px solid #28428a;border-radius:9px;background:#0b1328;color:#f3f4f7;padding:7px 11px;font:inherit;font-size:13px;outline:none}
  .sx-in:focus{border-color:var(--sx)}
  .sx-res{font-size:11.5px;margin-top:6px;font-weight:700}.sx-res.ok{color:#62db9b}.sx-res.no{color:#ff9c9c}
  .sx-empty{margin:auto;text-align:center;color:rgba(243,244,247,.62);font-size:13.5px;padding:40px 20px}
  .sx-picker{border-top:1px solid #28428a;background:#0f1936;padding:10px 14px}
  .sx-picker header{display:flex;justify-content:space-between;align-items:center}
  .sx-picker header strong{font-size:12.5px}
  .sx-picker header button{background:none;border:0;color:var(--sx);font:inherit;font-size:12px;cursor:pointer}
  .sx-opts{display:flex;gap:8px;overflow-x:auto;padding:8px 0 2px}
  .sx-mode{border:1px solid #28428a;border-radius:8px;padding:6px 10px;background:transparent;color:#f3f4f7;font:inherit;font-size:12px;cursor:pointer;flex:none}
  .sx-mode.on{border-color:var(--sx);color:var(--sx)}
  .sx-card{flex:none;width:150px;min-height:62px;border:1px solid var(--sx);border-radius:9px;padding:8px;background:transparent;color:#f3f4f7;font:inherit;font-size:11.5px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:5px}
  .sx-card svg{width:17px;height:17px;color:var(--sx)}
  .sx-comp{display:flex;gap:6px;align-items:center;padding:12px 14px;border-top:1px solid #28428a}
  .sx-ib{width:36px;height:36px;flex:none;border:1px solid var(--sx);border-radius:9px;background:transparent;color:var(--sx);display:grid;place-items:center;cursor:pointer}
  .sx-ib svg{width:19px;height:19px}
  .sx-send{width:38px;height:38px;flex:none;border:0;border-radius:9px;background:var(--sx);color:#0b1328;display:grid;place-items:center;cursor:pointer}
  .sx-send[disabled]{background:#28428a;color:rgba(243,244,247,.5);cursor:default}
  .sx-send svg{width:17px;height:17px}
  .sx-err{display:flex;gap:8px;align-items:center;margin:0 14px 8px;padding:8px 10px;border-radius:9px;background:rgba(225,91,100,.14);color:#fca5a5;font-size:12px}
  .sx-err svg{width:16px;height:16px}
  /* perfil público */
  .sx-prof{position:relative;width:520px;max-width:100%;max-height:calc(100vh - 48px);overflow-y:auto;background:#121e3f;border:1px solid color-mix(in srgb,var(--sx) 55%,#28428a);border-radius:22px;color:#f3f4f7;animation:sxU .22s;scrollbar-width:thin;scrollbar-color:#28428a transparent}
  .sx-prof .sx-x{position:absolute;top:12px;right:12px;margin:0;background:rgba(0,0,0,.45);border-color:transparent;z-index:2}
  .sx-banner{height:150px;background:color-mix(in srgb,var(--sx) 30%,#0b1328) center/cover no-repeat;border-radius:21px 21px 0 0}
  .sx-avatar{width:86px;height:86px;border-radius:50%;border:5px solid var(--sx);background:#0b1730;margin:-40px 0 0 26px;object-fit:cover;position:relative}
  .sx-name{padding:8px 26px 0}
  .sx-name h3{margin:0;font-family:Georgia,serif;font-size:18px;letter-spacing:.04em}
  .sx-name span{display:flex;align-items:center;gap:6px;color:#a9a8bc;font-size:13px;margin-top:3px}
  .sx-rule{height:1px;background:rgba(242,247,250,.18);margin:16px 26px}
  .sx-guild{display:flex;align-items:center;gap:12px;margin:0 22px;padding:12px;border-radius:12px;background:color-mix(in srgb,var(--sx) 12%,transparent)}
  .sx-guild img{width:32px;height:32px;object-fit:contain}
  .sx-lbl{font-family:Georgia,serif;font-weight:700;font-size:12px;letter-spacing:.06em;margin:16px 26px 0;display:flex;justify-content:space-between}
  .sx-lbl em{font-style:normal;color:var(--sx);font-family:inherit}
  .sx-guild .sx-lbl{margin:0}
  .sx-val{color:#b9b7c7;font-size:13.5px;line-height:1.5;margin:5px 26px 0}
  .sx-guild .sx-val{margin:2px 0 0}
  .sx-badges{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 26px 0}
  .sx-badge{border-radius:12px;background:#192a57;padding:12px}
  .sx-badge img{width:34px;height:34px;object-fit:contain}
  .sx-badge strong{display:block;font-size:12.5px;margin-top:4px}
  .sx-badge i{display:block;font-style:normal;font-size:10.5px;color:#9db8ff;margin-top:2px}
  .sx-badge p{font-size:11.5px;line-height:1.45;color:#b9b7c7;margin:5px 0 0}
  .sx-badge b{display:block;font-size:10.5px;color:var(--sx);margin-top:6px}
  .sx-foot{display:flex;justify-content:flex-end;padding:22px 26px 24px}
  .sx-chatbtn{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--sx);border-radius:999px;padding:10px 18px;background:transparent;color:var(--sx);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
  .sx-chatbtn:hover{background:color-mix(in srgb,var(--sx) 16%,transparent)}
  .sx-chatbtn svg{width:20px;height:20px}
  .sx-center{min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:30px;text-align:center;color:#c6c3d0}
  .sx-retry{border:0;border-radius:9px;padding:10px 18px;background:var(--sx);color:#0b1328;font:inherit;font-weight:800;cursor:pointer}
  .sx-ini{display:grid;place-items:center;font-weight:800;color:var(--sx);background:#0b1730}
  .sx-head .sx-ini{font-size:14px}.sx-avatar.sx-ini{font-size:28px}
  [data-perfil]{cursor:pointer}
  `;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  const root=document.createElement('div');root.id='sx-root';document.body.appendChild(root);
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const agora=()=>new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  let S=null; /* {tipo:'guilda'|'privado'|'perfil', ...} */

  function fechar(){S=null;root.innerHTML=''}
  function bg(inner,center){return `<div class="sx-bg${center?' center':''}" data-sx-bg style="--sx:${S.acc}">${inner}</div>`}

  function msgHTML(m,i){
    const ac=ACC[m.p]||S.acc;
    let corpo=m.t?`<p>${esc(m.t)}</p>`:'';
    if(m.share){
      const sh=m.share;
      if(sh.k==='desafio')corpo=`<button class="sx-share" disabled>${I.sword}<div><em>DESAFIO COMPARTILHADO</em><strong>${esc(sh.t)}</strong></div></button>`;
      else if(sh.k==='bloqueada')corpo=`<button class="sx-share" disabled>${I.lock}<div><em>QUESTÃO BLOQUEADA</em><strong>Questão bloqueada para você</strong></div></button>`;
      else{const q=QUESTOES[sh.q];
        corpo=`<button class="sx-share" data-sx-q="${i}">${I.help}<div><em>QUESTÃO COMPARTILHADA</em><strong>${esc(q.t)}</strong><small>Toque para responder</small></div></button>`;
        if(S.resp===i){
          const ops=q.vf?['Verdadeiro','Falso']:q.alt;
          corpo+=`<div class="sx-ans">${ops?`<div class="sx-row">${ops.map(o=>`<button class="sx-opt" data-sx-r="${esc(o)}">${esc(o)}</button>`).join('')}</div>`
            :`<div class="sx-row"><input class="sx-in" id="sx-ansin" placeholder="Digite sua resposta" /><button class="sx-send" data-sx-r="">${I.send}</button></div>`}
            ${S.res?`<div class="sx-res ${S.res==='Resposta correta!'?'ok':'no'}">${S.res}</div>`:''}</div>`;
        }}
    }
    return `<div class="sx-m${m.me?' me':''}" style="--ac:${ac}">${m.me?'':`<b>${esc(m.a)}</b>`}${corpo}<time>${m.h}</time></div>`;
  }
  function pickerHTML(){
    if(!S.share)return '';
    if(S.share==='desafio')return `<div class="sx-picker"><header><strong>Modo do desafio</strong><button data-sx-pclose>Fechar</button></header>
      <div class="sx-opts">${MODOS.map(m=>`<button class="sx-mode${S.modo===m?' on':''}" data-sx-modo="${m}">${m}</button>`).join('')}</div>
      <div class="sx-opts"><button class="sx-card" data-sx-start>${I.sword}Iniciar desafio</button></div></div>`;
    const qs=S.semQuestoes?[]:QUESTOES;
    return `<div class="sx-picker"><header><strong>Escolha a questão</strong><button data-sx-pclose>Fechar</button></header>
      <div class="sx-opts">${qs.length?qs.map((q,i)=>`<button class="sx-card" data-sx-qs="${i}">${I.help}${esc(q.t)}</button>`).join(''):'<span class="sx-val" style="margin:6px 0">Nenhum conteúdo disponível para compartilhar.</span>'}</div></div>`;
  }
  function render(){
    if(!S){root.innerHTML='';return}
    if(S.tipo==='perfil'){root.innerHTML=bg(perfilHTML(),true);return}
    const g=S.tipo==='guilda';
    const head=g?`<div class="sx-head">${I.forum}<div><h3>Chat da guilda</h3><small>Legião Azul · ${GUILDAS['Legião Azul']} membros</small></div><button class="sx-x" data-sx-close aria-label="Fechar chat da guilda">${I.x}</button></div>`
      :`<div class="sx-head">${rosto(S.pes,'av',`data-perfil="${esc(S.pes.n)}" title="Ver perfil"`)}<div><h3>${esc(S.pes.n)}</h3><small>@${esc(S.pes.ap)} · <span class="sx-dot${S.pes.on?' on':''}"></span>${S.pes.on?'online':'Offline'}</small></div><button class="sx-x" data-sx-close aria-label="Fechar conversa">${I.x}</button></div>`;
    const msgs=S.msgs.length?S.msgs.map(msgHTML).join(''):`<div class="sx-empty">Ainda não há mensagens. Comece a conversa!</div>`;
    const comp=`<div class="sx-comp">${g?`<button class="sx-ib" data-sx-share="desafio" aria-label="Compartilhar desafio" title="Compartilhar desafio">${I.sword}</button><button class="sx-ib" data-sx-share="questao" aria-label="Compartilhar questão" title="Compartilhar questão">${I.help}</button>`:''}
      <input class="sx-in" id="sx-in" maxlength="500" placeholder="${g?'Escreva para sua guilda...':'Mensagem privada...'}" aria-label="${g?'Mensagem para a guilda':'Mensagem privada'}" value="${esc(S.txt||'')}" />
      <button class="sx-send" data-sx-send aria-label="Enviar mensagem" ${(S.txt||'').trim()?'':'disabled'}>${I.send}</button></div>`;
    root.innerHTML=bg(`<aside class="sx-panel" role="dialog" aria-modal="true" aria-label="${g?'Chat da guilda':'Conversa com '+esc(S.pes.n)}">${head}<div class="sx-msgs" id="sx-msgs">${msgs}</div>${S.erro?`<div class="sx-err">${I.alert}${S.erro}</div>`:''}${pickerHTML()}${comp}</aside>`);
    const box=document.getElementById('sx-msgs');if(box&&!S.keepScroll)box.scrollTop=box.scrollHeight;S.keepScroll=false;
  }
  function perfilHTML(){
    const x=S.pes,close=`<button class="sx-x" data-sx-close aria-label="Fechar perfil">${I.x}</button>`;
    if(S.estado==='erro')return `<div class="sx-prof">${close}<div class="sx-center">${I.alert.replace('<svg','<svg width="34" height="34"')}<p>Não foi possível carregar este perfil.</p><button class="sx-retry" data-sx-retry>Tentar novamente</button></div></div>`;
    const cq=S.estado==='sem-conquistas'?[]:x.cq, pts=cq.reduce((s,c)=>s+c[4],0);
    return `<div class="sx-prof" role="dialog" aria-modal="true" aria-label="Perfil de ${esc(x.n)}">${close}
      <div class="sx-banner" style="background-image:linear-gradient(180deg,transparent 40%,rgba(18,30,63,.85)),${x.p==='nenhum'?'none':`url(assets/world-${x.p}.webp)`}"></div>
      ${rosto(x,'sx-avatar')}
      <div class="sx-name"><h3>${esc(x.n.toUpperCase())}</h3><span>@${esc(x.ap)}</span><span><i class="sx-dot${x.on?' on':''}"></i>${x.on?'online':'offline'}</span></div>
      <div class="sx-rule"></div>
      ${x.g?`<div class="sx-guild"><img src="assets/emblem-${x.g==='Legião Azul'?'conqueror':x.g==='Fênix Rubra'?'daredevil':'seeker'}.png" alt="" /><div><div class="sx-lbl">GUILDA</div><div class="sx-val">${esc(x.g)} · ${GUILDAS[x.g]||5} pessoas</div></div></div>`:''}
      <div class="sx-lbl">DADOS</div><div class="sx-val">${NOME_PERFIL[x.p]||'Jornada ativa'}</div>
      ${SOBRE_PERFIL[x.p]?`<div class="sx-lbl">SOBRE O PERFIL</div><div class="sx-val">${SOBRE_PERFIL[x.p]}</div>`:''}
      ${x.sobre?`<div class="sx-lbl">SOBRE</div><div class="sx-val">${esc(x.sobre)}</div>`:''}
      <div class="sx-lbl">CONQUISTAS<em>${pts} pts</em></div>
      ${cq.length?`<div class="sx-badges">${cq.map(([o,n,c,d,p])=>`<div class="sx-badge"><img src="assets/object-${o}.png" alt="" /><strong>${n}</strong><i>${c}</i><p>${d}</p><b>+${p} pts</b></div>`).join('')}</div>`:'<div class="sx-val">Nenhuma conquista pública ainda.</div>'}
      <div class="sx-foot"><button class="sx-chatbtn" data-sx-pm="${esc(x.n)}" aria-label="Conversar em privado">${I.msg}Conversar em privado</button></div></div>`;
  }

  const Social={
    guilda(o={}){S={tipo:'guilda',acc:ACC.conqueror,msgs:o.vazio?[]:BASE_GUILDA.map(m=>({...m})),modo:'todos'};render()},
    privado(n){const pes=pessoa(n);S={tipo:'privado',pes,acc:ACC[pes.p],msgs:BASE_PRIVADO(n)};render()},
    perfil(n,o={}){const pes=pessoa(n);S={tipo:'perfil',pes,acc:ACC[pes.p],estado:o.estado||''};render()},
    fechar,
  };
  window.Social=Social;

  function enviar(){const t=(S.txt||'').trim();if(!t)return;S.msgs.push({a:'Amina T.',p:'conqueror',h:agora(),t,me:true});S.txt='';render();document.getElementById('sx-in')?.focus()}
  function responder(v){const m=S.msgs[S.resp],q=QUESTOES[m.share.q];if(!v.trim())return;S.res=v.trim().toLowerCase()===q.ok.toLowerCase()?'Resposta correta!':'Resposta incorreta.';S.keepScroll=true;render()}

  root.addEventListener('input',e=>{if(e.target.id==='sx-in'){S.txt=e.target.value;const b=root.querySelector('[data-sx-send]');if(b)b.disabled=!S.txt.trim()}});
  root.addEventListener('keydown',e=>{if(e.key!=='Enter')return;if(e.target.id==='sx-in'){e.preventDefault();enviar()}if(e.target.id==='sx-ansin'){e.preventDefault();responder(e.target.value)}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S)fechar()});
  root.addEventListener('click',e=>{
    const q=s=>e.target.closest(s);
    if(e.target.hasAttribute('data-sx-bg')||q('[data-sx-close]')){fechar();return}
    if(q('[data-sx-send]')){enviar();return}
    if(q('[data-sx-q]')){const i=+q('[data-sx-q]').dataset.sxQ;S.resp=S.resp===i?null:i;S.res=null;S.keepScroll=true;render();return}
    if(q('[data-sx-r]')){const b=q('[data-sx-r]');responder(b.dataset.sxR||document.getElementById('sx-ansin').value);return}
    if(q('[data-sx-share]')){const k=q('[data-sx-share]').dataset.sxShare;S.share=S.share===k?null:k;render();return}
    if(q('[data-sx-pclose]')){S.share=null;render();return}
    if(q('[data-sx-modo]')){S.modo=q('[data-sx-modo]').dataset.sxModo;S.keepScroll=true;render();return}
    if(q('[data-sx-start]')){const nm={todos:'Todos',velocidade:'Velocidade',precisao:'Precisão',duelo:'Duelo',duplo:'Duplo'}[S.modo];S.msgs.push({a:'Amina T.',p:'conqueror',h:agora(),me:true,share:{k:'desafio',t:`${nm} · 3 questões de Equações`}});S.share=null;render();return}
    if(q('[data-sx-qs]')){S.msgs.push({a:'Amina T.',p:'conqueror',h:agora(),me:true,share:{k:'questao',q:+q('[data-sx-qs]').dataset.sxQs}});S.share=null;render();return}
    if(q('[data-sx-pm]')){Social.privado(q('[data-sx-pm]').dataset.sxPm);return}
    if(q('[data-sx-retry]')){S.estado='';render();return}
    if(q('[data-perfil]')){Social.perfil(q('[data-perfil]').dataset.perfil);return}
  });
  /* fora do componente: qualquer [data-perfil] abre o perfil público; [data-open="guilda"] e [data-privado] abrem os chats */
  document.addEventListener('click',e=>{
    if(root.contains(e.target))return;
    const p=e.target.closest('[data-perfil]'),g=e.target.closest('[data-open="guilda"]'),pm=e.target.closest('[data-privado]');
    if(pm){e.preventDefault();e.stopPropagation();Social.privado(pm.dataset.privado);return}
    if(g){e.preventDefault();e.stopPropagation();Social.guilda();return}
    if(p){e.preventDefault();e.stopPropagation();Social.perfil(p.dataset.perfil)}
  },true);
})();
