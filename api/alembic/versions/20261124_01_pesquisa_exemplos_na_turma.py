"""Turma de demonstração da pesquisa: um exemplo de cada coisa que o professor configura

`pesquisa_preparar_avaliador` copia a turma-modelo com `duplicar_classe`, que leva só a trilha
(tópicos, conteúdos, atividades, questões e cards). Missões, desafios, conquistas, economia, fundo,
guildas e eventos ficavam vazios: o avaliador abria cada aba do console e via a tela de "nada
cadastrado", sem entender o que aquilo faz. As tarefas do roteiro pedem justamente para olhar essas
abas.

## `fn_pesquisa_semear_exemplos(p_classe_id, p_professor)`

Grava um exemplo de cada, já preenchido e editável, na turma do avaliador:

| Aba | Exemplo |
|---|---|
| Missões | quatro metas (minutos de estudo, dias seguidos, a turma inteira, a guilda) e uma só para o perfil Mastermind |
| Desafios | um de lógica (múltipla escolha) e uma cruzadinha, para os 7 perfis, já aprovados |
| Conquistas | três comuns e uma de perfil |
| Economia | preço e estoque do "Tempo extra" na turma, um item dado a cada aluno, o valor de missão concluída e uma meta coletiva |
| Fundo da turma | um fundo aberto |
| Guildas | formação aberta por 14 dias, até 4 por guilda |
| Eventos | um rascunho na semana seguinte, com missão e rank do evento |

**Pelos mesmos caminhos do console.** O que o console grava por RPC (conquista, economia, fundo,
guilda, missões do evento) passa pela mesma RPC, com as claims do professor da turma (locais à
transação e restauradas no fim), e herda a posse e cada validação dela. O que o console grava por
INSERT (missão, evento) é INSERT aqui, e os gatilhos `trg_missoes_guarda` e
`trg_eventos_classe_guarda` conferem como conferem o do console. Os desafios saem de
`fn_missao_desafio_gravar`, a mesma gravação da RPC `missao_desafio_criar`; a posse que a RPC confere
já está garantida, porque a turma acabou de ser criada para este professor.

**Exemplo que falha não impede a conta.** Cada bloco roda na própria subtransação. Se um for
recusado (um CHECK novo, um item que saiu do catálogo), os outros entram, a falha sai em
`exemplos.falhas` no retorno e num `WARNING` no log, e o avaliador recebe a conta do mesmo jeito.
Sem trilha (turma-modelo vazia), os exemplos que dependem dela (desafios, missões do evento) são
pulados.

**Nenhum exemplo paga ninguém.** São configurações: nada aqui escreve em `eventos_aluno`, e o evento
nasce em rascunho, fora do horário, com `abrir_no_inicio = false`.

`EXECUTE` só para o dono e o `service_role`: o cliente não semeia turma.

## Quem já foi preparado

`pesquisa_avaliador.exemplos_em` registra quando os exemplos entraram. O `upgrade` semeia quem já
estava preparado sem eles (a turma de quem se inscreveu antes desta migration), uma vez só.

Nem a preparação nem o `upgrade` param por causa dos exemplos: a semeadura inteira roda numa
subtransação, e o erro vira `WARNING` (e `exemplos.erro` no retorno da preparação). A API aplica esta
migration ao subir, e um erro solto aqui a derrubaria.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261124_01"
down_revision = "20261123_03"
branch_labels = None
depends_on = None


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"m_{arquivo[:11]}", caminho)
    assert spec and spec.loader
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M02 = _modulo("20261123_02_pesquisa_topicos_publicados.py")

COLUNA = """
ALTER TABLE public.pesquisa_avaliador ADD COLUMN IF NOT EXISTS exemplos_em timestamptz;
COMMENT ON COLUMN public.pesquisa_avaliador.exemplos_em IS
  'Quando fn_pesquisa_semear_exemplos gravou os exemplos na turma de demonstração (20261124_01).';
"""

SEMEAR = r"""
CREATE OR REPLACE FUNCTION public.fn_pesquisa_semear_exemplos(p_classe_id bigint, p_professor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_topico bigint;
  v_conteudo bigint;
  v_atividade bigint;
  v_evento uuid;
  v_feitos text[] := '{}';
  v_falhas jsonb := '[]'::jsonb;
BEGIN
  IF p_classe_id IS NULL OR p_professor IS NULL THEN
    RAISE EXCEPTION 'Turma e professor são obrigatórios.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classe c WHERE c.id = p_classe_id AND c.professor_id = p_professor) THEN
    RAISE EXCEPTION 'A turma % não é deste professor.', p_classe_id USING ERRCODE = '42501';
  END IF;

  -- Primeiro tópico, conteúdo e atividade da trilha, na ordem em que o aluno os vê.
  SELECT t.id INTO v_topico
    FROM public.topicos t WHERE t.classe_id = p_classe_id
   ORDER BY t.ordem NULLS LAST, t.id LIMIT 1;
  SELECT c.id INTO v_conteudo
    FROM public.conteudos c JOIN public.topicos t ON t.id = c.topico_id
   WHERE t.classe_id = p_classe_id
   ORDER BY t.ordem NULLS LAST, t.id, c.ordem NULLS LAST, c.id LIMIT 1;
  SELECT a.id INTO v_atividade
    FROM public.atividades a JOIN public.topicos t ON t.id = a.topico_id
   WHERE t.classe_id = p_classe_id
   ORDER BY t.ordem NULLS LAST, t.id, a.id LIMIT 1;

  -- As RPCs do console conferem a posse por auth.uid(): durante a semeadura, quem chama é o
  -- professor da turma. Local à transação e restaurado no fim.
  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('sub', p_professor::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_professor::text, true);

  -- Missões: as quatro metas do formulário (cada métrica com a chave que o avaliador lê) e uma de perfil.
  BEGIN
    INSERT INTO public.missoes (classe_id, origem, escopo, perfil_alvo, titulo, descricao, criterio,
                                recompensa_tipo, janela_fim, criado_por)
    VALUES
      (p_classe_id, 'professor', 'aluno', NULL, 'Uma hora de estudo',
       'Exemplo de missão: some 60 minutos de estudo na trilha. Edite o alvo, o prazo ou apague.',
       '{"metrica": "minutos_totais", "minutos": 60}'::jsonb, 'missao_concluida', now() + interval '30 days', p_professor),
      (p_classe_id, 'professor', 'aluno', NULL, 'Três dias seguidos',
       'Exemplo de missão: estude três dias seguidos para manter o ritmo.',
       '{"metrica": "dias_seguidos", "dias_seguidos": 3}'::jsonb, 'missao_concluida', now() + interval '30 days', p_professor),
      (p_classe_id, 'professor', 'turma', NULL, 'Mutirão da turma',
       'Exemplo de missão coletiva: a turma inteira soma 10 atividades concluídas.',
       '{"metrica": "atividades_concluidas", "minimo": 10}'::jsonb, 'missao_concluida', now() + interval '30 days', p_professor),
      (p_classe_id, 'professor', 'guilda', NULL, 'Guilda em ação',
       'Exemplo de missão de guilda: os membros somam 6 atividades concluídas.',
       '{"metrica": "atividades_concluidas", "minimo": 6}'::jsonb, 'missao_concluida', now() + interval '30 days', p_professor),
      (p_classe_id, 'professor', 'aluno', 'mastermind', 'Estratégia certeira',
       'Exemplo de missão só para o perfil Mastermind: acerte 80 por cento das questões.',
       '{"metrica": "acertos_percentual", "percentual": 80}'::jsonb, 'missao_concluida', now() + interval '30 days', p_professor);
    v_feitos := v_feitos || 'missoes';
  EXCEPTION WHEN OTHERS THEN
    v_falhas := v_falhas || jsonb_build_object('exemplo', 'missoes', 'erro', SQLERRM);
  END;

  -- Desafios: a mesma gravação da RPC missao_desafio_criar, já aprovados, para os 7 perfis.
  IF v_conteudo IS NULL THEN
    v_falhas := v_falhas || jsonb_build_object('exemplo', 'desafios', 'erro', 'turma sem conteúdo');
  ELSE
    BEGIN
      PERFORM public.fn_missao_desafio_gravar(
        v_conteudo,
        jsonb_build_object(
          'tipo', 'logica', 'formato', 'multipla',
          'enunciado', 'Um laço repete um bloco enquanto a condição for verdadeira. Quantas vezes o bloco roda em "para i de 1 até 4"?',
          'alternativas', jsonb_build_array('3', '4', '5')),
        jsonb_build_object('aceitas', jsonb_build_array('4')),
        ARRAY['seeker','survivor','daredevil','mastermind','conqueror','socializer','achiever'],
        'aprovada', p_professor);
      -- Grade 7 x 7. LACO e LOGICA dividem o L; LACO e CODIGO, o C; ALOCAR cruza LOGICA no A e CODIGO no O.
      PERFORM public.fn_missao_desafio_gravar(
        v_conteudo,
        jsonb_build_object(
          'tipo', 'cruzadinha', 'linhas', 7, 'colunas', 7,
          'palavras', jsonb_build_array(
            jsonb_build_object('numero', 1, 'direcao', 'h', 'linha', 0, 'coluna', 0, 'tamanho', 4,
                               'pista', 'Estrutura que repete um bloco de instruções'),
            jsonb_build_object('numero', 1, 'direcao', 'v', 'linha', 0, 'coluna', 0, 'tamanho', 6,
                               'pista', 'Estudo do raciocínio válido'),
            jsonb_build_object('numero', 2, 'direcao', 'v', 'linha', 0, 'coluna', 2, 'tamanho', 6,
                               'pista', 'Instruções escritas para o computador'),
            jsonb_build_object('numero', 3, 'direcao', 'h', 'linha', 5, 'coluna', 0, 'tamanho', 6,
                               'pista', 'Reservar memória para uma variável'))),
        jsonb_build_object('palavras', jsonb_build_object(
          '1h', 'LACO', '1v', 'LOGICA', '2v', 'CODIGO', '3h', 'ALOCAR')),
        ARRAY['seeker','survivor','daredevil','mastermind','conqueror','socializer','achiever'],
        'aprovada', p_professor);
      v_feitos := v_feitos || 'desafios';
    EXCEPTION WHEN OTHERS THEN
      v_falhas := v_falhas || jsonb_build_object('exemplo', 'desafios', 'erro', SQLERRM);
    END;
  END IF;

  -- Conquistas da turma, pela RPC do console.
  BEGIN
    PERFORM public.conquista_da_turma_salvar(p_classe_id, NULL, 'Primeiro passo',
      'Concluiu a primeira atividade da trilha.', 'comum', NULL,
      '{"metrica": "atividades_concluidas", "minimo": 1}'::jsonb, 10);
    PERFORM public.conquista_da_turma_salvar(p_classe_id, NULL, 'Constância',
      'Estudou cinco dias seguidos.', 'comum', NULL,
      '{"metrica": "dias_seguidos", "dias_seguidos": 5}'::jsonb, 20);
    PERFORM public.conquista_da_turma_salvar(p_classe_id, NULL, 'Explorador da trilha',
      'Visitou três tópicos diferentes.', 'comum', NULL,
      '{"metrica": "topicos_visitados", "visitados": 3}'::jsonb, 15);
    PERFORM public.conquista_da_turma_salvar(p_classe_id, NULL, 'Curiosidade em dia',
      'Para o perfil Seeker: 30 minutos explorando o material.', 'perfil', 'seeker',
      '{"metrica": "minutos_totais", "minutos": 30}'::jsonb, 15);
    v_feitos := v_feitos || 'conquistas';
  EXCEPTION WHEN OTHERS THEN
    v_falhas := v_falhas || jsonb_build_object('exemplo', 'conquistas', 'erro', SQLERRM);
  END;

  -- Economia, pelas RPCs do console: preço e estoque de um item, um item dado a cada aluno, o valor
  -- da missão concluída na turma e uma meta coletiva.
  BEGIN
    PERFORM public.economia_salvar_preco_classe(p_classe_id, 'tempo_extra', 6, 20, 2, true, NULL);
    PERFORM public.economia_salvar_dotacao(p_classe_id, 'tempo_extra', 1);
    PERFORM public.economia_salvar_valores_evento(p_classe_id, 'missao_concluida', 20, 5);
    PERFORM public.economia_salvar_meta(NULL, p_classe_id, 'classe', NULL, 'Turma afiada',
                                        'atividades_concluidas', 5, 10, 20);
    v_feitos := v_feitos || 'economia';
  EXCEPTION WHEN OTHERS THEN
    v_falhas := v_falhas || jsonb_build_object('exemplo', 'economia', 'erro', SQLERRM);
  END;

  BEGIN
    PERFORM public.fundo_turma_criar(p_classe_id, 'Aula de revisão em jogo',
      'Quando a turma juntar as moedas, a próxima revisão vira um jogo em sala.', 200);
    v_feitos := v_feitos || 'fundo';
  EXCEPTION WHEN OTHERS THEN
    v_falhas := v_falhas || jsonb_build_object('exemplo', 'fundo', 'erro', SQLERRM);
  END;

  BEGIN
    PERFORM public.guilda_configurar_turma(p_classe_id, 4, now(), now() + interval '14 days');
    v_feitos := v_feitos || 'guildas';
  EXCEPTION WHEN OTHERS THEN
    v_falhas := v_falhas || jsonb_build_object('exemplo', 'guildas', 'erro', SQLERRM);
  END;

  -- Evento em rascunho na semana seguinte, com a primeira atividade como missão e o rank do evento.
  BEGIN
    INSERT INTO public.eventos_classe (classe_id, topico_id, titulo, descricao, inicio, fim, pecas,
                                       arena_criterios, pontos, moedas, medalha_participacao,
                                       medalha_destaque, recompensa, abrir_no_inicio, criado_por)
    VALUES (p_classe_id, v_topico, 'Semana do desafio',
            'Exemplo de evento: uma semana com missão própria e rank de quem quiser entrar. Fica em rascunho até você abrir.',
            date_trunc('day', now()) + interval '7 days', date_trunc('day', now()) + interval '14 days',
            '["missoes", "arena"]'::jsonb, ARRAY['missoes']::text[], 50, 10, true, true,
            'Os três primeiros escolhem o tema da próxima revisão.', false, p_professor)
    RETURNING id INTO v_evento;
    IF v_atividade IS NOT NULL THEN
      PERFORM public.evento_classe_definir_missoes(v_evento, ARRAY[v_atividade]);
    END IF;
    v_feitos := v_feitos || 'evento';
  EXCEPTION WHEN OTHERS THEN
    v_falhas := v_falhas || jsonb_build_object('exemplo', 'evento', 'erro', SQLERRM);
  END;

  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);

  IF jsonb_array_length(v_falhas) > 0 THEN
    RAISE WARNING 'Exemplos da turma % com falha: %', p_classe_id, v_falhas;
  END IF;
  RETURN jsonb_build_object('feitos', to_jsonb(v_feitos), 'falhas', v_falhas);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pesquisa_semear_exemplos(bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pesquisa_semear_exemplos(bigint, uuid) TO service_role;
"""

# A preparação semeia depois de gravar o avaliador: as RPCs conferem a posse pela turma, que a esta
# altura já é do professor novo.
_ANTES = "  RETURN jsonb_build_object('ja_existia', false, 'classe_id', v_nova, 'situacao', 'conta_criada');"
_DEPOIS = """  -- Um exemplo de cada coisa que o professor configura (missões, conquistas, economia...), 20261124_01.
  -- Falha aqui não desfaz a conta: sem exemplos_em, a próxima migration ou a equipe semeia depois.
  BEGIN
    v_exemplos := public.fn_pesquisa_semear_exemplos(v_nova, p_professor);
    UPDATE public.pesquisa_avaliador SET exemplos_em = now() WHERE classe_id = v_nova;
  EXCEPTION WHEN OTHERS THEN
    v_exemplos := jsonb_build_object('erro', SQLERRM);
    RAISE WARNING 'Exemplos da turma % não entraram: %', v_nova, SQLERRM;
  END;

  RETURN jsonb_build_object('ja_existia', false, 'classe_id', v_nova, 'situacao', 'conta_criada',
                            'exemplos', v_exemplos);"""
_DECLARE_ANTES = "  v_nome text := btrim(coalesce(p_nome, ''));\nBEGIN"
_DECLARE_DEPOIS = "  v_nome text := btrim(coalesce(p_nome, ''));\n  v_exemplos jsonb;\nBEGIN"

assert M02.SQL.count(_ANTES) == 1 and M02.SQL.count(_DECLARE_ANTES) == 1
PREPARAR = M02.SQL.replace(_ANTES, _DEPOIS).replace(_DECLARE_ANTES, _DECLARE_DEPOIS)

# Quem já tinha sido preparado antes desta migration recebe os exemplos uma vez.
BACKFILL = """
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT pa.id, pa.classe_id, pa.professor_id
             FROM public.pesquisa_avaliador pa
             JOIN public.classe c ON c.id = pa.classe_id AND c.professor_id = pa.professor_id
            WHERE pa.exemplos_em IS NULL
  LOOP
    -- A API roda esta migration ao subir: um erro aqui a derrubaria. Avisa e segue.
    BEGIN
      PERFORM public.fn_pesquisa_semear_exemplos(r.classe_id, r.professor_id);
      UPDATE public.pesquisa_avaliador SET exemplos_em = now() WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Exemplos da turma % não entraram: %', r.classe_id, SQLERRM;
    END;
  END LOOP;
END;
$do$;
"""

DOWNGRADE_SQL = (
    M02.SQL
    + """
DROP FUNCTION IF EXISTS public.fn_pesquisa_semear_exemplos(bigint, uuid);
ALTER TABLE public.pesquisa_avaliador DROP COLUMN IF EXISTS exemplos_em;
"""
)


def upgrade() -> None:
    op.execute(COLUNA)
    op.execute(SEMEAR)
    op.execute(PREPARAR)
    op.execute(BACKFILL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
