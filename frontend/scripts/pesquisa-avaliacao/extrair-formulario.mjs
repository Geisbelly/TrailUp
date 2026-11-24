// Gera src/features/pesquisa/formularioDeAvaliacao.gerado.ts a partir do formulário de avaliação
// PUBLICADO no Google Forms: páginas, perguntas, `entry.*`, opções e rótulos das escalas, como o
// Google os serve na página de resposta (FB_PUBLIC_LOAD_DATA_).
//
// A página do console desenha o formulário a partir desse espelho e manda as respostas para o
// mesmo `formResponse`. Recriou o formulário (Code.gs → criarFormulario)? Os `entry.*` mudam: rode
// de novo, na pasta frontend:
//   node scripts/pesquisa-avaliacao/extrair-formulario.mjs <link de resposta do formulário>
// O teste (formularioDeAvaliacao.test.ts) confere o espelho contra o Code.gs e a cartilha.

import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SAIDA = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/features/pesquisa/formularioDeAvaliacao.gerado.ts");
const TIPOS = { 0: "texto", 1: "paragrafo", 2: "escolha", 4: "caixas", 5: "escala", 6: "aviso", 7: "grade", 8: "pagina" };

const link = process.argv[2];
const id = /\/forms\/d\/e\/([A-Za-z0-9_-]+)\//.exec(link ?? "")?.[1];
if (!id) {
  console.error("Uso: node scripts/pesquisa-avaliacao/extrair-formulario.mjs https://docs.google.com/forms/d/e/<id>/viewform");
  process.exit(2);
}

const html = await (await fetch(`https://docs.google.com/forms/d/e/${id}/viewform`)).text();
const bruto = /FB_PUBLIC_LOAD_DATA_ = (.*?);<\/script>/s.exec(html)?.[1];
if (!bruto) throw new Error("FB_PUBLIC_LOAD_DATA_ não encontrado: o formulário pede login ou não está aceitando respostas.");
const dados = JSON.parse(bruto);

// Mesmo título de CAMPO_CODIGO_DO_SITE no Code.gs: a página preenche e não mostra.
const CAMPO_CODIGO_DO_SITE = "Código do site (preenchido automaticamente)";

const paginas = [{ titulo: "", ajuda: "", itens: [] }];
let codigoDoSite = null;
for (const item of dados[1][1]) {
  const [, titulo, ajuda, codigo, partes] = item;
  if (titulo === CAMPO_CODIGO_DO_SITE) {
    codigoDoSite = `entry.${partes[0][0]}`;
    continue;
  }
  const tipo = TIPOS[codigo];
  if (!tipo) throw new Error(`Tipo de pergunta ${codigo} não suportado: ${titulo}`);
  const base = { titulo: titulo ?? "", ajuda: ajuda ?? "" };
  if (tipo === "pagina") {
    paginas.push({ ...base, itens: [] });
    continue;
  }
  const atual = paginas[paginas.length - 1].itens;
  const p = partes?.[0];
  if (tipo === "aviso") atual.push({ tipo, ...base });
  else if (tipo === "texto") atual.push({ tipo, ...base, entry: `entry.${p[0]}`, email: JSON.stringify(p[4] ?? null).includes("[2,102]") });
  else if (tipo === "paragrafo") atual.push({ tipo, ...base, entry: `entry.${p[0]}` });
  else if (tipo === "escolha" || tipo === "caixas")
    atual.push({ tipo, ...base, entry: `entry.${p[0]}`, opcoes: p[1].map(o => o[0]) });
  else if (tipo === "escala")
    atual.push({ tipo, ...base, entry: `entry.${p[0]}`, valores: p[1].map(o => o[0]), rotulos: [p[3][0], p[3][1]] });
  else if (tipo === "grade")
    atual.push({
      tipo,
      ...base,
      multipla: JSON.stringify(p[11] ?? null) === "[1]",
      colunas: p[1].map(o => o[0]),
      linhas: partes.map(l => ({ rotulo: l[3][0], entry: `entry.${l[0]}` })),
    });
}

// O id não entra no bundle (ele é público): o link sai do banco só para o avaliador aprovado.
// O espelho guarda o hash, para a aba conferir que o link do banco é este formulário.
const idSha256 = createHash("sha256").update(id).digest("hex");
const formulario = { idSha256, titulo: dados[1][8] ?? dados[3] ?? "", descricao: dados[1][0] ?? "", codigo: codigoDoSite, paginas };
const ts = `// GERADO por scripts/pesquisa-avaliacao/extrair-formulario.mjs a partir do formulário publicado.
// Não edite à mão: rode o script de novo se o formulário mudar.

import type { EspelhoDaAvaliacao } from "./formularioDeAvaliacao";

export const ESPELHO_DA_AVALIACAO: EspelhoDaAvaliacao = ${JSON.stringify(formulario, null, 2)};
`;
await writeFile(SAIDA, ts);
const perguntas = paginas.flatMap(p => p.itens).length;
console.log(`${SAIDA}: ${paginas.length} páginas, ${perguntas} perguntas, código do site ${codigoDoSite ?? "ausente"}.`);
