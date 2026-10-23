/* Bag no celular (parte 7): uma Bag só, em tela cheia, aberta de qualquer tela logada.
   Itens e textos do v4 (v4/assets/bag.js). Precisa de tema.js (ARTE, ICONE, perfil) e app.css.
   Uso: Bag.abrir({estado:'vazia'|'erro'}) · Bag.novo() · Bag.fechar() · Bag.redesenha()
   Qualquer botão com [data-abre-bag] abre a Bag. */
(function () {
  const BASE = [
    {id:1,origem:'aluno',tipo:'resumo',titulo:'Isolar o x',conteudo:'O que faço de um lado, faço do outro. Primeiro tiro o número sozinho, depois divido.',topico:'Equações do 1º grau',data:'Hoje'},
    {id:2,origem:'aluno',tipo:'anotacao',titulo:'Dúvida para a professora',conteudo:'Por que 1/2 + 1/3 não é 2/5?',topico:'Frações',data:'Segunda'},
    {id:3,origem:'aluno',tipo:'card',titulo:'Termo independente',frente:'O que é o termo independente?',verso:'O número que não acompanha a incógnita.',topico:'Expressões algébricas',data:'Sexta passada'},
    {id:4,origem:'plataforma',tipo:'card',titulo:'3x + 7 = 22',frente:'Qual é o primeiro passo?',verso:'Tirar 7 dos dois lados.',topico:'Equações do 1º grau',data:'Ontem'},
    {id:5,origem:'plataforma',tipo:'resumo',titulo:'Mapa mental de Equações',conteudo:'Equação, incógnita, operação inversa e verificação.',topico:'Equações do 1º grau',data:'Ontem'},
    {id:6,origem:'loja',efeito:'TROCA DE FORMATO',titulo:'Trocar formato',estado:'DISPONÍVEL',img:'book',data:'Comprado ontem'},
    {id:7,origem:'loja',efeito:'DICA',titulo:'Dica',estado:'CONSUMIDO',img:'hint',data:'Sexta passada'},
  ];
  const TIPO = {resumo:'RESUMO',anotacao:'ANOTAÇÃO',card:'CARD'};
  const ORIG = {aluno:'MEU ITEM',plataforma:'GERADO',loja:'LOJA'};
  const ABAS = [['todos','Todos'],['salvos','Salvos'],['gerados','Gerados'],['comprados','Comprados']];
  const FILTROS = [['resumo','Resumos'],['anotacao','Anotações'],['card','Cards']];
  const VAZIO = {todos:['Sua Bag está vazia','Guarde resumos, anotações e cards enquanto estuda.'],salvos:['Nada salvo ainda','Use "Adicionar à Bag" no tópico ou crie um item aqui.'],gerados:['Nada gerado ainda','Os cards e resumos que a plataforma gerar para você aparecem aqui.'],comprados:['Nada comprado ainda','Os itens que você comprar na Loja ficam aqui até você usar.']};
  const I = {
    busca:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    mais:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
    pontos:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    virar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  };
  const css = `
  .bg{position:absolute;inset:0;z-index:62;background:var(--bg);display:flex;flex-direction:column;padding-top:var(--topo)}
  .bg-topo{display:flex;align-items:center;gap:10px;padding:6px 8px 8px 16px}
  .bg-topo img{width:40px;height:40px;object-fit:contain}
  .bg-topo div{flex:1}.bg-topo small{display:block;font-size:11px;letter-spacing:.12em;font-weight:800;color:var(--accent);text-transform:uppercase}
  .bg-topo h2{font-family:Georgia,serif;font-size:22px;margin:0}
  .bg-busca{display:flex;align-items:center;gap:8px;height:46px;margin:0 14px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--surface)}
  .bg-busca svg{width:17px;height:17px;color:var(--text-subtle)}
  .bg-busca input{flex:1;min-width:0;background:none;border:0;color:var(--text);font-size:16px;outline:none}
  .bg-abas{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;padding:3px;margin:10px 14px 0;border-radius:12px;background:var(--surface);border:1px solid var(--line)}
  .bg-abas button{min-height:38px;border:0;border-radius:9px;background:none;font-size:12.5px;font-weight:700;color:var(--text-muted)}
  .bg-abas button[aria-pressed="true"]{background:var(--accent);color:var(--bg)}
  .bg-filtros{display:flex;gap:6px;padding:10px 14px 4px;overflow-x:auto;scrollbar-width:none}
  .bg-filtros button{flex:none;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:none;font-size:13px;font-weight:600;color:var(--text-muted)}
  .bg-filtros button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent);background:var(--accent-muted)}
  .bg-lista{flex:1;overflow-y:auto;padding:8px 14px 100px;display:flex;flex-direction:column;gap:10px}
  .bg-item{border-radius:12px;border:1px solid var(--line);background:var(--surface);padding:12px 12px 12px 14px;display:flex;flex-direction:column;gap:6px}
  .bg-item .l1{display:flex;align-items:center;gap:6px}
  .bg-item .tag{font-size:10.5px;font-weight:800;letter-spacing:.06em;padding:3px 8px;border-radius:999px;background:var(--elev);color:var(--text-muted)}
  .bg-item .tag.ac{background:var(--accent-muted);color:var(--accent)}
  .bg-item .l1 .esp{flex:1}
  .bg-item .menu{width:40px;height:40px;border-radius:50%;border:0;background:none;color:var(--text-muted);display:grid;place-items:center}
  .bg-item .menu svg{width:18px;height:18px}
  .bg-item h4{margin:0;font-size:15.5px}
  .bg-item p{margin:0;font-size:14px;line-height:1.5;color:var(--text-muted)}
  .bg-item .pe{font-size:12px;color:var(--text-subtle)}
  .bg-card{min-height:84px;border-radius:10px;border:1px dashed var(--border-strong);background:var(--bg-a55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px;text-align:center;font-size:15px;cursor:pointer}
  .bg-card.virado{border-style:solid;border-color:var(--accent);background:var(--accent-muted)}
  .bg-card small{display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--text-subtle)}
  .bg-card small svg{width:13px;height:13px}
  .bg-loja{display:flex;align-items:center;gap:12px}
  .bg-loja img{width:48px;height:48px;object-fit:contain}
  .bg-loja .est{font-size:11px;font-weight:800;color:var(--success)}
  .bg-loja .est.usado{color:var(--text-subtle)}
  .bg-vazio{margin:30px auto;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--text-subtle);max-width:280px}
  .bg-vazio img{width:84px;height:84px;object-fit:contain;opacity:.8}
  .bg-vazio h3{margin:0;font-family:Georgia,serif;color:var(--text);font-size:19px}
  .bg-vazio p{margin:0 0 6px;font-size:14px;line-height:1.5}
  .bg-erro{margin:20px 0;padding:16px;border-radius:12px;background:var(--danger-bg);border:1px solid var(--danger-border);color:#f3d9e0;display:flex;flex-direction:column;gap:10px;align-items:flex-start}
  .bg-pe{position:absolute;left:0;right:0;bottom:0;padding:10px 14px calc(var(--base) + 10px);background:linear-gradient(transparent,var(--bg) 35%)}
  .bg-aviso{position:absolute;left:50%;bottom:calc(var(--base) + 76px);transform:translateX(-50%);background:var(--text);color:var(--bg);font-size:13px;font-weight:600;padding:9px 14px;border-radius:999px;white-space:nowrap;z-index:3}
  .bg-veu{position:absolute;inset:0;z-index:4;background:rgba(0,0,0,.45)}
  .bg-folha{position:absolute;left:0;right:0;bottom:0;z-index:5;background:var(--surface);border:1px solid var(--line);border-radius:20px 20px 0 0;padding:0 16px calc(var(--base) + 16px);max-height:90%;overflow-y:auto}
  .bg-folha h3{font-family:Georgia,serif;font-size:20px;margin:2px 0 6px}
  .bg-folha p{font-size:14.5px;color:var(--text-muted);margin:0 0 14px}
  .bg-folha .op{display:flex;align-items:center;min-height:52px;width:100%;border:0;border-bottom:1px solid var(--line);background:none;font-size:15px;font-weight:600;text-align:left}
  .bg-folha .op.perigo{color:var(--danger)}
  .bg-folha .k{display:block;font-size:11.5px;font-weight:700;letter-spacing:.08em;color:var(--text-subtle);margin:14px 0 6px}
  .bg-folha .segm{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  .bg-folha .segm button{min-height:44px;border-radius:8px;border:1px solid var(--line);background:var(--bg-a55);font-weight:600}
  .bg-folha .segm button[aria-pressed="true"]{background:var(--accent);color:var(--bg);border-color:var(--accent)}
  .bg-folha input,.bg-folha textarea{width:100%;border-radius:8px;border:1px solid var(--line);background:var(--bg-a55);color:var(--text);padding:12px 14px;font-size:16px;font-family:inherit}
  .bg-folha input{height:50px}.bg-folha textarea{min-height:110px;resize:vertical}
  .bg-folha .duas{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
  .bg-perigo{background:var(--danger);color:#2a0d10}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  let itens = BASE.map(i => ({...i})), aba = 'todos', filtro = null, busca = '', virados = new Set(), estado = null, aberta = false, folha = null, aviso = null, nextId = 100;
  const esc = x => String(x ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const raiz = () => { let r = document.getElementById('bag-raiz'); if (!r) { r = document.createElement('div'); r.id = 'bag-raiz'; } document.querySelector('.tela').appendChild(r); return r; };
  const visiveis = () => itens.filter(i => (aba === 'todos' || (aba === 'salvos' && i.origem === 'aluno') || (aba === 'gerados' && i.origem === 'plataforma') || (aba === 'comprados' && i.origem === 'loja'))
    && (!filtro || i.tipo === filtro) && (!busca || (i.titulo + ' ' + (i.conteudo || '') + ' ' + (i.frente || '')).toLowerCase().includes(busca.toLowerCase())));

  function itemHTML(i) {
    const menu = `<button class="menu" data-bag-menu="${i.id}" aria-label="Mais ações para ${esc(i.titulo)}">${I.pontos}</button>`;
    if (i.origem === 'loja') return `<article class="bg-item"><div class="l1"><span class="tag ac">LOJA</span><span class="tag">${i.efeito}</span><span class="esp"></span></div>
      <div class="bg-loja"><img src="${ARTE}${i.img}-${perfil}.png" onerror="this.src='${ARTE}object-${i.img}.png'" alt="" /><div><h4>${esc(i.titulo)}</h4><span class="est ${i.estado === 'CONSUMIDO' ? 'usado' : ''}">${i.estado}</span></div></div><span class="pe">${i.data}</span></article>`;
    const corpo = i.tipo === 'card'
      ? `<button class="bg-card ${virados.has(i.id) ? 'virado' : ''}" data-bag-virar="${i.id}" aria-label="Virar card">${esc(virados.has(i.id) ? i.verso : i.frente)}<small>${I.virar}${virados.has(i.id) ? 'Verso · toque para voltar' : 'Toque para virar'}</small></button>`
      : `<p>${esc(i.conteudo)}</p>`;
    return `<article class="bg-item"><div class="l1"><span class="tag ${i.origem === 'aluno' ? 'ac' : ''}">${ORIG[i.origem]}</span><span class="tag">${TIPO[i.tipo]}</span><span class="esp"></span>${menu}</div>
      <h4>${esc(i.titulo)}</h4>${corpo}<span class="pe">${esc(i.topico)} · ${i.data}</span></article>`;
  }
  function folhaHTML() {
    if (!folha) return '';
    let c = '';
    if (folha.tipo === 'menu') { const i = itens.find(x => x.id === folha.id);
      c = `<h3>${esc(i.titulo)}</h3><button class="op" data-bag-acao="compartilhar">Compartilhar</button>${i.origem === 'aluno' ? '<button class="op" data-bag-acao="editar">Editar</button>' : ''}<button class="op perigo" data-bag-acao="excluir">Excluir</button>`; }
    if (folha.tipo === 'excluir') c = `<h3>Excluir item</h3><p>Este item sai da sua Bag e não dá para desfazer.</p><div class="duas"><button class="btn btn-secundario" data-bag-fecha-folha>Cancelar</button><button class="btn bg-perigo" data-bag-confirma>Excluir</button></div>`;
    if (folha.tipo === 'editor') { const e = folha.e, card = e.tipo === 'card';
      c = `<span class="eyebrow">Bag</span><h3>${e.id ? 'Editar item' : 'Novo item'}</h3>
        <span class="k">TIPO</span><div class="segm">${[['resumo','Resumo'],['anotacao','Anotação'],['card','Card']].map(([k, l]) => `<button type="button" data-bag-tipo="${k}" aria-pressed="${e.tipo === k}">${l}</button>`).join('')}</div>
        <label class="k" for="bagT">TÍTULO</label><input id="bagT" placeholder="Dê um nome para este item" value="${esc(e.titulo)}" />
        ${card ? `<label class="k" for="bagF">FRENTE</label><input id="bagF" placeholder="Pergunta ou conceito" value="${esc(e.frente)}" /><label class="k" for="bagV">VERSO</label><textarea id="bagV" placeholder="Resposta ou explicação">${esc(e.verso)}</textarea>`
          : `<label class="k" for="bagC">CONTEÚDO</label><textarea id="bagC" placeholder="${e.tipo === 'resumo' ? 'Escreva o resumo' : 'Escreva sua anotação'}">${esc(e.conteudo)}</textarea>`}
        <div class="duas"><button class="btn btn-secundario" data-bag-fecha-folha>Cancelar</button><button class="btn btn-primario" data-bag-salva>Salvar</button></div>`; }
    return `<div class="bg-veu" data-bag-fecha-folha></div><section class="bg-folha" role="dialog" aria-modal="true"><span class="alca" data-bag-fecha-folha></span>${c}</section>`;
  }
  function render() {
    const r = raiz();
    if (!aberta) { r.innerHTML = ''; return; }
    const V = visiveis();
    let lista;
    if (estado === 'erro') lista = `<div class="bg-erro" role="alert">${ICONE.alerta.replace('<svg', '<svg width="22" height="22"')}<span>Não foi possível carregar sua Bag.</span><button class="btn btn-secundario" data-bag-retry>${ICONE.repetir}Tentar novamente</button></div>`;
    else if (!V.length) { const [t, p] = busca ? ['Nada encontrado', 'Tente outra palavra.'] : VAZIO[aba];
      lista = `<div class="bg-vazio"><img src="${ARTE}bag-${perfil}.png" alt="" /><h3>${t}</h3><p>${p}</p></div>`; }
    else lista = V.map(itemHTML).join('');
    r.innerHTML = `<section class="bg" role="dialog" aria-modal="true" aria-label="Bag">
      <div class="bg-topo"><img src="${ARTE}bag-${perfil}.png" alt="" /><div><small>Seu inventário</small><h2>Bag</h2></div><button class="redondo" data-bag-fecha aria-label="Fechar Bag">${ICONE.x}</button></div>
      <label class="bg-busca">${I.busca}<input id="bagQ" placeholder="Buscar na Bag" value="${esc(busca)}" aria-label="Buscar na Bag" /></label>
      <div class="bg-abas" role="group" aria-label="Origem">${ABAS.map(([k, l]) => `<button aria-pressed="${aba === k}" data-bag-aba="${k}">${l}</button>`).join('')}</div>
      ${aba !== 'comprados' ? `<div class="bg-filtros" role="group" aria-label="Tipo">${FILTROS.map(([k, l]) => `<button aria-pressed="${filtro === k}" data-bag-filtro="${k}">${l}</button>`).join('')}</div>` : ''}
      <div class="bg-lista">${lista}</div>
      ${aba === 'gerados' || aba === 'comprados' ? '' : `<div class="bg-pe"><button class="btn btn-primario btn-bloco" data-bag-novo>${I.mais}Novo item</button></div>`}
      ${aviso ? `<div class="bg-aviso" role="status">${aviso}</div>` : ''}${folhaHTML()}</section>`;
    if (document.activeElement?.id !== 'bagQ' && raiz.focoBusca) { const q = document.getElementById('bagQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  function avisa(t) { aviso = t; render(); setTimeout(() => { aviso = null; render(); }, 1600); }
  function lerEditor() { const g = id => document.getElementById(id)?.value; const e = folha.e; e.titulo = g('bagT') ?? e.titulo; e.frente = g('bagF') ?? e.frente; e.verso = g('bagV') ?? e.verso; e.conteudo = g('bagC') ?? e.conteudo; }
  window.Bag = {
    abrir(o = {}) { aberta = true; folha = null; aba = 'todos'; filtro = null; busca = ''; estado = o.estado === 'erro' ? 'erro' : null; if (o.estado === 'vazia') itens = []; render(); },
    novo() { aberta = true; folha = {tipo: 'editor', e: {tipo: 'resumo', titulo: '', conteudo: '', frente: '', verso: ''}}; render(); },
    fechar() { aberta = false; folha = null; itens = itens.length ? itens : BASE.map(i => ({...i})); render(); },
    redesenha() { if (aberta) render(); },
  };
  document.addEventListener('click', e => {
    const q = s => e.target.closest(s);
    if (q('[data-abre-bag]')) { e.preventDefault(); Bag.abrir(); return; }
    if (!q('#bag-raiz')) return;
    if (q('[data-bag-fecha]')) { Bag.fechar(); return; }
    if (q('[data-bag-aba]')) { aba = q('[data-bag-aba]').dataset.bagAba; filtro = null; render(); return; }
    if (q('[data-bag-filtro]')) { const f = q('[data-bag-filtro]').dataset.bagFiltro; filtro = filtro === f ? null : f; render(); return; }
    if (q('[data-bag-virar]')) { const id = +q('[data-bag-virar]').dataset.bagVirar; virados.has(id) ? virados.delete(id) : virados.add(id); render(); return; }
    if (q('[data-bag-menu]')) { folha = {tipo: 'menu', id: +q('[data-bag-menu]').dataset.bagMenu}; render(); return; }
    if (q('[data-bag-acao]')) { const a = q('[data-bag-acao]').dataset.bagAcao, i = itens.find(x => x.id === folha.id);
      if (a === 'compartilhar') { folha = null; avisa('Abre o compartilhamento do celular'); }
      if (a === 'editar') { folha = {tipo: 'editor', e: {...i}}; render(); }
      if (a === 'excluir') { folha = {tipo: 'excluir', id: i.id}; render(); }
      return; }
    if (q('[data-bag-confirma]')) { itens = itens.filter(x => x.id !== folha.id); folha = null; avisa('Item excluído.'); return; }
    if (q('[data-bag-tipo]')) { lerEditor(); folha.e.tipo = q('[data-bag-tipo]').dataset.bagTipo; render(); return; }
    if (q('[data-bag-salva]')) { lerEditor(); const ed = folha.e; if (!ed.titulo.trim()) return;
      if (ed.id) { Object.assign(itens.find(x => x.id === ed.id), ed); folha = null; avisa('Item atualizado.'); }
      else { itens.unshift({...ed, id: nextId++, origem: 'aluno', topico: 'Sem tópico', data: 'Agora'}); aba = 'salvos'; folha = null; avisa('Guardado na sua Bag.'); }
      return; }
    if (q('[data-bag-novo]')) { Bag.novo(); return; }
    if (q('[data-bag-fecha-folha]')) { folha = null; render(); return; }
    if (q('[data-bag-retry]')) { estado = null; render(); return; }
  });
  document.addEventListener('input', e => { if (e.target.id !== 'bagQ') return; busca = e.target.value; raiz.focoBusca = true; render(); raiz.focoBusca = false; });
})();
