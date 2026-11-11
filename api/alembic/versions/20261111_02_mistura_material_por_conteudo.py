"""Mistura de material por conteúdo: progresso, chave e registro de exposição (fase 2).

Spec `docs/superpowers/specs/2026-11-11-mistura-de-material-por-conteudo-design.md`.

Com a chave `mistura_material = 'alternancia'`, o app monta a rota do tópico conteúdo a conteúdo:
cada conteúdo vem inteiro de um perfil representativo do aluno, na proporção do vetor. Três peças
no banco acompanham isso:

1. **Progresso.** `trailup_progresso_percurso` contava só o manifesto do `perfil_ativo`. No ramo
   do manifesto, passa a contar também o de qualquer perfil representativo
   (`app_perfis_representativos`, da `20261111_01`). O `perfil_ativo` continua no filtro por causa
   da conta de demonstração, que escolhe entre os 7. O ramo legado (cliente sem manifesto) fica
   como estava. O denominador continua sendo o material aprovado que a rota mostra: o
   `DISTINCT ON (topico, conteudo)` fica com o manifesto mais recente, e o app regrava o manifesto
   quando a rota muda.
2. **Chaves** em `app_config`, as duas públicas (parâmetro de UI, não teto anti-abuso):
   `mistura_material` nasce `desligada`, e `mistura_material_bonus_ativo` nasce `0.5`.
3. **`personalizacao_exposicao`**: qual perfil a rota deu a cada conteúdo, sob qual política e com
   qual probabilidade. Append-only. O aluno insere e lê só o que é dele, nas turmas em que está;
   o professor lê o das turmas dele; ninguém altera nem apaga pelo cliente. Prazo em
   `retencao_politica`: `saida_turma`, 90 dias, o mesmo do conteúdo gerado para o aluno.

   **É atribuição, não visualização.** O app grava uma linha por conteúdo de todos os tópicos que
   hidrata — inclusive os bloqueados, que o aluno nunca abriu. Para saber o que ele de fato viu,
   cruze com `personalizacao_item_progresso` (ou com o manifesto em `personalizacao_percurso`).
   Cobertura e entropia de perfis sem esse cruzamento contam material que ninguém estudou.

Nada aqui muda o app antigo: ele não lê a chave e continua em perfil único, e com o manifesto do
perfil ativo o progresso dá o mesmo número de antes.

Ordem de entrada: esta migration → build novo do app → professor aprova as bases dos perfis
representativos → a chave é ligada.

**Não ligar a chave antes desta migration.** Sem a troca do progresso, o manifesto continua
filtrado por `perfil_ativo`: conteúdo que a rota deu a outro perfil sai do denominador (o tópico
chega a 100% sem ele), e conteúdo com manifesto antigo do perfil ativo faz o `DISTINCT ON` pegar o
manifesto velho (o tópico fica preso abaixo de 100% e pode travar o desbloqueio). Por isso a linha
`mistura_material` só nasce aqui, e nasce `desligada`.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261111_02"
down_revision = "20261111_01"
branch_labels = None
depends_on = None

PERFIS = ("seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever")
POLITICAS = ("perfil_unico", "proporcional")


def _aprovacao():
    caminho = Path(__file__).with_name("20261110_09_aprovacao_do_personalizado.py")
    spec = importlib.util.spec_from_file_location("_m20261110_09", caminho)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Só o CTE `manifestos` termina o filtro em `ORDER BY`; o ramo legado continua em `AND left(...)`.
PERCURSO_ANTES = "AND cp.brainhex_profile_key=al.perfil_ativo AND cp.aprovacao='aprovado'\n    ORDER BY"
PERCURSO_DEPOIS = (
    "AND (cp.brainhex_profile_key=al.perfil_ativo\n"
    "           OR cp.brainhex_profile_key = ANY (public.app_perfis_representativos(p_aluno)))\n"
    "      AND cp.aprovacao='aprovado'\n    ORDER BY"
)


def percurso_com_mistura() -> str:
    """O percurso da `20261110_09` com o ramo do manifesto aberto aos perfis representativos."""
    original = _aprovacao().percurso_novo()
    achadas = original.count(PERCURSO_ANTES)
    if achadas != 1:
        raise RuntimeError(f"esperava 1 ocorrência de {PERCURSO_ANTES!r}, achei {achadas}")
    return original.replace(PERCURSO_ANTES, PERCURSO_DEPOIS)


CHAVES = """
INSERT INTO public.app_config (chave, valor, descricao, publico)
VALUES
  ('mistura_material', 'desligada',
   'Mistura de material por conteúdo na trilha: desligada (um perfil só, como antes) ou '
   || 'alternancia (metade dos tópicos de cada aluno mistura os perfis representativos).',
   true),
  ('mistura_material_bonus_ativo', '0.5',
   'Na mistura, o peso do perfil ativo do aluno é multiplicado por 1 + este valor.',
   true)
ON CONFLICT (chave) DO NOTHING;
"""

_LISTA_PERFIS = ", ".join(f"'{p}'" for p in PERFIS)
_LISTA_POLITICAS = ", ".join(f"'{p}'" for p in POLITICAS)

TABELA = f"""
CREATE TABLE IF NOT EXISTS public.personalizacao_exposicao (
  aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  classe_id bigint NOT NULL,
  topico_id bigint NOT NULL,
  conteudo_id bigint NOT NULL,
  perfil text NOT NULL,
  politica text NOT NULL,
  prob_politica numeric NOT NULL,
  pesos jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  versao_alocador text NOT NULL,
  primeira_vez timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, conteudo_id, perfil, politica),
  CONSTRAINT personalizacao_exposicao_perfil_chk CHECK (perfil IN ({_LISTA_PERFIS})),
  CONSTRAINT personalizacao_exposicao_politica_chk CHECK (politica IN ({_LISTA_POLITICAS})),
  CONSTRAINT personalizacao_exposicao_prob_chk CHECK (prob_politica > 0 AND prob_politica <= 1)
);

COMMENT ON TABLE public.personalizacao_exposicao IS
  'Qual perfil a rota de material deu a cada conteúdo do aluno, sob qual política (mistura de '
  'material por conteúdo). Append-only; o app grava com ON CONFLICT DO NOTHING.';

CREATE INDEX IF NOT EXISTS personalizacao_exposicao_classe_idx
  ON public.personalizacao_exposicao (classe_id, topico_id);

ALTER TABLE public.personalizacao_exposicao ENABLE ROW LEVEL SECURITY;

-- O default do Supabase dá tudo a anon e authenticated; aqui só o que as policies cobrem.
REVOKE ALL ON public.personalizacao_exposicao FROM anon, authenticated;
GRANT SELECT, INSERT ON public.personalizacao_exposicao TO authenticated;

DROP POLICY IF EXISTS personalizacao_exposicao_aluno_ins ON public.personalizacao_exposicao;
CREATE POLICY personalizacao_exposicao_aluno_ins ON public.personalizacao_exposicao
  FOR INSERT TO authenticated
  WITH CHECK (aluno_id = auth.uid() AND classe_id IN (SELECT public.app_classes_do_aluno()));

DROP POLICY IF EXISTS personalizacao_exposicao_aluno_sel ON public.personalizacao_exposicao;
CREATE POLICY personalizacao_exposicao_aluno_sel ON public.personalizacao_exposicao
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid());

DROP POLICY IF EXISTS personalizacao_exposicao_professor_sel ON public.personalizacao_exposicao;
CREATE POLICY personalizacao_exposicao_professor_sel ON public.personalizacao_exposicao
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()));

INSERT INTO public.retencao_politica
  (tabela, acao, coluna_tempo, coluna_aluno, dias, ordem, categoria, motivo)
VALUES
  ('personalizacao_exposicao', 'saida_turma', NULL, 'aluno_id', 90, 130, 'saida_turma',
   'qual perfil a rota de material deu a cada conteudo do aluno naquela turma; prazo do conteudo gerado')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

RELOAD = "NOTIFY pgrst, 'reload schema';"


def upgrade() -> None:
    op.execute(percurso_com_mistura())
    op.execute(CHAVES)
    op.execute(TABELA)
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute("DELETE FROM public.retencao_politica WHERE tabela = 'personalizacao_exposicao'")
    op.execute("DROP TABLE IF EXISTS public.personalizacao_exposicao")
    op.execute(
        "DELETE FROM public.app_config WHERE chave IN ('mistura_material', 'mistura_material_bonus_ativo')"
    )
    op.execute(_aprovacao().percurso_novo())
    op.execute(RELOAD)
