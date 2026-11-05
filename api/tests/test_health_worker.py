"""`/health` não pode dizer `running` para um worker que já morreu: a tarefa continua no estado da app."""

import asyncio

from app.api.health import _estado_do_worker


def test_sem_tarefa_e_disabled() -> None:
    assert _estado_do_worker(None) == "disabled"


def test_tarefa_viva_e_morta() -> None:
    async def caso() -> None:
        async def falha() -> None:
            raise RuntimeError("loop caiu")

        viva = asyncio.create_task(asyncio.sleep(10))
        morta = asyncio.create_task(falha())
        await asyncio.gather(morta, return_exceptions=True)
        assert _estado_do_worker(viva) == "running"
        assert _estado_do_worker(morta) == "stopped"
        viva.cancel()

    asyncio.run(caso())
