"""Missão diária com acento: o molde do gerador e o texto que já foi gravado

## Medido em produção (só leitura, 30/10)

`fn_missao_diaria_gerar` monta quatro moldes de missão sem acento: "Feche um conteudo", "Conclua N
conteudo(s) hoje.", "Faca N acoes na trilha hoje.". O molde é o que o aluno vê quando a reescrita por
IA não roda (`20261021_07`: ela só troca o texto, e sem crédito de IA nenhuma roda), e é o que a IA
recebe como base: das 128 missões do sistema, 34 têm `texto_molde` sem acento e 27 têm uma
descrição final com palavras como "conteudo", "acoes", "determinacao" que a IA copiou do molde.

## O que muda

1. `fn_missao_diaria_gerar` é reescrita a partir da definição que **está no banco** (não de uma cópia
   desta pasta: o corpo foi redefinido em `20261021_20` e depois), trocando só os quatro textos.
   Se algum texto-alvo não for encontrado a migração falha em vez de gravar uma função inalterada
   e fingir que consertou.
2. As linhas já gravadas da diária do sistema (`origem = 'sistema'` e `dia IS NOT NULL`) ganham
   acento em `titulo`, `descricao` e `texto_molde`, só nas palavras de uma lista fechada, com
   fronteira de palavra. `fn_missoes_guarda` bloqueia a edição do texto de missão do sistema; a
   única passagem é o sinal `app.missao_texto_llm`, que a migração liga só dentro da transação e que
   não vale para `authenticated`/`anon`.

Não mexe em critério, janela, recompensa nem progresso: a missão continua a mesma.
"""

from __future__ import annotations

from alembic import op

revision = "20261030_02"
down_revision = "20261030_01"
branch_labels = None
depends_on = None


FUNCAO = r"""
DO $migracao$
DECLARE
  v_def text;
  v_novo text;
  v_par text[];
  v_pares text[][] := ARRAY[
    ARRAY['''Feche um conteudo''', '''Feche um conteúdo'''],
    ARRAY['''Conclua '' || v_cont || '' conteudo(s) hoje.''', '''Conclua '' || v_cont || '' conteúdo(s) hoje.'''],
    ARRAY['''Faca '' || v_acoes || '' acoes na trilha hoje.''', '''Faça '' || v_acoes || '' ações na trilha hoje.''']
  ];
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
   WHERE p.proname = 'fn_missao_diaria_gerar' AND p.pronamespace = 'public'::regnamespace;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'fn_missao_diaria_gerar nao existe';
  END IF;

  v_novo := v_def;
  FOREACH v_par SLICE 1 IN ARRAY v_pares LOOP
    IF position(v_par[1] IN v_def) = 0 THEN
      -- Ja corrigida por quem rodou antes: aceita; ausente dos dois lados: erro.
      IF position(v_par[2] IN v_def) = 0 THEN
        RAISE EXCEPTION 'molde nao encontrado em fn_missao_diaria_gerar: %', v_par[1];
      END IF;
    END IF;
    v_novo := replace(v_novo, v_par[1], v_par[2]);
  END LOOP;

  IF v_novo <> v_def THEN
    EXECUTE v_novo;
  END IF;
END
$migracao$;
"""


# Lista fechada: cada entrada existe nos moldes ou em descrições medidas em produção. Só palavra
# inteira, para "acoes" não pegar o meio de outra palavra.
ACENTUAR = r"""
CREATE OR REPLACE FUNCTION pg_temp.acentuar(p_texto text) RETURNS text
LANGUAGE sql IMMUTABLE AS $f$
  SELECT regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           p_texto,
           '\mconteudo(s?)\M', 'conteúdo\1', 'g'),
           '\mConteudo(s?)\M', 'Conteúdo\1', 'g'),
           '\macoes\M', 'ações', 'g'),
           '\mAcoes\M', 'Ações', 'g'),
           '\mFaca\M', 'Faça', 'g'),
           '\mconcluidas\M', 'concluídas', 'g'),
           '\mdeterminacao\M', 'determinação', 'g'),
           '\msuperacao\M', 'superação', 'g'),
           '\mFisica\M', 'Física', 'g'),
           '\mconcluido(s?)\M', 'concluído\1', 'g')
$f$
"""


# `fn_missoes_guarda` só deixa o texto do sistema mudar com este sinal ligado, e só fora dos
# papéis do cliente. `set_config(..., true)` vale até o fim da transação.
LIGAR_SINAL = "SELECT set_config('app.missao_texto_llm', 'on', true)"
DESLIGAR_SINAL = "SELECT set_config('app.missao_texto_llm', 'off', true)"

REGRAVAR = r"""
UPDATE public.missoes
   SET titulo = pg_temp.acentuar(titulo),
       descricao = pg_temp.acentuar(descricao),
       texto_molde = CASE
         WHEN texto_molde IS NULL THEN NULL
         ELSE jsonb_build_object(
                'titulo', pg_temp.acentuar(texto_molde ->> 'titulo'),
                'descricao', pg_temp.acentuar(texto_molde ->> 'descricao'))
       END
 WHERE origem = 'sistema'
   AND dia IS NOT NULL
   AND (titulo IS DISTINCT FROM pg_temp.acentuar(titulo)
        OR descricao IS DISTINCT FROM pg_temp.acentuar(descricao)
        OR (texto_molde ->> 'titulo') IS DISTINCT FROM pg_temp.acentuar(texto_molde ->> 'titulo')
        OR (texto_molde ->> 'descricao') IS DISTINCT FROM pg_temp.acentuar(texto_molde ->> 'descricao'))
"""


def upgrade() -> None:
    op.execute(FUNCAO)
    op.execute(ACENTUAR)
    op.execute(LIGAR_SINAL)
    op.execute(REGRAVAR)
    op.execute(DESLIGAR_SINAL)


def downgrade() -> None:
    # Texto com acento não volta a ser sem acento: seria reintroduzir o defeito.
    pass
