import assert from "node:assert/strict";
import test from "node:test";

/**
 * O aviso tem de sair nas DUAS plataformas.
 *
 * No `react-native-web` o `Alert` é `class Alert { static alert() {} }` — não
 * faz nada e não levanta, então todo `Alert.alert` é invisível na web. Era o
 * caso do relatório do aluno: o botão não gerava o PDF e o `catch` avisava por
 * `Alert.alert`, ou seja, falhava calado duas vezes (#28).
 *
 * Aqui o `react-native` e o diálogo do app são trocados por dublês para medir
 * só o roteamento: na web vai pelo diálogo, no nativo continua no `Alert` do
 * sistema — a tela do app que já funcionava não pode mudar.
 */

type Chamada = { onde: "dialogo" | "confirm" | "alert"; args: unknown[] };

function carregarUseAviso(plataforma: string, registro: Chamada[]) {
  const cache = require.cache as Record<string, unknown>;
  const salvos: [string, unknown][] = [];

  // Guarda o que estava no cache e devolve depois. Hoje isto nao e necessario --
  // `rodar-testes.mjs` chama `node --test` com a lista de arquivos, e o runner do
  // Node da um PROCESSO POR ARQUIVO, entao o `require.cache` nao e compartilhado
  // (medido: trocar um `react` de mentira aqui nao afeta
  // `DesbloqueioModal.icone.test.tsx` rodando na mesma chamada). E barato e vale
  // pelo dia em que alguem rodar os arquivos num processo so: um `react` falso
  // deixado no cache quebraria todo teste seguinte que renderize de verdade.
  const mock = (path: string, exports: unknown) => {
    const id = require.resolve(path);
    salvos.push([id, cache[id]]);
    cache[id] = { id: path, filename: path, loaded: true, exports };
  };

  // `useAviso` memoiza com `useCallback`; fora de um render o React real
  // levanta ("Cannot read properties of null"). O dublê devolve a função como
  // ela é, que é exatamente o que importa para medir o roteamento.
  mock("react", { useCallback: (fn: unknown) => fn });
  mock("react-native", {
    Platform: { OS: plataforma },
    Alert: { alert: (...args: unknown[]) => registro.push({ onde: "alert", args }) },
  });
  mock("@/context/DialogContext", {
    useDialog: () => ({
      showDialog: (...args: unknown[]) => registro.push({ onde: "dialogo", args }),
      showConfirm: (...args: unknown[]) => registro.push({ onde: "confirm", args }),
      hideDialog: () => undefined,
      dialogoAberto: false,
    }),
  });

  const alvo = require.resolve("./useAviso");
  salvos.push([alvo, cache[alvo]]);
  delete cache[alvo];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./useAviso").useAviso() as {
      avisar: (titulo: string, texto?: string, tone?: string) => void;
      confirmar: (opcoes: Record<string, unknown>) => void;
    };
  } finally {
    for (const [id, anterior] of salvos.reverse()) {
      if (anterior === undefined) delete cache[id];
      else cache[id] = anterior;
    }
  }
}

test("na web o aviso vai pelo dialogo do app, nunca pelo Alert", () => {
  const registro: Chamada[] = [];
  carregarUseAviso("web", registro).avisar("Erro", "Não deu", "error");

  assert.deepEqual(
    registro.map((c) => c.onde),
    ["dialogo"],
    "Alert.alert na web e' um no-op: o aluno nao veria nada"
  );
  assert.deepEqual(registro[0].args[0], {
    title: "Erro",
    description: "Não deu",
    tone: "error",
  });
});

test("no nativo o aviso continua no Alert do sistema", () => {
  const registro: Chamada[] = [];
  carregarUseAviso("ios", registro).avisar("Erro", "Não deu", "error");

  assert.deepEqual(
    registro.map((c) => c.onde),
    ["alert"],
    "a tela do app ja funcionava; o comportamento dela nao muda"
  );
  assert.deepEqual(registro[0].args, ["Erro", "Não deu"]);
});

test("confirmar na web abre o dialogo com o botao de perigo", () => {
  const registro: Chamada[] = [];
  carregarUseAviso("web", registro).confirmar({
    titulo: "Excluir guilda",
    texto: "Encerra a guilda.",
    rotuloConfirmar: "Excluir",
    destrutivo: true,
    onConfirmar: () => undefined,
  });

  assert.equal(registro[0]?.onde, "confirm", "na web o Alert com botoes nao abre nada");
  const opcoes = registro[0].args[0] as Record<string, unknown>;
  assert.equal(opcoes.confirmLabel, "Excluir");
  assert.equal(opcoes.confirmVariant, "danger");
});

test("confirmar no nativo mantem os dois botoes do Alert", () => {
  const registro: Chamada[] = [];
  let confirmou = false;
  carregarUseAviso("android", registro).confirmar({
    titulo: "Excluir guilda",
    rotuloConfirmar: "Excluir",
    destrutivo: true,
    onConfirmar: () => {
      confirmou = true;
    },
  });

  assert.equal(registro[0]?.onde, "alert");
  const botoes = registro[0].args[2] as { text: string; style?: string; onPress?: () => void }[];
  assert.deepEqual(
    botoes.map((b) => b.text),
    ["Cancelar", "Excluir"],
    "perder o Cancelar transformaria a pergunta em acao direta"
  );
  assert.equal(botoes[1].style, "destructive");
  botoes[1].onPress?.();
  assert.equal(confirmou, true, "o Excluir tem de chamar a acao");
});
