"""desafios gerados sozinhos esperam a aprovação do professor

Tarefa 1 do plano `docs/superpowers/plans/2026-11-20-desafios-gerados-automaticamente.md` (spec
`docs/superpowers/specs/2026-11-20-desafios-gerados-automaticamente-design.md`, que continua a de 17/11).
Todo conteúdo publicado e parado há 1 hora, de professor com geração automática, ganha 2 desafios de
lógica e 2 cruzadinhas gerados no servidor. Eles nascem `pendente` e esperam o professor na aba Missões.

O banco decide quem entra, reivindica, grava, avisa o professor e guarda as tentativas. A API (Tarefa 3)
só faz o laço: pede o material, chama a edge e devolve a resposta para cá. Tudo o que a API chama é
`SECURITY DEFINER`, `SET search_path = public, pg_temp`, sem EXECUTE para `PUBLIC`, `anon` e
`authenticated`, com EXECUTE para `service_role`. A única função nova do cliente é
`missao_desafio_decidir`, do console.

## O que muda, na ordem do `upgrade()`

1. **`conteudos.atualizado_em`** (`timestamptz NOT NULL DEFAULT now()`). O gatilho
   `trg_conteudos_atualizado_em` (BEFORE INSERT OR UPDATE) põe `now()` em toda escrita: o cliente não
   escolhe o valor. Um UPDATE que só mexe na própria coluna ou em `ordem` não conta como edição: o
   console reordena gravando `ordem` conteúdo por conteúdo, e reordenar não reinicia a carência.

   **O backfill não é um UPDATE.** `conteudos` tem gatilhos de escrita em produção, e o
   `trg_conteudos_class_delta_job` (`20260827_03`) enfileira regeração em todo UPDATE: um
   `UPDATE conteudos SET atualizado_em = created_at` mandaria regerar a mídia de todas as turmas. O
   valor sai de `ALTER COLUMN ... TYPE timestamptz USING COALESCE(created_at, now())`, que reescreve a
   tabela sem disparar gatilho nenhum (medido no e2e com um gatilho que conta disparos). Linha sem
   `created_at` ganha `now()` e espera a carência como se tivesse acabado de ser salva. O bloco só roda
   quando a coluna ainda não existe, então repetir a migration não reescreve o que o gatilho já cuida.

2. **`desafios_auto_tentativas`**, uma linha por conteúdo: `estado` (`gerando`, `gerado`,
   `sem_desafio`, `falhou`, `esperando`), `tentativas`, `proxima_em`, `iniciada_em`, `erro` e
   `atualizado_em`. `esperando` é o limite por minuto do modelo: não conta como falha.

   **A tabela é só do servidor, e nasce sem policy de propósito.** RLS ligada, nenhuma policy e
   nenhum GRANT para `anon`/`authenticated`: quem lê e escreve são as funções `SECURITY DEFINER`
   abaixo. O console não precisa dela (o que o professor vê é a missão pendente).

3. **`app_config`**, cinco chaves privadas, com `ON CONFLICT DO NOTHING`. Valor ausente ou fora da
   faixa vira o padrão (`fn_desafios_auto_config`):

   | chave | padrão | faixa aceita |
   |---|---|---|
   | `desafios_auto_ligado` | `true` | `true`/`false` (também `1`/`0`, `on`/`off`, `sim`/`nao`) |
   | `desafios_auto_por_passada` | `2` | 1 a 50 |
   | `desafios_auto_intervalo_seg` | `600` | 60 a 86400 |
   | `desafios_auto_por_dia` | `20` | 0 a 1000 |
   | `desafios_auto_carencia_min` | `60` | 0 a 10080 |

4. **O sino** (`professor_notificacoes`): os CHECKs de `tipo` e `destino` partem do texto da
   `20261102_23` (a última que os escreveu) e ganham `desafio_para_aprovar` e `missoes`.

5. **`fn_missao_desafio_gravar(p_conteudo_id, p_desafio, p_resposta, p_perfis, p_aprovacao,
   p_criado_por)`**: o corpo de `missao_desafio_criar` (`20261117_03`), trocado por âncora. Sai a
   posse, `'aprovada'` vira `p_aprovacao` e `auth.uid()` vira `p_criado_por`. A validação, o título, o
   gabarito e o sinal `app.desafio_gravando` ficam iguais. Conteúdo inexistente levanta `P0002`.
   Ninguém de fora a executa.

6. **`missao_desafio_criar`** (a do botão): mesma assinatura e mesmo GRANT. Confere a posse com o
   mesmo bloco de antes, pega a trava consultiva do conteúdo
   (`pg_advisory_xact_lock(hashtextextended('missao_desafio:' || id, 0))`) e chama a interna com
   `'aprovada'` e `auth.uid()`.

7. **`fn_desafios_auto_config()`**: `{ligado, por_passada, intervalo_seg, por_dia, carencia_min}`.

8. **`fn_desafios_auto_candidatos(p_limite, p_classes)`**, só leitura. Entra o conteúdo cujo tópico é
   da turma, de professor com `geracao_automatica`, turma com pelo menos um aluno, nenhuma missão com
   desafio dele (em qualquer estado: recusar não regera), nenhuma tentativa `gerado`/`sem_desafio` nem
   `falhou` com 3 tentativas, sem `proxima_em` no futuro, tópico liberado (`app_topico_liberado`),
   parado há `carencia_min` e com material: texto próprio, `metadata.media_storage_path` ou uma fonte
   que o contexto (item 10) de fato manda à edge, isto é, de `visibilidade = 'classe'` e com texto
   (as chaves de `metadata` que o contexto lê, ou `descricao`). A regra da fonte mora em
   `fn_desafios_auto_fonte_serve` e `fn_desafios_auto_texto_da_fonte`, que o candidato e o contexto
   chamam: fonte só do aluno, ou da turma sem texto, não faz candidato que iria à edge vazio. Ordem: `topicos.ordem`, conteúdo mais antigo, id. `p_limite` nulo
   devolve todos.

9. **`fn_desafios_auto_reivindicar(p_limite, p_trava_seg, p_classes)`**. Com `ligado = false`,
   devolve vazio. Serializa as reivindicações por uma trava consultiva própria e calcula a sobra do
   dia (`por_dia` menos as tentativas iniciadas desde a meia-noite de `America/Los_Angeles`, a virada
   da cota do Gemini). Percorre os candidatos e reivindica cada um com
   `INSERT ... ON CONFLICT DO UPDATE ... WHERE`: a linha só passa a `gerando` se não estiver gerando
   (ou se estiver há mais de `p_trava_seg`, a API caiu no meio) e se a espera já venceu. O mesmo
   INSERT confere de novo a carência e a ausência de desafio: o conteúdo editado entre a lista e a
   reivindicação fica de fora. Retomar uma trava vencida não soma tentativa.

10. **`fn_desafios_auto_contexto(p_conteudo_id)`**: o corpo da edge `generate-content-ai` em
    `mode: "desafios"`, ou `NULL` se o conteúdo sumiu. Leva título do conteúdo, tópico, turma e
    matéria, o texto do conteúdo, o texto já extraído das fontes de `visibilidade = 'classe'` desse
    conteúdo (`texto_extraido`, `transcricao`, `transcript`, `text`, nessa ordem, e `descricao`,
    juntos com linha em branco e cortados em 20 000 caracteres), os nomes dos arquivos, a orientação
    da turma (ausente quando não há) e `existentes` (enunciados das questões do tópico e textos dos
    desafios do tópico, sem repetir; títulos dos cards do tópico; até 60 em cada). `tipoConteudo` e
    `corpoConteudo` vão para a API tirar `videoUrl`/`linkUrl`. Nenhum dado de aluno.

11. **`fn_missao_desafio_registrar_auto(p_conteudo_id, p_desafios)`**. Pega a mesma trava consultiva
    do botão. Se o conteúdo já tem desafio (o professor aplicou pelo botão enquanto o worker gerava),
    marca `gerado` e devolve `ja_tinha` sem gravar nada. Senão, grava cada item
    (`{desafio, resposta, perfis?}`) pela interna, como `pendente` e em nome do professor dono, num
    bloco que pula o item inválido (`22023`). Perfis ausentes usam o padrão do tipo (lógica: mastermind
    e achiever; cruzadinha: seeker e mastermind). Gravou algum: marca `gerado` e avisa o professor no
    sino, um aviso por turma e dia (`dedupe_key = desafios_auto:<turma>:<dia em Brasília>`), com o total
    de grupos pendentes da turma no texto. Nenhum: `sem_desafio`.

12. **`fn_desafios_auto_falhou(p_conteudo_id, p_erro, p_espera_min)`**. Com espera, `esperando` até
    `now() + espera`, sem somar tentativa. Sem espera, soma uma tentativa e espera 2^n horas; na
    terceira para de vez (`proxima_em` nulo). Linha já `gerado` ou `sem_desafio` não volta atrás. O
    erro guarda só a primeira linha, em até 300 caracteres.

13. **As missões da IA (#151) ignoram os desafios.** Um conteúdo gera até 8 linhas `pendente`, e
    elas travariam o teto de sugestões de `missao_ia_pedir` e entrariam nos títulos que vão ao modelo.
    As duas consultas ganham `desafio IS NULL`, por troca no texto da `20261102_20` (a única que as
    escreve): o teto em `missao_ia_pedir` e a lista em `fn_missao_ia_contexto`.

14. **`missao_desafio_decidir(p_grupo, p_aprovar, p_motivo)`**, do console. Posse por `NOT EXISTS`
    sobre `app_classes_do_professor()` (grupo de outra turma, inexistente ou quem não é professor:
    `42501`). Muda todas as linhas `pendente` do grupo para `aprovada`, ou para `recusada` com o motivo
    (ou "Recusado pelo professor", porque o CHECK exige motivo). Devolve quantas linhas mudou; grupo já
    decidido devolve 0. Fica fora de `missoes_ia_log` pelo `WHEN` do gatilho (`20261117_03`).

## Downgrade

Volta `missao_desafio_criar`, `missao_ia_pedir` e `fn_missao_ia_contexto` ao texto das migrations de
origem, os CHECKs do sino ao da `20261102_23` (apagando antes os avisos do tipo novo) e apaga as
funções, a tabela, as chaves e a coluna com o gatilho. As missões-desafio já gravadas ficam, inclusive
as pendentes.

Revision ID: 20261120_03
Revises: 20261120_02
Create Date: 2026-11-20
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261120_03"
down_revision = "20261120_02"
branch_labels = None
depends_on = None


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}_para_20_02", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M17_03 = _modulo("20261117_03_missao_desafio_criar.py")
M20 = _modulo("20261102_20_missoes_sugeridas_pela_ia.py")
M23 = _modulo("20261102_23_alerta_do_dono_do_painel.py")


def _trocar(texto: str, antes: str, depois: str) -> str:
    if texto.count(antes) != 1:
        raise RuntimeError(f"âncora ausente ou repetida: {antes[:60]!r}")
    return texto.replace(antes, depois)


# ------------------------------------------------------------------------------- 1. atualizado_em
COLUNA_ATUALIZADO_EM = r"""
DO $coluna$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'conteudos' AND column_name = 'atualizado_em'
  ) THEN
    ALTER TABLE public.conteudos ADD COLUMN atualizado_em timestamptz;
    -- Reescreve a tabela sem disparar gatilho: um UPDATE aqui enfileiraria regeracao de todas as turmas.
    ALTER TABLE public.conteudos ALTER COLUMN atualizado_em TYPE timestamptz USING COALESCE(created_at, now());
  END IF;
END
$coluna$;
ALTER TABLE public.conteudos ALTER COLUMN atualizado_em SET DEFAULT now();
ALTER TABLE public.conteudos ALTER COLUMN atualizado_em SET NOT NULL;
COMMENT ON COLUMN public.conteudos.atualizado_em IS
  'Ultima edicao do conteudo. So o gatilho trg_conteudos_atualizado_em escreve (20261120_03).';

CREATE OR REPLACE FUNCTION public.fn_conteudos_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'atualizado_em' - 'ordem') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'atualizado_em' - 'ordem') THEN
    -- Nada mudou alem da propria coluna e da ordem: nao e' edicao. O console reordena gravando so'
    -- `ordem`, conteudo por conteudo, e isso nao pode reiniciar a carencia.
    NEW.atualizado_em := OLD.atualizado_em;
  ELSE
    NEW.atualizado_em := now();
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_conteudos_atualizado_em() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_conteudos_atualizado_em ON public.conteudos;
CREATE TRIGGER trg_conteudos_atualizado_em
  BEFORE INSERT OR UPDATE ON public.conteudos
  FOR EACH ROW EXECUTE FUNCTION public.fn_conteudos_atualizado_em();
"""

# ------------------------------------------------------------------------------------ 2. tentativas
TABELA = r"""
CREATE TABLE IF NOT EXISTS public.desafios_auto_tentativas (
  conteudo_id   bigint      PRIMARY KEY REFERENCES public.conteudos (id) ON DELETE CASCADE,
  estado        text        NOT NULL
                CHECK (estado IN ('gerando', 'gerado', 'sem_desafio', 'falhou', 'esperando')),
  tentativas    integer     NOT NULL DEFAULT 0,
  proxima_em    timestamptz,
  iniciada_em   timestamptz NOT NULL,
  erro          text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS desafios_auto_tentativas_iniciada_idx
  ON public.desafios_auto_tentativas (iniciada_em);

-- So' do servidor: RLS ligada e nenhuma policy, de proposito (docstring da 20261120_03).
ALTER TABLE public.desafios_auto_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.desafios_auto_tentativas FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.desafios_auto_tentativas IS
  'Tentativas de gerar desafios sozinho, uma linha por conteudo. So do servidor: sem policy (20261120_03).';
"""

# ------------------------------------------------------------------------------------- 3. app_config
CONFIG = r"""
INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('desafios_auto_ligado', 'true', 'Desafios gerados sozinhos: liga ou desliga o laco sem deploy.', false),
  ('desafios_auto_por_passada', '2', 'Desafios gerados sozinhos: conteudos por passada do laco.', false),
  ('desafios_auto_intervalo_seg', '600', 'Desafios gerados sozinhos: segundos entre as passadas do laco.', false),
  ('desafios_auto_por_dia', '20', 'Desafios gerados sozinhos: conteudos por dia (virada da cota do Gemini).', false),
  ('desafios_auto_carencia_min', '60', 'Desafios gerados sozinhos: minutos sem edicao antes de gerar.', false)
ON CONFLICT (chave) DO NOTHING;
"""

# ------------------------------------------------------------------------------------------ 4. sino
TIPOS = _trocar(
    _trocar(M23.TIPOS, "'evento_encerrado', 'gatilho_tecnico'", "'evento_encerrado', 'gatilho_tecnico', 'desafio_para_aprovar'"),
    "'eventos', 'tecnico'",
    "'eventos', 'tecnico', 'missoes'",
)

# ------------------------------------------------------------------------------- 5. a interna, por âncora
POSSE = """  -- Posse antes de ler. NOT EXISTS, e nao NOT IN: um NULL na lista faria o IF dar NULL e passar.
  IF NOT EXISTS (
       SELECT 1 FROM public.conteudos c JOIN public.topicos t ON t.id = c.topico_id
        WHERE c.id = p_conteudo_id
          AND t.classe_id IN (SELECT public.app_classes_do_professor())) THEN
    RAISE EXCEPTION 'Conteúdo não encontrado ou sem permissão para criar desafio.' USING ERRCODE = '42501';
  END IF;

"""

_GRANT_CRIAR = (
    "REVOKE ALL ON FUNCTION public.missao_desafio_criar(bigint, jsonb, jsonb, text[]) FROM PUBLIC, anon;\n"
    "GRANT EXECUTE ON FUNCTION public.missao_desafio_criar(bigint, jsonb, jsonb, text[]) TO authenticated;"
)

TROCAS_GRAVAR = (
    (
        "CREATE OR REPLACE FUNCTION public.missao_desafio_criar(\n"
        "  p_conteudo_id bigint, p_desafio jsonb, p_resposta jsonb, p_perfis text[])",
        "CREATE OR REPLACE FUNCTION public.fn_missao_desafio_gravar(\n"
        "  p_conteudo_id bigint, p_desafio jsonb, p_resposta jsonb, p_perfis text[], p_aprovacao text,\n"
        "  p_criado_por uuid)",
    ),
    (
        POSSE,
        "  -- Sem posse aqui: quem chama confere (o botao, pela sessao; o worker, sem sessao) (20261120_03).\n"
        "  IF p_aprovacao IS NULL OR p_aprovacao NOT IN ('pendente', 'aprovada') THEN\n"
        "    RAISE EXCEPTION 'Aprovação inválida para o desafio.';\n"
        "  END IF;\n\n",
    ),
    (
        "   WHERE c.id = p_conteudo_id;\n\n  -- Perfis",
        "   WHERE c.id = p_conteudo_id;\n"
        "  IF NOT FOUND THEN\n"
        "    RAISE EXCEPTION 'Conteúdo não encontrado.' USING ERRCODE = 'P0002';\n"
        "  END IF;\n\n  -- Perfis",
    ),
    ("'ia', 'aprovada'", "'ia', p_aprovacao"),
    ("auth.uid()", "p_criado_por"),
    (
        _GRANT_CRIAR,
        "REVOKE ALL ON FUNCTION public.fn_missao_desafio_gravar(bigint, jsonb, jsonb, text[], text, uuid)\n"
        "  FROM PUBLIC, anon, authenticated;",
    ),
)


def gravar() -> str:
    texto = M17_03.RPC
    for antes, depois in TROCAS_GRAVAR:
        texto = _trocar(texto, antes, depois)
    return texto


# Calculada na importação: âncora que sumir derruba a migration antes de ela tocar no banco.
GRAVAR = gravar()

# ---------------------------------------------------------------------------------- 6. o botão
CRIAR = (
    r"""
CREATE OR REPLACE FUNCTION public.missao_desafio_criar(
  p_conteudo_id bigint, p_desafio jsonb, p_resposta jsonb, p_perfis text[])
RETURNS TABLE (missao_id bigint, perfil_alvo text, desafio_grupo uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
"""
    + POSSE
    + r"""  -- A mesma trava do worker (fn_missao_desafio_registrar_auto): os dois nao gravam por cima um do outro.
  PERFORM pg_advisory_xact_lock(hashtextextended('missao_desafio:' || p_conteudo_id::text, 0));

  RETURN QUERY
    SELECT g.missao_id, g.perfil_alvo, g.desafio_grupo
      FROM public.fn_missao_desafio_gravar(p_conteudo_id, p_desafio, p_resposta, p_perfis, 'aprovada', auth.uid()) g;
END;
$function$;

"""
    + _GRANT_CRIAR
    + "\n"
)

# ------------------------------------------------------------------------- 7. texto de uma fonte
# Uma regra só para "esta fonte tem texto": o candidato exige e o contexto usa a mesma.
TEXTO_DA_FONTE = r"""
CREATE OR REPLACE FUNCTION public.fn_desafios_auto_texto_da_fonte(p_metadata jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE(NULLIF(btrim(p_metadata ->> 'texto_extraido'), ''),
                  NULLIF(btrim(p_metadata ->> 'transcricao'), ''),
                  NULLIF(btrim(p_metadata ->> 'transcript'), ''),
                  NULLIF(btrim(p_metadata ->> 'text'), ''))
$function$;

REVOKE ALL ON FUNCTION public.fn_desafios_auto_texto_da_fonte(jsonb) FROM PUBLIC, anon, authenticated;

-- A fonte que vai para a edge: da turma (a do aluno nunca) e com texto aproveitavel.
CREATE OR REPLACE FUNCTION public.fn_desafios_auto_fonte_serve(p_visibilidade text, p_metadata jsonb, p_descricao text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT p_visibilidade = 'classe'
     AND (public.fn_desafios_auto_texto_da_fonte(p_metadata) IS NOT NULL
          OR btrim(COALESCE(p_descricao, '')) <> '')
$function$;

REVOKE ALL ON FUNCTION public.fn_desafios_auto_fonte_serve(text, jsonb, text) FROM PUBLIC, anon, authenticated;
"""

# --------------------------------------------------------------------------------------- 7. config
CONFIG_FN = r"""
CREATE OR REPLACE FUNCTION public.fn_desafios_auto_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'ligado', CASE WHEN lower(x.ligado) IN ('true', 't', '1', 'on', 'sim') THEN true
                   WHEN lower(x.ligado) IN ('false', 'f', '0', 'off', 'nao', 'não') THEN false
                   ELSE true END,
    'por_passada', CASE WHEN x.por_passada ~ '^[0-9]{1,6}$'
                        THEN CASE WHEN x.por_passada::integer BETWEEN 1 AND 50 THEN x.por_passada::integer ELSE 2 END
                        ELSE 2 END,
    'intervalo_seg', CASE WHEN x.intervalo ~ '^[0-9]{1,6}$'
                          THEN CASE WHEN x.intervalo::integer BETWEEN 60 AND 86400 THEN x.intervalo::integer ELSE 600 END
                          ELSE 600 END,
    'por_dia', CASE WHEN x.por_dia ~ '^[0-9]{1,6}$'
                    THEN CASE WHEN x.por_dia::integer BETWEEN 0 AND 1000 THEN x.por_dia::integer ELSE 20 END
                    ELSE 20 END,
    'carencia_min', CASE WHEN x.carencia ~ '^[0-9]{1,6}$'
                         THEN CASE WHEN x.carencia::integer BETWEEN 0 AND 10080 THEN x.carencia::integer ELSE 60 END
                         ELSE 60 END)
    FROM (
      SELECT max(btrim(c.valor)) FILTER (WHERE c.chave = 'desafios_auto_ligado')        AS ligado,
             max(btrim(c.valor)) FILTER (WHERE c.chave = 'desafios_auto_por_passada')   AS por_passada,
             max(btrim(c.valor)) FILTER (WHERE c.chave = 'desafios_auto_intervalo_seg') AS intervalo,
             max(btrim(c.valor)) FILTER (WHERE c.chave = 'desafios_auto_por_dia')       AS por_dia,
             max(btrim(c.valor)) FILTER (WHERE c.chave = 'desafios_auto_carencia_min')  AS carencia
        FROM public.app_config c
       WHERE c.chave LIKE 'desafios_auto_%'
    ) x
$function$;

REVOKE ALL ON FUNCTION public.fn_desafios_auto_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_desafios_auto_config() TO service_role;
"""

# ----------------------------------------------------------------------------------- 8. candidatos
CANDIDATOS = r"""
CREATE OR REPLACE FUNCTION public.fn_desafios_auto_candidatos(p_limite integer, p_classes bigint[] DEFAULT NULL)
RETURNS TABLE (conteudo_id bigint, classe_id bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_carencia integer := (public.fn_desafios_auto_config() ->> 'carencia_min')::integer;
BEGIN
  RETURN QUERY
  SELECT c.id, t.classe_id
    FROM public.conteudos c
    JOIN public.topicos t ON t.id = c.topico_id
    JOIN public.classe cl ON cl.id = t.classe_id
    JOIN public.professor p ON p.id = cl.professor_id
   WHERE p.geracao_automatica
     AND (p_classes IS NULL OR t.classe_id = ANY (p_classes))
     AND EXISTS (SELECT 1 FROM public.classe_aluno ca WHERE ca.classe_id = t.classe_id)
     -- Desafio em qualquer estado (pendente, aprovada, recusada, inativa): recusar nao regera.
     AND NOT EXISTS (SELECT 1 FROM public.missoes m WHERE m.conteudo_id = c.id AND m.desafio IS NOT NULL)
     AND NOT EXISTS (
           SELECT 1 FROM public.desafios_auto_tentativas d
            WHERE d.conteudo_id = c.id
              AND (d.estado IN ('gerado', 'sem_desafio')
                   OR (d.estado = 'falhou' AND d.tentativas >= 3)
                   OR d.proxima_em > now()))
     AND public.app_topico_liberado(t.publicacao, t.publicar_em)
     AND c.atualizado_em <= now() - make_interval(mins => v_carencia)
     -- Com material: so' o titulo nao basta.
     AND (btrim(COALESCE(c.conteudo, '')) <> ''
          OR EXISTS (SELECT 1 FROM public.fontes_personalizacao f
                      WHERE f.conteudo_id = c.id
                        AND public.fn_desafios_auto_fonte_serve(f.visibilidade, f.metadata, f.descricao))
          OR (c.metadata -> 'media_storage_path') IS NOT NULL)
   ORDER BY t.ordem NULLS LAST, c.created_at NULLS LAST, c.id
   LIMIT p_limite;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_desafios_auto_candidatos(integer, bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_desafios_auto_candidatos(integer, bigint[]) TO service_role;
"""

# ---------------------------------------------------------------------------------- 9. reivindicar
REIVINDICAR = r"""
CREATE OR REPLACE FUNCTION public.fn_desafios_auto_reivindicar(
  p_limite integer, p_trava_seg integer, p_classes bigint[] DEFAULT NULL)
RETURNS SETOF bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_cfg      jsonb := public.fn_desafios_auto_config();
  v_carencia integer;
  v_desde    timestamptz;
  v_sobra    integer;
  v_pegos    integer := 0;
  v_cand     record;
  v_id       bigint;
BEGIN
  IF NOT (v_cfg ->> 'ligado')::boolean OR COALESCE(p_limite, 0) <= 0 THEN
    RETURN;
  END IF;
  v_carencia := (v_cfg ->> 'carencia_min')::integer;

  -- Uma reivindicacao por vez: o teto do dia e' contado e consumido sem corrida entre lacos.
  PERFORM pg_advisory_xact_lock(hashtextextended('desafios_auto:reivindicar', 0));

  -- A cota do Gemini vira a meia-noite do Pacifico.
  v_desde := date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles';
  SELECT (v_cfg ->> 'por_dia')::integer - count(*)::integer INTO v_sobra
    FROM public.desafios_auto_tentativas d WHERE d.iniciada_em >= v_desde;
  v_sobra := LEAST(p_limite, v_sobra);
  IF v_sobra <= 0 THEN
    RETURN;
  END IF;

  FOR v_cand IN SELECT * FROM public.fn_desafios_auto_candidatos(NULL, p_classes) LOOP
    EXIT WHEN v_pegos >= v_sobra;
    v_id := NULL;
    -- A carencia e a ausencia de desafio de novo, na mesma escrita: o conteudo editado depois da
    -- lista fica de fora. A trava da linha impede dois lacos no mesmo conteudo.
    INSERT INTO public.desafios_auto_tentativas AS d (conteudo_id, estado, tentativas, iniciada_em, atualizado_em)
    SELECT c.id, 'gerando', 0, now(), now()
      FROM public.conteudos c
     WHERE c.id = v_cand.conteudo_id
       AND c.atualizado_em <= now() - make_interval(mins => v_carencia)
       AND NOT EXISTS (SELECT 1 FROM public.missoes m WHERE m.conteudo_id = c.id AND m.desafio IS NOT NULL)
    ON CONFLICT (conteudo_id) DO UPDATE
       SET estado = 'gerando', iniciada_em = now(), atualizado_em = now(), proxima_em = NULL
     WHERE (d.estado = 'gerando' AND d.iniciada_em < now() - make_interval(secs => p_trava_seg))
        OR (d.estado = 'esperando' AND (d.proxima_em IS NULL OR d.proxima_em <= now()))
        OR (d.estado = 'falhou' AND d.tentativas < 3 AND (d.proxima_em IS NULL OR d.proxima_em <= now()))
    RETURNING d.conteudo_id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_pegos := v_pegos + 1;
      RETURN NEXT v_id;
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_desafios_auto_reivindicar(integer, integer, bigint[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_desafios_auto_reivindicar(integer, integer, bigint[]) TO service_role;
"""

# ------------------------------------------------------------------------------------- 10. contexto
CONTEXTO = r"""
CREATE OR REPLACE FUNCTION public.fn_desafios_auto_contexto(p_conteudo_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_c          record;
  v_arquivos   text;
  v_nomes      jsonb;
  v_orientacao jsonb;
  v_questoes   jsonb;
  v_cards      jsonb;
BEGIN
  SELECT c.titulo, c.tipo, c.conteudo, c.topico_id, t.classe_id,
         t.nome AS topico_nome, t.descricao AS topico_descricao,
         cl.descricao AS classe_nome, ma.nome AS materia_nome
    INTO v_c
    FROM public.conteudos c
    JOIN public.topicos t ON t.id = c.topico_id
    JOIN public.classe cl ON cl.id = t.classe_id
    LEFT JOIN public.materia ma ON ma.id = cl.materia_id
   WHERE c.id = p_conteudo_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- O texto ja' extraido dos arquivos do professor (o mesmo que a personalizacao usa). Fonte do aluno
  -- (`visibilidade = 'aluno'`) nao entra.
  SELECT left(string_agg(x.texto, E'\n\n' ORDER BY x.id, x.parte), 20000)
    INTO v_arquivos
    FROM (
      SELECT f.id, 1 AS parte,
             public.fn_desafios_auto_texto_da_fonte(f.metadata) AS texto
        FROM public.fontes_personalizacao f
       WHERE f.conteudo_id = p_conteudo_id AND f.visibilidade = 'classe'
      UNION ALL
      SELECT f.id, 2, NULLIF(btrim(f.descricao), '')
        FROM public.fontes_personalizacao f
       WHERE f.conteudo_id = p_conteudo_id AND f.visibilidade = 'classe'
    ) x
   WHERE x.texto IS NOT NULL;

  SELECT COALESCE(jsonb_agg(btrim(f.nome_arquivo) ORDER BY f.id), '[]'::jsonb)
    INTO v_nomes
    FROM public.fontes_personalizacao f
   WHERE f.conteudo_id = p_conteudo_id AND f.visibilidade = 'classe'
     AND btrim(COALESCE(f.nome_arquivo, '')) <> '';

  SELECT jsonb_build_object('pedir', o.pedir, 'evitar', o.evitar)
    INTO v_orientacao
    FROM public.classe_orientacao_ia o
   WHERE o.classe_id = v_c.classe_id
     AND (btrim(o.pedir) <> '' OR btrim(o.evitar) <> '');

  -- O que a IA nao pode repetir: as questoes do topico e os desafios de qualquer conteudo dele.
  SELECT COALESCE(jsonb_agg(q.texto ORDER BY q.ordem, q.texto), '[]'::jsonb)
    INTO v_questoes
    FROM (
      SELECT u.texto, min(u.ordem) AS ordem
        FROM (
          SELECT btrim(qq.enunciado) AS texto, 1 AS ordem
            FROM public.questoes qq
            JOIN public.atividades a ON a.id = qq.atividade_id
           WHERE a.topico_id = v_c.topico_id
          UNION ALL
          SELECT btrim(m.desafio ->> 'enunciado'), 2
            FROM public.missoes m
            JOIN public.conteudos co ON co.id = m.conteudo_id
           WHERE co.topico_id = v_c.topico_id AND m.desafio ->> 'tipo' = 'logica'
          UNION ALL
          SELECT btrim(p ->> 'pista'), 3
            FROM public.missoes m
            JOIN public.conteudos co ON co.id = m.conteudo_id
            CROSS JOIN LATERAL jsonb_array_elements(
              CASE WHEN jsonb_typeof(m.desafio -> 'palavras') = 'array' THEN m.desafio -> 'palavras'
                   ELSE '[]'::jsonb END) p
           WHERE co.topico_id = v_c.topico_id AND m.desafio ->> 'tipo' = 'cruzadinha'
        ) u
       WHERE COALESCE(u.texto, '') <> ''
       GROUP BY u.texto
       ORDER BY min(u.ordem), u.texto
       LIMIT 60
    ) q;

  SELECT COALESCE(jsonb_agg(k.titulo ORDER BY k.titulo), '[]'::jsonb)
    INTO v_cards
    FROM (
      SELECT DISTINCT btrim(ca.titulo) AS titulo
        FROM public.cards ca
        JOIN public.conteudos co ON co.id = ca.conteudo_id
       WHERE co.topico_id = v_c.topico_id AND btrim(COALESCE(ca.titulo, '')) <> ''
       ORDER BY 1
       LIMIT 60
    ) k;

  RETURN jsonb_build_object(
           'mode', 'desafios',
           'topicName', COALESCE(btrim(v_c.titulo), ''),
           'topicoNome', COALESCE(v_c.topico_nome, ''),
           'topicoDescricao', COALESCE(v_c.topico_descricao, ''),
           'classeNome', COALESCE(v_c.classe_nome, ''),
           'materiaNome', COALESCE(v_c.materia_nome, ''),
           'contents', jsonb_build_array(jsonb_build_object(
             'titulo', COALESCE(btrim(v_c.titulo), ''), 'tipo', COALESCE(v_c.tipo, ''), 'conteudo', v_c.conteudo)),
           'fileContents', COALESCE(v_arquivos, ''),
           'fileNames', v_nomes,
           'existentes', jsonb_build_object('questoes', v_questoes, 'cards', v_cards),
           'tipoConteudo', v_c.tipo,
           'corpoConteudo', v_c.conteudo)
         || CASE WHEN v_orientacao IS NULL THEN '{}'::jsonb
                 ELSE jsonb_build_object('orientacao', v_orientacao) END;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_desafios_auto_contexto(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_desafios_auto_contexto(bigint) TO service_role;
"""

# -------------------------------------------------------------------------------- 11. registrar
REGISTRAR_AUTO = r"""
CREATE OR REPLACE FUNCTION public.fn_missao_desafio_registrar_auto(p_conteudo_id bigint, p_desafios jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_classe   bigint;
  v_prof     uuid;
  v_turma    text;
  v_itens    jsonb;
  v_item     jsonb;
  v_tipo     text;
  v_perfis   text[];
  v_gravados integer := 0;
  v_pulados  integer := 0;
  v_pendentes integer;
BEGIN
  -- A mesma trava de `missao_desafio_criar`: se o professor aplicou pelo botao enquanto o worker
  -- gerava, o worker espera o commit dele e encontra o desafio pronto.
  PERFORM pg_advisory_xact_lock(hashtextextended('missao_desafio:' || p_conteudo_id::text, 0));

  v_itens := CASE WHEN jsonb_typeof(p_desafios) = 'array' THEN p_desafios ELSE '[]'::jsonb END;

  SELECT t.classe_id, cl.professor_id, COALESCE(NULLIF(btrim(cl.descricao), ''), 'a turma ' || cl.id::text)
    INTO v_classe, v_prof, v_turma
    FROM public.conteudos c
    JOIN public.topicos t ON t.id = c.topico_id
    JOIN public.classe cl ON cl.id = t.classe_id
   WHERE c.id = p_conteudo_id;
  IF v_classe IS NULL THEN
    -- O conteudo sumiu no meio da geracao (a tentativa saiu junto, em cascata).
    RETURN jsonb_build_object('estado', 'sem_desafio', 'gravados', 0, 'pulados', jsonb_array_length(v_itens));
  END IF;

  IF EXISTS (SELECT 1 FROM public.missoes m WHERE m.conteudo_id = p_conteudo_id AND m.desafio IS NOT NULL) THEN
    INSERT INTO public.desafios_auto_tentativas AS d (conteudo_id, estado, iniciada_em, atualizado_em)
    VALUES (p_conteudo_id, 'gerado', now(), now())
    ON CONFLICT (conteudo_id) DO UPDATE
       SET estado = 'gerado', proxima_em = NULL, erro = NULL, atualizado_em = now();
    RETURN jsonb_build_object('estado', 'ja_tinha', 'gravados', 0, 'pulados', 0);
  END IF;

  FOR v_item IN SELECT e FROM jsonb_array_elements(v_itens) e LOOP
    BEGIN
      v_tipo := CASE WHEN jsonb_typeof(v_item) = 'object' THEN v_item #>> '{desafio,tipo}' END;
      IF jsonb_typeof(v_item -> 'perfis') = 'array' AND jsonb_array_length(v_item -> 'perfis') > 0 THEN
        SELECT array_agg(x) INTO v_perfis FROM jsonb_array_elements_text(v_item -> 'perfis') x;
      ELSIF v_tipo = 'cruzadinha' THEN
        v_perfis := ARRAY['seeker', 'mastermind'];
      ELSE
        v_perfis := ARRAY['mastermind', 'achiever'];
      END IF;
      PERFORM 1 FROM public.fn_missao_desafio_gravar(
        p_conteudo_id,
        CASE WHEN jsonb_typeof(v_item) = 'object' THEN v_item -> 'desafio' END,
        CASE WHEN jsonb_typeof(v_item) = 'object' THEN v_item -> 'resposta' END,
        v_perfis, 'pendente', v_prof);
      v_gravados := v_gravados + 1;
    EXCEPTION WHEN SQLSTATE '22023' THEN
      -- Item que nao passa na validacao e' pulado; o resto grava.
      v_pulados := v_pulados + 1;
    END;
  END LOOP;

  INSERT INTO public.desafios_auto_tentativas AS d (conteudo_id, estado, iniciada_em, atualizado_em)
  VALUES (p_conteudo_id, CASE WHEN v_gravados > 0 THEN 'gerado' ELSE 'sem_desafio' END, now(), now())
  ON CONFLICT (conteudo_id) DO UPDATE
     SET estado = EXCLUDED.estado, proxima_em = NULL, erro = NULL, atualizado_em = now();

  IF v_gravados = 0 THEN
    RETURN jsonb_build_object('estado', 'sem_desafio', 'gravados', 0, 'pulados', v_pulados);
  END IF;

  -- Um aviso por turma e dia; o texto traz o total de grupos que esperam o professor na turma.
  SELECT count(DISTINCT m.desafio_grupo)::integer INTO v_pendentes
    FROM public.missoes m
   WHERE m.classe_id = v_classe AND m.desafio IS NOT NULL AND m.aprovacao = 'pendente';
  PERFORM public.fn_professor_notificar(
    v_prof, v_classe, 'desafio_para_aprovar',
    'Desafios esperando aprovação',
    v_pendentes::text || CASE WHEN v_pendentes = 1 THEN ' desafio esperando' ELSE ' desafios esperando' END
      || ' aprovação em ' || v_turma,
    'missoes',
    'desafios_auto:' || v_classe::text || ':' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD'));

  RETURN jsonb_build_object('estado', 'gerado', 'gravados', v_gravados, 'pulados', v_pulados);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_desafio_registrar_auto(bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_missao_desafio_registrar_auto(bigint, jsonb) TO service_role;
"""

# ---------------------------------------------------------------------------------- 12. falhou
FALHOU = r"""
CREATE OR REPLACE FUNCTION public.fn_desafios_auto_falhou(p_conteudo_id bigint, p_erro text, p_espera_min integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_erro   text := NULLIF(left(btrim(split_part(replace(COALESCE(p_erro, ''), E'\r', ''), E'\n', 1)), 300), '');
  v_estado text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.conteudos c WHERE c.id = p_conteudo_id) THEN
    RETURN NULL;
  END IF;

  IF p_espera_min IS NOT NULL THEN
    -- Limite por minuto: espera e volta, sem contar como falha.
    INSERT INTO public.desafios_auto_tentativas AS d
      (conteudo_id, estado, tentativas, proxima_em, iniciada_em, erro, atualizado_em)
    VALUES (p_conteudo_id, 'esperando', 0, now() + make_interval(mins => GREATEST(p_espera_min, 0)), now(),
            v_erro, now())
    ON CONFLICT (conteudo_id) DO UPDATE
       SET estado = 'esperando', proxima_em = EXCLUDED.proxima_em, erro = EXCLUDED.erro, atualizado_em = now()
     WHERE d.estado NOT IN ('gerado', 'sem_desafio')
    RETURNING d.estado INTO v_estado;
  ELSE
    -- Falha: espera 2^n horas; na terceira, para de vez.
    INSERT INTO public.desafios_auto_tentativas AS d
      (conteudo_id, estado, tentativas, proxima_em, iniciada_em, erro, atualizado_em)
    VALUES (p_conteudo_id, 'falhou', 1, now() + interval '2 hours', now(), v_erro, now())
    ON CONFLICT (conteudo_id) DO UPDATE
       SET estado = 'falhou',
           tentativas = d.tentativas + 1,
           proxima_em = CASE WHEN d.tentativas + 1 >= 3 THEN NULL
                             ELSE now() + make_interval(hours => power(2, d.tentativas + 1)::integer) END,
           erro = EXCLUDED.erro,
           atualizado_em = now()
     WHERE d.estado NOT IN ('gerado', 'sem_desafio')
    RETURNING d.estado INTO v_estado;
  END IF;

  IF v_estado IS NULL THEN
    SELECT d.estado INTO v_estado FROM public.desafios_auto_tentativas d WHERE d.conteudo_id = p_conteudo_id;
  END IF;
  RETURN v_estado;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_desafios_auto_falhou(bigint, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_desafios_auto_falhou(bigint, text, integer) TO service_role;
"""

# --------------------------------------------------------------------------- 13. missões da IA (#151)
PEDIR_IA = _trocar(
    M20.PEDIR,
    "   WHERE m.classe_id = p_classe_id AND m.origem = 'ia' AND m.aprovacao = 'pendente';",
    "   WHERE m.classe_id = p_classe_id AND m.origem = 'ia' AND m.aprovacao = 'pendente'\n"
    "     -- Os desafios esperam a decisao em outro lugar (20261120_03): nao travam o teto.\n"
    "     AND m.desafio IS NULL;",
)

_INICIO_CONTEXTO_IA = "CREATE OR REPLACE FUNCTION public.fn_missao_ia_contexto(p_pedido_id uuid)"
_FIM_CONTEXTO_IA = "GRANT EXECUTE ON FUNCTION public.fn_missao_ia_contexto(uuid) TO service_role;\n"
CONTEXTO_IA_ANTES = M20.WORKER[
    M20.WORKER.index(_INICIO_CONTEXTO_IA) : M20.WORKER.index(_FIM_CONTEXTO_IA) + len(_FIM_CONTEXTO_IA)
]
CONTEXTO_IA = _trocar(
    CONTEXTO_IA_ANTES,
    "               WHERE classe_id = v_ped.classe_id AND origem <> 'sistema'\n",
    "               WHERE classe_id = v_ped.classe_id AND origem <> 'sistema' AND desafio IS NULL\n",
)

# ------------------------------------------------------------------------------------- 14. decidir
DECIDIR = r"""
CREATE OR REPLACE FUNCTION public.missao_desafio_decidir(p_grupo uuid, p_aprovar boolean, p_motivo text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_n integer;
BEGIN
  -- Posse antes de qualquer outra coisa: grupo de outra turma, inexistente ou quem nao e' professor
  -- recebem o mesmo erro. NOT EXISTS, e nao NOT IN. Sem sessao, nem chega a ler.
  IF auth.uid() IS NULL OR p_grupo IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.missoes m
        WHERE m.desafio_grupo = p_grupo
          AND EXISTS (SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = m.classe_id))
     OR EXISTS (
       SELECT 1 FROM public.missoes m
        WHERE m.desafio_grupo = p_grupo
          AND NOT EXISTS (SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = m.classe_id))
  THEN
    RAISE EXCEPTION 'Desafio não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF p_aprovar IS NULL THEN
    RAISE EXCEPTION 'Diga se o desafio é aprovado ou recusado.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.missoes m
     SET aprovacao = CASE WHEN p_aprovar THEN 'aprovada' ELSE 'recusada' END,
         motivo_recusa = CASE WHEN p_aprovar THEN NULL
                              ELSE left(COALESCE(NULLIF(btrim(p_motivo), ''), 'Recusado pelo professor'), 500) END
   WHERE m.desafio_grupo = p_grupo AND m.aprovacao = 'pendente';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.missao_desafio_decidir(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.missao_desafio_decidir(uuid, boolean, text) TO authenticated;
"""

# ------------------------------------------------------------------------------------------ downgrade
DESFAZER = r"""
DROP FUNCTION IF EXISTS public.missao_desafio_decidir(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.fn_desafios_auto_falhou(bigint, text, integer);
DROP FUNCTION IF EXISTS public.fn_missao_desafio_registrar_auto(bigint, jsonb);
DROP FUNCTION IF EXISTS public.fn_desafios_auto_contexto(bigint);
DROP FUNCTION IF EXISTS public.fn_desafios_auto_reivindicar(integer, integer, bigint[]);
DROP FUNCTION IF EXISTS public.fn_desafios_auto_candidatos(integer, bigint[]);
DROP FUNCTION IF EXISTS public.fn_desafios_auto_config();
DROP FUNCTION IF EXISTS public.fn_desafios_auto_fonte_serve(text, jsonb, text);
DROP FUNCTION IF EXISTS public.fn_desafios_auto_texto_da_fonte(jsonb);
DROP FUNCTION IF EXISTS public.fn_missao_desafio_gravar(bigint, jsonb, jsonb, text[], text, uuid);

DELETE FROM public.app_config WHERE chave IN (
  'desafios_auto_ligado', 'desafios_auto_por_passada', 'desafios_auto_intervalo_seg',
  'desafios_auto_por_dia', 'desafios_auto_carencia_min');

DROP TABLE IF EXISTS public.desafios_auto_tentativas;

DROP TRIGGER IF EXISTS trg_conteudos_atualizado_em ON public.conteudos;
DROP FUNCTION IF EXISTS public.fn_conteudos_atualizado_em();
ALTER TABLE public.conteudos DROP COLUMN IF EXISTS atualizado_em;
"""


def upgrade() -> None:
    op.execute(COLUNA_ATUALIZADO_EM)
    op.execute(TABELA)
    op.execute(CONFIG)
    op.execute(TIPOS)
    op.execute(GRAVAR)
    op.execute(CRIAR)
    op.execute(TEXTO_DA_FONTE)
    op.execute(CONFIG_FN)
    op.execute(CANDIDATOS)
    op.execute(REIVINDICAR)
    op.execute(CONTEXTO)
    op.execute(REGISTRAR_AUTO)
    op.execute(FALHOU)
    op.execute(PEDIR_IA)
    op.execute(CONTEXTO_IA)
    op.execute(DECIDIR)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    # A RPC do botão volta ao texto da 20261117_03 antes de a função interna sair.
    op.execute(M17_03.RPC)
    op.execute(M20.PEDIR)
    op.execute(CONTEXTO_IA_ANTES)
    op.execute(DESFAZER)
    op.execute("DELETE FROM public.professor_notificacoes WHERE tipo = 'desafio_para_aprovar'")
    op.execute(M23.TIPOS)
    op.execute("NOTIFY pgrst, 'reload schema'")
