/* Celebrações (revisão 04 #2): conquista desbloqueada e cerimônia de desbloqueio de funcionalidade.
   Textos de mobile/src/utils/portoes.ts e comportamento de ConquistaModal/DesbloqueioModal.
   Uso: Celebrar.conquista({titulo, descricao, data, categoria, img}) · Celebrar.portao('social'|'rank', bloqueado) */
(function(){
  const PORTOES={
    social:{titulo:'Amizades liberadas',promessa:'Agora você pode se conectar com colegas da turma e acompanhar o avanço de quem você escolher.',comoAbrir:'Conclua seu primeiro conteúdo para liberar.',
      passos:['Envie um convite para um colega da turma.','A amizade só existe quando os dois aceitam.','Você pode desfazer ou bloquear quando quiser.'],
      icone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19.5 8.5c.8-.8 2.2-.8 3 0s.8 2.2 0 3L20 14l-2.5-2.5c-.8-.8-.8-2.2 0-3s2.2-.8 3 0"/></svg>'},
    rank:{titulo:'Ranking liberado',promessa:'Sua posição na turma já estava sendo contada desde o começo. Agora ela aparece — e você chega nela com os pontos que já fez.',comoAbrir:'Conclua o primeiro bloco de conteúdo para liberar.',
      passos:['A aba Ranking mostra as primeiras posições da turma.','Sua posição aparece sempre, mesmo fora do topo.','Estudar é o que move o ranking — presença e atividades contam.'],
      icone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 21V11H3v10M15 21V5H9v16M21 21v-7h-5v7M2 21h20"/></svg>'},
  };
  const LOCK='<svg class="cel-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path class="shackle" d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const css=`
  .cel-bg{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.7);display:grid;place-items:center;animation:celFade .2s ease-out}
  .cel{width:420px;max-width:calc(100vw - 32px);text-align:center;padding:28px 28px 22px;border-radius:22px;background:var(--surface,#121e3f);border:1px solid var(--cel-c);box-shadow:0 0 60px color-mix(in srgb,var(--cel-c) 35%,transparent),0 24px 60px rgba(0,0,0,.5);color:var(--text,#f3f4f7);animation:celPop .45s cubic-bezier(.2,1.3,.4,1)}
  .cel-eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--cel-c);font-weight:700;margin:0 0 4px}
  .cel h2{font-family:Georgia,serif;font-size:26px;margin:4px 0 8px;color:var(--cel-c)}
  .cel p{margin:0;font-size:14px;line-height:1.55;color:var(--text-muted,rgba(243,244,247,.82))}
  .cel-art{position:relative;width:170px;height:150px;margin:0 auto 8px;display:grid;place-items:center}
  .cel-art::before{content:"";position:absolute;inset:-10px;border-radius:50%;background:repeating-conic-gradient(from 0deg,color-mix(in srgb,var(--cel-c) 30%,transparent) 0deg 8deg,transparent 8deg 22deg);mask:radial-gradient(circle,#000 30%,transparent 70%);animation:celSpin 14s linear infinite}
  .cel-art img{position:relative;width:120px;height:120px;object-fit:contain;filter:drop-shadow(0 0 18px var(--cel-c))}
  .cel-chip{display:inline-block;padding:4px 11px;border-radius:100px;font-size:11.5px;font-weight:700;background:color-mix(in srgb,var(--cel-c) 18%,transparent);color:var(--cel-c);margin-bottom:8px}
  .cel-date{font-size:12.5px!important;color:var(--text-subtle,rgba(243,244,247,.62))!important;margin-top:10px!important}
  .cel-btn{margin-top:20px;min-width:160px;padding:11px 22px;border-radius:100px;border:0;background:var(--cel-c);color:#0b1328;font:inherit;font-weight:700;cursor:pointer}
  .cel-icons{position:relative;width:110px;height:110px;margin:0 auto 10px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--cel-c) 14%,transparent);border:1px solid color-mix(in srgb,var(--cel-c) 40%,transparent)}
  .cel-icons svg{position:absolute;inset:0;margin:auto;width:56px;height:56px;color:var(--cel-c)}
  .cel-feat{position:absolute;inset:0}
  .cel-lock .shackle{transform-origin:16px 11px}
  .cel.abrindo .cel-lock{animation:celLockOut .5s .9s forwards}
  .cel.abrindo .cel-lock .shackle{animation:celOpen .4s .45s forwards}
  .cel-feat{opacity:0;transform:scale(.6);transform-origin:center}
  .cel.abrindo .cel-feat{animation:celIn .5s 1.25s forwards}
  .cel.abrindo .cel-icons{animation:celPulse 1.2s 1.6s ease-out}
  .cel-steps{list-style:none;margin:14px 0 0;padding:12px 14px;border-radius:14px;background:rgba(0,0,0,.2);text-align:left;font-size:13px}
  .cel-steps li{display:flex;gap:8px;padding:4px 0;color:var(--text-muted,rgba(243,244,247,.82))}
  .cel-steps li::before{content:"";flex:none;width:6px;height:6px;margin-top:7px;border-radius:50%;background:var(--cel-c)}
  @keyframes celFade{from{opacity:0}}
  @keyframes celPop{from{opacity:0;transform:scale(.85) translateY(10px)}}
  @keyframes celSpin{to{transform:rotate(360deg)}}
  @keyframes celOpen{to{transform:translateY(-3px) rotate(-28deg)}}
  @keyframes celLockOut{to{opacity:0;transform:scale(.5)}}
  @keyframes celIn{to{opacity:1;transform:scale(1)}}
  @keyframes celPulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--cel-c) 50%,transparent)}100%{box-shadow:0 0 0 26px transparent}}
  @media (prefers-reduced-motion:reduce){.cel,.cel-bg,.cel-art::before{animation:none!important}.cel.abrindo .cel-lock{display:none}.cel-feat{opacity:1;transform:none;animation:none!important}}`;
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
  function cor(){ // o dourado/destaque sai do accent do perfil (como lighten no app), nunca de branco
    return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#6f90eb';
  }
  function abrir(html,cls){
    fechar();
    const bg=document.createElement('div'); bg.className='cel-bg'; bg.id='celBg';
    bg.innerHTML=`<div class="cel ${cls||''}" role="dialog" aria-modal="true" aria-labelledby="celT" style="--cel-c:${cor()}">${html}</div>`;
    bg.addEventListener('click',e=>{if(e.target===bg||e.target.closest('[data-cel-close]'))fechar()});
    document.body.appendChild(bg); const b=bg.querySelector('.cel-btn'); b&&b.focus();
  }
  function fechar(){const b=document.getElementById('celBg'); b&&b.remove()}
  document.addEventListener('keydown',e=>{if(e.key==='Escape')fechar()});
  window.Celebrar={
    conquista({titulo,descricao,data,categoria,img}){
      abrir(`<div class="cel-art"><img src="${img}" alt="" /></div>
        ${categoria?`<span class="cel-chip">${categoria}</span>`:''}
        <p class="cel-eyebrow">Conquista desbloqueada</p>
        <h2 id="celT">${titulo}</h2><p>${descricao}</p>${data?`<p class="cel-date">Conquistada em ${data}</p>`:''}
        <button class="cel-btn" data-cel-close>Fechar</button>`);
    },
    portao(f,bloqueado){
      const P=PORTOES[f];
      abrir(`<div class="cel-icons">${LOCK}${bloqueado?'':`<span class="cel-feat">${P.icone}</span>`}</div>
        <h2 id="celT">${bloqueado?P.titulo.replace(' liberadas','').replace(' liberado','')+' indisponível':P.titulo}</h2>
        <p>${bloqueado?P.comoAbrir:P.promessa}</p>
        ${bloqueado?'':`<ul class="cel-steps">${P.passos.map(x=>`<li>${x}</li>`).join('')}</ul>`}
        <button class="cel-btn" data-cel-close>${bloqueado?'Fechar':'Entendi'}</button>`, bloqueado?'':'abrindo');
    },
    fechar,
  };
})();
