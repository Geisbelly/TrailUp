"""O professor escolhe a turma e o perfil da missão — ao criar e ao editar

## O que travava

`fn_missoes_guarda` congelava `classe_id` e `perfil_alvo` em **todo** UPDATE, de qualquer missão
(`20261021_02`). Fazia sentido quando `perfil_alvo` era só da diária por coorte; mas o avaliador
(`trg_eventos_aluno_after_iud`, `20261021_20`) e o app do aluno (`montarMissoes`) já entregam e
avaliam missão com `perfil_alvo` para qualquer origem. Faltava o professor poder dizer isso — e,
editando, mudar de ideia sobre a turma ou o perfil sem apagar e recriar.

## O que muda

- `classe_id` e `perfil_alvo` passam a ser editáveis na missão que **não** é diária do sistema
  (`origem <> 'sistema'` e `dia IS NULL`). A diária continua com os dois congelados: a chave dela é
  `(classe_id, perfil_alvo, dia, slot)`, e o gerador é quem decide.
- **A turma nova é conferida pela policy**, não aqui: `missoes_professor_all` tem
  `WITH CHECK (classe_id IN app_classes_do_professor())`, então mover para turma alheia falha.
- **Guilda não tem perfil** (`22023`): o laço da guilda soma os membros e ignora `perfil_alvo` — a
  missão diria "só Achiever" e valeria para todos.
- **Entrega aponta atividade da própria turma** (`22023`): mover a missão sem mover a atividade
  deixaria o aluno da turma nova com uma missão cuja atividade ele não vê. O console move a atividade
  para um tópico da turma nova **antes** de gravar a missão.

O resto da guarda é o da `20261103_05`, lido de lá e trocado por âncora (o teste confere).

Revision ID: 20261103_06
Revises: 20261103_05
Create Date: 2026-11-03
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261103_06"
down_revision = "20261103_05"
branch_labels = None
depends_on = None


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _trocar(texto: str, antes: str, depois: str) -> str:
    if texto.count(antes) != 1:
        raise RuntimeError(f"âncora ausente ou repetida: {antes[:60]!r}")
    return texto.replace(antes, depois)


def guarda_anterior() -> str:
    return _modulo("20261103_05_missao_diaria_pela_trilha.py").GUARDA


_CONGELA_ANTES = """    NEW.classe_id   := OLD.classe_id;
    NEW.origem      := OLD.origem;
    NEW.criado_por  := OLD.criado_por;
    NEW.dia         := OLD.dia;
    NEW.slot        := OLD.slot;
    NEW.perfil_alvo := OLD.perfil_alvo;
"""
_CONGELA_DEPOIS = """    NEW.origem      := OLD.origem;
    NEW.criado_por  := OLD.criado_por;
    NEW.dia         := OLD.dia;
    NEW.slot        := OLD.slot;
    -- Turma e perfil sao escolha de quem cria (20261103_06); so' a diaria do sistema os tem
    -- fixos, porque fazem parte da chave dela. A turma nova e' conferida pela policy.
    IF OLD.origem = 'sistema' OR OLD.dia IS NOT NULL THEN
      NEW.classe_id   := OLD.classe_id;
      NEW.perfil_alvo := OLD.perfil_alvo;
    END IF;
"""

_REGRAS_ANTES = "  -- Recompensa e chave de `eventos_pontuacao`, nao numero."
_REGRAS_DEPOIS = """  -- Guilda soma os membros e o laco dela ignora `perfil_alvo`: a missao diria um perfil e
  -- valeria para todos (20261103_06).
  IF NEW.escopo = 'guilda' AND NEW.perfil_alvo IS NOT NULL THEN
    RAISE EXCEPTION 'Missao de guilda nao tem perfil: ela soma todos os membros.' USING ERRCODE = '22023';
  END IF;

  -- A entrega aponta atividade da propria turma. Sem isto, mover a missao de turma sem mover a
  -- atividade a deixaria invisivel para quem tem de entrega-la (20261103_06).
  IF NEW.atividade_origem_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.atividades a
         JOIN public.topicos t ON t.id = a.topico_id
        WHERE a.id = NEW.atividade_origem_id AND t.classe_id = NEW.classe_id) THEN
    RAISE EXCEPTION 'A atividade da missao precisa ser de um topico da mesma turma.' USING ERRCODE = '22023';
  END IF;

  -- Recompensa e chave de `eventos_pontuacao`, nao numero."""


def guarda() -> str:
    g = _trocar(guarda_anterior(), _CONGELA_ANTES, _CONGELA_DEPOIS)
    return _trocar(g, _REGRAS_ANTES, _REGRAS_DEPOIS)


def upgrade() -> None:
    op.execute(guarda())
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(guarda_anterior())
    op.execute("NOTIFY pgrst, 'reload schema'")
