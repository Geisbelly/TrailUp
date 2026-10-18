import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * Assinar `postgres_changes` numa tabela não basta: ela precisa estar na
 * publicação `supabase_realtime` do Postgres.
 *
 * Fora da publicação, a mudança não vai para o WAL lógico do Realtime. O canal
 * assina, o `.subscribe()` não reclama, e evento nenhum chega — nunca. Não é
 * lentidão nem corrida: é silêncio permanente, e nada no cliente avisa.
 *
 * Foi o que aconteceu com seis das oito tabelas assinadas (verificado no banco
 * de produção em 2026-10-06: a publicação tinha 9 tabelas e nenhuma delas era
 * `topico_aluno`, `conteudo_aluno`, `atividade_aluno`, `eventos_aluno`,
 * `conteudo_personalizado` ou `classe_mapa_tema`). O sintoma mais visível era
 * o `PortoesContext`: as duas assinaturas dele estavam mortas, e o portão só
 * abria quando o aluno saía do app e voltava, pelo `AppState`.
 *
 * Este teste não enxerga o banco. Ele congela a lista do que o código assina,
 * para que assinar uma tabela nova quebre aqui e force a migração junto —
 * `api/alembic/versions/20261003_04_realtime_das_tabelas_assinadas.py`.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Tabelas na publicação `supabase_realtime`. Mudar aqui pede migração. */
const NA_PUBLICACAO = new Set([
  // já estavam antes de 20261003_04
  "classe_aluno",
  "notificacoes",
  // entraram em 20261003_04
  "atividade_aluno",
  "classe_mapa_tema",
  "conteudo_aluno",
  "conteudo_personalizado",
  "eventos_aluno",
  "topico_aluno",
]);

function arquivosFonte(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosFonte(caminho);
    return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

/** Tabelas que aparecem num bloco de assinatura `postgres_changes`. */
function tabelasAssinadas(): Map<string, string[]> {
  const encontradas = new Map<string, string[]>();
  for (const caminho of arquivosFonte(SRC)) {
    const fonte = readFileSync(caminho, "utf8");
    // cada `postgres_changes` é seguido, no mesmo objeto de config, por um
    // `table: "<nome>"`. Pega o primeiro `table:` depois de cada ocorrência.
    for (const trecho of fonte.split(/["']postgres_changes["']/).slice(1)) {
      const casamento = trecho.match(/table:\s*["'`]([a-z_]+)["'`]/);
      if (!casamento) continue;
      const tabela = casamento[1];
      const onde = relative(SRC, caminho);
      encontradas.set(tabela, [...(encontradas.get(tabela) ?? []), onde]);
    }
  }
  return encontradas;
}

test("toda tabela assinada por Realtime esta na publicacao", () => {
  const assinadas = tabelasAssinadas();
  assert.ok(assinadas.size > 0, "nenhuma assinatura encontrada — o parser quebrou?");

  const fora = [...assinadas.entries()].filter(([tabela]) => !NA_PUBLICACAO.has(tabela));
  assert.deepEqual(
    fora,
    [],
    `tabela assinada fora da publicacao supabase_realtime — nenhum evento vai chegar.\n` +
      fora.map(([t, onde]) => `  ${t} (em ${onde.join(", ")})`).join("\n") +
      `\nAdicione-a numa migracao, como 20261003_04_realtime_das_tabelas_assinadas.py.`
  );
});

test("a lista da publicacao nao acumula tabela que ninguem assina", () => {
  const assinadas = new Set(tabelasAssinadas().keys());
  const orfas = [...NA_PUBLICACAO].filter((t) => !assinadas.has(t));
  assert.deepEqual(
    orfas,
    [],
    `na lista da publicacao mas sem assinante no codigo: ${orfas.join(", ")}.\n` +
      `Ou a assinatura foi removida (ai remova da publicacao tambem, o WAL ` +
      `continua sendo escrito de graca), ou o nome esta errado aqui.`
  );
});
