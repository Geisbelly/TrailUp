import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERVALO_ENTRE_PERGUNTAS_MS,
  OCIOSIDADE_PARA_PERGUNTAR_MS,
  criarTempoCorrido,
  cronometroDeveContar,
  devePerguntarSeEstaAi,
  estaNaTrilhaDeEstudo,
} from "./presencaDeEstudo";

const CRONOMETRO_CORRENDO = {
  recursoAtivo: true,
  appEmPrimeiroPlano: true,
  telaFocada: true,
};

test("o cronômetro corre quando o aluno está diante do material", () => {
  assert.equal(cronometroDeveContar(CRONOMETRO_CORRENDO), true);
});

test("tela montada sem foco não conta tempo", () => {
  // Este é o defeito: trocar para a aba Ranking não desmonta a tela da trilha,
  // então o intervalo seguia até zerar e o diálogo abria fora do estudo.
  assert.equal(
    cronometroDeveContar({ ...CRONOMETRO_CORRENDO, telaFocada: false }),
    false
  );
});

test("app em segundo plano não conta tempo", () => {
  assert.equal(
    cronometroDeveContar({ ...CRONOMETRO_CORRENDO, appEmPrimeiroPlano: false }),
    false
  );
});

test("recurso desligado não conta tempo", () => {
  assert.equal(
    cronometroDeveContar({ ...CRONOMETRO_CORRENDO, recursoAtivo: false }),
    false
  );
});

const AGORA = 1_700_000_000_000;

const PARADO_FORA_DO_ESTUDO = {
  agoraMs: AGORA,
  ultimaInteracaoEmMs: AGORA - OCIOSIDADE_PARA_PERGUNTAR_MS,
  appEmPrimeiroPlano: true,
  estudando: false,
  dialogoAberto: false,
  perguntadoEmMs: null,
};

test("pergunta quando o app está aberto e parado fora do estudo", () => {
  assert.equal(devePerguntarSeEstaAi(PARADO_FORA_DO_ESTUDO), true);
});

test("não pergunta antes de a ociosidade completar", () => {
  assert.equal(
    devePerguntarSeEstaAi({
      ...PARADO_FORA_DO_ESTUDO,
      ultimaInteracaoEmMs: AGORA - (OCIOSIDADE_PARA_PERGUNTAR_MS - 1),
    }),
    false
  );
});

test("não pergunta com o app em segundo plano", () => {
  // Aparelho no bolso: quem fala nessa hora é a notificação.
  assert.equal(
    devePerguntarSeEstaAi({ ...PARADO_FORA_DO_ESTUDO, appEmPrimeiroPlano: false }),
    false
  );
});

test("não pergunta enquanto o aluno está no módulo", () => {
  // Dentro do módulo o tempo já tem dono: o cronômetro daquele bloco. Duas
  // mensagens sobre o mesmo silêncio viram ruído.
  assert.equal(
    devePerguntarSeEstaAi({ ...PARADO_FORA_DO_ESTUDO, estudando: true }),
    false
  );
});

test("não sobrepõe um diálogo já aberto", () => {
  // Trocar o conteúdo do diálogo apagaria a mensagem que o aluno não leu.
  assert.equal(
    devePerguntarSeEstaAi({ ...PARADO_FORA_DO_ESTUDO, dialogoAberto: true }),
    false
  );
});

test("não repete a pergunta antes do intervalo", () => {
  assert.equal(
    devePerguntarSeEstaAi({
      ...PARADO_FORA_DO_ESTUDO,
      perguntadoEmMs: AGORA - (INTERVALO_ENTRE_PERGUNTAS_MS - 1),
    }),
    false
  );
});

test("volta a perguntar depois do intervalo", () => {
  assert.equal(
    devePerguntarSeEstaAi({
      ...PARADO_FORA_DO_ESTUDO,
      perguntadoEmMs: AGORA - INTERVALO_ENTRE_PERGUNTAS_MS,
    }),
    true
  );
});

test("perguntar é mais raro que o limiar de ociosidade da telemetria", () => {
  // A telemetria usa 15s para separar tempo ativo de tempo parado. Reaproveitar
  // aquele limiar aqui abriria o diálogo em cima de quem só parou para ler.
  assert.ok(OCIOSIDADE_PARA_PERGUNTAR_MS >= 60_000);
  assert.ok(INTERVALO_ENTRE_PERGUNTAS_MS > OCIOSIDADE_PARA_PERGUNTAR_MS);
});

test("estudando é estar dentro de um módulo, não na listagem", () => {
  assert.equal(estaNaTrilhaDeEstudo(["(tabs)", "trilha", "[id]"]), true);
  assert.equal(estaNaTrilhaDeEstudo(["(tabs)", "trilha", "index"]), false);
  assert.equal(estaNaTrilhaDeEstudo(["(tabs)", "trilha", "_layout"]), false);
  assert.equal(estaNaTrilhaDeEstudo(["(tabs)", "trilha"]), false);
  assert.equal(estaNaTrilhaDeEstudo(["(tabs)", "ranking"]), false);
  assert.equal(estaNaTrilhaDeEstudo([]), false);
});

test("tela desligada nao entra no tempo do modulo, nem depois de trocar de item", () => {
  const tempo = criarTempoCorrido();
  for (let s = 0; s <= 60; s++) tempo.avancar(s * 1000);
  tempo.pausar(60_000);

  // 30 min apagada, e o aluno volta e segue para o proximo item.
  const voltou = 60_000 + 30 * 60_000;
  tempo.avancar(voltou);
  tempo.avancar(voltou + 1000);

  assert.equal(tempo.decorridoMs(), 61_000);
});

test("JS dormindo sem o AppState avisar tambem nao conta", () => {
  const tempo = criarTempoCorrido();
  tempo.avancar(0);
  tempo.avancar(1000);
  tempo.avancar(1000 + 30 * 60_000);
  tempo.avancar(2000 + 30 * 60_000);

  assert.equal(tempo.decorridoMs(), 2000);
});

test("pausar credita o trecho em andamento e zerar recomeca", () => {
  const tempo = criarTempoCorrido();
  tempo.avancar(0);
  tempo.pausar(800);
  assert.equal(tempo.decorridoMs(), 800);

  tempo.zerar();
  assert.equal(tempo.decorridoMs(), 0);
});
