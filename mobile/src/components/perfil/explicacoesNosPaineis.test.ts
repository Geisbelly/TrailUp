import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

// Cada número do Perfil leva a explicação certa. A chave sai de CHAVE_DO_CAMPO, nunca de uma string
// escrita à mão ao lado do rótulo temático ("Precisão", "Relíquias"): o rótulo muda por perfil, a
// métrica não.
const fonte = (...partes: string[]) => readFileSync(join(process.cwd(), "src", "components", ...partes), "utf-8");
const paineis = fonte("perfil", "ProfileMetricsViews.tsx");

function ocorrencias(src: string, tag: string): string[] {
  const trechos: string[] = [];
  for (let i = src.indexOf(tag); i !== -1; i = src.indexOf(tag, i + 1)) {
    const fim = src.indexOf("/>", i);
    trechos.push(src.slice(i, fim + 2));
  }
  return trechos;
}

// As barras de afinidade são uma lista de 7 perfis: um ícone por barra repetiria a mesma explicação
// sete vezes. Ela fica no título da seção, conferido abaixo.
const eAfinidade = (trecho: string) => trecho.includes("label={nomeDoPerfil(item.nome)}");

// Quantos de cada existem hoje: o mínimo impede o teste de passar com a busca quebrada.
const MINIMO: Record<string, number> = { "<StatTile": 25, "<ProgressLine": 8, "<KpiPill": 20 };

for (const tag of Object.keys(MINIMO)) {
  test(`todo ${tag} do Perfil traz a explicação do seu campo`, () => {
    const trechos = ocorrencias(paineis, tag).filter((t) => !eAfinidade(t));
    assert.ok(trechos.length >= MINIMO[tag], `só ${trechos.length} ${tag}`);
    const sem = trechos.filter((t) => !/explicacao=\{CHAVE_DO_CAMPO\.\w+\}/.test(t));
    assert.deepEqual(sem, []);
  });
}

test("as listas de afinidade são explicadas no título da seção", () => {
  assert.equal(ocorrencias(paineis, "<ProgressLine").filter(eAfinidade).length, 2);
  assert.equal(paineis.split("<SectionTitle explicacao={CHAVE_DO_CAMPO.afinidades}").length - 1, 2);
});

test("os gráficos da semana, do radar e da jornada têm explicação no título", () => {
  for (const chave of ["CHAVE_DO_CAMPO.semanaDiaria", "CHAVE_DO_GRAFICO.radar", "CHAVE_DO_CAMPO.concluidos", "CHAVE_DO_CAMPO.analysisSummary"]) {
    assert.ok(paineis.includes(`<SectionTitle explicacao={${chave}}`), chave);
  }
  assert.ok(paineis.includes("<ExplicacaoDaMetrica chave={CHAVE_DO_CAMPO.emotionLabel}"));
});

test("nenhum explicacao= usa string solta", () => {
  assert.doesNotMatch(paineis, /explicacao="/);
  for (const m of paineis.matchAll(/explicacao=\{([^}]+)\}/g)) {
    assert.match(m[1], /^CHAVE_DO_(CAMPO|GRAFICO)\.\w+$|^explicacao$/, m[0]);
  }
});

test("o ícone da explicação é o de informação, não o do guia da seção", () => {
  const comp = fonte("metricas", "ExplicacaoDaMetrica.tsx");
  assert.match(comp, /information-outline/);
  assert.doesNotMatch(comp, /help-circle-outline/);
  assert.match(comp, /onRequestClose/);
  assert.match(comp, /accessibilityLabel=\{rotuloAcessivel\(chave\)\}/);
});

test("faixa de XP, sequência e ranking explicam como são contados", () => {
  assert.match(fonte("perfil", "FaixaXpCartao.tsx"), /<ExplicacaoDaMetrica\s+chave="aluno\.faixa_xp"/);
  const larga = fonte("web", "AfinidadesPerfilDesktop.tsx");
  assert.match(larga, /"aluno\.sequencia"/);
  assert.match(larga, /"aluno\.ranking"/);
  assert.match(larga, /<ExplicacaoDaMetrica chave=\{chave\}/);
  const rota = (arquivo: string) => readFileSync(join(process.cwd(), "src", "app", "(tabs)", "ranking", arquivo), "utf-8");
  // No título do ranking (tela larga e rota avulsa) e, no celular, onde o título não aparece
  // (`semBarraDeVolta`), na linha com o nome do ranking. Conferido no Android: sem esta segunda,
  // o celular ficava sem explicação nenhuma.
  const vezes = (src: string) => [...src.matchAll(/<ExplicacaoDaMetrica\s+chave="aluno\.ranking"/g)].length;
  assert.equal(vezes(rota("[id].tsx")), 1);
  assert.equal(vezes(rota("index.tsx")), 1);
});

test("a explicação da faixa fica fora do bloco acessível agrupado, senão o leitor de tela não a alcança", () => {
  const faixa = fonte("perfil", "FaixaXpCartao.tsx");
  const agrupado = faixa.indexOf("accessibilityLabel={textos.acessivel}");
  const icone = faixa.indexOf("<ExplicacaoDaMetrica");
  const raiz = faixa.lastIndexOf("<View", agrupado);
  const fimDoAgrupado = faixa.indexOf("</View>\n      <ExplicacaoDaMetrica", raiz);
  assert.ok(agrupado > 0 && icone > 0 && fimDoAgrupado > 0 && icone > fimDoAgrupado);
});
