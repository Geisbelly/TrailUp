import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: React.ReactElement) => string;
};

// O item novo do termo: o modo de cuidado (spec 2026-11-20, seção 1). Sem renderizador com
// efeitos neste ambiente: a decisão de mostrar é pura (`deveMostrarItemNovo`) e o componente é
// desenhado com `renderToString`, com o react-native trocado por elementos simples.

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};
function textoDe(no: React.ReactNode): string {
  if (no == null || typeof no === "boolean") return "";
  if (typeof no === "string" || typeof no === "number") return String(no);
  if (Array.isArray(no)) return no.map(textoDe).join("");
  if (React.isValidElement(no)) return textoDe((no.props as { children?: React.ReactNode }).children);
  return "";
}
const botoes: { rotulo: string; onPress: () => void }[] = [];
mockModule("react-native", {
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Pressable: ({ children, onPress }: { children?: React.ReactNode; onPress: () => void }) => {
    botoes.push({ rotulo: textoDe(children), onPress });
    return <button>{children}</button>;
  },
  StyleSheet: { create: (s: unknown) => s },
});
mockModule("@/styles/GlobalStyle", { FontFamily: {} });
// O serviço de verdade importa o Supabase; o componente recebe `registrar` no teste.
mockModule("@/services/consentimentoResponsavelApi", {
  registrarConsentimentoCuidado: async () => ({ ok: false, motivo: "falha", erro: "não deveria ser chamado" }),
});

const {
  ItemNovoDoTermo,
  INTRO_ITEM_CUIDADO,
  RESUMO_ITEM_CUIDADO,
  AVISO_MENOR_CUIDADO,
  SECOES_ITEM_CUIDADO,
  TITULO_ITEM_CUIDADO,
} = require("./ItemNovoDoTermo") as typeof import("./ItemNovoDoTermo");
const cuidado = require("@/services/consentimentoCuidado") as typeof import("@/services/consentimentoCuidado");
const { CONSENTIMENTO_CUIDADO_VERSAO } =
  require("@/utils/consentimentoResponsavel") as typeof import("@/utils/consentimentoResponsavel");

const palette = {
  accent: "#3a7bd5",
  background: "#ffffff",
  surfaceElevated: "#f7f9fc",
  border: "#cfd8e3",
  text: "#111111",
  textMuted: "#444444",
  textSubtle: "#666666",
} as never;

const PROIBIDAS = /ansiedade|ansios[oa]|crise/i;

const VIGENTE = CONSENTIMENTO_CUIDADO_VERSAO;
const SEM_DECISAO = { decisao: null, permitido: false };

type Chamada = { funcao: string; argumentos?: Record<string, unknown> };

/** Um cliente Supabase de mentira: `from(...)` encadeia e devolve `linha`; `rpc` devolve `rpcs`. */
function clienteFalso(opcoes: {
  linha?: { data: unknown; error: unknown };
  rpcs?: Record<string, { data: unknown; error: unknown } | Error>;
}) {
  const chamadas: Chamada[] = [];
  const consulta: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "order", "limit"]) consulta[metodo] = () => consulta;
  consulta.maybeSingle = async () => opcoes.linha ?? { data: null, error: null };
  const cliente = {
    from: (tabela: string) => {
      chamadas.push({ funcao: `from:${tabela}` });
      return consulta;
    },
    rpc: async (funcao: string, argumentos?: Record<string, unknown>) => {
      chamadas.push({ funcao, argumentos });
      const r = opcoes.rpcs?.[funcao];
      if (r instanceof Error) throw r;
      return r ?? { data: null, error: { message: "sem resposta" } };
    },
  };
  return { cliente, chamadas };
}

function renderizar(registrar: (aceito: boolean) => Promise<import("@/services/consentimentoCuidado").ResultadoDoCuidado>) {
  botoes.length = 0;
  const decididos: unknown[] = [];
  const adiados: number[] = [];
  const html = renderToString(
    <ItemNovoDoTermo
      palette={palette}
      registrar={registrar}
      onDecidido={(r) => decididos.push(r)}
      onAdiar={() => adiados.push(1)}
    />
  );
  return { html, decididos, adiados };
}

const esperar = () => new Promise((r) => setImmediate(r));

test("a versão do app é a mesma da migração", () => {
  const migracao = readFileSync(
    resolve(__dirname, "../../../../api/alembic/versions/20261120_04_consentimento_cuidado.py"),
    "utf8"
  );
  const m = /^VERSAO_CUIDADO = "([^"]+)"/m.exec(migracao);
  assert.ok(m, "VERSAO_CUIDADO não encontrada na migração");
  assert.equal(CONSENTIMENTO_CUIDADO_VERSAO, m[1]);
  assert.equal(CONSENTIMENTO_CUIDADO_VERSAO, "2026-11-20-cuid-v1");
});

test("o adulto sem decisão na versão vigente vê só o item novo, e aceitar chama a RPC com a versão", async () => {
  assert.equal(cuidado.deveMostrarItemNovo({ menor: false, leitura: SEM_DECISAO }), true);
  // Aceite de versão antiga não vale: o termo mudou.
  assert.equal(
    cuidado.deveMostrarItemNovo({
      menor: false,
      leitura: { decisao: { status: "accepted", versao: "2026-01-01-cuid-v0" }, permitido: false },
    }),
    true
  );

  // Só o item novo: nada do termo de coleta antigo aparece.
  const pedidos: boolean[] = [];
  const { html, decididos } = renderizar(async (aceito) => {
    pedidos.push(aceito);
    return { ok: true, permitido: aceito };
  });
  assert.match(html, new RegExp(TITULO_ITEM_CUIDADO));
  assert.doesNotMatch(html, /Câmera frontal|Termos de coleta/);
  assert.deepEqual(
    botoes.map((b) => b.rotulo),
    ["Não aceitar", "Aceitar", "Decidir depois"]
  );
  botoes[1].onPress();
  await esperar();
  assert.deepEqual(pedidos, [true]);
  assert.deepEqual(decididos, [{ ok: true, permitido: true }]);

  // E a RPC leva a versão vigente do app.
  const agora = new Date("2026-11-20T12:00:00Z");
  const { cliente, chamadas } = clienteFalso({
    rpcs: {
      aluno_registrar_consentimento_cuidado: {
        data: { ok: true, permitido: true, versao_vigente: VIGENTE },
        error: null,
      },
    },
  });
  const r = await cuidado.registrarConsentimentoCuidadoCom(cliente, true, agora);
  assert.deepEqual(r, { ok: true, permitido: true });
  assert.deepEqual(chamadas, [
    {
      funcao: "aluno_registrar_consentimento_cuidado",
      argumentos: {
        p_aceito: true,
        p_versao: "2026-11-20-cuid-v1",
        p_decidido_em: "2026-11-20T12:00:00.000Z",
        p_origem: { canal: "app" },
      },
    },
  ]);
});

test("recusar também é decisão, e falha ao gravar mostra o erro sem prender o aluno", async () => {
  const { decididos } = renderizar(async () => ({ ok: true, permitido: false }));
  botoes[0].onPress();
  await esperar();
  assert.deepEqual(decididos, [{ ok: true, permitido: false }]);

  const falha = renderizar(async () => ({ ok: false, motivo: "falha", erro: "sem rede" }));
  botoes[1].onPress();
  await esperar();
  assert.deepEqual(falha.decididos, []);
  // "Decidir depois" segue livre.
  botoes[2].onPress();
  assert.deepEqual(falha.adiados, [1]);

  const { cliente } = clienteFalso({ rpcs: { aluno_registrar_consentimento_cuidado: new Error("rede") } });
  const r = await cuidado.registrarConsentimentoCuidadoCom(cliente, false);
  assert.equal(r.ok, false);
});

test("decisão já tomada na versão vigente não mostra de novo", () => {
  for (const status of ["accepted", "rejected"] as const) {
    assert.equal(
      cuidado.deveMostrarItemNovo({ menor: false, leitura: { decisao: { status, versao: VIGENTE }, permitido: false } }),
      false
    );
  }
  // O menor decide em Perfil › Coleta e acessos, com o responsável; o portão não o interrompe.
  assert.equal(cuidado.deveMostrarItemNovo({ menor: true, leitura: SEM_DECISAO }), false);
  assert.equal(cuidado.deveMostrarItemNovo({ menor: null, leitura: SEM_DECISAO }), false);
});

test("leitura que falha não mostra o item", async () => {
  assert.equal(cuidado.deveMostrarItemNovo({ menor: false, leitura: null }), false);

  // Tabela ausente (migração não aplicada) ou sem permissão.
  const semTabela = clienteFalso({
    linha: { data: null, error: { code: "42P01" } },
    rpcs: { aluno_meu_cuidado_permitido: { data: false, error: null } },
  });
  assert.equal(await cuidado.lerLeituraDoCuidado(semTabela.cliente, "aluno"), null);

  // RPC ausente.
  const semRpc = clienteFalso({ linha: { data: null, error: null } });
  assert.equal(await cuidado.lerLeituraDoCuidado(semRpc.cliente, "aluno"), null);

  // Rede caiu no meio.
  const caiu = clienteFalso({ rpcs: { aluno_meu_cuidado_permitido: new Error("rede") } });
  assert.equal(await cuidado.lerLeituraDoCuidado(caiu.cliente, "aluno"), null);
  assert.equal(await cuidado.lerCuidadoPermitidoCom(caiu.cliente), false);

  // E a leitura boa lê a última decisão e a resposta do banco.
  const boa = clienteFalso({
    linha: { data: { status: "accepted", versao: VIGENTE }, error: null },
    rpcs: { aluno_meu_cuidado_permitido: { data: true, error: null } },
  });
  assert.deepEqual(await cuidado.lerLeituraDoCuidado(boa.cliente, "aluno"), {
    decisao: { status: "accepted", versao: VIGENTE },
    permitido: true,
  });
  assert.ok(boa.chamadas.some((c) => c.funcao === "from:consentimento_cuidado"));
});

test("o texto do item diz que o professor vê o que aconteceu, nunca o que o aluno escreveu", () => {
  const { html } = renderizar(async () => ({ ok: true, permitido: true }));
  assert.match(html, /professor da sua turma vê quando isso aconteceu e o que o app fez/);
  assert.match(html, /o app sugeriu uma pausa/);
  assert.match(html, /o Guia indicou o CVV 188/);
  assert.match(html, /Ele nunca vê o que você escreveu ao Guia\./);
  assert.match(html, /não viram emoção nem nota/);
  assert.match(html, /Versão (<!-- -->)?2026-11-20-cuid-v1/);

  const textos = [
    TITULO_ITEM_CUIDADO,
    INTRO_ITEM_CUIDADO,
    RESUMO_ITEM_CUIDADO,
    AVISO_MENOR_CUIDADO,
    ...SECOES_ITEM_CUIDADO.flatMap((s) => [s.titulo, s.texto]),
  ];
  for (const texto of textos) assert.doesNotMatch(texto, PROIBIDAS, texto);
  assert.doesNotMatch(html, PROIBIDAS);
  assert.match(RESUMO_ITEM_CUIDADO, /nunca o que você escreveu/);
});

test("o responsável decide só o cuidado, sem reescrever as outras finalidades", async () => {
  const agora = new Date("2026-11-20T12:00:00Z");
  const { cliente, chamadas } = clienteFalso({
    rpcs: { responsavel_registrar_cuidado: { data: { ok: true, permitido: false }, error: null } },
  });
  const r = await cuidado.registrarCuidadoDoResponsavelCom(
    cliente,
    { aceito: true, nome: "  Maria Souza ", relacao: "mae", declaracao: true },
    agora
  );
  assert.deepEqual(r, { ok: true, permitido: false });
  assert.deepEqual(chamadas, [
    {
      funcao: "responsavel_registrar_cuidado",
      argumentos: {
        p_aceito: true,
        p_nome: "Maria Souza",
        p_relacao: "mae",
        p_declaracao: true,
        p_decidido_em: "2026-11-20T12:00:00.000Z",
      },
    },
  ]);
  // Nenhum argumento de finalidades: o banco copia as que já estão lá.
  assert.ok(!("p_finalidades" in (chamadas[0].argumentos ?? {})));

  // Revogar não pede nome nem declaração.
  assert.equal(cuidado.cuidadoDoResponsavelValido({ aceito: false, nome: "", relacao: null, declaracao: false }), null);
  assert.deepEqual(
    cuidado.argumentosCuidadoDoResponsavel({ aceito: false, nome: "x", relacao: "pai", declaracao: true }, agora),
    { p_aceito: false, p_nome: null, p_relacao: null, p_declaracao: false, p_decidido_em: "2026-11-20T12:00:00.000Z" }
  );
  assert.ok(cuidado.cuidadoDoResponsavelValido({ aceito: true, nome: "Jo", relacao: "mae", declaracao: true }));

  // Sem autorização geral vigente, o banco recusa com motivo, e a tela explica.
  const sem = clienteFalso({
    rpcs: { responsavel_registrar_cuidado: { data: { ok: false, motivo: "sem_aceite_do_responsavel" }, error: null } },
  });
  const recusa = await cuidado.registrarCuidadoDoResponsavelCom(sem.cliente, {
    aceito: true,
    nome: "Maria Souza",
    relacao: "mae",
    declaracao: true,
  });
  assert.deepEqual(recusa, {
    ok: false,
    motivo: "sem_aceite_do_responsavel",
    erro: cuidado.ERRO_SEM_ACEITE_DO_RESPONSAVEL,
  });
});

test("no Perfil, o menor vê que precisa do responsável", () => {
  const aceitou = { decisao: { status: "accepted" as const, versao: VIGENTE }, permitido: false };
  const adulto = cuidado.situacaoDoCuidadoNoPerfil({
    menor: false,
    leitura: { ...aceitou, permitido: true },
    responsavelComAutorizacaoGeral: false,
    responsavelAutorizouCuidado: false,
  });
  assert.deepEqual(adulto, { ligado: true, nota: null, telaDoResponsavel: null });

  const semGeral = cuidado.situacaoDoCuidadoNoPerfil({
    menor: true,
    leitura: aceitou,
    responsavelComAutorizacaoGeral: false,
    responsavelAutorizouCuidado: false,
  });
  assert.equal(semGeral.ligado, true);
  assert.equal(semGeral.telaDoResponsavel, "completa");
  assert.match(semGeral.nota ?? "", /Precisa do seu responsável/);

  const comGeral = cuidado.situacaoDoCuidadoNoPerfil({
    menor: true,
    leitura: SEM_DECISAO,
    responsavelComAutorizacaoGeral: true,
    responsavelAutorizouCuidado: false,
  });
  assert.equal(comGeral.ligado, false);
  assert.equal(comGeral.telaDoResponsavel, "item_novo");
  assert.match(comGeral.nota ?? "", /Precisa do seu responsável/);

  const valendo = cuidado.situacaoDoCuidadoNoPerfil({
    menor: true,
    leitura: { ...aceitou, permitido: true },
    responsavelComAutorizacaoGeral: true,
    responsavelAutorizouCuidado: true,
  });
  assert.match(valendo.nota ?? "", /está valendo/);

  const faltaOAluno = cuidado.situacaoDoCuidadoNoPerfil({
    menor: true,
    leitura: SEM_DECISAO,
    responsavelComAutorizacaoGeral: true,
    responsavelAutorizouCuidado: true,
  });
  assert.match(faltaOAluno.nota ?? "", /Falta você ligar aqui/);

  for (const s of [semGeral, comGeral, valendo, faltaOAluno]) assert.doesNotMatch(s.nota ?? "", PROIBIDAS);
});
