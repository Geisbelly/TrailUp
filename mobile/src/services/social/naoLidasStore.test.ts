import assert from "node:assert/strict";
import { test } from "node:test";
import { SEM_NAO_LIDAS, agruparNaoLidas, type NaoLidas } from "./chatNaoLidasModel";
import { criarLojaDeNaoLidas } from "./naoLidasStore";

const DUAS = agruparNaoLidas([
  { tipo: "privado", conversa_id: "b", nao_lidas: 2 },
  { tipo: "guilda", conversa_id: "g", nao_lidas: 1 },
]);

function adiado<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((r) => { resolver = r; });
  return { promessa, resolver };
}

test("lê, avisa quem assina e zera a conversa aberta", async () => {
  const marcadas: string[] = [];
  const loja = criarLojaDeNaoLidas(async () => DUAS, async (tipo, id) => { marcadas.push(`${tipo}:${id}`); });
  let avisos = 0;
  const sair = loja.assinar(() => { avisos += 1; });
  await loja.atualizar();
  assert.equal(loja.atual().total, 3);
  loja.marcarLida("privado", "b");
  assert.deepEqual(loja.atual(), { privado: {}, guilda: { g: 1 }, total: 1 });
  assert.deepEqual(marcadas, ["privado:b"]);
  assert.equal(avisos, 2);
  sair();
  loja.limpar();
  assert.equal(avisos, 2);
  assert.equal(loja.atual(), SEM_NAO_LIDAS);
});

test("leitura que saiu antes de marcar como lida não devolve o número apagado", async () => {
  const leitura = adiado<NaoLidas>();
  const loja = criarLojaDeNaoLidas(() => leitura.promessa, async () => {});
  const emCurso = loja.atualizar();
  loja.marcarLida("privado", "b");
  leitura.resolver(DUAS);
  await emCurso;
  assert.equal(loja.atual(), SEM_NAO_LIDAS);
});

test("leitura que saiu enquanto a marca ia ao banco também é descartada", async () => {
  const marca = adiado<void>();
  const leitura = adiado<NaoLidas>();
  let carregar: () => Promise<NaoLidas> = async () => DUAS;
  const loja = criarLojaDeNaoLidas(() => carregar(), () => marca.promessa);
  await loja.atualizar();
  loja.marcarLida("privado", "b");
  carregar = () => leitura.promessa;
  const emCurso = loja.atualizar();
  marca.resolver();
  await marca.promessa;
  leitura.resolver(DUAS);
  await emCurso;
  assert.deepEqual(loja.atual(), { privado: {}, guilda: { g: 1 }, total: 1 });
  carregar = async () => SEM_NAO_LIDAS;
  await loja.atualizar();
  assert.equal(loja.atual(), SEM_NAO_LIDAS);
});

test("sair da conta apaga o número e descarta a leitura em curso", async () => {
  const leitura = adiado<NaoLidas>();
  const loja = criarLojaDeNaoLidas(() => leitura.promessa, async () => {});
  const emCurso = loja.atualizar();
  loja.limpar();
  leitura.resolver(DUAS);
  await emCurso;
  assert.equal(loja.atual(), SEM_NAO_LIDAS);
});
