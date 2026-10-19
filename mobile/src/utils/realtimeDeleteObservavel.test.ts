import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Assinar `postgres_changes` com `event: '*'` e filtro numa coluna que NAO e a
 * replica identity faz o DELETE nunca chegar -- em silencio. O canal assina,
 * `.subscribe()` devolve SUBSCRIBED, e evento nenhum vem.
 *
 * Com `REPLICA IDENTITY DEFAULT` (o padrao), o old record de um DELETE carrega
 * so a chave primaria. Um filtro por `aluno_id` nao tem o que casar.
 *
 * `20261018_10` liga `REPLICA IDENTITY FULL` nas tabelas em que essa perda e
 * observavel. Este teste existe para que a proxima assinatura seja uma
 * DECISAO: tabela nova aqui obriga a dizer se o DELETE dela precisa chegar.
 */

type Assinatura = { arquivo: string; tabela: string; filtro: string | null };

const RAIZ = join(__dirname, '..');

function arquivosDeFonte(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      saida.push(...arquivosDeFonte(caminho));
      continue;
    }
    if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/** Ocorrencias cruas de `postgres_changes`, para detectar parser quebrado. */
function contarOcorrencias(): number {
  let total = 0;
  for (const caminho of arquivosDeFonte(RAIZ)) {
    const fonte = readFileSync(caminho, 'utf8');
    let i = fonte.indexOf('postgres_changes');
    while (i !== -1) {
      total += 1;
      i = fonte.indexOf('postgres_changes', i + 1);
    }
  }
  return total;
}

function lerAssinaturas(): Assinatura[] {
  const achadas: Assinatura[] = [];
  for (const caminho of arquivosDeFonte(RAIZ)) {
    const fonte = readFileSync(caminho, 'utf8');
    let i = fonte.indexOf('postgres_changes');
    while (i !== -1) {
      // A janela cobre as duas formas usadas no app: objeto numa linha so e
      // objeto quebrado em varias.
      const janela = fonte.slice(i, i + 500);
      const tabela = /\btable:\s*['"`]([a-z_]+)['"`]/.exec(janela);
      const filtro = /\bfilter:\s*[`'"]([a-zA-Z_]+)=/.exec(janela);
      if (tabela) {
        achadas.push({
          arquivo: caminho.slice(RAIZ.length + 1),
          tabela: tabela[1],
          filtro: filtro ? filtro[1] : null,
        });
      }
      i = fonte.indexOf('postgres_changes', i + 1);
    }
  }
  return achadas;
}

/**
 * A matriz. Cada tabela assinada precisa estar aqui, dizendo por que o DELETE
 * chega ou por que nao chegar esta ok.
 */
const DELETE_CHEGA: Record<string, { como: string; porque: string }> = {
  // Filtra pela propria PK: o old record do DELETE ja carrega classe_id.
  classe_mapa_tema: { como: 'filtro e a PK', porque: 'PK = classe_id' },
  // REPLICA IDENTITY FULL em 20261018_10.
  classe_aluno: { como: 'FULL', porque: 'matricula removida tem de sumir da tela do aluno' },
  notificacoes: { como: 'FULL', porque: 'notificacao apagada nao pode ficar na caixa' },
  eventos_aluno: { como: 'FULL', porque: 'trg_eventos_aluno_after_iud trata DELETE' },
};

const DELETE_NAO_CHEGA: Record<string, string> = {
  // Caminho quente: reescritas por trigger a cada evento de progresso. Ligar
  // FULL poe a linha antiga inteira no WAL a cada uma. Ver #331.
  topico_aluno: 'caminho quente; so apagada em cascata, coberta por classe_aluno',
  conteudo_aluno: 'caminho quente; so apagada em cascata',
  atividade_aluno: 'caminho quente; so apagada em cascata',
  conteudo_personalizado: 'caminho quente (8881 updates); so apagada na regeracao',
};

/**
 * Sem isto os testes abaixo passam por vacuidade quando o parser para de
 * casar: uma lista vazia satisfaz "todas estao na matriz".
 */
test('o parser le todas as ocorrencias de postgres_changes', () => {
  const cruas = contarOcorrencias();
  const parseadas = lerAssinaturas().length;
  assert.ok(cruas > 0, 'nenhuma assinatura no app — o parser quebrou?');
  assert.equal(parseadas, cruas, 'ha assinatura que o parser nao conseguiu ler');
});

test('toda tabela assinada esta na matriz de DELETE', () => {
  const assinaturas = lerAssinaturas();
  assert.ok(assinaturas.length > 0, 'nenhuma assinatura encontrada — o parser quebrou?');

  const semResposta = assinaturas
    .filter((a) => !(a.tabela in DELETE_CHEGA) && !(a.tabela in DELETE_NAO_CHEGA))
    .map((a) => `${a.tabela} (${a.arquivo})`);

  assert.deepEqual(
    semResposta,
    [],
    `assinatura nova sem decisao sobre DELETE. Diga na matriz se ele precisa chegar ` +
      `— se precisar, a tabela quer REPLICA IDENTITY FULL numa migracao.`
  );
});

test('nenhuma tabela aparece nos dois lados da matriz', () => {
  const nos_dois = Object.keys(DELETE_CHEGA).filter((t) => t in DELETE_NAO_CHEGA);
  assert.deepEqual(nos_dois, []);
});

test('quem depende do filtro ser a PK de fato filtra pela PK', () => {
  const assinaturas = lerAssinaturas();
  const porPk = assinaturas.filter((a) => DELETE_CHEGA[a.tabela]?.como === 'filtro e a PK');
  assert.ok(porPk.length > 0);
  for (const a of porPk) {
    assert.equal(a.filtro, 'classe_id', `${a.tabela} mudou de filtro e perdeu o DELETE`);
  }
});

test('as de caminho quente continuam filtrando por coluna nao-PK — e por isso perdem DELETE', () => {
  const assinaturas = lerAssinaturas();
  for (const a of assinaturas.filter((x) => x.tabela in DELETE_NAO_CHEGA)) {
    assert.notEqual(
      a.filtro,
      'id',
      `${a.tabela} passou a filtrar pela PK; se foi de proposito, mova para DELETE_CHEGA`
    );
  }
});
