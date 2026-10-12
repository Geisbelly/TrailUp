/* Tutorial de primeiro acesso (revisão 04 #7). Passos e falas de mobile/src/utils/firstAccessTour.ts (v7),
   voz do Conqueror (Amina). Atravessa as telas: o passo atual vai na URL (?tour=N).
   Uso: Tour.iniciar() · Tour.ir(n) · Tour.fechar() */
(function(){
  const G={nome:'Amina',img:'assets/guardiao-conqueror.png',rosto:'assets/rosto-conqueror.png',cor:'#6f90eb'};
  const P=[
    {pg:'03-trilha.html',page:'Apresentação · Amina',t:'Amina, a Comandante do Cristal Azul',d:'Eu sou Amina. Minha armadura azul e dourada, a coroa e o cajado de cristal representam liderança, estratégia e domínio conquistado com propósito. Como guardiã Conquistadora, comando sua campanha, acompanho sua posição e transformo progresso em território dominado.',intro:true},
    {pg:'03-trilha.html',page:'Navegação principal',t:'Suas áreas',d:'Antes da campanha, reconheça o terreno: estes são seus setores de comando. Trilha, Notificações, Social, Loja, Ranking e Perfil — trocar de área não perde seu progresso.',alvo:'.console-navigation'},
    {pg:'03-trilha.html',page:'Guias da interface',t:'Precisou de ajuda?',d:'Precisou de inteligência tática? Me acione sem sair do setor. Este botão abre o guia da página em que você estiver.',alvo:'#guideBtn'},
    {pg:'03-trilha.html',page:'Trilha',t:'Seu progresso',d:'Este é o mapa da campanha. Cada território aqui pode ser seu. Aqui ficam a classe e a porcentagem já concluída.',alvo:'#hud'},
    {pg:'03-trilha.html',page:'Trilha',t:'Os tópicos',d:'Avance sobre um tópico. Sua posição fica salva entre as investidas. Cada nó é um tópico: concluído, disponível ou ainda bloqueado.',alvo:'#board'},
    {pg:'07-notificacoes.html',page:'Notificações',t:'Seus avisos',d:'As movimentações da sua campanha chegam por aqui. Abra um aviso para ler, marcar como não lido ou excluir.',alvo:'#md .list'},
    {pg:'05-ranking.html',page:'Ranking',t:'As classificações',d:'A Sala de Honra mostra onde você está em cada frente. Cada cartão abre uma tabela com critério próprio.',alvo:'.cats'},
    {pg:'08-perfil-hub.html',page:'Perfil',t:'Seu perfil ativo',d:'Este é o seu posto de comando. Ajuste o estilo, não as vitórias. Trocar de perfil muda cores, guia e recursos — nunca o seu histórico.',alvo:'.id-block'},
    {pg:'08-perfil-hub.html',page:'Perfil · Métricas',t:'Suas métricas: Arena Tática',d:'Seu painel prioriza campanha, posição, precisão e domínio da trilha. O guia desta página explica cada número.',alvo:'.kpis'},
    {pg:'09-biblioteca-conquistas.html',page:'Biblioteca de Conquistas',t:'Suas conquistas',d:'Aqui ficam as insígnias que você conquistou em campo. Concluídas, em progresso e bloqueadas, com o requisito de cada uma.',alvo:'.summary'},
    {pg:'11-configuracoes.html',q:'sub=coleta',page:'Configurações',t:'Suas preferências',d:'Daqui você comanda preferências, acessos e permissões. Conta, estilo das métricas, coleta de dados e privacidade.',alvo:'.side'},
    {pg:'11-configuracoes.html',q:'sub=metricas',page:'Configurações · Métricas',t:'Como suas métricas aparecem',d:'O modo Automático acompanha o seu perfil ativo. Você também pode fixar outra visualização; isso muda somente a apresentação do painel, nunca seus resultados nem seu histórico.',alvo:'.opts'},
    {pg:'11-configuracoes.html',q:'sub=coleta',page:'Configurações · Coleta',t:'Câmera: você mantém o controle',d:'Este controle ativa ou desativa a análise opcional por câmera. Ativar ainda depende da permissão do navegador; desativar interrompe essa coleta sem bloquear seus estudos, notas ou demais recursos.',alvo:'.toggle-row',nth:0},
    {pg:'11-configuracoes.html',q:'sub=coleta',page:'Configurações · Coleta',t:'Chat e contexto do mentor',d:'Aqui você permite ou interrompe o registro das interações com o chat do guia. O estado Ativo ou Desativado aparece no próprio controle e pode ser alterado quando quiser.',alvo:'.toggle-row',nth:3},
    {pg:'10-relatorio-dados.html',page:'Configurações · Relatório',t:'Seu relatório completo',d:'O relatório reúne identificação, eventos registrados, posições nos rankings, progresso nas trilhas e conquistas. Este botão gera um PDF para você revisar e compartilhar.',alvo:'.action-card'},
    {pg:'03-trilha.html',page:'Tutorial concluído',t:'Pronto',d:'O reconhecimento terminou. A campanha é sua — avance. O botão de ajuda continua em cada página.'},
  ];
  const css=`
  .tu-root{position:fixed;inset:0;z-index:120;pointer-events:none;font-family:inherit}
  .tu-dim{position:fixed;inset:0;background:rgba(3,7,20,.72);pointer-events:auto}
  .tu-hole{position:fixed;border:2px solid ${G.cor};border-radius:14px;box-shadow:0 0 0 9999px rgba(3,7,20,.72),0 0 24px rgba(111,144,235,.55);transition:all .25s ease;pointer-events:none}
  .tu-block{position:fixed;inset:0;pointer-events:auto}
  .tu-card{position:fixed;width:380px;max-width:calc(100vw - 32px);background:#121e3f;border:1px solid #4d6fcb;border-radius:18px;padding:18px 18px 16px;color:#f3f4f7;box-shadow:0 18px 50px rgba(0,0,0,.5);pointer-events:auto;transition:top .25s,left .25s;animation:tuIn .2s}
  @keyframes tuIn{from{opacity:0;transform:translateY(8px)}}
  .tu-top{display:flex;gap:12px;align-items:center;margin-bottom:10px}
  .tu-top img{width:56px;height:56px;border-radius:50%;border:2px solid ${G.cor};object-fit:cover;flex:none}
  .tu-page{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:${G.cor};font-weight:800}
  .tu-n{margin-left:auto;font-size:12px;color:rgba(243,244,247,.62);font-weight:700;align-self:flex-start}
  .tu-card h3{margin:2px 0 0;font-family:Georgia,serif;font-size:18px;line-height:1.25}
  .tu-card p{margin:0;font-size:13.5px;line-height:1.55;color:rgba(243,244,247,.85)}
  .tu-prog{display:flex;gap:4px;margin:14px 0 12px}
  .tu-prog i{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.14)}
  .tu-prog i.on{background:${G.cor}}
  .tu-acts{display:flex;align-items:center;gap:8px}
  .tu-btn{border-radius:999px;padding:9px 16px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;border:1px solid #4d6fcb;background:transparent;color:#f3f4f7}
  .tu-btn.primary{background:${G.cor};border-color:${G.cor};color:#0b1328;margin-left:auto}
  .tu-btn.link{border:0;padding:9px 6px;color:rgba(243,244,247,.7)}
  .tu-btn[disabled]{opacity:.4;cursor:default}
  .tu-intro{position:fixed;inset:0;display:grid;place-items:center;pointer-events:auto;padding:24px}
  .tu-intro .tu-card{position:relative;width:760px;max-width:100%;display:grid;grid-template-columns:280px 1fr;gap:24px;padding:0;overflow:hidden}
  .tu-intro .art{background:radial-gradient(circle at 50% 60%,rgba(111,144,235,.35),transparent 70%),#0b1328;display:flex;align-items:flex-end;justify-content:center;min-height:380px}
  .tu-intro .art img{width:100%;height:100%;max-height:440px;object-fit:contain;object-position:bottom}
  .tu-intro .body{padding:28px 28px 22px 0;display:flex;flex-direction:column}
  .tu-intro h3{font-size:24px;margin:6px 0 12px}
  .tu-intro p{font-size:14.5px}
  .tu-intro .tu-prog{margin-top:auto;padding-top:18px}
  `;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  const root=document.createElement('div');root.className='tu-root';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Tutorial inicial');
  let n=-1;
  const aqui=()=>location.pathname.split('/').pop()||'03-trilha.html';
  function url(i){const s=P[i];return `${s.pg}?${s.q?s.q+'&':''}tour=${i}`}
  function fechar(){n=-1;root.remove();window.removeEventListener('resize',pos);const u=new URL(location.href);if(u.searchParams.has('tour')){u.searchParams.delete('tour');history.replaceState(null,'',u.pathname+(u.search||''))}}
  function ir(i){
    if(i<0||i>=P.length)return;
    const s=P[i];
    const subAtual=new URLSearchParams(location.search).get('sub')||'coleta';
    const precisaSub=s.q&&s.q.startsWith('sub=')&&s.q.slice(4)!==subAtual;
    if(s.pg!==aqui()||precisaSub){location.href=url(i);return}
    n=i;history.replaceState(null,'',location.pathname+'?'+(s.q?s.q+'&':'')+'tour='+i);
    if(!root.isConnected)document.body.appendChild(root);
    desenhar();
  }
  function botoes(){const ult=n===P.length-1;return `<div class="tu-acts"><button class="tu-btn link" data-tu="pular" aria-label="Pular tutorial inicial">Pular</button><button class="tu-btn" data-tu="voltar" ${n===0?'disabled':''}>Voltar</button><button class="tu-btn primary" data-tu="prox">${ult?'Começar':'Próximo'}</button></div>`}
  const prog=()=>`<div class="tu-prog">${P.map((_,i)=>`<i class="${i<=n?'on':''}"></i>`).join('')}</div>`;
  function alvo(){const s=P[n];if(!s.alvo)return null;const l=document.querySelectorAll(s.alvo);return l[s.nth||0]||null}
  function desenhar(tentativa=0){
    const s=P[n];
    if(s.intro){root.innerHTML=`<div class="tu-dim"></div><div class="tu-intro"><div class="tu-card"><div class="art"><img src="${G.img}" alt="${G.nome}" /></div><div class="body"><div style="display:flex"><span class="tu-page">${s.page}</span><span class="tu-n">${n+1}/${P.length}</span></div><h3>${s.t}</h3><p>${s.d}</p>${prog()}${botoes()}</div></div></div>`;return}
    const el=alvo();
    if(s.alvo&&!el&&tentativa<15){setTimeout(()=>desenhar(tentativa+1),100);return}
    if(el){const r=el.getBoundingClientRect();if(r.top<70||r.bottom>innerHeight)el.scrollIntoView({block:r.height>innerHeight-120?'start':'center'})}
    root.innerHTML=`${el?'<div class="tu-block"></div><div class="tu-hole"></div>':'<div class="tu-dim"></div>'}<div class="tu-card"><div class="tu-top"><img src="${G.rosto}" alt="" /><div><div class="tu-page">${s.page}</div><h3>${s.t}</h3></div><span class="tu-n">${n+1}/${P.length}</span></div><p>${s.d}</p>${prog()}${botoes()}</div>`;
    pos();
  }
  function pos(){
    if(n<0||P[n].intro)return;
    const card=root.querySelector('.tu-card'),hole=root.querySelector('.tu-hole'),el=alvo();if(!card)return;
    const W=innerWidth,H=innerHeight,cw=card.offsetWidth,ch=card.offsetHeight,g=16;
    if(!el||!hole){card.style.left=(W-cw)/2+'px';card.style.top=(H-ch)/2+'px';return}
    const r=el.getBoundingClientRect(),pad=6;
    const R={l:Math.max(4,r.left-pad),t:Math.max(4,r.top-pad),r:Math.min(W-4,r.right+pad),b:Math.min(H-4,r.bottom+pad)};
    Object.assign(hole.style,{left:R.l+'px',top:R.t+'px',width:(R.r-R.l)+'px',height:(R.b-R.t)+'px'});
    const clampY=y=>Math.min(H-ch-g,Math.max(g,y)),clampX=x=>Math.min(W-cw-g,Math.max(g,x));
    let x,y;
    if(R.r+g+cw<W){x=R.r+g;y=clampY(R.t)}
    else if(R.l-g-cw>0){x=R.l-g-cw;y=clampY(R.t)}
    else if(R.b+g+ch<H){y=R.b+g;x=clampX(R.l)}
    else if(R.t-g-ch>0){y=R.t-g-ch;x=clampX(R.l)}
    else{x=W-cw-g*2;y=H-ch-g*2}
    card.style.left=x+'px';card.style.top=y+'px';
  }
  root.addEventListener('click',e=>{const b=e.target.closest('[data-tu]');if(!b)return;const a=b.dataset.tu;
    if(a==='pular')fechar();else if(a==='voltar')ir(n-1);else if(n===P.length-1)fechar();else ir(n+1)});
  document.addEventListener('keydown',e=>{if(n<0)return;if(e.key==='Escape')fechar();if(e.key==='ArrowRight'){n===P.length-1?fechar():ir(n+1)}if(e.key==='ArrowLeft')ir(n-1)});
  window.addEventListener('resize',pos);
  window.addEventListener('scroll',pos,true);
  window.Tour={iniciar:()=>{location.href=url(0)},ir,fechar,passos:P.length};
  const t=new URLSearchParams(location.search).get('tour');
  if(t!==null&&P[+t]){const go=()=>setTimeout(()=>ir(+t),250);document.readyState==='complete'?go():window.addEventListener('load',go)}
})();
