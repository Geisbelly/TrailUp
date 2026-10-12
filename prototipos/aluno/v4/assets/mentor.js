/* Mentor no Tópico (revisão 04 #3) — textos de mobile/src/components/ia/IAMentorPanel.tsx (escopo "modulo").
   As respostas são simuladas no protótipo, sempre dentro dos limites do app (não entrega respostas). */
(function(){
  const G={nome:'Amina',perfil:'Conqueror',rosto:'assets/rosto-conqueror.png'};
  const ABERTURA='Estou acompanhando este módulo como uma conversa. Posso comentar a personalização, explicar os elementos da tela e sugerir estratégia de estudo sem entregar respostas das atividades.';
  const DICAS=[
    ['Conversa','Neste módulo eu apareço como guia em formato de conversa. Você pode me responder para pedir explicações sobre a personalização, o fluxo do módulo e a melhor estratégia de estudo.'],
    ['Progresso','A barra horizontal mostra quanto do módulo já foi concluído. O contador ao lado indica quantas etapas já foram finalizadas dentro da sequência atual.'],
    ['Boss','O boss representa o desafio do módulo. Conforme você avança no conteúdo e acerta atividades, causa dano nele. Se o inimigo já tiver sido derrotado, o resumo do confronto continua disponível.'],
    ['Limites','Eu posso orientar, resumir métricas e explicar a personalização, mas não entrego respostas de atividades. Quando você pedir ajuda, eu respondo dentro desses limites.'],
  ];
  const SUG=['Por que este módulo veio em desafios curtos?','Como eu derroto o boss?','Qual é a resposta da atividade?'];
  const ERRO='Estou aqui para conversar com você sobre personalização, métricas e estratégia de estudo, mas falhei ao responder agora.';
  function responder(t){
    const s=t.toLowerCase();
    if(/respost|gabarito|qual (é|e) o x|valor de x|resolve/.test(s))return 'Não posso entregar a resposta, mas posso te ajudar a chegar nela: isole o x passando o 7 para o outro lado. O que sobra de 3x?';
    if(/boss|inimigo|dano|derrot/.test(s)){const hp=document.querySelector('.b-bar:last-of-type .h span:last-child');return DICAS[2][1]+(hp?` Agora ele está com ${hp.textContent.split('/')[0].trim()} de HP: concluir a atividade tira 24.`:'')}
    if(/personaliz|desafio|curto|por que|formato/.test(s))return 'Reorganizei Equações em desafios curtos antes da leitura, porque você rende mais quando começa praticando.';
    if(/progress|barra|etapa/.test(s))return DICAS[1][1];
    return ERRO;
  }
  const css=`
  .m-fab{position:fixed;right:28px;bottom:96px;z-index:45;width:64px;height:64px;border-radius:50%;border:2px solid var(--accent);padding:0;background:var(--surface);cursor:pointer;box-shadow:0 10px 26px rgba(0,0,0,.45),0 0 0 4px var(--accent-soft)}
  .m-fab img{width:100%;height:100%;border-radius:50%;object-fit:cover}
  .m-fab .ping{position:absolute;top:2px;right:2px;width:13px;height:13px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 2px var(--bg)}
  .m-fab.muted{filter:grayscale(1) brightness(.6);box-shadow:none}
  .m-fab.muted::after{content:"";position:absolute;left:8px;right:8px;top:50%;height:3px;border-radius:2px;background:var(--text-muted);transform:rotate(-35deg)}
  .m-panel{position:fixed;right:28px;bottom:172px;z-index:46;width:400px;max-height:min(560px,calc(100vh - 200px));display:flex;flex-direction:column;border-radius:20px;background:var(--surface);border:1px solid var(--border-strong);box-shadow:0 24px 60px rgba(0,0,0,.55);overflow:hidden}
  .m-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border);border-top:3px solid var(--accent)}
  .m-head img{width:40px;height:40px;border-radius:50%;object-fit:cover}
  .m-head div{flex:1}
  .m-head strong{display:block;font-size:14px}
  .m-head span{font-size:12px;color:var(--text-subtle)}
  .m-mute{background:none;border:1px solid var(--border-strong);border-radius:100px;color:var(--text-muted);font:inherit;font-size:11.5px;padding:5px 10px;cursor:pointer}
  .m-x{background:none;border:0;color:var(--text-muted);font-size:20px;cursor:pointer;padding:0 4px}
  .m-body{flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
  .m-msg{max-width:88%;padding:10px 12px;border-radius:14px;font-size:13.5px;line-height:1.5}
  .m-msg.g{align-self:flex-start;background:var(--elevated);border-top-left-radius:4px}
  .m-msg.u{align-self:flex-end;background:var(--accent);color:#0b1328;border-top-right-radius:4px}
  .m-msg.g b{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-bottom:3px}
  .m-tips,.m-sug{display:flex;flex-wrap:wrap;gap:6px}
  .m-tips button,.m-sug button{border:1px solid var(--border-strong);background:none;color:var(--text);border-radius:100px;padding:5px 11px;font:inherit;font-size:12px;cursor:pointer}
  .m-sug button{border-style:dashed;color:var(--text-muted)}
  .m-input{display:flex;gap:8px;padding:12px;border-top:1px solid var(--border)}
  .m-input input{flex:1;height:40px;border-radius:100px;border:1px solid var(--border);background:var(--bg);color:var(--text);padding:0 14px;font:inherit;font-size:13px}
  .m-input button{width:40px;height:40px;border-radius:50%;border:0;background:var(--accent);color:#0b1328;cursor:pointer;display:grid;place-items:center}
  .m-input svg{width:16px;height:16px}
  .m-note{font-size:11.5px;color:var(--text-subtle);padding:0 16px 10px}`;
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
  let aberto=false, mudo=false, msgs=[['g',ABERTURA]];
  const root=document.createElement('div'); document.body.appendChild(root);
  const esc=x=>x.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function render(){
    root.innerHTML=`<button class="m-fab ${mudo?'muted':''}" data-m-toggle aria-label="${mudo?'Reativar guia':`Abrir ${G.nome}, guia do perfil`}" title="${mudo?'Reativar guia':'Abrir guia'}"><img src="${G.rosto}" alt="" />${!mudo&&!aberto?'<span class="ping"></span>':''}</button>
    ${aberto&&!mudo?`<section class="m-panel" role="dialog" aria-label="Conversa com ${G.nome}">
      <div class="m-head"><img src="${G.rosto}" alt="" /><div><strong>${G.nome}</strong><span>guia do perfil ${G.perfil}</span></div><button class="m-mute" data-m-mute>Silenciar guia</button><button class="m-x" data-m-close aria-label="Fechar">×</button></div>
      <div class="m-body" id="mBody">${msgs.map(([q,t,lb])=>`<div class="m-msg ${q}">${lb?`<b>${lb}</b>`:''}${esc(t)}</div>`).join('')}
        <div class="m-tips" aria-label="Dicas do guia">${DICAS.filter(d=>d[0]!=='Boss'||document.querySelector('.battle')).map(([l],i)=>`<button data-m-tip="${l}">${l}</button>`).join('')}</div>
        <div class="m-sug">${SUG.map(s=>`<button data-m-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>
      <form class="m-input" id="mForm"><input id="mIn" placeholder="Responda ao guia ou pergunte sobre este módulo" aria-label="Mensagem para o guia" /><button aria-label="Enviar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg></button></form>
      <p class="m-note">Eu oriento e explico a personalização, mas não entrego respostas de atividades.</p>
    </section>`:''}`;
    const b=document.getElementById('mBody'); if(b)b.scrollTop=b.scrollHeight;
    const f=document.getElementById('mForm'); if(f)f.onsubmit=e=>{e.preventDefault();const v=document.getElementById('mIn').value.trim();if(v)perguntar(v)};
  }
  function perguntar(t){msgs.push(['u',t]);msgs.push(['g',responder(t)]);render();const i=document.getElementById('mIn');i&&i.focus()}
  document.addEventListener('click',e=>{
    const q=x=>e.target.closest(x);
    if(q('[data-m-toggle]')){if(mudo){mudo=false;aberto=true}else aberto=!aberto;render();return}
    if(q('[data-m-close]')){aberto=false;render();return}
    if(q('[data-m-mute]')){mudo=true;aberto=false;render();return}
    if(q('[data-m-tip]')){const l=q('[data-m-tip]').dataset.mTip;msgs.push(['g',DICAS.find(d=>d[0]===l)[1],l]);render();return}
    if(q('[data-m-sug]')){perguntar(q('[data-m-sug]').dataset.mSug);return}
  });
  window.Mentor={abrir(){mudo=false;aberto=true;render()},silenciar(){mudo=true;aberto=false;render()},reset(){aberto=false;mudo=false;msgs=[['g',ABERTURA]];render()}};
  render();
})();
