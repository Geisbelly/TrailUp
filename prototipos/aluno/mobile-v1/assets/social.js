/* Social no celular (parte 5): chat da guilda, chat privado e perfil público, em tela cheia.
   Dados e textos do v4 (v4/assets/social.js). Precisa de tema.js (ARTE, ICONE) e app.css.
   Uso: Social.guilda({vazio}) · Social.privado(nome) · Social.perfil(nome, {estado:'sem-conquistas'|'erro'}) · Social.fechar() */
(function () {
  const NOME_PERFIL = {seeker:'Seeker · Explorador',survivor:'Survivor · Sobrevivente',daredevil:'Daredevil · Ousado',mastermind:'Mastermind · Estrategista',conqueror:'Conqueror · Conquistador',socializer:'Socializer · Socializador',achiever:'Achiever · Realizador'};
  const SOBRE_PERFIL = {seeker:'Curiosidade, conexões inesperadas e exploração: aprende melhor descobrindo caminhos.',survivor:'Persistência diante do difícil: rende quando o desafio aperta e há algo a superar.',daredevil:'Risco e ritmo: prefere desafios rápidos e decisões no calor do momento.',mastermind:'Estratégia e quebra-cabeças: gosta de entender o porquê antes de agir.',conqueror:'Superação e vitória: cresce com metas claras e adversários à altura.',socializer:'Conversa e colaboração: aprende melhor com outras pessoas por perto.',achiever:'Colecionar e completar: rende quando vê o progresso se acumulando.'};
  const GUILDAS = {'Legião Azul':['conqueror',8],'Exploradores do Norte':['seeker',7],'Fênix Rubra':['daredevil',6]};
  const PESSOAS = {
    'Marina S.':{p:'seeker',on:true,ap:'marina.s',g:'Exploradores do Norte',sobre:'Gosto de mapas e de achar o caminho mais curto.',cq:[['completion','Primeiro Tópico','Jornada','Conclua seu primeiro tópico da trilha.',10],['trophy','Fronteira Avançada','Desempenho','Complete 2 tópicos seguidos sem errar nenhuma questão de atividade.',40],['compass','Explorador de Perfis','Exploração','Experimente a trilha em 5 turmas diferentes.',35]]},
    'Zuri & Mateo':{p:'socializer',on:false,ap:'zuri.mateo',g:'Fênix Rubra',sobre:'Estudamos em dupla.'},
    'Diego A.':{p:'conqueror',on:true,ap:'diego.a',g:'Legião Azul',sobre:'Arena é comigo.'},
    'Bianca L.':{p:'achiever',on:true,ap:'bianca.l',g:'Exploradores do Norte'},
    'Théo M.':{p:'seeker',on:false,ap:'theo.m',g:null},
    'Rafael N.':{p:'conqueror',on:true,ap:'rafael.n',g:'Legião Azul'},
    'Kwame R.':{p:'achiever',on:true,ap:'kwame.r',g:'Exploradores do Norte'},
    'Lara P.':{p:'mastermind',on:false,ap:'lara.p',g:null},'Iago F.':{p:'daredevil',on:false,ap:'iago.f',g:null},'Kenji O.':{p:'survivor',on:true,ap:'kenji.o',g:null},
    'Ana C.':{p:null,on:false,ap:'ana.c',g:null},
  };
  const CQ_PADRAO = [['completion','Primeiro Tópico','Jornada','Conclua seu primeiro tópico da trilha.',10],['calendar','Sequência de 3 dias','Constância','Estude 3 dias seguidos.',15]];
  const QUESTOES = [{t:'Se 3x + 7 = 22, quanto vale x?',alt:['3','5','7','15']},{t:'Isole o x em 5x − 4 = 21'},{t:'Em 2x = 10, x vale 5.',vf:true}];
  const BASE_GUILDA = [
    {a:'Diego A.',p:'conqueror',h:'14:02',t:'Alguém já fez a missão 2 da Semana das Equações?'},
    {a:'Rafael N.',p:'conqueror',h:'14:03',share:{k:'desafio',t:'Precisão · 3 questões de Equações'}},
    {a:'Diego A.',p:'conqueror',h:'14:05',share:{k:'questao',q:0}},
    {a:'Bianca L.',p:'achiever',h:'14:06',share:{k:'questao',q:2}},
    {a:'Rafael N.',p:'conqueror',h:'14:08',share:{k:'bloqueada'}},
    {a:'Amina T.',p:'conqueror',h:'14:10',t:'Fiz! Faltou só a de precisão.',me:true},
  ];
  const BASE_PRIVADO = n => [{a:n,h:'13:40',t:'Viu que abriu a arena?'},{a:'Amina T.',h:'13:41',t:'Vi! Tô em 4º.',me:true},{a:n,h:'13:42',t:'Bora fazer um duelo de Equações depois?'}];
  const I = {
    msg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    espada:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 17.5L21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2"/></svg>',
    ajuda:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/></svg>',
    mais:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
  };
  const css = `
  .sx{position:absolute;inset:0;z-index:60;background:var(--bg);display:flex;flex-direction:column;padding-top:var(--topo)}
  .sx-topo{display:flex;align-items:center;gap:10px;padding:6px 8px 10px 14px;border-bottom:1px solid var(--line)}
  .sx-topo .rosto{width:40px;height:40px;border-radius:50%;object-fit:cover;background:var(--elev)}
  .sx-topo div{flex:1;min-width:0}.sx-topo strong{display:block;font-size:15px}.sx-topo span{font-size:12px;color:var(--text-subtle)}
  .sx-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
  .sx-m{display:flex;gap:8px;align-items:flex-end;max-width:88%}
  .sx-m img,.sx-m .ini{width:28px;height:28px;border-radius:50%;object-fit:cover;flex:none;background:var(--elev)}
  .sx-m.eu{align-self:flex-end;flex-direction:row-reverse}
  .sx-b{background:var(--surface);border:1px solid var(--line);border-radius:14px 14px 14px 4px;padding:9px 12px;font-size:14.5px;line-height:1.45}
  .sx-m.eu .sx-b{background:var(--accent);color:var(--bg);border:0;border-radius:14px 14px 4px 14px}
  .sx-b small{display:block;font-size:11px;opacity:.7;margin-bottom:2px;font-weight:700}
  .sx-share{border-radius:12px;border:1px solid var(--accent-soft);background:var(--accent-muted);padding:10px 12px;font-size:13.5px;display:flex;flex-direction:column;gap:6px;min-width:220px}
  .sx-share .k{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);display:flex;align-items:center;gap:6px}
  .sx-share .k svg{width:14px;height:14px}
  .sx-share .alts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .sx-share .alts button,.sx-share .acao{min-height:40px;border-radius:8px;border:1px solid var(--line);background:var(--bg-a55);font-weight:600;font-size:13.5px}
  .sx-share.trava{border-style:dashed;border-color:var(--border-strong);background:none;color:var(--text-subtle)}
  .sx-vazio{margin:auto;text-align:center;color:var(--text-subtle);font-size:14px}
  .sx-campo{display:flex;gap:8px;padding:8px 10px calc(var(--base) + 8px);border-top:1px solid var(--line);align-items:center}
  .sx-campo input{flex:1;height:48px;border-radius:24px;border:1px solid var(--line);background:var(--surface);color:var(--text);padding:0 16px;font-size:16px}
  .sx-campo .env{width:48px;height:48px;border-radius:50%;border:0;background:var(--accent);color:var(--bg);display:grid;place-items:center}
  .sx-campo .env svg,.sx-campo .redondo svg{width:18px;height:18px}
  .sx-folha{position:absolute;left:0;right:0;bottom:0;z-index:70;background:var(--surface);border-radius:20px 20px 0 0;border:1px solid var(--line);padding:0 16px calc(var(--base) + 16px);display:flex;flex-direction:column;gap:8px;box-shadow:0 -14px 40px rgba(0,0,0,.5)}
  .sx-folha h3{margin:0 0 4px;font-family:Georgia,serif;font-size:19px}
  .sx-folha .op{min-height:52px;display:flex;align-items:center;gap:10px;border-radius:10px;border:1px solid var(--line);background:var(--bg-a55);padding:0 14px;font-weight:600;font-size:15px;text-align:left}
  .sx-folha .op svg{width:18px;height:18px;color:var(--accent)}
  .sx-veu{position:absolute;inset:0;z-index:65;background:rgba(0,0,0,.45)}
  .sx-perfil{overflow-y:auto;padding-top:0}
  .sx-perfil > *{flex:none}
  .sx-banner{height:170px;background-size:cover;background-position:center;position:relative}
  .sx-banner::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,var(--bg-a55),transparent 40%,var(--bg))}
  .sx-fechar{position:absolute;top:calc(var(--topo) + 4px);right:10px;z-index:3}
  .sx-av{width:96px;height:96px;border-radius:50%;object-fit:cover;margin:-52px auto 0;display:grid;place-items:center;position:relative;z-index:2;box-shadow:0 0 0 3px var(--bg),0 0 0 5px var(--accent);background:var(--elev);font-size:30px;font-weight:800}
  .sx-nome{text-align:center;margin:10px 0 14px}
  .sx-nome h3{font-family:Georgia,serif;font-size:22px;margin:0}
  .sx-nome span{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--text-subtle);margin:2px 6px 0}
  .sx-nome i{width:8px;height:8px;border-radius:50%;background:#90949d}.sx-nome i.on{background:var(--success)}
  .sx-corpo{padding:0 18px 100px;display:flex;flex-direction:column;gap:6px}
  .sx-lbl{font-size:11.5px;font-weight:800;letter-spacing:.08em;color:var(--text-subtle);margin-top:12px;display:flex;justify-content:space-between}
  .sx-lbl em{font-style:normal;color:var(--accent)}
  .sx-val{font-size:14.5px;line-height:1.55;color:var(--text-muted)}
  .sx-guilda{display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:var(--surface);border:1px solid var(--line)}
  .sx-guilda img{width:40px;height:40px;object-fit:contain}
  .sx-badges{display:flex;flex-direction:column;gap:8px}
  .sx-badge{display:grid;grid-template-columns:44px 1fr auto;gap:2px 12px;align-items:center;padding:12px;border-radius:10px;background:var(--surface);border:1px solid var(--line)}
  .sx-badge img{width:44px;height:44px;object-fit:contain;grid-row:span 3}
  .sx-badge strong{font-size:14.5px}.sx-badge i{font-style:normal;font-size:12px;color:var(--accent)}.sx-badge p{margin:0;font-size:13px;color:var(--text-subtle);grid-column:2/4}
  .sx-badge b{grid-row:1;grid-column:3;font-size:12.5px;color:var(--accent)}
  .sx-pe{position:absolute;left:0;right:0;bottom:0;padding:10px 16px calc(var(--base) + 10px);background:linear-gradient(transparent,var(--bg) 30%)}
  .sx-erro{margin:auto;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;color:var(--text-muted);padding:24px}
  .sx-erro svg{width:36px;height:36px;color:var(--danger)}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  let S = null;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const pessoa = n => { const b = PESSOAS[n] || {}; return {n, p: b.p === undefined ? 'seeker' : b.p, on: !!b.on, ap: b.ap || n.toLowerCase().replace(/[^a-z]+/g, '.'), g: b.g || null, sobre: b.sobre || '', cq: b.cq || CQ_PADRAO}; };
  const ini = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const rosto = (p, n, cls) => p ? `<img class="${cls}" src="${ARTE}rosto-${p}.png" alt="" />` : `<span class="${cls}">${ini(n)}</span>`;
  const tela = () => document.querySelector('.tela');
  const raiz = () => { let r = document.getElementById('sx-raiz'); if (!r) { r = document.createElement('div'); r.id = 'sx-raiz'; } tela().appendChild(r); return r; };
  const agora = () => { const d = new Date(); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };

  function shareHTML(s) {
    if (s.k === 'desafio') return `<div class="sx-share"><span class="k">${I.espada}Desafio da guilda</span><b>${esc(s.t)}</b><button class="acao" data-sx-toast="A rodada abre aqui">Participar</button></div>`;
    if (s.k === 'bloqueada') return `<div class="sx-share trava"><span class="k" style="color:inherit">${ICONE.cadeado}Questão bloqueada</span>Você ainda não liberou este tópico na trilha.</div>`;
    const q = QUESTOES[s.q];
    return `<div class="sx-share"><span class="k">${I.ajuda}Questão</span><b>${esc(q.t)}</b>${q.alt ? `<div class="alts">${q.alt.map(a => `<button data-sx-toast="${a === '5' ? 'Resposta correta!' : 'Resposta incorreta.'}">${a}</button>`).join('')}</div>` : q.vf ? `<div class="alts"><button data-sx-toast="Resposta correta!">Verdadeiro</button><button data-sx-toast="Resposta incorreta.">Falso</button></div>` : `<button class="acao" data-sx-toast="Abre o campo para responder">Responder</button>`}</div>`;
  }
  function msgHTML(m) {
    const p = PESSOAS[m.a]?.p ?? m.p ?? 'conqueror';
    const corpo = m.share ? shareHTML(m.share) : `<div class="sx-b">${m.me ? '' : `<small>${esc(m.a)} · ${m.h}</small>`}${esc(m.t)}</div>`;
    return `<div class="sx-m ${m.me ? 'eu' : ''}">${m.me ? '' : rosto(p, m.a, 'ini')}${corpo}</div>`;
  }
  function chatHTML() {
    const g = S.tipo === 'guilda';
    const topo = g ? `<img class="rosto" src="${ARTE}emblem-conqueror.png" alt="" style="border-radius:0;object-fit:contain" /><div><strong>Legião Azul</strong><span>Chat da guilda · 8 pessoas</span></div>`
      : `${rosto(S.pes.p, S.pes.n, 'rosto')}<div><strong>${esc(S.pes.n)}</strong><span>${S.pes.on ? 'online' : 'offline'}</span></div>`;
    const msgs = S.msgs.length ? S.msgs.map(msgHTML).join('') : '<div class="sx-vazio">Ainda não há mensagens. Comece a conversa!</div>';
    return `<section class="sx" role="dialog" aria-modal="true" aria-label="${g ? 'Chat da guilda' : 'Conversa com ' + esc(S.pes.n)}">
      <div class="sx-topo">${topo}${g ? '' : `<button class="redondo" data-sx-perfil="${esc(S.pes.n)}" aria-label="Ver perfil">${ICONE.chev}</button>`}<button class="redondo" data-sx-fechar aria-label="Fechar">${ICONE.x}</button></div>
      <div class="sx-msgs" id="sx-msgs">${msgs}</div>
      <form class="sx-campo" id="sx-form">${g ? `<button type="button" class="redondo" data-sx-compartilhar aria-label="Compartilhar desafio ou questão">${I.mais}</button>` : ''}<input id="sx-in" placeholder="Mensagem" aria-label="Mensagem" autocomplete="off" /><button class="env" aria-label="Enviar">${ICONE.enviar}</button></form>
      ${S.compartilhar ? `<div class="sx-veu" data-sx-fecha-folha></div><div class="sx-folha" role="dialog" aria-label="Compartilhar"><span class="alca" data-sx-fecha-folha></span><h3>Compartilhar na guilda</h3>
        <button class="op" data-sx-share="desafio">${I.espada}Desafio · Todos, 3 questões de Equações</button><button class="op" data-sx-share="questao">${I.ajuda}Questão · Se 3x + 7 = 22, quanto vale x?</button></div>` : ''}
    </section>`;
  }
  function perfilHTML() {
    const x = S.pes, fechar = `<button class="redondo sx-fechar" data-sx-fechar aria-label="Fechar perfil">${ICONE.x}</button>`;
    if (S.estado === 'erro') return `<section class="sx" role="dialog" aria-modal="true">${fechar}<div class="sx-erro">${ICONE.alerta}<p>Não foi possível carregar este perfil.</p><button class="btn btn-secundario" data-sx-retry>Tentar novamente</button></div></section>`;
    const cq = S.estado === 'sem-conquistas' ? [] : x.cq, pts = cq.reduce((s, c) => s + c[4], 0), G = x.g && GUILDAS[x.g];
    return `<section class="sx sx-perfil" role="dialog" aria-modal="true" aria-label="Perfil de ${esc(x.n)}">${fechar}
      <div class="sx-banner" style="background-image:${x.p ? `url(${ARTE}world-${x.p}.webp)` : 'none'}"></div>
      ${rosto(x.p, x.n, 'sx-av')}
      <div class="sx-nome"><h3>${esc(x.n.toUpperCase())}</h3><span>@${esc(x.ap)}</span><span><i class="${x.on ? 'on' : ''}"></i>${x.on ? 'online' : 'offline'}</span></div>
      <div class="sx-corpo">
        ${G ? `<div class="sx-guilda"><img src="${ARTE}emblem-${G[0]}.png" alt="" /><div><div class="sx-lbl" style="margin:0">GUILDA</div><div class="sx-val">${esc(x.g)} · ${G[1]} pessoas</div></div></div>` : ''}
        <div class="sx-lbl">DADOS</div><div class="sx-val">${x.p ? NOME_PERFIL[x.p] : 'Perfil não definido'}</div>
        ${x.p ? `<div class="sx-lbl">SOBRE O PERFIL</div><div class="sx-val">${SOBRE_PERFIL[x.p]}</div>` : ''}
        ${x.sobre ? `<div class="sx-lbl">SOBRE</div><div class="sx-val">${esc(x.sobre)}</div>` : ''}
        <div class="sx-lbl">CONQUISTAS<em>${pts} pts</em></div>
        ${cq.length ? `<div class="sx-badges">${cq.map(([o, n, c, d, p]) => `<div class="sx-badge"><img src="${ARTE}object-${o}.png" alt="" /><strong>${n}</strong><b>+${p} pts</b><i>${c}</i><p>${d}</p></div>`).join('')}</div>` : '<div class="sx-val">Nenhuma conquista pública ainda.</div>'}
      </div>
      <div class="sx-pe"><button class="btn btn-primario btn-bloco" data-sx-pm="${esc(x.n)}">${I.msg}Conversar em privado</button></div></section>`;
  }
  function render() {
    const r = raiz();
    if (!S) { r.innerHTML = ''; return; }
    r.innerHTML = S.tipo === 'perfil' ? perfilHTML() : chatHTML();
    const box = document.getElementById('sx-msgs'); if (box) box.scrollTop = box.scrollHeight;
  }
  function aviso(t) { const r = raiz(); r.insertAdjacentHTML('beforeend', `<div class="torrada" role="status" style="z-index:90">${t}</div>`); setTimeout(() => r.querySelector('.torrada')?.remove(), 1600); }
  window.Social = {
    guilda(o = {}) { S = {tipo: 'guilda', msgs: o.vazio ? [] : BASE_GUILDA.map(m => ({...m}))}; render(); },
    privado(n) { S = {tipo: 'privado', pes: pessoa(n), msgs: BASE_PRIVADO(n)}; render(); },
    perfil(n, o = {}) { S = {tipo: 'perfil', pes: pessoa(n), estado: o.estado}; render(); },
    fechar() { S = null; render(); },
    // a tela que redesenha o .tela inteiro chama isto no fim, para a conversa aberta não sumir
    redesenha() { if (S) render(); },
    pessoa,
  };
  document.addEventListener('click', e => {
    const q = s => e.target.closest(s);
    if (!q('#sx-raiz')) return;
    if (q('[data-sx-fechar]')) { Social.fechar(); return; }
    if (q('[data-sx-pm]')) { Social.privado(q('[data-sx-pm]').dataset.sxPm); return; }
    if (q('[data-sx-perfil]')) { Social.perfil(q('[data-sx-perfil]').dataset.sxPerfil); return; }
    if (q('[data-sx-retry]')) { S.estado = null; render(); return; }
    if (q('[data-sx-compartilhar]')) { S.compartilhar = true; render(); return; }
    if (q('[data-sx-fecha-folha]')) { S.compartilhar = false; render(); return; }
    if (q('[data-sx-share]')) { const k = q('[data-sx-share]').dataset.sxShare; S.msgs.push({a: 'Amina T.', me: true, h: agora(), share: k === 'desafio' ? {k, t: 'Todos · 3 questões de Equações'} : {k, q: 0}}); S.compartilhar = false; render(); return; }
    if (q('[data-sx-toast]')) { aviso(q('[data-sx-toast]').dataset.sxToast); return; }
  });
  document.addEventListener('submit', e => { if (e.target.id !== 'sx-form') return; e.preventDefault(); const t = document.getElementById('sx-in').value.trim(); if (!t) return; S.msgs.push({a: 'Amina T.', me: true, h: agora(), t}); render(); });
})();
