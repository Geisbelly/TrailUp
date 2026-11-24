// Gera a cartilha da pesquisa com professores em PDF (A4) e em imagens, no
// tema do TrailUp. O texto vem de src/features/pesquisa/pesquisaProfessores.ts,
// o mesmo módulo da página /pesquisa/professores e do formulário do Google, para
// os três não se separarem.
//
// Uso (na pasta frontend):
//   node scripts/cartilha-pesquisa/gerar.mjs [pasta-de-saida]
// Saída padrão: ~/Downloads/cartilha-pesquisa-professores
//
// Gera: cartilha-pesquisa-professores.pdf, pagina-N.png (uma por página do
// PDF) e resumo-pesquisa-professores.png (1080 × 1350, para mensagem).

import { build } from "esbuild";
import { chromium } from "playwright";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(AQUI, "../..");
const SAIDA = resolve(process.argv[2] ?? join(homedir(), "Downloads", "cartilha-pesquisa-professores"));

async function carregarConteudo() {
  const tmp = await mkdtemp(join(tmpdir(), "cartilha-"));
  const arquivo = join(tmp, "conteudo.mjs");
  await build({
    entryPoints: [join(FRONTEND, "src/features/pesquisa/pesquisaProfessores.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: arquivo,
    logLevel: "silent",
  });
  const modulo = await import(pathToFileURL(arquivo).href);
  await rm(tmp, { recursive: true, force: true });
  return modulo;
}

async function dataUri(relativo, tipo) {
  const bytes = await readFile(join(FRONTEND, relativo));
  return `data:${tipo};base64,${bytes.toString("base64")}`;
}

const esc = s =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Tokens de src/index.css (tema escuro do sistema).
const CSS_BASE = `
:root {
  --bg: hsl(264 43% 10%);
  --fg: hsl(280 50% 97%);
  --card: hsl(268 29% 14%);
  --muted: hsl(268 23% 20%);
  --muted-fg: hsl(272 18% 76%);
  --primary: hsl(270 57% 73%);
  --primary-light: hsl(270 64% 82%);
  --primary-dark: hsl(268 38% 43%);
  --coral: hsl(12 100% 80%);
  --mint: hsl(162 54% 73%);
  --border: hsl(268 22% 29%);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--fg); }
body { font-family: "Inter", system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; font-weight: 400; }
.cinzel { font-family: "Cinzel", Georgia, serif; letter-spacing: .04em; }
.eyebrow { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--primary); font-weight: 600; }
p, li { line-height: 1.55; color: var(--muted-fg); }
strong { color: var(--fg); font-weight: 600; }
`;

const FONTES = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`;

function htmlDaCartilha(c, arte) {
  const consoleT = c.TAREFAS.filter(t => t.onde === "console");
  const alunoT = c.TAREFAS.filter(t => t.onde === "aluno");
  const tarefa = t => `
    <div class="tarefa">
      <div class="tarefa-topo"><span class="cinzel id">${esc(t.id)}</span><span class="cinzel">${esc(t.titulo)}</span></div>
      <ul>${t.passos.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
      <p class="repare"><strong>Repare:</strong> ${esc(t.observar)}</p>
    </div>`;
  const rodape = n => `<footer><span>Cartilha do professor · Pesquisa TrailUp</span><span>${n}</span></footer>`;
  const etapas = [
    ["1", "Inscrição", "Termo e identificação. O e-mail vira o seu login."],
    ["2", "Acesso", "A equipe cria a conta com senha aleatória e envia ao seu e-mail."],
    ["3", "Avaliação", `Roteiro de ${c.TAREFAS.length} tarefas e os blocos de perguntas.`],
  ];

  return `<!doctype html><html lang="pt-BR" class="notranslate"><head><meta charset="utf-8">${FONTES}
<style>
${CSS_BASE}
@page { size: A4; margin: 0; }
.page { width: 210mm; height: 297mm; padding: 16mm 16mm 18mm; position: relative; overflow: hidden; page-break-after: always; background: var(--bg); }
.page:last-child { page-break-after: auto; }
footer { position: absolute; left: 16mm; right: 16mm; bottom: 8mm; display: flex; justify-content: space-between; font-size: 9px; color: var(--muted-fg); border-top: 1px solid var(--border); padding-top: 3mm; }
h2 { font-size: 24px; color: var(--fg); margin: 0 0 10px; }
h3 { font-size: 16px; color: var(--fg); margin: 0 0 6px; }
.sec { margin-bottom: 16px; }
.sec > p { font-size: 11.5px; margin-bottom: 6px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.card p, .card li { font-size: 10.5px; }
.card h3 { font-size: 14px; }
.destaque { background: hsl(270 57% 73% / .12); border: 1px solid hsl(270 57% 73% / .45); border-radius: 10px; padding: 14px 16px; }
.destaque h3 { color: var(--primary-light); }
.destaque p { font-size: 11px; color: var(--fg); }
/* capa */
.capa { padding: 0; }
.capa img.fundo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.capa .veu { position: absolute; inset: 0; background: linear-gradient(180deg, hsl(264 43% 10% / .35) 0%, hsl(264 43% 10% / .55) 45%, hsl(264 43% 10% / .97) 78%); }
.capa .conteudo { position: absolute; left: 18mm; right: 18mm; bottom: 26mm; }
.capa .marca { position: absolute; top: 16mm; left: 18mm; display: flex; align-items: center; gap: 10px; font-family: Georgia, serif; font-size: 22px; font-weight: 700; }
.capa .marca img { width: 30px; height: 30px; }
.capa h1 { font-size: 50px; line-height: 1.1; margin: 10px 0 14px; color: #fff4ff; }
.capa .sub { font-size: 15px; color: hsl(280 50% 92%); max-width: 150mm; margin-bottom: 18px; }
.capa .etapas { display: flex; gap: 8px; margin-bottom: 18px; }
.capa .etapa { flex: 1; background: hsl(268 29% 14% / .85); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.capa .etapa b { font-family: "Cinzel", serif; color: var(--primary-light); font-size: 13px; display: block; margin-bottom: 3px; }
.capa .etapa span { font-size: 10px; color: var(--muted-fg); line-height: 1.4; display: block; }
.capa .credito { font-size: 10px; color: var(--muted-fg); }
/* passos */
ul.porTarefa { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; margin: 6px 0 12px; font-size: 10.5px; color: var(--muted-fg); }
ul.porTarefa b { color: var(--fg); }
.pares { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 6px; }
.pares span { font-size: 10.5px; text-align: center; padding: 5px 4px; border: 1px solid hsl(270 57% 73% / .4); border-radius: 8px; background: hsl(270 57% 73% / .08); color: var(--fg); }
ol.passos { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; }
ol.passos li { display: flex; gap: 9px; }
ol.passos .n { flex: 0 0 22px; height: 22px; border-radius: 50%; background: var(--primary); color: var(--bg); font-weight: 700; font-size: 11px; display: flex; align-items: center; justify-content: center; }
ol.passos b { color: var(--fg); font-size: 11.5px; display: block; }
ol.passos span { display: block; font-size: 10px; line-height: 1.45; color: var(--muted-fg); }
.fluxo { display: flex; align-items: stretch; gap: 6px; margin-bottom: 14px; }
.fluxo .etapa { flex: 1; text-align: center; }
.fluxo .seta { align-self: center; color: var(--primary); font-size: 20px; }
.fluxo .num { width: 30px; height: 30px; margin: 0 auto 6px; border-radius: 50%; border: 1px solid var(--primary); color: var(--primary-light); display: flex; align-items: center; justify-content: center; font-family: "Cinzel", serif; font-weight: 700; }
ul.cadeado { list-style: none; }
ul.cadeado li { padding-left: 16px; position: relative; font-size: 10.5px; margin-bottom: 3px; }
ul.cadeado li::before { content: "◆"; position: absolute; left: 0; color: var(--primary); font-size: 8px; top: 3px; }
/* tarefas */
.tarefas { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.tarefa { background: var(--card); border: 1px solid var(--border); border-radius: 9px; padding: 9px 11px; }
.tarefa-topo { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; font-size: 11.5px; color: var(--fg); font-weight: 600; }
.tarefa .id { color: var(--primary); }
.tarefa ul { padding-left: 14px; }
.tarefa li { font-size: 9.8px; }
.tarefa .repare { font-size: 9.8px; margin-top: 4px; }
.escala7 { display: flex; gap: 4px; align-items: center; margin: 6px 0 12px; }
.escala7 span.v { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--fg); background: var(--card); }
.escala7 .rot { font-size: 10px; color: var(--muted-fg); margin: 0 6px; }
.grupo { display: flex; align-items: center; gap: 8px; margin: 4px 0 8px; }
.grupo img { width: 26px; height: 26px; }
.grupo h3 { margin: 0; }
/* métricas */
table { width: 100%; border-collapse: collapse; font-size: 10px; }
th, td { border: 1px solid var(--border); padding: 5px 7px; text-align: left; color: var(--muted-fg); }
th { color: var(--fg); background: var(--muted); font-weight: 600; }
td.caixa { text-align: center; color: var(--primary); }
.bloco ul { padding-left: 14px; }
.bloco li { font-size: 10px; }
.tag { font-size: 9px; color: var(--coral); font-weight: 600; margin-left: 6px; letter-spacing: .05em; text-transform: uppercase; }
.opcao { background: var(--card); border: 1px solid var(--border); border-left: 3px solid var(--primary); border-radius: 8px; padding: 8px 11px; font-size: 10.5px; color: var(--fg); margin-bottom: 6px; }
.faca li::marker { color: var(--mint); }
.evite li::marker { color: var(--coral); }
.faca ul, .evite ul { padding-left: 14px; }
.faq { margin-bottom: 9px; }
.faq b { color: var(--fg); font-size: 11.5px; display: block; margin-bottom: 2px; }
.faq p { font-size: 10.3px; }
</style></head><body>

<section class="page capa">
  <img class="fundo" src="${arte.floresta}" alt="">
  <div class="veu"></div>
  <div class="marca"><img src="${arte.estrela}" alt="">TrailUp</div>
  <div class="conteudo">
    <p class="eyebrow">Pesquisa TrailUp · avaliação com especialistas</p>
    <h1>Cartilha do professor</h1>
    <p class="sub">Como funciona a avaliação do TrailUp com professores: as etapas, o que você vai fazer no sistema, o que observar e como responder.</p>
    <div class="etapas">${etapas.map(([n, t, d]) => `<div class="etapa"><b>${n}. ${t}</b><span>${d}</span></div>`).join("")}</div>
    <p class="credito">Trabalho de Conclusão de Curso · Ciência da Computação · Ulbra Palmas · Orientação: Prof. Esp. Fábio Castro Araújo</p>
  </div>
</section>

<section class="page">
  <div class="sec">
    <p class="eyebrow">Por que esta pesquisa</p>
    <h2>O que a pesquisa quer saber</h2>
    <p>O TrailUp é uma plataforma de aprendizagem criada num Trabalho de Conclusão de Curso. O professor monta a trilha da turma e o sistema adapta o material a cada perfil de aluno, com elementos de jogo. O professor acompanha a turma por métricas e recebe sugestões feitas por inteligência artificial.</p>
    <p>Antes de chegar a uma turma de verdade, o sistema precisa passar por quem dá aula. A pergunta é <strong>se ele é fácil de usar, se as métricas fazem sentido, se o material personalizado serve ao aluno e quanto trabalho ele dá</strong>. Para responder, a pesquisa convida especialistas em ensino (docentes de TI, docentes de outras áreas e pedagogos).</p>
  </div>
  <div class="sec">
    <h2>Em resumo</h2>
    <div class="grid2">${c.RESUMO.map(r => `<div class="card"><h3>${esc(r.titulo)}</h3><p>${esc(r.texto)}</p></div>`).join("")}</div>
    <p style="font-size:10.5px;margin-top:8px"><strong>Quanto tempo leva.</strong> ${esc(c.TEMPO_ESTIMADO)}</p>
  </div>
  <div class="destaque sec">
    <h3>Resultado negativo também é resultado</h3>
    <p>${esc(c.FRANQUEZA)}</p>
  </div>
  <div class="sec">
    <h2>As três etapas</h2>
    <div class="fluxo">${etapas.map(([n, t, d], i) => `${i ? '<span class="seta">→</span>' : ""}<div class="card etapa"><div class="num">${n}</div><h3>${t}</h3><p>${d}</p></div>`).join("")}</div>
  </div>
  ${rodape(2)}
</section>

<section class="page">
  <div class="sec">
    <p class="eyebrow">Passo a passo</p>
    <h2>Do convite ao envio</h2>
    <ol class="passos">${c.PASSOS.map((p, i) => `<li><span class="n">${i + 1}</span><div><b>${esc(p.titulo)}</b><span>${esc(p.texto)}</span></div></li>`).join("")}</ol>
  </div>
  <div class="card sec">
    <div class="grupo"><img src="${arte.chave}" alt=""><h3>Seu acesso ao TrailUp</h3></div>
    <p style="margin-bottom:6px">${esc(c.ACESSO)}</p>
    <ul class="cadeado">${c.ITENS_DO_ACESSO.map(i => `<li>${esc(i)}</li>`).join("")}</ul>
  </div>
  <div class="card sec">
    <div class="grupo"><img src="${arte.livro}" alt=""><h3>O que o formulário pergunta sobre você</h3></div>
    <p>${c.CAMPOS_DE_IDENTIFICACAO.map(x => esc(x.pergunta)).join(" · ")}</p>
  </div>
  ${rodape(3)}
</section>

<section class="page">
  <p class="eyebrow">Roteiro de uso</p>
  <h2>${c.TAREFAS.length} tarefas curtas</h2>
  <p style="font-size:11px">Cada tarefa tem quatro perguntas rápidas. Ninguém cronometra, e contar que não conseguiu ajuda tanto quanto contar que conseguiu.</p>
  <p style="font-size:10.5px"><b>Fora desta rodada.</b> ${esc(c.FORA_DESTA_RODADA)}</p>
  <ul class="porTarefa">
    <li><b>${esc(c.PERGUNTA_CONCLUSAO)}</b> ${esc(c.OPCOES_CONCLUSAO.join(" · "))}</li>
    <li><b>${esc(c.PERGUNTA_SEQ)}</b> de 1 (${esc(c.EXTREMOS_SEQ[0].toLowerCase())}) a 7 (${esc(c.EXTREMOS_SEQ[1].toLowerCase())})</li>
    <li><b>${esc(c.PERGUNTA_TEMPO)}</b> ${esc(c.OPCOES_TEMPO.join(" · "))}</li>
    <li><b>Onde travou?</b> Opcional, com as suas palavras.</li>
  </ul>
  <div class="grupo"><img src="${arte.mapa}" alt=""><h3>No console do professor</h3></div>
  <div class="tarefas">${consoleT.map(tarefa).join("")}</div>
  ${rodape(4)}
</section>

<section class="page">
  <div class="grupo"><img src="${arte.bussola}" alt=""><h3>Na tela do aluno</h3></div>
  <div class="tarefas sec">${alunoT.map(tarefa).join("")}</div>
  <p class="eyebrow">O que você vai avaliar</p>
  <h2>Usabilidade, carga e métricas</h2>
  <div class="grid2 sec">
    <div class="card"><h3>Usabilidade</h3><p>Dez frases da Escala de Usabilidade de Sistema, versão brasileira validada, de 1 (${esc(c.EXTREMOS_SUS[0].toLowerCase())}) a 5 (${esc(c.EXTREMOS_SUS[1].toLowerCase())}). Por exemplo: “${esc(c.ITENS_SUS[2])}”</p></div>
    <div class="card"><h3>Carga de trabalho</h3><p>Seis perguntas sobre as tarefas do console, de 0 (pouquíssimo) a 10 (muitíssimo), baseadas no Índice NASA de carga de tarefa: ${esc(c.ITENS_TLX.map(i => i[0].toLowerCase()).join(", "))}.</p></div>
  </div>
  <div class="card sec">
    <h3>As métricas do console</h3>
    <p style="margin-bottom:4px">Oito frases de um instrumento internacional para avaliar painéis de dados educacionais (EFLA), de 1 (discordo totalmente) a 10 (concordo totalmente). A turma é de demonstração: responda como seria com uma turma sua.</p>
    <ul style="padding-left:14px;margin-bottom:6px">${c.ITENS_EFLA.map(i => `<li>${esc(i.texto)}</li>`).join("")}</ul>
    <p>Depois: “${esc(c.ACIONABILIDADE.agiria.replace(/\.$/, ""))}”, que ação seria essa e quanto as métricas refletiriam a realidade de uma turma.</p>
  </div>
  ${rodape(5)}
</section>

<section class="page">
  <div class="card sec">
    <h3>Métricas, uma a uma</h3>
    <p style="margin-bottom:6px">Para cada métrica da Visão geral, marque o que vale (mais de uma, ou nenhuma). Preste atenção na última coluna: um número que não muda nada na aula só ocupa espaço.</p>
    <table><thead><tr><th>Métrica</th>${c.COLUNAS_DAS_METRICAS.map(x => `<th>${esc(x)}</th>`).join("")}</tr></thead>
    <tbody>${c.METRICAS.map(m => `<tr><td>${esc(m)}</td>${c.COLUNAS_DAS_METRICAS.map(() => '<td class="caixa">☐</td>').join("")}</tr>`).join("")}</tbody></table>
  </div>
  <p class="eyebrow">O que você vai avaliar</p>
  <h2>Blocos de perguntas</h2>
  <p style="font-size:11px;margin-bottom:10px">Escala de cinco pontos, de “${esc(c.ESCALA_CONCORDANCIA[0].toLowerCase())}” a “${esc(c.ESCALA_CONCORDANCIA[4].toLowerCase())}”, mais “${esc(c.NAO_OBSERVEI.toLowerCase())}” para o que você não viu. Algumas frases são negativas de propósito: leia cada uma antes de marcar.</p>
  <div class="grid2">${c.BLOCOS.slice(0, 2).map(b => `<div class="card bloco"><h3>${esc(b.titulo)}${b.opcional ? '<span class="tag">opcional</span>' : ""}</h3><p style="margin-bottom:4px">${esc(b.sobre)}</p><ul>${b.itens.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div>
  ${rodape(6)}
</section>

<section class="page">
  <div class="card sec">
    <h3>Primeira impressão da tela do aluno</h3>
    <p>Antes do bloco “Interface do aluno”, oito pares de palavras opostas, de 1 a 7 (Questionário de Experiência do Usuário, versão curta):</p>
    <div class="pares">${c.PARES_UEQS.map(([a, b]) => `<span>${esc(a)} ↔ ${esc(b)}</span>`).join("")}</div>
  </div>
  <div class="grid2">${c.BLOCOS.slice(2).map(b => `<div class="card bloco"><h3>${esc(b.titulo)}${b.opcional ? '<span class="tag">opcional</span>' : ""}</h3><p style="margin-bottom:4px">${esc(b.sobre)}</p><ul>${b.itens.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div>
  <div class="card" style="margin-top:10px"><h3>Perguntas abertas</h3><ul style="padding-left:14px">${c.PERGUNTAS_ABERTAS.map(p => `<li>${esc(p)}</li>`).join("")}</ul></div>
  ${rodape(7)}
</section>

<section class="page">
  <div class="sec">
    <p class="eyebrow">Divulgação</p>
    <h2>Como você aparece na monografia</h2>
    <p>A monografia traz a avaliação de cada especialista, num quadro próprio. A última pergunta do formulário, <strong>depois de toda a avaliação</strong>, é como o seu quadro aparece:</p>
    ${c.OPCOES_DIVULGACAO.map(o => `<div class="opcao">${esc(o)}</div>`).join("")}
    <p><strong>Você pode trocar essa escolha a qualquer momento</strong>, até a versão final da monografia, e vale sempre a mais recente. Recusar o nome não tira você da pesquisa. A escolha fica para o fim, e é reversível, para que você responda sem pensar em quem vai ler.</p>
  </div>
  <div class="sec">
    <h2>Cuidados para a avaliação valer</h2>
    <div class="grid2">
      <div class="card faca"><h3>Faça</h3><ul>${c.FACA.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>
      <div class="card evite"><h3>Evite</h3><ul>${c.EVITE.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>
    </div>
  </div>
  <div class="card sec">
    <div class="grupo"><img src="${arte.bau}" alt=""><h3>Seus direitos</h3></div>
    <ul class="cadeado">
      <li>Participar é voluntário, sem custo e sem pagamento. Recusar ou desistir não traz prejuízo. O convite é feito pela pesquisadora, nunca por coordenação ou superior.</li>
      <li>Fora do que você autorizar, a identificação fica em sigilo, só com a equipe. Ao fim da coleta, as respostas são baixadas e apagadas do formulário online.</li>
      <li>O texto completo, com o contato da equipe, é o Termo de Consentimento, na primeira página da inscrição. Esta etapa é a validação com especialistas e não envolve alunos; a fase com alunos vem depois, com aprovação do Comitê de Ética em Pesquisa.</li>
    </ul>
  </div>
  ${rodape(8)}
</section>

<section class="page">
  <p class="eyebrow">Dúvidas frequentes</p>
  <h2>Perguntas e respostas</h2>
  ${c.PERGUNTAS_FREQUENTES.map(f => `<div class="faq"><b>${esc(f.pergunta)}</b><p>${esc(f.resposta)}</p></div>`).join("")}
  <div class="destaque" style="margin-top:12px">
    <h3>Pronto para começar?</h3>
    <p>A inscrição abre quando a equipe enviar os convites. O link chega no convite, por e-mail individual. A cartilha também está no site do TrailUp, em /pesquisa/professores.</p>
  </div>
  ${rodape(9)}
</section>

</body></html>`;
}

function htmlDoResumo(c, arte) {
  const avalia = ["Usabilidade", "Carga de trabalho", "Métricas do console", "Material personalizado", "Tela do aluno", "Utilidade", "Esforço e rotina"];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">${FONTES}<style>
${CSS_BASE}
body { width: 1080px; height: 1350px; position: relative; overflow: hidden; }
.fundo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.veu { position: absolute; inset: 0; background: linear-gradient(180deg, hsl(264 43% 10% / .45) 0%, hsl(264 43% 10% / .82) 30%, hsl(264 43% 10% / .97) 55%); }
.c { position: absolute; inset: 64px 72px; display: flex; flex-direction: column; }
.marca { display: flex; align-items: center; gap: 14px; font-family: Georgia, serif; font-size: 34px; font-weight: 700; margin-bottom: 70px; }
.marca img { width: 46px; height: 46px; }
.eyebrow { font-size: 20px; }
h1 { font-size: 84px; line-height: 1.05; margin: 14px 0 22px; color: #fff4ff; }
.sub { font-size: 28px; color: hsl(280 50% 92%); line-height: 1.4; margin-bottom: 44px; }
.etapas { display: flex; gap: 16px; margin-bottom: 40px; }
.etapa { flex: 1; background: hsl(268 29% 14% / .9); border: 1px solid var(--border); border-radius: 18px; padding: 22px; }
.etapa b { font-family: "Cinzel", serif; color: var(--primary-light); font-size: 26px; display: block; margin-bottom: 8px; }
.etapa span { font-size: 20px; color: var(--muted-fg); line-height: 1.4; }
h2 { font-size: 34px; margin-bottom: 18px; color: var(--fg); }
.chips { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 40px; }
.chip { font-size: 22px; padding: 10px 20px; border-radius: 999px; border: 1px solid hsl(270 57% 73% / .6); background: hsl(270 57% 73% / .14); color: var(--fg); }
.destaque { border: 1px solid hsl(12 100% 80% / .6); background: hsl(12 100% 80% / .1); border-radius: 18px; padding: 24px 28px; margin-bottom: auto; }
.destaque b { font-family: Georgia, serif; font-size: 30px; color: var(--coral); display: block; margin-bottom: 8px; font-weight: 400; }
.destaque span { font-size: 21px; color: var(--fg); line-height: 1.45; }
.rodape { display: flex; justify-content: space-between; font-size: 19px; color: var(--muted-fg); border-top: 1px solid var(--border); padding-top: 20px; }
</style></head><body>
<img class="fundo" src="${arte.floresta}" alt=""><div class="veu"></div>
<div class="c">
  <div class="marca"><img src="${arte.estrela}" alt="">TrailUp</div>
  <p class="eyebrow">Pesquisa com professores e pedagogos</p>
  <h1>Avalie o TrailUp</h1>
  <p class="sub">Mais ou menos uma hora. Você usa o sistema numa turma de demonstração e conta, por escrito, o que deu certo e o que não deu.</p>
  <div class="etapas">
    <div class="etapa"><b>1. Inscrição</b><span>Termo e identificação. O e-mail vira o seu login.</span></div>
    <div class="etapa"><b>2. Acesso</b><span>Senha aleatória enviada só ao seu e-mail.</span></div>
    <div class="etapa"><b>3. Avaliação</b><span>${c.TAREFAS.length} tarefas e os blocos de perguntas.</span></div>
  </div>
  <h2>O que você avalia</h2>
  <div class="chips">${avalia.map(a => `<span class="chip">${a}</span>`).join("")}</div>
  <div class="destaque"><b>Resultado negativo também é resultado</b><span>Uma tarefa difícil ou uma métrica confusa é exatamente o que a pesquisa precisa encontrar. Crítica franca ajuda; nota por gentileza atrapalha.</span></div>
  <div class="rodape"><span>Cartilha completa: site do TrailUp · /pesquisa/professores</span><span>TCC · Ciência da Computação · Ulbra Palmas</span></div>
</div>
</body></html>`;
}

async function main() {
  const c = await carregarConteudo();
  const arte = {
    floresta: await dataUri("src/assets/design/journey-forest.webp", "image/webp"),
    estrela: await dataUri("src/assets/design/trailup-star.png", "image/png"),
    mapa: await dataUri("src/assets/design/object-map.png", "image/png"),
    bussola: await dataUri("src/assets/design/object-compass.png", "image/png"),
    livro: await dataUri("src/assets/design/object-book.png", "image/png"),
    chave: await dataUri("src/assets/design/object-chest.png", "image/png"),
    bau: await dataUri("src/assets/design/object-trophy.png", "image/png"),
  };
  await mkdir(SAIDA, { recursive: true });

  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
    await pagina.setContent(htmlDaCartilha(c, arte), { waitUntil: "networkidle" });
    await pagina.evaluate(() => document.fonts.ready);
    await pagina.pdf({ path: join(SAIDA, "cartilha-pesquisa-professores.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });

    const transbordos = await pagina.$$eval(".page", paginas =>
      paginas.flatMap((p, i) => {
        const limite = p.getBoundingClientRect().bottom - 30;
        const pe = p.querySelector("footer");
        const ultimo = [...p.children].filter(e => e !== pe && getComputedStyle(e).position !== "absolute").pop();
        return ultimo && ultimo.getBoundingClientRect().bottom > limite ? [i + 1] : [];
      }),
    );
    const paginas = await pagina.$$(".page");
    for (let i = 0; i < paginas.length; i++) {
      await paginas[i].screenshot({ path: join(SAIDA, `pagina-${i + 1}.png`) });
    }

    const resumo = await navegador.newPage({ viewport: { width: 1080, height: 1350 } });
    await resumo.setContent(htmlDoResumo(c, arte), { waitUntil: "networkidle" });
    await resumo.evaluate(() => document.fonts.ready);
    await resumo.screenshot({ path: join(SAIDA, "resumo-pesquisa-professores.png") });

    console.log(`Gerado em ${SAIDA}: PDF com ${paginas.length} páginas, ${paginas.length} PNGs de página e o resumo.`);
    if (transbordos.length) {
      console.error(`ATENÇÃO: conteúdo passou do rodapé nas páginas ${transbordos.join(", ")}.`);
      process.exitCode = 1;
    }
  } finally {
    await navegador.close();
  }
}

await main();
