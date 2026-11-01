import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "src", "app", "(tabs)", "perfil", "index.tsx"),
  "utf8",
);

test("Loja, Bag e Biblioteca ficam lado a lado na linha do topo do perfil compacto", () => {
  const linha = source.match(/<View style=\{styles\.acoesTopo\}>([\s\S]*?)\n {12}<\/View>\n/);
  assert.ok(linha, "linha de ações do topo não encontrada");
  const loja = linha[1].indexOf('accessibilityLabel="Abrir loja"');
  const bag = linha[1].indexOf('accessibilityLabel="Abrir minha Bag"');
  const biblioteca = linha[1].indexOf('accessibilityLabel="Biblioteca de conquistas"');
  const config = linha[1].indexOf('accessibilityLabel="Configurações"');
  assert.ok(
    loja >= 0 && bag > loja && biblioteca > bag && config > biblioteca,
    "ordem esperada: Loja, Bag, Biblioteca de conquistas, Configurações",
  );
  assert.match(
    source,
    /acoesTopo:\s*\{[\s\S]*?position:\s*"absolute"[\s\S]*?top:\s*10[\s\S]*?zIndex:\s*10[\s\S]*?flexDirection:\s*"row"/,
  );
});

test("Relatório e Sair não ficam no corpo do perfil compacto", () => {
  assert.doesNotMatch(source, /AtalhosPerfil/);
  assert.doesNotMatch(source, /sairDoAparelho/);
});
