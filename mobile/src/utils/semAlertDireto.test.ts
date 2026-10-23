import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";

/**
 * `Alert.alert` não pode ser chamado direto: ele é invisível na web.
 *
 * No `react-native-web` o módulo é, inteiro:
 *
 *     class Alert { static alert() {} }
 *
 * Não faz nada e não levanta. Então um `Alert.alert` direto é um aviso que o
 * aluno da web nunca vê — e, quando é a confirmação de uma ação, o controle
 * simplesmente não funciona: "Excluir guilda" e "Excluir item" eram clique sem
 * efeito nenhum (#28).
 *
 * O caminho é `useAviso()` (`src/hooks/useAviso.ts`), que decide por
 * PLATAFORMA: diálogo do app na web, `Alert` do sistema no nativo. Duas telas
 * já desviavam à mão, mas decidindo por LARGURA de tela, o que deixava a web
 * em janela estreita sem aviso — é o erro que este guarda impede de voltar.
 */
const RAIZ = join(process.cwd(), "src");

/** O único arquivo que pode falar com o `Alert` direto é o próprio hook. */
const PERMITIDO = join("src", "hooks", "useAviso.ts");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

test("ninguem chama Alert.alert fora do useAviso", () => {
  const culpados = arquivos(RAIZ)
    .filter((c) => [".ts", ".tsx"].includes(extname(c)))
    .filter((c) => !c.endsWith(".test.ts") && !c.endsWith(".test.tsx"))
    .map((c) => relative(process.cwd(), c))
    .filter((c) => c !== PERMITIDO)
    .filter((c) => /\bAlert\s*\.\s*alert\s*\(/.test(readFileSync(c, "utf8")));

  assert.deepEqual(
    culpados,
    [],
    "Alert.alert nao aparece na web; use useAviso() em:\n  " + culpados.join("\n  ")
  );
});

test("o hook existe e e' ele que trata as duas plataformas", () => {
  const fonte = readFileSync(PERMITIDO, "utf8");
  assert.match(fonte, /Platform\.OS === "web"/, "a decisao e' de plataforma, nao de largura");
  assert.match(fonte, /Alert\.alert/, "no nativo o caminho continua sendo o Alert do sistema");
});
