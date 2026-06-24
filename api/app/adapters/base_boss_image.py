from abc import ABC, abstractmethod

from app.schemas.ia_patch import IAEnemySpec


class BossImageAdapter(ABC):
    @abstractmethod
    async def generate_png(self, enemy: IAEnemySpec) -> bytes | None:
        raise NotImplementedError
