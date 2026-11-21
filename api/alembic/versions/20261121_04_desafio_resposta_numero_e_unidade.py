"""A resposta curta do desafio aceita o número com a unidade escrita de outro jeito

Medido em 20/11, nos desafios gerados sozinhos (`20261120_03`): o Δx tinha as aceitas `-15`,
`-15 metros` e `menos 15`, e o aluno que escrevesse `-15 m` ou `-15m` errava estando certo. A
comparação da `20261117_04` (`fn_missao_desafio_comparavel`) só tirava acento, maiúscula e espaço
repetido, e trocava a vírgula decimal por ponto.

Agora, só na resposta curta, a comparação também:

1. troca o sinal de menos tipográfico (U+2212) e os travessões por `-`;
2. junta `- 15` em `-15`;
3. troca `por` entre unidade e unidade de tempo por `/` (`metros por segundo` → `metros/segundo`);
4. tira o espaço em volta de `/` e entre o número e a unidade (`20 m / s` → `20m/s`);
5. troca o nome da unidade pelo símbolo quando ela vem logo depois de um número ou de `/`:
   quilômetro, centímetro, milímetro, metro, quilograma, grama, segundo, minuto, hora e litro,
   no singular e no plural.

A mesma forma vale dos dois lados, a do aluno e a das aceitas, como antes. Por isso a mudança só
faz respostas a mais casarem: `15 kg` continua diferente de `15 m`, e nada que casava deixa de
casar. A múltipla escolha não muda (o app manda o texto da alternativa), nem a cruzadinha, nem a
validação de criação, que usam outras funções. Nada fica gravado já normalizado, então não há
backfill: os desafios que já existem passam a ser comparados pela regra nova na próxima resposta.

O downgrade devolve o texto exato da `20261117_04` (o teste de estrutura compara).

Revision ID: 20261121_04
Revises: 20261121_03
Create Date: 2026-11-20
"""

from alembic import op

revision = "20261121_04"
down_revision = "20261121_03"
branch_labels = None
depends_on = None

COMPARAVEL = r"""
-- Como a logica compara (20261121_04 sobre a 20261117_04). Na resposta curta, alem da normalizacao
-- e da virgula decimal, o numero com a unidade escrita de outro jeito vira a mesma forma.
CREATE OR REPLACE FUNCTION public.fn_missao_desafio_comparavel(p_texto text, p_curta boolean)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = ''
AS $function$
DECLARE
  v text;
BEGIN
  IF NOT p_curta THEN
    RETURN public.fn_missao_desafio_normalizar(p_texto);
  END IF;

  -- 1. Sinal de menos tipografico e travessoes viram o hifen.
  v := translate(p_texto, E'−–—', '---');
  -- Minusculas, sem acento, espacos colapsados e aparados (20261117_03).
  v := public.fn_missao_desafio_normalizar(v);
  -- Virgula entre digitos vira ponto (20261117_04).
  v := regexp_replace(v, '([0-9]),(?=[0-9])', '\1.', 'g');
  -- 2. "- 15" junta em "-15".
  v := regexp_replace(v, '(^|[^0-9a-z])- (?=[0-9])', '\1-', 'g');
  -- 3. "por" antes de unidade de tempo vira "/".
  v := regexp_replace(v, ' por (?=(segundos?|minutos?|horas?|s|min|h)([^a-z]|$))', '/', 'g');
  -- 4. Sem espaco em volta da barra nem entre o numero e a unidade.
  v := regexp_replace(v, ' ?/ ?', '/', 'g');
  v := regexp_replace(v, '([0-9]) (?=[a-z/])', '\1', 'g');
  -- 5. O nome da unidade vira o simbolo, logo depois de numero ou de barra. Os prefixos primeiro.
  v := regexp_replace(v, '([0-9/])quilometros?(?![a-z])', '\1km', 'g');
  v := regexp_replace(v, '([0-9/])centimetros?(?![a-z])', '\1cm', 'g');
  v := regexp_replace(v, '([0-9/])milimetros?(?![a-z])', '\1mm', 'g');
  v := regexp_replace(v, '([0-9/])metros?(?![a-z])', '\1m', 'g');
  v := regexp_replace(v, '([0-9/])quilogramas?(?![a-z])', '\1kg', 'g');
  v := regexp_replace(v, '([0-9/])gramas?(?![a-z])', '\1g', 'g');
  v := regexp_replace(v, '([0-9/])segundos?(?![a-z])', '\1s', 'g');
  v := regexp_replace(v, '([0-9/])minutos?(?![a-z])', '\1min', 'g');
  v := regexp_replace(v, '([0-9/])horas?(?![a-z])', '\1h', 'g');
  v := regexp_replace(v, '([0-9/])litros?(?![a-z])', '\1l', 'g');
  RETURN v;
END
$function$;
REVOKE ALL ON FUNCTION public.fn_missao_desafio_comparavel(text, boolean) FROM PUBLIC, anon, authenticated;
"""

# Texto exato da 20261117_04 (AUXILIARES), para o downgrade.
COMPARAVEL_ANTES = r"""
-- Como a logica compara (20261117_04): a normalizacao da 20261117_03 e, na resposta curta, virgula
-- entre digitos vira ponto. A mesma forma nos dois lados, aluno e gabarito.
CREATE OR REPLACE FUNCTION public.fn_missao_desafio_comparavel(p_texto text, p_curta boolean)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path = ''
AS $function$
  SELECT CASE WHEN p_curta
              THEN regexp_replace(public.fn_missao_desafio_normalizar(p_texto), '([0-9]),(?=[0-9])', '\1.', 'g')
              ELSE public.fn_missao_desafio_normalizar(p_texto) END
$function$;
REVOKE ALL ON FUNCTION public.fn_missao_desafio_comparavel(text, boolean) FROM PUBLIC, anon, authenticated;
"""


def upgrade() -> None:
    op.execute(COMPARAVEL)


def downgrade() -> None:
    # A linguagem muda (plpgsql -> sql), e CREATE OR REPLACE aceita a troca com a mesma assinatura.
    op.execute(COMPARAVEL_ANTES)
