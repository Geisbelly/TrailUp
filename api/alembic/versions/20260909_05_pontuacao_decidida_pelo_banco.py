"""o banco decide quanto vale cada evento; o cliente so diz o que aconteceu

Medido no aluno de demonstracao (classe 32), 386 eventos:

| tipo               | qtd | pontos | resolve classe |
|--------------------|-----|--------|----------------|
| ciclo_iniciado     | 208 |   6466 |              0 |
| ciclo_executado    |   1 |      4 |              0 |
| atividade_revisada |  86 |      0 |             16 |
| atividade_concluida|   5 |      0 |              4 |
| conteudo_concluido |  15 |      0 |              2 |
| todo o resto       |  71 |      0 |              - |

Dois defeitos somados fazem o ranking de pontuacao ser **zero para todo mundo,
sempre**:

1. **Todo evento de estudo entra com `valor = 0`.** Quem decide o valor e'
   `registrarEventoPontos` no cliente, e ele manda zero.
2. **O unico com valor e' o ciclo da IA**, cuja `referencia` e' um UUID. A view
   do rank resolve a classe por id numerico e descarta o que nao resolve, entao
   esses 6470 pontos nunca chegaram a lugar nenhum.

E um evento de ciclo da IA valer 6466 pontos e', por si, errado: nao e' esforco
do aluno.

A correcao inverte quem manda. O cliente continua dizendo **o que aconteceu**; o
valor passa a sair de `eventos_pontuacao`, por gatilho `BEFORE INSERT`, e o que
vier no `valor` e' ignorado. Isso fecha de uma vez o buraco do #164: a policy de
INSERT precisa continuar deixando o aluno gravar evento de estudo (e' o cliente
dele que grava), mas ele deixa de escolher quanto isso vale.

**Tipo desconhecido vale 0, nao e' recusado.** Recusar seria mais rigido e
quebraria o fluxo do aluno na cara dele se algum cliente emitisse um tipo novo.
Valendo zero, o `topico_qualquercoisa` que a view resolveria por prefixo deixa de
render pontos -- o buraco fecha do mesmo jeito, sem transformar um evento
inesperado em erro de tela.

**Evento creditado nao passa por aqui.** Presenca, participacao e premio de
conquista tem valor definido por quem concede (a RPC ou o proprio gatilho de
conquistas), e `fn_evento_creditado()` os separa.

Os valores sao semente, nao dogma: a tabela existe para serem ajustados sem
migracao nova. A calibragem do estudo de referencia e' 10 XP por aula presencial,
e faixas de 10/20/30 por acerto em quiz -- as faixas ficam para o #143, que vai
ler esta mesma tabela.

O historico e' reescrito de proposito: os valores antigos foram escolhidos pelo
cliente e nao significam nada. Como o rank ja mostrava zero, ninguem perde
posicao -- os alunos ganham a pontuacao que sempre deveriam ter tido.

Revision ID: 20260909_05
Revises: 20260909_04
Create Date: 2026-09-09
"""

from alembic import op

revision = "20260909_05"
down_revision = "20260909_04"
branch_labels = None
depends_on = None


# tipo -> (pontos, por que)
PONTUACAO: dict[str, tuple[int, str]] = {
    # A unidade base de estudo.
    "conteudo_concluido": (10, "Concluiu um conteudo"),
    # Custa mais que ler, entao vale mais.
    "atividade_concluida": (15, "Concluiu uma atividade"),
    "atividade_acertada": (5, "Acertou uma questao"),
    # Nunca negativo: errar faz parte de aprender, e o placar nao pode andar
    # para tras por isso.
    "atividade_errada": (0, "Errou uma questao"),
    # Rever conta, mas pouco: sao 86 eventos num aluno so' -- a 10 pontos cada,
    # revisar dominaria o ranking inteiro.
    "atividade_revisada": (2, "Revisou uma atividade"),
    # Abrir nao e' esforco.
    "topico_aberto": (0, "Abriu um topico"),
    "topico_iniciado": (0, "Comecou um topico"),
    "topico_pular_conteudo": (0, "Pulou um conteudo"),
    "conteudo_aberto": (0, "Abriu um conteudo"),
    "atividade_iniciada": (0, "Comecou uma atividade"),
    # O ciclo e' da IA, nao do aluno. Era daqui que saiam 6466 dos 6470 pontos.
    "ciclo_iniciado": (0, "Ciclo de personalizacao iniciado"),
    "ciclo_executado": (0, "Ciclo de personalizacao executado"),
}


def _linhas_seed() -> str:
    partes = []
    for tipo, (pontos, descricao) in PONTUACAO.items():
        partes.append(f"    ('{tipo}', {pontos}, '{descricao}')")
    return ",\n".join(partes)


TABELA = f"""
CREATE TABLE IF NOT EXISTS public.eventos_pontuacao (
  tipo          text PRIMARY KEY,
  pontos        numeric NOT NULL DEFAULT 0 CHECK (pontos >= 0),
  descricao     text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eventos_pontuacao ENABLE ROW LEVEL SECURITY;

-- O aluno pode ver quanto vale cada coisa; ninguem escreve pelo cliente.
DROP POLICY IF EXISTS eventos_pontuacao_sel ON public.eventos_pontuacao;
CREATE POLICY eventos_pontuacao_sel ON public.eventos_pontuacao
  FOR SELECT TO authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.eventos_pontuacao FROM anon, authenticated;

INSERT INTO public.eventos_pontuacao (tipo, pontos, descricao)
VALUES
{_linhas_seed()}
ON CONFLICT (tipo) DO NOTHING;
"""

FUNCAO = """
CREATE OR REPLACE FUNCTION public.fn_pontos_do_evento(p_tipo text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  -- Tipo desconhecido vale zero: o evento fica registrado, mas nao pontua.
  SELECT COALESCE(
    (SELECT pontos FROM public.eventos_pontuacao WHERE tipo = p_tipo),
    0
  );
$fn$;
"""

GATILHO = """
CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_valor_do_banco()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Creditado tem valor de quem concede: presenca e participacao vem da RPC,
  -- o premio de conquista vem de `conquistas.pontos_recompensa`.
  IF public.fn_evento_creditado(NEW.tipo) THEN
    RETURN NEW;
  END IF;

  -- Para todo o resto, o que o cliente mandou em `valor` e' descartado.
  NEW.valor := public.fn_pontos_do_evento(NEW.tipo);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_eventos_aluno_valor_ins ON public.eventos_aluno;
CREATE TRIGGER trg_eventos_aluno_valor_ins
  BEFORE INSERT ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trg_eventos_aluno_valor_do_banco();

-- Tambem no UPDATE: senao bastaria inserir com zero e corrigir depois.
DROP TRIGGER IF EXISTS trg_eventos_aluno_valor_upd ON public.eventos_aluno;
CREATE TRIGGER trg_eventos_aluno_valor_upd
  BEFORE UPDATE OF valor, tipo ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trg_eventos_aluno_valor_do_banco();
"""

# O que ja esta gravado veio do cliente e nao significa nada. Reescrever alinha o
# razao com a regra nova -- e como o rank mostrava zero, ninguem perde posicao.
BACKFILL = """
UPDATE public.eventos_aluno e
   SET valor = public.fn_pontos_do_evento(e.tipo)
 WHERE NOT public.fn_evento_creditado(e.tipo)
   AND COALESCE(e.valor, -1) IS DISTINCT FROM public.fn_pontos_do_evento(e.tipo);
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(FUNCAO)
    op.execute(GATILHO)
    op.execute(BACKFILL)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_eventos_aluno_valor_ins ON public.eventos_aluno")
    op.execute("DROP TRIGGER IF EXISTS trg_eventos_aluno_valor_upd ON public.eventos_aluno")
    op.execute("DROP FUNCTION IF EXISTS public.trg_eventos_aluno_valor_do_banco()")
    op.execute("DROP FUNCTION IF EXISTS public.fn_pontos_do_evento(text)")
    # A tabela fica: os valores antigos vieram do cliente e nao ha para onde
    # voltar.
