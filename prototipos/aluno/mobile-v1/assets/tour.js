/* Tutorial de primeiro acesso no celular (parte 10). Passos e falas do v4 (v4/assets/tour.js), voz da Amina.
   Atravessa as telas com o passo na URL (?tour=N). Desenha dentro do .aparelho, por cima da .tela.
   Precisa de tema.js (ARTE, perfil). Uso: Tour.iniciar() · Tour.ir(n) · Tour.daPagina() · Tour.fechar()
   Qualquer botão com [data-tour-pagina] abre o passo da página atual. */
(function () {
  const G = {nome: 'Amina', img: ARTE + 'guardiao-conqueror.png', rosto: ARTE + 'rosto-conqueror.png'};
  const P = [
    {pg:'03-trilha.html',page:'Apresentação · Amina',t:'Amina, a Comandante do Cristal Azul',d:'Eu sou Amina. Minha armadura azul e dourada, a coroa e o cajado de cristal representam liderança, estratégia e domínio conquistado com propósito. Como guardiã Conquistadora, comando sua campanha, acompanho sua posição e transformo progresso em território dominado.',intro:true},
    {pg:'03-trilha.html',page:'Navegação principal',t:'Suas áreas',d:'Antes da campanha, reconheça o terreno: estes são seus setores de comando. Trilha, Notificações, Social, Ranking e Perfil. A Loja fica dentro do Perfil — trocar de área não perde seu progresso.',alvo:'.abas'},
    {pg:'03-trilha.html',page:'Guias da interface',t:'Precisou de ajuda?',d:'Precisou de inteligência tática? Me acione sem sair do setor. Este botão abre o guia da página em que você estiver.',alvo:'[data-tour-pagina]'},
    {pg:'03-trilha.html',page:'Trilha',t:'Seu progresso',d:'Este é o mapa da campanha. Cada território aqui pode ser seu. Aqui ficam a classe e a porcentagem já concluída.',alvo:'.topo'},
    {pg:'03-trilha.html',page:'Trilha',t:'Os tópicos',d:'Avance sobre um tópico. Sua posição fica salva entre as investidas. Cada nó é um tópico: concluído, disponível ou ainda bloqueado.',alvo:'.tabuleiro'},
    {pg:'07-notificacoes.html',page:'Notificações',t:'Seus avisos',d:'As movimentações da sua campanha chegam por aqui. Abra um aviso para ler, marcar como não lido ou excluir.',alvo:'.lista'},
    {pg:'05-ranking.html',page:'Ranking',t:'As classificações',d:'A Sala de Honra mostra onde você está em cada frente. Cada cartão abre uma tabela com critério próprio.',alvo:'.cats'},
    {pg:'08-perfil-hub.html',page:'Perfil',t:'Seu perfil ativo',d:'Este é o seu posto de comando. Ajuste o estilo, não as vitórias. Trocar de perfil muda cores, guia e recursos — nunca o seu histórico.',alvo:'.ident'},
    {pg:'08-perfil-hub.html',page:'Perfil · Métricas',t:'Suas métricas: Arena Tática',d:'Seu painel prioriza campanha, posição, precisão e domínio da trilha. O guia desta página explica cada número.',alvo:'.kpis'},
    {pg:'09-biblioteca-conquistas.html',page:'Biblioteca de Conquistas',t:'Suas conquistas',d:'Aqui ficam as insígnias que você conquistou em campo. Concluídas, em progresso e bloqueadas, com o requisito de cada uma.',alvo:'.numeros'},
    {pg:'11-configuracoes.html',estado:'lista',page:'Configurações',t:'Suas preferências',d:'Daqui você comanda preferências, acessos e permissões. Conta, estilo das métricas, coleta de dados e privacidade.',alvo:'.lista'},
    {pg:'11-configuracoes.html',estado:'metricas',page:'Configurações · Métricas',t:'Como suas métricas aparecem',d:'O modo Automático acompanha o seu perfil ativo. Você também pode fixar outra visualização; isso muda somente a apresentação do painel, nunca seus resultados nem seu histórico.',alvo:'.opcoes'},
    {pg:'11-configuracoes.html',estado:'coleta',page:'Configurações · Coleta',t:'Câmera: você mantém o controle',d:'Este controle ativa ou desativa a análise opcional por câmera. Ativar ainda depende da permissão do celular; desativar interrompe essa coleta sem bloquear seus estudos, notas ou demais recursos.',alvo:'[data-coleta="cam"]'},
    {pg:'11-configuracoes.html',estado:'coleta',page:'Configurações · Coleta',t:'Chat e contexto do mentor',d:'Aqui você permite ou interrompe o registro das interações com o chat do guia. O estado Ativo ou Desativado aparece no próprio controle e pode ser alterado quando quiser.',alvo:'[data-coleta="chat"]'},
    {pg:'10-relatorio-dados.html',page:'Configurações · Relatório',t:'Seu relatório completo',d:'O relatório reúne identificação, eventos registrados, posições nos rankings, progresso nas trilhas e conquistas. Este botão gera um PDF para você revisar e compartilhar.',alvo:'.cartao.acao'},
    {pg:'03-trilha.html',page:'Tutorial concluído',t:'Pronto',d:'O reconhecimento terminou. A campanha é sua — avance. O botão de ajuda continua em cada página.'},
  ];
  const css = `
  .tu{position:absolute;inset:0;z-index:90;font-family:Inter,system-ui,sans-serif;color:var(--text)}
  .tu-veu{position:absolute;inset:0;background:rgba(3,7,20,.74)}
  .tu-bloq{position:absolute;inset:0}
  .tu-furo{position:absolute;border:2px solid var(--accent);border-radius:14px;box-shadow:0 0 0 9999px rgba(3,7,20,.74),0 0 22px var(--accent-soft);pointer-events:none;transition:all .25s ease}
  .tu-cartao{position:absolute;left:10px;right:10px;background:var(--surface);border:1px solid var(--border-strong);border-radius:20px;padding:16px 16px 14px;color:var(--text);box-shadow:0 18px 50px rgba(0,0,0,.5)}
  .tu-cartao.baixo{bottom:calc(var(--base) + 8px)}
  .tu-cartao.alto{top:calc(var(--topo) + 8px)}
  .tu-cab{display:flex;gap:12px;align-items:center;margin-bottom:8px}
  .tu-cab img{width:48px;height:48px;border-radius:50%;border:2px solid var(--accent);object-fit:cover;flex:none}
  .tu-cab div{flex:1;min-width:0}
  .tu-pag{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);font-weight:800}
  .tu-n{font-size:12px;color:var(--text-subtle);font-weight:700;align-self:flex-start}
  .tu h3{margin:2px 0 0;font-family:Georgia,serif;font-size:18px;line-height:1.25}
  .tu p{margin:0;font-size:14px;line-height:1.55;color:var(--text-muted)}
  .tu-prog{display:flex;gap:3px;margin:14px 0 12px}
  .tu-prog i{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.14)}
  .tu-prog i.on{background:var(--accent)}
  .tu-acoes{display:flex;align-items:center;gap:8px}
  .tu-bt{min-height:44px;border-radius:999px;padding:0 16px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;border:1px solid var(--border-strong);background:transparent;color:var(--text)}
  .tu-bt.prim{flex:1;background:var(--accent);border-color:var(--accent);color:var(--bg)}
  .tu-bt.link{border:0;padding:0 8px;color:var(--text-subtle)}
  .tu-bt[disabled]{opacity:.4;cursor:default}
  .tu-intro{position:absolute;inset:0;display:flex;flex-direction:column;background:radial-gradient(90% 55% at 50% 30%,var(--accent-soft),transparent 70%),var(--bg)}
  .tu-intro .arte{flex:1;min-height:0;display:flex;align-items:flex-end;justify-content:center;padding-top:var(--topo)}
  .tu-intro .arte img{max-width:86%;max-height:100%;object-fit:contain;filter:drop-shadow(0 0 30px var(--accent-soft))}
  .tu-intro .corpo{padding:18px 20px calc(var(--base) + 14px);background:linear-gradient(transparent,var(--bg) 18px)}
  .tu-intro h3{font-size:23px;margin:4px 0 10px}
  .tu-intro .tu-cab{display:flex;justify-content:space-between;margin:0}
  `;
  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
  const aparelho = document.querySelector('.aparelho');
  const raiz = document.createElement('div');
  raiz.className = 'tu'; raiz.setAttribute('role', 'dialog'); raiz.setAttribute('aria-modal', 'true'); raiz.setAttribute('aria-label', 'Tutorial inicial');
  let n = -1;
  const aqui = () => location.pathname.split('/').pop() || '03-trilha.html';
  const url = i => { const s = P[i]; return `${s.pg}?${s.estado ? `estado=${s.estado}&` : ''}perfil=${perfil}&tour=${i}`; };

  function fechar() {
    n = -1; raiz.remove();
    const u = new URL(location.href);
    if (u.searchParams.has('tour')) { u.searchParams.delete('tour'); history.replaceState(null, '', u.pathname + u.search); }
  }
  function ir(i) {
    if (i < 0 || i >= P.length) return;
    const s = P[i], estadoAtual = new URLSearchParams(location.search).get('estado');
    if (s.pg !== aqui() || (s.estado && s.estado !== (estadoAtual || 'lista'))) { location.href = url(i); return; }
    n = i;
    const u = new URL(location.href); u.searchParams.set('tour', i); history.replaceState(null, '', u.pathname + u.search);
    if (!raiz.isConnected) aparelho.appendChild(raiz);
    desenhar();
  }
  const prog = () => `<div class="tu-prog" aria-hidden="true">${P.map((_, i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;
  const botoes = () => `<div class="tu-acoes"><button class="tu-bt link" data-tu="pular" aria-label="Pular tutorial inicial">Pular</button><button class="tu-bt" data-tu="voltar" ${n === 0 ? 'disabled' : ''}>Voltar</button><button class="tu-bt prim" data-tu="prox">${n === P.length - 1 ? 'Começar' : 'Próximo'}</button></div>`;
  const alvo = () => P[n].alvo ? aparelho.querySelector('.tela ' + P[n].alvo) : null;

  function desenhar(tentativa = 0) {
    const s = P[n];
    if (s.intro) {
      raiz.innerHTML = `<div class="tu-intro"><div class="arte"><img src="${G.img}" alt="${G.nome}" /></div><div class="corpo"><div class="tu-cab"><span class="tu-pag">${s.page}</span><span class="tu-n">${n + 1}/${P.length}</span></div><h3>${s.t}</h3><p>${s.d}</p>${prog()}${botoes()}</div></div>`;
      return;
    }
    const el = alvo();
    if (s.alvo && !el && tentativa < 15) { setTimeout(() => desenhar(tentativa + 1), 100); return; }
    if (el) el.scrollIntoView({block: 'nearest'});
    raiz.innerHTML = `${el ? '<div class="tu-bloq"></div><div class="tu-furo"></div>' : '<div class="tu-veu"></div>'}<div class="tu-cartao baixo"><div class="tu-cab"><img src="${G.rosto}" alt="" /><div><div class="tu-pag">${s.page}</div><h3>${s.t}</h3></div><span class="tu-n">${n + 1}/${P.length}</span></div><p>${s.d}</p>${prog()}${botoes()}</div>`;
    posicionar();
  }
  function posicionar() {
    if (n < 0 || P[n].intro) return;
    const furo = raiz.querySelector('.tu-furo'), cartao = raiz.querySelector('.tu-cartao'), el = alvo();
    if (!cartao) return;
    if (!el || !furo) { cartao.className = 'tu-cartao baixo'; cartao.style.top = ''; return; }
    const B = aparelho.getBoundingClientRect(), A = {left: B.left + aparelho.clientLeft, top: B.top + aparelho.clientTop, width: aparelho.clientWidth, height: aparelho.clientHeight}, r = el.getBoundingClientRect(), pad = 4;
    const H = A.height, R = {l: Math.max(6, r.left - A.left - pad), t: Math.max(6, r.top - A.top - pad), r: Math.min(A.width - 6, r.right - A.left + pad), b: Math.min(H - 6, r.bottom - A.top + pad)};
    Object.assign(furo.style, {left: R.l + 'px', top: R.t + 'px', width: (R.r - R.l) + 'px', height: (R.b - R.t) + 'px'});
    // alvo na metade de baixo: cartão no topo; senão embaixo. Se ainda assim cobrir, encosta no lado livre.
    const meio = (R.t + R.b) / 2, ch = cartao.offsetHeight;
    if (meio > H / 2) {
      cartao.className = 'tu-cartao alto';
      if (R.t - ch - 12 > 0 && cartao.offsetTop + ch > R.t) cartao.style.top = (R.t - ch - 12) + 'px';
    } else {
      cartao.className = 'tu-cartao baixo';
      if (R.b + ch + 12 > H) { cartao.className = 'tu-cartao'; cartao.style.top = Math.min(H - ch - 8, R.b + 12) + 'px'; }
    }
  }
  raiz.addEventListener('click', e => {
    e.stopPropagation();
    const b = e.target.closest('[data-tu]'); if (!b) return;
    const a = b.dataset.tu;
    if (a === 'pular') fechar(); else if (a === 'voltar') ir(n - 1); else if (n === P.length - 1) fechar(); else ir(n + 1);
  });
  document.addEventListener('keydown', e => {
    if (n < 0) return;
    if (e.key === 'Escape') fechar();
    if (e.key === 'ArrowRight') n === P.length - 1 ? fechar() : ir(n + 1);
    if (e.key === 'ArrowLeft') ir(n - 1);
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-tour-pagina]'); if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation(); Tour.daPagina();
  }, true);
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-tour-inicio]')) return;
    e.preventDefault(); e.stopImmediatePropagation(); Tour.iniciar();
  }, true);
  addEventListener('resize', posicionar);
  addEventListener('scroll', posicionar, true);
  window.Tour = {
    iniciar: () => { location.href = url(0); },
    ir, fechar, passos: P.length,
    // o passo da página atual (o "?" de cada tela); a apresentação conta como o passo da Trilha
    daPagina: () => { const i = P.findIndex(s => s.pg === aqui() && !s.intro); ir(i < 0 ? 0 : (aqui() === '03-trilha.html' ? 0 : i)); },
    redesenha: () => { if (n >= 0) desenhar(); },
  };
  const t = qs.get('tour');
  if (t !== null && P[+t]) { const vai = () => setTimeout(() => ir(+t), 250); document.readyState === 'complete' ? vai() : addEventListener('load', vai); }
})();
