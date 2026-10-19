// O `expo export` (Expo 54) calcula o hash do nome do entry-<hash>.js ANTES de
// colocar dentro dele o mapa das rotas carregadas sob demanda (async routes).
// Resultado: um deploy novo pode publicar um entry com conteúdo diferente e o
// MESMO nome. Como /aluno/_expo/* vai com cache imutável de 1 ano, o navegador
// reaproveita o entry antigo, que puxa chunks antigos (_layout-...) contra o
// __common novo, e o app quebra com "Requiring unknown module <id>".
//
// O mesmo vale para o __common-<hash>.js. Os demais chunks já têm o nome igual
// ao MD5 do conteúdo.
//
// Aqui cada <script src=".../_expo/static/js/web/<nome>-<hash>.js"> do
// index.html é conferido: se o hash do nome não bate com o MD5 do conteúdo,
// o arquivo é renomeado com o hash real e o index.html é atualizado.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCRIPT_RE = /(["'])((?:[^"']*\/)?_expo\/static\/js\/web\/)([^"'/]+)-([0-9a-f]{32})\.js\1/g;

export function hashDoConteudo(buffer) {
  return createHash("md5").update(buffer).digest("hex");
}

/**
 * @param {string} outDir pasta do export (ex.: dist/aluno)
 * @param {string[]} htmls arquivos HTML (relativos a outDir) que citam os scripts
 * @returns {{de: string, para: string}[]} arquivos renomeados
 */
export function renomearScriptsPorConteudo(outDir, htmls = ["index.html"]) {
  const jsDir = join(outDir, "_expo", "static", "js", "web");
  const renomeados = new Map();

  for (const html of htmls) {
    const htmlPath = join(outDir, html);
    if (!existsSync(htmlPath)) continue;
    const original = readFileSync(htmlPath, "utf8");
    const novo = original.replace(SCRIPT_RE, (todo, aspas, prefixo, nome, hash) => {
      const arquivo = `${nome}-${hash}.js`;
      let destino = renomeados.get(arquivo);
      if (!destino) {
        const caminho = join(jsDir, arquivo);
        if (!existsSync(caminho)) return todo;
        const real = hashDoConteudo(readFileSync(caminho));
        if (real === hash) return todo;
        destino = `${nome}-${real}.js`;
        renameSync(caminho, join(jsDir, destino));
        renomeados.set(arquivo, destino);
      }
      return `${aspas}${prefixo}${destino}${aspas}`;
    });
    if (novo !== original) writeFileSync(htmlPath, novo);
  }

  return [...renomeados].map(([de, para]) => ({ de, para }));
}
