import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { EnrichedContentBlock } from "../types";
import {
  FIDELITY_GUARD_VERSION,
  guardarFidelidade,
  guardarFidelidadeDoAudio,
  type AchadoDeFidelidade,
} from "./fidelityGuard";

// Fixtures: os textos que o gemini-3.6-flash gerou no teste de 11/11 e o material de origem
// (docs/analises/2026-11-11-avaliacao-assinatura-editorial/).
const PASTA = new URL("./__fixtures__/fidelidade/", import.meta.url);
const BLOCOS: EnrichedContentBlock[] = JSON.parse(readFileSync(new URL("blocos.json", PASTA), "utf-8"));
const bloco = (id: string) => BLOCOS.find((b) => b.id === id)!;

type Capitulo = { blockId: string; markdown: string; audioScript: string };
function capitulos(nome: string): Capitulo[] {
  return JSON.parse(readFileSync(new URL(`${nome}.json`, PASTA), "utf-8")).chapters;
}
function guardarTudo(nome: string) {
  return capitulos(nome).map((ch) => ({ ch, ...guardarFidelidade(bloco(ch.blockId), ch, BLOCOS) }));
}
const todosOsAchados = (nome: string): AchadoDeFidelidade[] => guardarTudo(nome).flatMap((r) => r.achados);

const TEXTOS = ["seeker-atual", "seeker-assinatura", "survivor-atual", "survivor-assinatura", "mastermind-assinatura"];

function blocoSintetico(conteudo: string): EnrichedContentBlock {
  return {
    id: "x1", ordem: 1, tema: "Teste", topico: "Teste", objetivos: [], conteudo_base: conteudo,
    conteudo_aprofundado: "", conceitos_chave: [], exemplos_contextos: [], ponte_proximo_bloco: "", source_ids: [],
  };
}

test("a versão da barreira é fidelidade-v1", () => {
  assert.equal(FIDELITY_GUARD_VERSION, "fidelidade-v1");
});

test("cerca o código do material que o Mastermind deixou solto", () => {
  const [, b2] = guardarTudo("mastermind-assinatura");
  assert.match(b2.markdown, /```python\ndef busca_binaria\(lista, alvo\):\n[\s\S]*?return -1\n```/);
  const cercado = b2.achados.filter((a) => a.tipo === "codigo_sem_cerca");
  assert.equal(cercado.length, 1);
  assert.equal(cercado[0].acao, "cercado");
  assert.equal(cercado[0].campo, "markdown");
});

test("registra o exponencial que a fonte não diz", () => {
  for (const nome of ["mastermind-assinatura", "survivor-atual"]) {
    const exp = todosOsAchados(nome).filter((a) => a.tipo === "generalizacao_fora_da_fonte" && /exponencial/i.test(a.trecho));
    assert.ok(exp.length >= 1, `${nome} sem achado de exponencial`);
    assert.ok(exp.every((a) => a.acao === "registrado"));
  }
});

test("os itens do checklist do Survivor que citam o material ficam", () => {
  const resultado = guardarTudo("survivor-assinatura");
  const texto = resultado.map((r) => r.markdown).join("\n");
  assert.ok(texto.includes("`inicio = meio + 1`"));
  assert.ok(texto.includes("Retornar o código `-1` fora do laço"));
  assert.equal(resultado.flatMap((r) => r.achados).filter((a) => a.acao === "removido").length, 0);
});

test("o que a leitura deu como certo não vira achado", () => {
  for (const nome of TEXTOS) {
    for (const a of todosOsAchados(nome)) {
      assert.ok(!/\b37\b/.test(a.trecho) || a.tipo !== "numero_fora_da_fonte", `${nome}: ${a.trecho}`);
      if (a.tipo === "numero_fora_da_fonte") {
        assert.ok(!/^(1\.?000\.?000|1\.?024|20)$/.test(a.trecho), `${nome}: número da fonte acusado: ${a.trecho}`);
      }
    }
  }
});

test("o trecho de um achado tem no máximo 160 caracteres", () => {
  for (const nome of TEXTOS) for (const a of todosOsAchados(nome)) assert.ok(a.trecho.length <= 160);
});

test("texto sem código, número nem checklist passa intacto", () => {
  const fonte = "Na Revolução Francesa, a tomada da Bastilha marcou o início da revolta popular em Paris.";
  const capitulo = { markdown: `## A Bastilha\n\n${fonte}`, audioScript: `## A Bastilha\n\n${fonte}` };
  const r = guardarFidelidade(blocoSintetico(fonte), capitulo);
  assert.deepEqual(r.achados, []);
  assert.equal(r.markdown, capitulo.markdown);
  assert.equal(r.audioScript, capitulo.audioScript);
});

test("bloco cercado com a versão errada da refutação é registrado e fica no texto", () => {
  const md = "## Erro comum\n\nVeja o erro:\n\n```python\nwhile inicio < fim:\n    meio = (inicio + fim) // 2\n```\n";
  const r = guardarFidelidade(bloco("b2"), { markdown: md, audioScript: "" });
  const fora = r.achados.filter((a) => a.tipo === "codigo_fora_da_fonte");
  assert.equal(fora.length, 1);
  assert.equal(fora[0].acao, "registrado");
  assert.ok(r.markdown.includes("while inicio < fim:"));
});

test("o código do material dentro da cerca não vira achado", () => {
  const md = "## Código\n\n```python\ndef busca_binaria(lista, alvo):\n    inicio, fim = 0, len(lista) - 1\n    while inicio <= fim:\n        meio = (inicio + fim) // 2\n```\n";
  const r = guardarFidelidade(bloco("b2"), { markdown: md, audioScript: "" });
  assert.deepEqual(r.achados, []);
});

test("item de checklist com termo de código que o material não tem é removido", () => {
  const md = "## Checklist\n\n**Checklist:**\n- Use `bisect.bisect_left` no lugar do laço.\n- Mantenha `inicio <= fim` no laço.\n";
  const r = guardarFidelidade(bloco("b2"), { markdown: md, audioScript: "" });
  assert.ok(!r.markdown.includes("bisect"));
  assert.ok(r.markdown.includes("Mantenha `inicio <= fim` no laço."));
  const removidos = r.achados.filter((a) => a.acao === "removido");
  assert.equal(removidos.length, 1);
  assert.equal(removidos[0].tipo, "item_sem_apoio");
});

test("item de lista de tarefas sob um título de checklist também é conferido", () => {
  const md = "### CHECKLIST DE SEGURANÇA\n- [ ] Chame `lista.sort()` antes de buscar.\n- [ ] Defina `fim` em `len(lista) - 1`.\n";
  const r = guardarFidelidade(bloco("b2"), { markdown: md, audioScript: "" });
  assert.ok(!r.markdown.includes("lista.sort()"));
  assert.ok(r.markdown.includes("`len(lista) - 1`"));
});

test("número grande que a fonte não tem é registrado", () => {
  const md = "## Custo\n\nCom 4.096 elementos a busca faz 13 comparações.";
  const r = guardarFidelidade(bloco("b2"), { markdown: md, audioScript: "" });
  const num = r.achados.filter((a) => a.tipo === "numero_fora_da_fonte");
  assert.deepEqual(num.map((a) => a.trecho), ["4.096"]);
  assert.equal(r.markdown, md);
});

test("desafio sem resposta é registrado", () => {
  const md = "## Fim\n\n**Desafio:** quantas comparações para n = 1.024?\n";
  const r = guardarFidelidade(bloco("b2"), { markdown: md, audioScript: "" });
  assert.equal(r.achados.filter((a) => a.tipo === "desafio_sem_resposta").length, 1);
  const comResposta = guardarFidelidade(bloco("b2"), { markdown: md + "\n**Resposta:** no máximo 11.\n", audioScript: "" });
  assert.equal(comResposta.achados.filter((a) => a.tipo === "desafio_sem_resposta").length, 0);
});

test("no áudio só a generalização é conferida", () => {
  const audio = "Com quatro mil e noventa e seis elementos o ganho é exponencial. while inicio < fim";
  const achados = guardarFidelidadeDoAudio(bloco("b2"), audio);
  assert.ok(achados.length >= 1);
  assert.ok(achados.every((a) => a.tipo === "generalizacao_fora_da_fonte" && a.campo === "audioScript"));
});

test("item que cita código de outro bloco do mesmo tópico fica quando o material do tópico vem junto", () => {
  const md = "**Checklist:**\n- Defina `fim` em `len(lista) - 1`.\n";
  assert.ok(guardarFidelidade(bloco("b1"), { markdown: md, audioScript: "" }, BLOCOS).markdown.includes("len(lista) - 1"));
  assert.ok(!guardarFidelidade(bloco("b1"), { markdown: md, audioScript: "" }).markdown.includes("len(lista) - 1"));
});

test("estritamente só é acusado como lista estritamente ordenada", () => {
  const r = guardarFidelidade(bloco("b2"), {
    markdown: "Quando inicio fica estritamente maior que fim, o trecho está vazio. A lista precisa estar estritamente ordenada.",
    audioScript: "",
  });
  const g = r.achados.filter((a) => a.tipo === "generalizacao_fora_da_fonte");
  assert.equal(g.length, 1);
  assert.match(g[0].trecho, /estritamente ordenada/);
});

test("generalização que a própria fonte usa não é acusada", () => {
  const fonte = "Esta operação tem crescimento exponencial no número de passos.";
  const r = guardarFidelidade(blocoSintetico(fonte), { markdown: "O crescimento é exponencial.", audioScript: "" });
  assert.deepEqual(r.achados, []);
});

// Revisão final da branch: a cerca e a remoção não podem estragar texto certo.
test("ficha sem código, com dois-pontos, copiada do material não vira código", () => {
  const ficha = "Data: 7 de setembro de 1822\nLocal: margens do Ipiranga (São Paulo)\nPersonagem: D. Pedro I";
  const md = `## A Independência\n\n${ficha}\n`;
  const r = guardarFidelidade(blocoSintetico(ficha), { markdown: md, audioScript: "" });
  assert.equal(r.markdown, md);
  assert.deepEqual(r.achados, []);
});

test("tabela copiada do material não vira código", () => {
  const tabela = "| Algoritmo | Custo |\n| --- | --- |\n| Busca linear | O(n) |\n| Busca binária | O(log n) |\n| Ordenação | O(n log n) |";
  const md = `## Custos\n\n${tabela}\n`;
  const r = guardarFidelidade(blocoSintetico(tabela), { markdown: md, audioScript: "" });
  assert.equal(r.markdown, md);
});

test("título de seção nunca entra numa cerca", () => {
  const fonte = "x = ler()\n## Passo 2: (somar)\ny = somar(x)\nz = dividir(y)";
  const md = "x = ler()\n## Passo 2: (somar)\ny = somar(x)\nz = dividir(y)\n";
  const r = guardarFidelidade(blocoSintetico(fonte), { markdown: md, audioScript: "" });
  assert.ok(!/```[^`]*## Passo 2: \(somar\)[^`]*```/.test(r.markdown), r.markdown);
});

test("item com o termo do material escrito com outro espaço ou sem acento fica", () => {
  const md = "**Checklist:**\n- Mantenha `inicio<=fim`.\n- Defina `len(lista)-1`.\n- Lembre da `busca binaria`.\n";
  const r = guardarFidelidade(bloco("b2"), { markdown: md, audioScript: "" }, BLOCOS);
  assert.equal(r.achados.filter((a) => a.acao === "removido").length, 0, r.markdown);
});

test("título que só menciona checklist não liga a conferência da lista", () => {
  const md = "## Por que um checklist decorado não basta\n\n- O valor `True` não basta sozinho.\n";
  const r = guardarFidelidade(bloco("b2"), { markdown: md, audioScript: "" });
  assert.ok(r.markdown.includes("`True`"));
});
