"""O banco só entrega o texto da IA que passou pela guarda de hoje (correção da #827)

A #827 pôs em `agente_notificacao` a guarda que recusa jargão de sistema ("hipótese", "evidência",
"modelo"), placeholder (`[MOCK]`, "Aluno") e frase longa. Ela vale **na geração**. Só que a sugestão
espera na fila até o horário do aluno (`notificacoes_ia_promover`, `20261102_01`), e o banco entrega
o texto do jeito que foi gravado. Medido em produção:

- `notificacoes_ia` 33: escrita pelo modelo em 01/11 às 22:18 UTC, antes da #827 (02/11, 14:05 UTC);
- a pendente 17111 foi para o horário de hábito do aluno e saiu em 02/11 às 17:30 UTC (14:30 em
  Fortaleza): "Próxima hipótese em [MOCK] Aceleração / A evidência apoia a progressão do modelo...".

Agora o texto carrega a versão da guarda que o aprovou (`contexto.texto_guarda`, gravado pela API:
`TEXTO_GUARDA_VERSAO` em `agente_notificacao`, também no aviso da intervenção), e
`notificacoes_entregar` suprime a sugestão da API (`notificacoes_ia.origem = 'ciclo'`) sem a marca ou
com marca abaixo de `notificacoes_config.texto_guarda_versao_minima`:

- a pendente vira `suprimida` com `ultimo_erro = 'texto_fora_da_guarda'`;
- a sugestão vira `suprimida` com `motivo = 'texto_fora_da_guarda'`.

O banco não julga texto: repetir a guarda em SQL seria uma segunda lista de palavras para manter em
paridade. Ele só recusa o que uma guarda mais velha aprovou. Quando a guarda endurecer, sobe a versão
na API e o mínimo aqui, numa migração nova, e o que estiver na fila com a marca velha não sai.

Fica de fora o que não é texto de modelo da API: o aviso de alteração do professor
(`origem = 'professor'`, texto do banco) e tudo que entra na fila sem `sugestao_id` (rotina, rank,
novo material, sequência).

**Ordem de subida:** com esta migração aplicada e a API ainda sem a marca, toda sugestão da API é
suprimida até o deploy. É o lado seguro (nada sai com jargão); a API publicada precisa ter este commit.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261102_24"
down_revision = "20261102_23"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()
CHAVE = "texto_guarda_versao_minima"
VERSAO_MINIMA = 1

CONFIG = f"""
INSERT INTO public.notificacoes_config (chave, valor, descricao) VALUES
  ('{CHAVE}', '{VERSAO_MINIMA}',
   'Versão mínima da guarda de texto (contexto.texto_guarda) para a sugestão da API ser entregue.')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, descricao = EXCLUDED.descricao;
"""

CONFIG_FORA = f"DELETE FROM public.notificacoes_config WHERE chave = '{CHAVE}';"

# Ancora: logo depois do bloco de silenciado do loop de entrega (20261102_18).
ANCORA = """      CONTINUE;
    END IF;

    v_dia := public.notificacoes_dia_local(COALESCE(v_reg.contexto->>'timezone', 'UTC'));
"""

GUARDA = """      CONTINUE;
    END IF;

    -- Texto da IA aprovado por guarda mais velha que a de hoje, ou sem guarda nenhuma, nao sai
    -- (20261102_24): a sugestao espera na fila e a guarda pode ter mudado nesse meio-tempo.
    IF v_reg.sugestao_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM notificacoes_ia s
                    WHERE s.id = v_reg.sugestao_id AND s.origem = 'ciclo')
       AND (CASE WHEN COALESCE(v_reg.contexto->>'texto_guarda', '') ~ '^[0-9]{1,6}$'
                 THEN (v_reg.contexto->>'texto_guarda')::integer ELSE 0 END)
           < public.notificacoes_cfg_int('texto_guarda_versao_minima', 0) THEN
      UPDATE notificacoes_pendentes
         SET status = 'suprimida', ultimo_erro = 'texto_fora_da_guarda', atualizado_em = now()
       WHERE id = v_reg.id;
      UPDATE notificacoes_ia
         SET status = 'suprimida', motivo = 'texto_fora_da_guarda'
       WHERE id = v_reg.sugestao_id;
      CONTINUE;
    END IF;

    v_dia := public.notificacoes_dia_local(COALESCE(v_reg.contexto->>'timezone', 'UTC'));
"""

RELOAD = "NOTIFY pgrst, 'reload schema';"


def _load(nome: str):
    path = AQUI.with_name(nome)
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_02_24", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def entregar_anterior() -> str:
    """`notificacoes_entregar` como a `20261102_18` a deixou (recortada da origem, não copiada)."""
    m18 = _load("20261102_18_notificacao_por_perfil_e_foco.py")
    return m18._funcao(m18.FUNCOES, "notificacoes_entregar", "20261102_18")


def entregar_nova() -> str:
    anterior = entregar_anterior()
    if anterior.count(ANCORA) != 1:
        raise RuntimeError("o loop de notificacoes_entregar mudou de forma; revise a 20261102_24")
    return anterior.replace(ANCORA, GUARDA, 1)


def upgrade() -> None:
    op.execute(CONFIG)
    op.execute(entregar_nova())
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(entregar_anterior())
    op.execute(CONFIG_FORA)
    op.execute(RELOAD)
