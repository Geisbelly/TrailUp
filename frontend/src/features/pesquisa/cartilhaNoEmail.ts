// A cartilha no corpo do e-mail de acesso, no lugar do PDF anexo.
//
// Sai das mesmas constantes da página /pesquisa/professores, então o e-mail não diverge do site.
// O Apps Script não importa TypeScript: scripts/cartilha-pesquisa/gerar-email.mjs grava o resultado
// em scripts/apps-script-formulario-professores/CartilhaNoEmail.gs, e o teste confere que o .gs
// está em dia. Mudou um texto da cartilha? Rode o gerador e cole o .gs no projeto do Apps Script.
//
// HTML de e-mail: tabelas e estilo inline, sem CSS externo, sem imagem obrigatória. As cores e as
// fontes ficam como marcadores @@chave@@ e o Apps Script troca pelo PLANILHA_TEMA na hora de enviar;
// @@link_cartilha@@ vira o link da cartilha.

import { EVITE, FACA, FRANQUEZA, PASSOS, PERGUNTAS_FREQUENTES, RESUMO, TAREFAS, TEMPO_ESTIMADO } from "./pesquisaProfessores";

/** Os marcadores que o Apps Script precisa preencher. O teste confere que o .gs conhece todos. */
export const MARCADORES_DA_CARTILHA = [
  "fundo",
  "cartao",
  "borda",
  "texto",
  "textoSuave",
  "primaria",
  "destaque",
  "destaqueTexto",
  "fonteTexto",
  "fonteTitulo",
  "link_cartilha",
] as const;

const m = (chave: (typeof MARCADORES_DA_CARTILHA)[number]) => `@@${chave}@@`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const P = `margin:0 0 12px;font-family:${m("fonteTexto")};font-size:14px;line-height:1.6;color:${m("textoSuave")};`;
const H2 = `margin:0 0 6px;font-family:${m("fonteTitulo")};font-size:18px;line-height:1.35;color:${m("primaria")};text-align:center;`;
const SUB = `margin:0 0 18px;font-family:${m("fonteTexto")};font-size:13px;line-height:1.5;color:${m("textoSuave")};text-align:center;`;
const H3 = `margin:0 0 6px;font-family:${m("fonteTexto")};font-size:15px;font-weight:700;line-height:1.4;color:${m("texto")};`;
const CARTAO = `background:${m("cartao")};border:1px solid ${m("borda")};border-radius:12px;`;

function cartao(conteudo: string, espaco = "16px 18px") {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;"><tr><td style="${CARTAO}padding:${espaco};">${conteudo}</td></tr></table>`;
}

function secao(titulo: string, subtitulo: string, conteudo: string) {
  return (
    `<tr><td style="padding:28px 0 0;">` +
    `<h2 style="${H2}">${esc(titulo)}</h2>` +
    (subtitulo ? `<p style="${SUB}">${esc(subtitulo)}</p>` : `<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>`) +
    conteudo +
    `</td></tr>`
  );
}

function lista(itens: readonly string[]) {
  return itens
    .map(
      item =>
        `<p style="${P}margin:0 0 8px;padding-left:16px;text-indent:-16px;"><span style="color:${m("primaria")};">&#9670;</span>&nbsp; ${esc(item)}</p>`,
    )
    .join("");
}

function numero(n: number | string) {
  return `<td width="36" valign="top" style="padding:0 12px 0 0;"><div style="width:30px;height:30px;line-height:30px;border-radius:15px;text-align:center;background:${m("primaria")};color:${m("fundo")};font-family:${m("fonteTexto")};font-size:13px;font-weight:700;">${esc(String(n))}</div></td>`;
}

/** O bloco da cartilha, para ir abaixo do cartão do e-mail de acesso, na mesma coluna de 560 px. */
export function cartilhaNoEmailHtml(): string {
  const abertura =
    `<tr><td style="padding:36px 0 0;">` +
    `<div style="height:1px;line-height:1px;font-size:0;background:${m("borda")};">&nbsp;</div>` +
    `<p style="margin:28px 0 6px;font-family:${m("fonteTexto")};font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${m("primaria")};text-align:center;">Cartilha do professor</p>` +
    `<h2 style="${H2}font-size:22px;color:${m("texto")};">Como vai ser a avaliação</h2>` +
    `<p style="${SUB}">${esc(TEMPO_ESTIMADO)}</p>` +
    `</td></tr>`;

  const resumo = secao(
    "Em resumo",
    "",
    RESUMO.map(r => cartao(`<h3 style="${H3}">${esc(r.titulo)}</h3><p style="${P}margin:0;">${esc(r.texto)}</p>`)).join(""),
  );

  const franqueza =
    `<tr><td style="padding:18px 0 0;">` +
    cartao(
      `<h3 style="${H3}color:${m("primaria")};text-align:center;">Resultado negativo também é resultado</h3><p style="${P}margin:0;text-align:center;color:${m("texto")};">${esc(FRANQUEZA)}</p>`,
      "18px 20px",
    ) +
    `</td></tr>`;

  const passos = secao(
    "Do convite ao envio",
    "",
    PASSOS.map((p, i) =>
      cartao(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${numero(i + 1)}<td valign="top"><h3 style="${H3}">${esc(p.titulo)}</h3><p style="${P}margin:0;">${esc(p.texto)}</p></td></tr></table>`,
      ),
    ).join(""),
  );

  const roteiro = secao(
    `${TAREFAS.length} tarefas curtas`,
    "Faça cada tarefa no sistema e volte ao formulário. Cada uma tem quatro perguntas rápidas.",
    TAREFAS.map(t =>
      cartao(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${numero(t.id)}<td valign="top">` +
          `<h3 style="${H3}">${esc(t.titulo)}${t.onde === "aluno" ? ` <span style="font-weight:400;color:${m("destaque")};">(como aluno)</span>` : ""}</h3>` +
          lista(t.passos) +
          `<p style="${P}margin:0;font-size:13px;"><strong style="color:${m("texto")};">Repare:</strong> ${esc(t.observar)}</p>` +
          `</td></tr></table>`,
      ),
    ).join(""),
  );

  const cuidados = secao(
    "Faça e evite",
    "",
    cartao(`<h3 style="${H3}color:${m("destaque")};">Faça</h3>${lista(FACA)}`) +
      cartao(`<h3 style="${H3}color:${m("primaria")};">Evite</h3>${lista(EVITE)}`),
  );

  const perguntas = secao(
    "Perguntas frequentes",
    "",
    PERGUNTAS_FREQUENTES.map(f => cartao(`<h3 style="${H3}">${esc(f.pergunta)}</h3><p style="${P}margin:0;">${esc(f.resposta)}</p>`)).join(""),
  );

  const fecho =
    `<tr><td align="center" style="padding:24px 0 0;">` +
    `<p style="${SUB}margin:0 0 14px;">Os vídeos, as escalas usadas e o termo completo ficam na cartilha do site.</p>` +
    `<a href="${m("link_cartilha")}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:${m("destaque")};color:${m("destaqueTexto")};font-family:${m("fonteTexto")};font-size:15px;font-weight:700;text-decoration:none;">Abrir a cartilha no site</a>` +
    `</td></tr>`;

  return abertura + resumo + franqueza + passos + roteiro + cuidados + perguntas + fecho;
}

/** A mesma cartilha em texto puro, para o corpo sem HTML. */
export function cartilhaNoEmailTexto(): string {
  const linha = "-".repeat(40);
  const blocos = [
    `${linha}\nCARTILHA DO PROFESSOR: COMO VAI SER A AVALIAÇÃO\n${linha}`,
    TEMPO_ESTIMADO,
    RESUMO.map(r => `${r.titulo}\n${r.texto}`).join("\n\n"),
    `Resultado negativo também é resultado\n${FRANQUEZA}`,
    `DO CONVITE AO ENVIO\n\n${PASSOS.map((p, i) => `${i + 1}. ${p.titulo}\n${p.texto}`).join("\n\n")}`,
    `${TAREFAS.length} TAREFAS CURTAS\n\n${TAREFAS.map(
      t => `${t.id}. ${t.titulo}${t.onde === "aluno" ? " (como aluno)" : ""}\n${t.passos.map(p => `- ${p}`).join("\n")}\nRepare: ${t.observar}`,
    ).join("\n\n")}`,
    `FAÇA\n${FACA.map(f => `- ${f}`).join("\n")}\n\nEVITE\n${EVITE.map(f => `- ${f}`).join("\n")}`,
    `PERGUNTAS FREQUENTES\n\n${PERGUNTAS_FREQUENTES.map(f => `${f.pergunta}\n${f.resposta}`).join("\n\n")}`,
    `Os vídeos, as escalas usadas e o termo completo: ${m("link_cartilha")}`,
  ];
  return blocos.join("\n\n");
}

/** Conteúdo do CartilhaNoEmail.gs. Uma string JS por constante, com aspas simples escapadas. */
export function arquivoGsDaCartilha(): string {
  const literal = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
  return (
    "// GERADO por frontend/scripts/cartilha-pesquisa/gerar-email.mjs a partir da cartilha do site\n" +
    "// (frontend/src/features/pesquisa/cartilhaNoEmail.ts). Não edite à mão: rode o gerador de novo.\n" +
    "// Marcadores @@chave@@: preenchidos em cartilhaNoEmail_ (Planilha.gs).\n\n" +
    `const CARTILHA_NO_EMAIL_HTML = ${literal(cartilhaNoEmailHtml())};\n\n` +
    `const CARTILHA_NO_EMAIL_TEXTO = ${literal(cartilhaNoEmailTexto())};\n`
  );
}
