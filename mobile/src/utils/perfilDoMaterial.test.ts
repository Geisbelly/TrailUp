import assert from "node:assert/strict";
import test from "node:test";

import {
  PERFIL_PADRAO,
  normalizarPerfilBrainHex,
  perfilDoCard,
  perfilDoRegistro,
  perfilNoCaminhoDeStorage,
} from "./perfilDoMaterial";

test("a COLUNA vence o plano quando os dois existem e discordam", () => {
  // A coluna e a chave do unique `(aluno, topico, perfil)`; o `plano` e um
  // JSONB que o gerador preenche. Quando divergem, quem manda e' a coluna.
  const perfil = perfilDoRegistro({
    brainhex_profile_key: "seeker",
    plano: { brainhex_profile_key: "mastermind" },
  });

  assert.equal(perfil, "seeker");
});

test("linha com a coluna e SEM chave no plano nao cai no default", () => {
  // Este caso existe na base: id 3608, `pronto`, coluna `mastermind`, `plano`
  // sem `brainhex_profile_key` nem `perfil_dominante`. Enquanto a coluna ficou
  // fora do SELECT, o unico elo que restava era o default.
  assert.equal(perfilDoRegistro({ brainhex_profile_key: "mastermind", plano: {} }), "mastermind");
  assert.equal(perfilDoRegistro({ brainhex_profile_key: "seeker", plano: {} }), "seeker");
});

test("sem coluna, a cadeia de reserva do plano continua valendo", () => {
  assert.equal(perfilDoRegistro({ plano: { brainhex_profile_key: "conqueror" } }), "conqueror");
  assert.equal(perfilDoRegistro({ plano: { perfil_dominante: "socializer" } }), "socializer");
  assert.equal(
    perfilDoRegistro({
      plano: { editorial_metadata: { perfil_editorial: { perfil_dominante: "achiever" } } },
    }),
    "achiever"
  );
  assert.equal(
    perfilDoRegistro({
      plano: {
        editorial_metadata: {
          modelo_editorial: { personalizacao_brainhex: { perfil_dominante: "survivor" } },
        },
      },
    }),
    "survivor"
  );
});

test("a ultima reserva e o caminho do Storage dentro de materiais", () => {
  const perfil = perfilDoRegistro({
    materiais: { markdown: { url: "https://x/storage/brainhex/daredevil/arquivo.md" } },
  });
  assert.equal(perfil, "daredevil");
});

test("O DEFAULT E A ARMADILHA: registro sem origem nenhuma vira mastermind", () => {
  // Nao e' `null` nem erro. Uma linha que perca a origem do perfil some para o
  // dono dela e aparece para um mastermind que nao a pediu -- calada.
  assert.equal(perfilDoRegistro({}), PERFIL_PADRAO);
  assert.equal(perfilDoRegistro({ plano: {}, materiais: {} }), PERFIL_PADRAO);
  assert.equal(perfilDoRegistro(null), PERFIL_PADRAO);
  assert.equal(PERFIL_PADRAO, "mastermind");
});

test("aliases em portugues e acento resolvem para a chave canonica", () => {
  assert.equal(normalizarPerfilBrainHex("Estrategista"), "mastermind");
  assert.equal(normalizarPerfilBrainHex("  SOCIALIZADOR  "), "socializer");
  assert.equal(normalizarPerfilBrainHex("aventureiro"), "daredevil");
  assert.equal(normalizarPerfilBrainHex("Explorador"), "seeker");
});

test("caminho de Storage codificado em URL continua sendo lido", () => {
  assert.equal(
    perfilNoCaminhoDeStorage("https://x/storage/brainhex%2Fconqueror%2Fparte.md"),
    "conqueror"
  );
  assert.equal(perfilNoCaminhoDeStorage("https://x/sem/perfil/aqui.md"), null);
  assert.equal(perfilNoCaminhoDeStorage(42), null);
});

test("card tira o perfil do metadata, e tambem tem o default", () => {
  assert.equal(perfilDoCard({ metadata: { brainhex_profile_key: "seeker" } }), "seeker");
  assert.equal(perfilDoCard({ metadata: { perfil_dominante: "conqueror" } }), "conqueror");
  assert.equal(perfilDoCard({ metadata: {} }), PERFIL_PADRAO);
});
