/* Bag (revisão 04 #4) — uma Bag só, aberta de qualquer tela. Textos de mobile/src/components/bag/*
   e do desenho docs/superpowers/specs/2026-09-13-bag-itens-pessoais-design.md.
   Uso: Bag.abrir({estado:'vazia'|'erro'}) · Bag.novo({topico, conteudo}) */
(function(){
  const ICON={
    x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
    share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    del:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    flip:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  };
  const BASE=[
    {id:1,origem:'aluno',tipo:'resumo',titulo:'Isolar o x',conteudo:'O que faço de um lado, faço do outro. Primeiro tiro o número sozinho, depois divido.',topico:'Equações do 1º grau',data:'Hoje'},
    {id:2,origem:'aluno',tipo:'anotacao',titulo:'Dúvida para a professora',conteudo:'Por que 1/2 + 1/3 não é 2/5?',topico:'Frações',data:'Segunda'},
    {id:3,origem:'aluno',tipo:'card',titulo:'Termo independente',frente:'O que é o termo independente?',verso:'O número que não acompanha a incógnita.',topico:'Expressões algébricas',data:'Sexta passada'},
    {id:4,origem:'plataforma',tipo:'card',titulo:'3x + 7 = 22',frente:'Qual é o primeiro passo?',verso:'Tirar 7 dos dois lados.',topico:'Equações do 1º grau',data:'Ontem'},
    {id:5,origem:'plataforma',tipo:'resumo',titulo:'Mapa mental de Equações',conteudo:'Equação, incógnita, operação inversa e verificação.',topico:'Equações do 1º grau',data:'Ontem'},
    {id:6,origem:'loja',efeito:'TROCA DE FORMATO',titulo:'Trocar formato',estado:'DISPONÍVEL',img:'book',data:'Comprado ontem'},
    {id:7,origem:'loja',efeito:'DICA',titulo:'Dica',estado:'CONSUMIDO',img:'hint',data:'Sexta passada'},
  ];
  const TIPO={resumo:'RESUMO',anotacao:'ANOTAÇÃO',card:'CARD'};
  const ORIG={aluno:'MEU ITEM',plataforma:'GERADO',loja:'LOJA'};
  const ABAS=[['todos','Todos'],['salvos','Salvos'],['gerados','Gerados'],['comprados','Comprados']];
  const FILTROS=[['resumo','Resumos'],['anotacao','Anotações'],['card','Cards']];
  let itens=BASE.map(i=>({...i})), aba='todos', filtro=null, busca='', virados=new Set(), estado='normal', aviso=null, editor=null, apagar=null, nextId=100;
  const perfil=()=>{const s=document.querySelector('.console-account-copy span');return (s&&s.textContent.trim().toLowerCase())||'conqueror'};
  const esc=x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const css=`
  .bag-bg,.bag-ed-bg{--bag-elev:var(--elevated,var(--elev,#192a57));--bag-muted:var(--text-muted,rgba(243,244,247,.82));--bag-subtle:var(--text-subtle,rgba(243,244,247,.62))}
  .bag-bg{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.65);display:grid;place-items:center}
  .bag{width:min(960px,calc(100vw - 48px));height:min(640px,calc(100vh - 48px));display:flex;flex-direction:column;border-radius:22px;background:var(--surface);border:1px solid var(--border-strong);box-shadow:0 30px 80px rgba(0,0,0,.6);color:var(--text);overflow:hidden}
  .bag-h{display:flex;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid var(--border)}
  .bag-h img.ico{width:44px;height:44px;object-fit:contain}
  .bag-h .t{flex:none}
  .bag-h .t small{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700}
  .bag-h .t h2{font-family:Georgia,serif;font-size:24px;margin:2px 0 0}
  .bag-search{flex:1;display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border-radius:100px;border:1px solid var(--border);background:var(--bg)}
  .bag-search svg{width:16px;height:16px;color:var(--bag-subtle)}
  .bag-search input{flex:1;background:none;border:0;outline:none;color:var(--text);font:inherit;font-size:13.5px}
  .bag-btn{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 16px;border-radius:100px;border:0;background:var(--accent);color:#0b1328;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
  .bag-btn svg{width:15px;height:15px}
  .bag-btn.sec{background:none;border:1px solid var(--border-strong);color:var(--text)}
  .bag-btn.danger{background:#dc2626;color:#fff}
  .bag-x{width:36px;height:36px;border-radius:50%;border:0;background:var(--bag-elev);color:var(--bag-muted);display:grid;place-items:center;cursor:pointer}
  .bag-x svg{width:16px;height:16px}
  .bag-f{display:flex;align-items:center;gap:8px;padding:12px 22px;flex-wrap:wrap}
  .bag-tab{padding:7px 14px;border-radius:100px;border:1px solid var(--border-strong);background:none;color:var(--bag-muted);font:inherit;font-size:12.5px;cursor:pointer}
  .bag-tab b{margin-left:6px;font-size:11px;opacity:.8}
  .bag-tab[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#0b1328;font-weight:700}
  .bag-sep{width:1px;height:22px;background:var(--border);margin:0 4px}
  .bag-chip{padding:5px 11px;border-radius:100px;border:1px dashed var(--border-strong);background:none;color:var(--bag-muted);font:inherit;font-size:12px;cursor:pointer}
  .bag-chip[aria-pressed="true"]{border-style:solid;border-color:var(--accent);color:var(--accent);background:var(--accent-soft,rgba(111,144,235,.15))}
  .bag-body{flex:1;overflow:auto;padding:4px 22px 22px}
  .bag-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  /* fundo dos cards como na v3 (bag-card da Trilha): sólido no tom elevado, sem borda; cabeçalho, selos e ícones da v4 */
  .bi{display:flex;flex-direction:column;gap:8px;min-height:170px;padding:16px;border-radius:16px;background:var(--bag-elev);border:1px solid transparent;text-align:left;color:inherit}
  .bi.flip{cursor:pointer}
  .bi.flip:hover{border-color:var(--border-strong)}
  .bi-tags{display:flex;gap:6px;align-items:center}
  .bi-tag{font-size:10px;font-weight:800;letter-spacing:.06em;padding:3px 8px;border-radius:100px;background:var(--surface);color:var(--bag-muted)}
  .bi-tag.o-aluno{background:var(--accent-soft,rgba(111,144,235,.18));color:var(--accent)}
  .bi-tag.o-plataforma{background:rgba(63,191,107,.15);color:#7fe0a3}
  .bi-tag.o-loja{background:rgba(218,180,63,.16);color:#e8c766}
  .bi h4{margin:2px 0 0;font-size:15px}
  .bi p{margin:0;font-size:13px;line-height:1.5;color:var(--bag-muted);flex:1}
  .bi .face{flex:1;display:flex;flex-direction:column;justify-content:center;gap:4px;padding:10px 12px;border-radius:12px;background:var(--surface);border:1px dashed var(--border-strong)}
  .bi .face small{font-size:10px;font-weight:800;letter-spacing:.08em;color:var(--accent)}
  .bi .face span{font-size:13.5px}
  .bi .hint{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--bag-subtle)}
  .bi .hint svg{width:12px;height:12px}
  .bi-foot{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--bag-subtle)}
  .bi-foot .tp{margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bi-act{width:28px;height:28px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--bag-muted);display:grid;place-items:center;cursor:pointer}
  .bi-act svg{width:13px;height:13px}
  .bi-act.del{color:#fca5a5}
  .bi.loja{flex-direction:row;align-items:center;min-height:0}
  .bi.loja img{width:54px;height:60px;object-fit:contain}
  .bi.loja .info{flex:1;display:flex;flex-direction:column;gap:4px}
  .bi.loja.usado{opacity:.6}
  .bi-st{font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:100px;background:rgba(63,191,107,.15);color:#7fe0a3;align-self:flex-start}
  .bi-st.c{background:var(--surface);color:var(--bag-subtle)}
  .bag-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;min-height:300px;color:var(--bag-subtle)}
  .bag-empty img{width:70px;height:70px;object-fit:contain;opacity:.6}
  .bag-empty h3{margin:6px 0 0;color:var(--text)}
  .bag-toast{margin:0 22px 10px;padding:10px 14px;border-radius:12px;border:1px solid var(--accent);background:var(--accent-soft,rgba(111,144,235,.15));font-size:13px;font-weight:600}
  .bag-ed-bg{position:fixed;inset:0;z-index:85;background:rgba(0,0,0,.55);display:grid;place-items:center}
  .bag-ed{width:min(520px,calc(100vw - 32px));border-radius:20px;background:var(--surface);border:1px solid var(--border-strong);padding:20px 22px;color:var(--text);box-shadow:0 24px 60px rgba(0,0,0,.55)}
  .bag-ed small.k{display:block;font-size:11px;letter-spacing:.1em;font-weight:700;color:var(--bag-subtle);margin:14px 0 6px}
  .bag-ed h3{font-family:Georgia,serif;font-size:21px;margin:2px 0 0}
  .bag-ed .ctx{margin-top:8px;font-size:12.5px;color:var(--bag-muted);padding:8px 12px;border-radius:10px;background:var(--bag-elev)}
  .bag-seg{display:flex;gap:6px}
  .bag-seg button{flex:1;height:38px;border-radius:10px;border:1px solid var(--border);background:none;color:var(--bag-muted);font:inherit;font-size:13px;cursor:pointer}
  .bag-seg button[aria-pressed="true"]{border-color:var(--accent);color:var(--text);background:var(--accent-soft,rgba(111,144,235,.15));font-weight:700}
  .bag-ed input,.bag-ed textarea{width:100%;box-sizing:border-box;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);padding:10px 12px;font:inherit;font-size:13.5px}
  .bag-ed textarea{min-height:96px;resize:vertical}
  .bag-ed .acts{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}`;
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
  const root=document.createElement('div'); document.body.appendChild(root);
  let aberta=false;

  function visiveis(){
    const q=busca.trim().toLowerCase();
    return itens.filter(i=>{
      if(aba==='salvos'&&i.origem!=='aluno')return false;
      if(aba==='gerados'&&i.origem!=='plataforma')return false;
      if(aba==='comprados'&&i.origem!=='loja')return false;
      if(filtro&&i.tipo!==filtro)return false;
      if(q&&![i.titulo,i.conteudo,i.frente,i.verso,i.topico].join(' ').toLowerCase().includes(q))return false;
      return true;
    });
  }
  function card(i){
    if(i.origem==='loja')return `<article class="bi loja ${i.estado==='CONSUMIDO'?'usado':''}"><img src="assets/${i.img}-${perfil()}.png" alt="" />
      <div class="info"><div class="bi-tags"><span class="bi-tag o-loja">ITEM DA LOJA</span><span class="bi-tag">${i.efeito}</span></div><h4>${esc(i.titulo)}</h4>
      <span class="bi-st ${i.estado==='CONSUMIDO'?'c':''}">${i.estado}</span><div class="bi-foot"><span class="tp">${i.data}</span></div></div></article>`;
    const meu=i.origem==='aluno', isCard=i.tipo==='card', v=virados.has(i.id);
    const corpo=isCard?`<div class="face"><small>${v?'VERSO':'FRENTE'}</small><span>${esc(v?i.verso:i.frente)}</span></div><span class="hint">${ICON.flip}Clique para virar</span>`:`<p>${esc(i.conteudo)}</p>`;
    return `<article class="bi ${isCard?'flip':''}" ${isCard?`data-bag-flip="${i.id}" tabindex="0" role="button" aria-label="Virar card ${esc(i.titulo)}"`:''}>
      <div class="bi-tags"><span class="bi-tag o-${i.origem}">${ORIG[i.origem]}</span><span class="bi-tag">${TIPO[i.tipo]}</span></div>
      <h4>${esc(i.titulo)}</h4>${corpo}
      <div class="bi-foot"><span class="tp">${esc(i.topico)} · ${i.data}</span>${meu?`<button class="bi-act" title="Compartilhar" aria-label="Compartilhar item da Bag" data-bag-share="${i.id}">${ICON.share}</button><button class="bi-act" title="Editar" aria-label="Editar item da Bag" data-bag-edit="${i.id}">${ICON.edit}</button><button class="bi-act del" title="Excluir" aria-label="Excluir item da Bag" data-bag-del="${i.id}">${ICON.del}</button>`:''}</div>
    </article>`;
  }
  function vazio(){
    const t={todos:['Sua Bag está vazia','Os itens salvos e comprados aparecerão aqui.'],salvos:['Sua Bag está vazia','Os itens salvos e comprados aparecerão aqui.'],gerados:['Nenhum material gerado','Os materiais personalizados aparecerão aqui.'],comprados:['Nenhuma compra encontrada','Os itens comprados na loja aparecerão aqui.']}[aba];
    return `<div class="bag-empty"><img src="assets/bag-${perfil()}.png" alt="" /><h3>${busca?'Nada encontrado':t[0]}</h3><p>${busca?'Tente outra palavra.':t[1]}</p>${!busca&&aba!=='gerados'&&aba!=='comprados'?'<button class="bag-btn" data-bag-new>'+ICON.plus+'Novo item</button>':''}</div>`;
  }
  function render(){
    if(!aberta){root.innerHTML='';return}
    const cont=k=>itens.filter(i=>k==='todos'||(k==='salvos'?i.origem==='aluno':k==='gerados'?i.origem==='plataforma':i.origem==='loja')).length;
    let body;
    if(estado==='erro')body=`<div class="bag-empty"><h3>Não foi possível carregar</h3><p>Não foi possível carregar a Bag.</p><button class="bag-btn sec" data-bag-retry>Tentar novamente</button></div>`;
    else{const V=visiveis();body=V.length?`<div class="bag-grid">${V.map(card).join('')}</div>`:vazio()}
    root.innerHTML=`<div class="bag-bg" data-bag-bg><section class="bag" role="dialog" aria-modal="true" aria-label="Bag">
      <div class="bag-h"><img class="ico" src="assets/bag-${perfil()}.png" alt="" /><div class="t"><small>Seu inventário</small><h2>Bag</h2></div>
        <label class="bag-search">${ICON.search}<input id="bagQ" placeholder="Buscar na Bag" value="${esc(busca)}" aria-label="Buscar na Bag" /></label>
        <button class="bag-btn" data-bag-new>${ICON.plus}Novo item</button><button class="bag-x" data-bag-close aria-label="Fechar Bag">${ICON.x}</button></div>
      <div class="bag-f">${ABAS.map(([k,l])=>`<button class="bag-tab" data-bag-tab="${k}" aria-pressed="${aba===k}">${l}<b>${cont(k)}</b></button>`).join('')}<span class="bag-sep"></span>
        ${FILTROS.map(([k,l])=>`<button class="bag-chip" data-bag-filter="${k}" aria-pressed="${filtro===k}">${l}</button>`).join('')}</div>
      ${aviso?`<div class="bag-toast" role="status">${aviso}</div>`:''}
      <div class="bag-body">${body}</div></section></div>
      ${editor?editorHTML():''}${apagar?`<div class="bag-ed-bg"><div class="bag-ed" role="dialog" aria-modal="true"><h3>Excluir item</h3><p style="color:var(--text-muted);font-size:14px">Este item será removido da sua Bag.</p><div class="acts"><button class="bag-btn sec" data-bag-cancel>Cancelar</button><button class="bag-btn danger" data-bag-confirm>Excluir</button></div></div></div>`:''}`;
    const q=document.getElementById('bagQ'); if(q&&q.dataset.f){q.focus()}
  }
  function editorHTML(){
    const e=editor, isCard=e.tipo==='card';
    return `<div class="bag-ed-bg"><form class="bag-ed" id="bagForm" role="dialog" aria-modal="true" aria-label="${e.id?'Editar item':'Novo item'}">
      <small class="k" style="margin-top:0;color:var(--accent)">BAG</small><h3>${e.id?'Editar item':'Novo item'}</h3>
      ${e.topico?`<div class="ctx">${esc(e.topico)}${e.conteudo_ctx?' · '+esc(e.conteudo_ctx):''}</div>`:''}
      <small class="k">TIPO</small><div class="bag-seg">${[['resumo','Resumo'],['anotacao','Anotação'],['card','Card']].map(([k,l])=>`<button type="button" data-bag-type="${k}" aria-pressed="${e.tipo===k}">${l}</button>`).join('')}</div>
      <small class="k">TÍTULO</small><input id="bagT" placeholder="Dê um nome para este item" value="${esc(e.titulo)}" required />
      ${isCard?`<small class="k">FRENTE</small><input id="bagF" placeholder="Pergunta ou conceito" value="${esc(e.frente)}" /><small class="k">VERSO</small><textarea id="bagV" placeholder="Resposta ou explicação">${esc(e.verso)}</textarea>`
        :`<small class="k">CONTEÚDO</small><textarea id="bagC" placeholder="${e.tipo==='resumo'?'Escreva o resumo':'Escreva sua anotação'}">${esc(e.conteudo)}</textarea>`}
      <div class="acts"><button type="button" class="bag-btn sec" data-bag-cancel>Cancelar</button><button class="bag-btn">Salvar</button></div></form></div>`;
  }
  function lerEditor(){const g=id=>{const el=document.getElementById(id);return el?el.value:undefined};if(editor){editor.titulo=g('bagT')??editor.titulo;editor.frente=g('bagF')??editor.frente;editor.verso=g('bagV')??editor.verso;editor.conteudo=g('bagC')??editor.conteudo}}
  function salvar(){
    lerEditor(); const e=editor; if(!e.titulo.trim())return;
    if(e.id){Object.assign(itens.find(i=>i.id===e.id),{tipo:e.tipo,titulo:e.titulo,conteudo:e.conteudo,frente:e.frente,verso:e.verso});aviso='Item atualizado.'}
    else{itens.unshift({id:nextId++,origem:'aluno',tipo:e.tipo,titulo:e.titulo,conteudo:e.conteudo,frente:e.frente,verso:e.verso,topico:e.topico||'Sem tópico',data:'Agora'});aviso='Guardado na sua Bag.';aba='salvos'}
    editor=null; aberta=true; render();
  }
  document.addEventListener('click',e=>{
    // qualquer botão de Bag da página abre esta Bag (captura: substitui Bags antigas da tela)
    const opener=e.target.closest('[data-open="bag"],.console-icon-button[title="Minha Bag"],[aria-label="Abrir minha Bag"],[title="Abre a mesma Bag do botão da barra superior"]');
    if(opener){e.preventDefault();e.stopPropagation();Bag.abrir();return}
    if(!root.contains(e.target))return;
    const q=x=>e.target.closest(x);
    if(e.target.matches('[data-bag-bg]')||q('[data-bag-close]')){aberta=false;aviso=null;render();return}
    if(q('[data-bag-tab]')){aba=q('[data-bag-tab]').dataset.bagTab;aviso=null;render();return}
    if(q('[data-bag-filter]')){const f=q('[data-bag-filter]').dataset.bagFilter;filtro=filtro===f?null:f;render();return}
    if(q('[data-bag-new]')){editor={tipo:'resumo',titulo:'',conteudo:'',frente:'',verso:''};render();document.getElementById('bagT').focus();return}
    if(q('[data-bag-edit]')){const i=itens.find(x=>x.id===+q('[data-bag-edit]').dataset.bagEdit);editor={...i};render();return}
    if(q('[data-bag-del]')){apagar=+q('[data-bag-del]').dataset.bagDel;render();return}
    if(q('[data-bag-confirm]')){itens=itens.filter(i=>i.id!==apagar);apagar=null;aviso='Item excluído.';render();return}
    if(q('[data-bag-cancel]')){editor=null;apagar=null;render();return}
    if(q('[data-bag-type]')){lerEditor();editor.tipo=q('[data-bag-type]').dataset.bagType;render();return}
    if(q('[data-bag-share]')){aviso='Escolha uma conversa ou a sua guilda para compartilhar (o item continua privado na sua Bag).';render();return}
    if(q('[data-bag-retry]')){estado='normal';render();return}
    const fl=q('[data-bag-flip]');if(fl){const id=+fl.dataset.bagFlip;virados.has(id)?virados.delete(id):virados.add(id);render();return}
  },true);
  document.addEventListener('submit',e=>{if(e.target.id==='bagForm'){e.preventDefault();salvar()}},true);
  document.addEventListener('input',e=>{if(e.target.id==='bagQ'){busca=e.target.value;const pos=e.target.selectionStart;render();const q=document.getElementById('bagQ');q.focus();q.setSelectionRange(pos,pos)}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&aberta){if(editor||apagar){editor=null;apagar=null}else aberta=false;render()}});
  window.Bag={
    abrir(o={}){aberta=true;estado=o.estado==='erro'?'erro':'normal';if(o.estado==='vazia')itens=[];else if(o.estado!=='manter'&&!itens.length)itens=BASE.map(i=>({...i}));aviso=null;render()},
    novo(ctx={}){aberta=true;editor={tipo:'resumo',titulo:'',conteudo:'',frente:'',verso:'',topico:ctx.topico,conteudo_ctx:ctx.conteudo};render();document.getElementById('bagT').focus()},
    fechar(){aberta=false;editor=null;apagar=null;render()},
  };
  /* botão da Bag na barra superior: arte da Bag do perfil ativo (bag-<perfil>.png), acompanhando a troca
     de perfil na Trilha e no Perfil (elas reescrevem o texto em .console-account-copy span) */
  const PERFIS=['seeker','survivor','daredevil','mastermind','conqueror','socializer','achiever'];
  function sincronizarArte(){const p=perfil(),img=document.querySelector('.console-icon-button.bag-btn img');if(img&&PERFIS.includes(p)&&!img.src.endsWith('bag-'+p+'.png'))img.src='assets/bag-'+p+'.png'}
  sincronizarArte();
  const alvo=document.querySelector('.console-account-copy span');
  if(alvo)new MutationObserver(sincronizarArte).observe(alvo,{childList:true,characterData:true,subtree:true});
})();
