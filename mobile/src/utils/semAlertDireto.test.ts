import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";

/**
 * `Alert.alert` não pode ser usado: ele é invisível na web e cru no aparelho.
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
 * No aparelho ele é a caixa crua do sistema, sem a identidade do perfil. O caminho
 * é `useAviso()` (`src/hooks/useAviso.ts`), que usa o diálogo do app nas duas
 * plataformas.
 */
const RAIZ = join(process.cwd(), "src");

/** O hook de avisos: ele também não fala com o `Alert`. */
const HOOK = join("src", "hooks", "useAviso.ts");

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
    .filter((c) => /\bAlert\s*\.\s*alert\s*\(/.test(readFileSync(c, "utf8")));

  assert.deepEqual(
    culpados,
    [],
    "Alert.alert e a caixa crua do aparelho e nao aparece na web; use useAviso() em:\n  " + culpados.join("\n  ")
  );
});

test("o hook usa so o dialogo do app, nas duas plataformas", () => {
  const fonte = readFileSync(HOOK, "utf8");
  assert.doesNotMatch(fonte, /Platform/, "a decisao nao depende de plataforma");
  assert.doesNotMatch(fonte, /from "react-native"/, "o Alert do sistema nao entra aqui");
  assert.match(fonte, /showDialog/);
  assert.match(fonte, /showConfirm/);
});
