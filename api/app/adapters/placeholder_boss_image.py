import math
import struct
import zlib
from hashlib import sha256

from app.adapters.base_boss_image import BossImageAdapter
from app.schemas.ia_patch import IAEnemySpec


class PlaceholderBossImageAdapter(BossImageAdapter):
    def _palette(self, enemy: IAEnemySpec) -> tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]]:
        digest = sha256(f"{enemy.id}:{enemy.archetype}:{enemy.name}".encode("utf-8")).digest()
        base = (
            35 + digest[0] % 85,
            18 + digest[1] % 60,
            30 + digest[2] % 85,
        )
        accent = (
            170 + digest[3] % 80,
            55 + digest[4] % 90,
            60 + digest[5] % 90,
        )
        glow = (
            min(255, base[0] + 65),
            min(255, base[1] + 25),
            min(255, base[2] + 55),
        )
        return base, accent, glow

    def _png_bytes(self, pixels: list[list[tuple[int, int, int, int]]]) -> bytes:
        height = len(pixels)
        width = len(pixels[0]) if height else 0
        raw_rows = []
        for row in pixels:
            raw = bytearray([0])
            for r, g, b, a in row:
                raw.extend((r, g, b, a))
            raw_rows.append(bytes(raw))
        compressed = zlib.compress(b"".join(raw_rows), level=9)

        def chunk(tag: bytes, data: bytes) -> bytes:
            return (
                struct.pack("!I", len(data))
                + tag
                + data
                + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)
            )

        header = struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)
        return b"".join(
            [
                b"\x89PNG\r\n\x1a\n",
                chunk(b"IHDR", header),
                chunk(b"IDAT", compressed),
                chunk(b"IEND", b""),
            ]
        )

    async def generate_png(self, enemy: IAEnemySpec) -> bytes | None:
        width = 192
        height = 192
        base, accent, glow = self._palette(enemy)
        pixels: list[list[tuple[int, int, int, int]]] = []

        cx = width / 2
        cy = height / 2 + 8
        radius_x = 52
        radius_y = 62

        for y in range(height):
            row: list[tuple[int, int, int, int]] = []
            for x in range(width):
                bg_blend = y / max(1, height - 1)
                r = int(14 + (base[0] - 14) * bg_blend * 0.45)
                g = int(12 + (base[1] - 12) * bg_blend * 0.35)
                b = int(22 + (base[2] - 22) * bg_blend * 0.55)
                pixel = (r, g, b, 255)

                dx = (x - cx) / radius_x
                dy = (y - cy) / radius_y
                body = dx * dx + dy * dy <= 1

                horn_left = y < 62 and x < 74 and (62 - y) > abs(x - 58) * 1.15
                horn_right = y < 62 and x > 118 and (62 - y) > abs(x - 134) * 1.15
                aura = 1.0 < (dx * dx + dy * dy) <= 1.18

                if aura:
                    pixel = (*glow, 255)

                if body or horn_left or horn_right:
                    shade = 0.92 + 0.08 * math.sin((x + y) / 12)
                    pixel = (
                        min(255, int(base[0] * shade)),
                        min(255, int(base[1] * shade)),
                        min(255, int(base[2] * shade)),
                        255,
                    )

                eye_left = 60 <= y <= 80 and 60 <= x <= 84 and (y - 60) <= (84 - x) * 0.7
                eye_right = 60 <= y <= 80 and 108 <= x <= 132 and (y - 60) <= (x - 108) * 0.7
                pupil_left = 66 <= y <= 76 and 69 <= x <= 78
                pupil_right = 66 <= y <= 76 and 114 <= x <= 123
                mouth = 104 <= y <= 118 and abs(x - cx) <= 36 and ((x + y) % 8) <= 2
                crown = y < 40 and abs(x - cx) <= 38 and (40 - y) >= abs(x - cx) * 0.55

                if eye_left or eye_right:
                    pixel = (250, 243, 230, 255)
                if pupil_left or pupil_right or mouth:
                    pixel = accent + (255,)
                if crown:
                    pixel = (
                        min(255, accent[0] + 20),
                        min(255, accent[1] + 12),
                        min(255, accent[2] + 12),
                        255,
                    )

                armor = 122 <= y <= 150 and abs(x - cx) <= 42 and y - 122 > abs(x - cx) * 0.3
                if armor:
                    pixel = (
                        min(255, accent[0] + 18),
                        min(255, accent[1] + 10),
                        min(255, accent[2] + 10),
                        255,
                    )

                row.append(pixel)
            pixels.append(row)

        return self._png_bytes(pixels)
