import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agent.graph.builder import build_graph
from app.agent.graph.checkpointer import (
    close_checkpointer,
    get_ephemeral_checkpointer,
    get_persistent_checkpointer,
)
from app.api.router import api_router
from app.core.settings import Settings, get_settings
from app.db.session import build_session_factory
from app.services.checkpoint_retention import checkpoint_retention_loop, run_checkpoint_retention_once
from app.services.personalizacao_jobs import personalizacao_jobs_loop


def _configure_windows_event_loop_policy() -> None:
    if hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine, session_factory = build_session_factory(app_settings)
        personalizacao_checkpointer, personalizacao_backend, personalizacao_manager = await get_persistent_checkpointer(app_settings)
        ephemeral_checkpointer, ephemeral_backend, ephemeral_manager = await get_ephemeral_checkpointer()

        app.state.settings = app_settings
        app.state.engine = engine
        app.state.session_factory = session_factory
        app.state.checkpointer_personalizacao = personalizacao_checkpointer
        app.state.checkpointer_backend_personalizacao = personalizacao_backend
        app.state.checkpointer_manager_personalizacao = personalizacao_manager
        app.state.checkpointer_ephemeral = ephemeral_checkpointer
        app.state.checkpointer_backend_ephemeral = ephemeral_backend
        app.state.checkpointer_manager_ephemeral = ephemeral_manager
        app.state.graph_personalizacao = build_graph(app_settings, session_factory, personalizacao_checkpointer)
        app.state.graph_ephemeral = build_graph(app_settings, session_factory, ephemeral_checkpointer)
        app.state.graph_personalizacao_degraded = False
        app.state.graph_personalizacao_recovery_lock = asyncio.Lock()
        app.state.graph_personalizacao_last_recovery_attempt = 0.0
        app.state.checkpointer = personalizacao_checkpointer
        app.state.checkpointer_manager = personalizacao_manager
        app.state.checkpointer_backend = personalizacao_backend
        app.state.graph = app.state.graph_ephemeral

        retention_task = None
        personalizacao_jobs_task = None
        if app_settings.checkpoint_retention_enabled and personalizacao_backend == "postgres":
            await run_checkpoint_retention_once(
                checkpointer=personalizacao_checkpointer,
                backend=personalizacao_backend,
                settings=app_settings,
            )
            retention_task = asyncio.create_task(
                checkpoint_retention_loop(
                    checkpointer=personalizacao_checkpointer,
                    backend=personalizacao_backend,
                    settings=app_settings,
                )
            )
        app.state.checkpoint_retention_task = retention_task
        database_url = (app_settings.database_url or "").lower()
        if database_url.startswith("postgres"):
            personalizacao_jobs_task = asyncio.create_task(personalizacao_jobs_loop(app))
        app.state.personalizacao_jobs_task = personalizacao_jobs_task

        try:
            yield
        finally:
            if personalizacao_jobs_task is not None:
                personalizacao_jobs_task.cancel()
                try:
                    await personalizacao_jobs_task
                except asyncio.CancelledError:
                    pass
            if retention_task is not None:
                retention_task.cancel()
                try:
                    await retention_task
                except asyncio.CancelledError:
                    pass
            await close_checkpointer(ephemeral_checkpointer, ephemeral_manager)
            await close_checkpointer(personalizacao_checkpointer, personalizacao_manager)
            await engine.dispose()

    app = FastAPI(
        title=app_settings.app_name,
        debug=app_settings.app_debug,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.cors_allow_origins,
        allow_methods=app_settings.cors_allow_methods,
        allow_headers=app_settings.cors_allow_headers,
    )
    app.include_router(api_router)
    return app


_configure_windows_event_loop_policy()
app = create_app()
