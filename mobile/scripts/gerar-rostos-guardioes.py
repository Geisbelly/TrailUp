"""Recorta o rosto de cada guardiao a partir da arte de corpo inteiro.

Uso:
    python mobile/scripts/gerar-rostos-guardioes.py         microservice/src/assets/guardioes         mobile/src/assets/guardioes/rosto

Rode isto quando a arte oficial dos guardioes mudar. A fonte da verdade e
`microservice/src/assets/guardioes/` -- os recortes sao derivados, nunca
editados a mao (edicao manual dessincroniza sem deixar rastro).

Nao usa fracao fixa da imagem: a composicao varia (o Realizador tem um braco
estendido, o que desloca o centro do bounding box). O alpha resolve isso -- as
PRIMEIRAS linhas visiveis da figura contem so a cabeca, entao elas dao o centro
horizontal do rosto de forma confiavel.
"""
import sys
from pathlib import Path

from PIL import Image

ORIGEM = Path(sys.argv[1])
DESTINO = Path(sys.argv[2])
# 256 cobre o maior avatar do app (72pt) com folga a 3x de densidade. Manter
# 512 aqui custaria ~2.6 MB de bundle pra pixel que nenhuma tela mostra.
LADO = 256

# Fracao da altura da figura usada pra localizar a cabeca. 12% pega o topo do
# cabelo ate mais ou menos a linha dos olhos em figuras em pe.
FAIXA_CABECA = 0.12
# Quanto o recorte e maior que a largura da cabeca. 2.2 deixa ombros e um pouco
# de ar em volta, sem entrar no tronco.
FOLGA = 2.2
# O Socializador tem DOIS guardioes (Mateo e Zuri). Com duas cabecas o vao
# detectado e largo, e a folga de 2.2 abriria o recorte pro corpo inteiro dos
# dois. Quando o vao passa desta fracao da largura da figura, tratamos como
# multi-cabeca e apertamos a folga pra caber so os rostos.
LIMITE_MULTI_CABECA = 0.5
FOLGA_MULTI = 1.15


def recortar(caminho: Path) -> Image.Image:
    img = Image.open(caminho).convert("RGBA")
    alpha = img.getchannel("A")
    caixa = alpha.getbbox()
    if not caixa:
        raise SystemExit(f"{caminho.name}: imagem sem pixel visivel")

    x0, y0, x1, y1 = caixa
    altura = y1 - y0
    faixa = max(1, int(altura * FAIXA_CABECA))

    topo = alpha.crop((x0, y0, x1, y0 + faixa))
    caixa_cabeca = topo.getbbox()
    if not caixa_cabeca:
        raise SystemExit(f"{caminho.name}: nao achei a cabeca")

    hx0, _, hx1, _ = caixa_cabeca
    cabeca_x0 = x0 + hx0
    cabeca_x1 = x0 + hx1
    vao = cabeca_x1 - cabeca_x0
    centro_x = (cabeca_x0 + cabeca_x1) // 2

    folga = FOLGA_MULTI if vao > (x1 - x0) * LIMITE_MULTI_CABECA else FOLGA
    lado = max(int(vao * folga), faixa * 2)

    # Um pouco de ar acima do cabelo; sem isso o topo da cabeca fica raspando.
    esquerda = centro_x - lado // 2
    topo_y = y0 - int(lado * 0.08)

    recorte = img.crop((esquerda, topo_y, esquerda + lado, topo_y + lado))
    return recorte.resize((LADO, LADO), Image.LANCZOS)


for arquivo in sorted(ORIGEM.glob("*.png")):
    saida = DESTINO / arquivo.name
    recortar(arquivo).save(saida, optimize=True)
    print(f"{arquivo.name} -> {saida.stat().st_size // 1024} KB")
