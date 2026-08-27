"""Recorta o rosto de cada guardiao a partir da arte de corpo inteiro.

Uso (rodando de dentro de mobile/):
    python scripts/gerar-rostos-guardioes.py         ../frontend/src/assets/guardioes         src/assets/guardioes/rosto

Rode isto quando a arte dos guardioes mudar. Os recortes sao derivados, nunca
editados a mao (edicao manual dessincroniza sem deixar rastro).

ORIGEM: `frontend/src/assets/guardioes/` (.webp). Tres pastas do monorepo tem a
arte dos guardioes e SO ESSA esta atualizada -- foi conferido imagem por imagem
em 2026-08-26:

  frontend/    .webp  arte ATUAL (Exploradora em teal, Sobrevivente cinza-chumbo)
  mobile/      .png   versao anterior (Exploradora dourada)
  microservice/ .png  versao mais antiga ainda (Sobrevivente VERMELHO)

O CLAUDE.md trata o microservice como fonte da verdade dos perfis, e isso vale
para as CONSTANTES (cor-assinatura, nome do guia) -- nao para os arquivos de
imagem. Gerar das outras duas pastas produz avatar com a cor errada, e foi o que
aconteceu duas vezes: o aluno via um guia que nao combinava com a tela.

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
#
# Nao mexa nisto sem olhar os 7 resultados: `vao` inclui cabelo, penacho e
# cajado, entao o mesmo numero enquadra cada guardiao de forma diferente. Subir
# pra 3.0 transformou a Conquistadora em figura inteira com o rosto minusculo.
FOLGA = 2.2
# O Socializador tem DOIS guardioes (Mateo e Zuri). Com duas cabecas o vao
# detectado e largo, e a folga de 2.2 abriria o recorte pro corpo inteiro dos
# dois. Quando o vao passa desta fracao da largura da figura, tratamos como
# multi-cabeca e apertamos a folga pra caber so os rostos.
#
# A heuristica e grosseira (larga != duas cabecas) e pega a Conquistadora pelo
# penacho, mas o resultado dela ficou BOM assim -- um recorte apertado no rosto.
# Trocar por deteccao de vao transparente "corrigiu" a classificacao e piorou o
# enquadramento. Fica como esta ate haver como comparar os 7 lado a lado.
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


# A arte mais nova esta em .webp (frontend); a antiga era .png. Aceitamos os
# dois e SEMPRE gravamos .png, porque e o que `profileImages.ts` requer.
#
# `socializer` na origem ja e o PAR (Mateo e Zuri) e o app o consome como
# `socializer-duo` -- e o unico perfil com dois guardioes, e e isso que faz o
# audio dele ser dialogo em vez de narracao solo.
RENOMEAR = {"socializer": "socializer-duo"}

# Só os 7 perfis entram. A pasta de origem carrega variantes soltas
# (`socializer2`, versões antigas) que nenhum slot do app consome -- recortar
# tudo enchia o bundle de arquivo morto.
PERFIS = {
    "seeker",
    "survivor",
    "daredevil",
    "mastermind",
    "conqueror",
    "socializer",
    "achiever",
}

# .webp ganha de .png para o mesmo perfil: a arte nova veio em webp, e a cópia
# .png ao lado é a versão anterior. Deixar a ordem do glob decidir isso ja
# produziu recorte com a cor errada uma vez.
PRIORIDADE = {".webp": 0, ".png": 1}

escolhidos: dict[str, Path] = {}
for extensao in ("*.png", "*.webp"):
    for caminho in ORIGEM.glob(extensao):
        if caminho.stem not in PERFIS:
            continue
        atual = escolhidos.get(caminho.stem)
        if atual is None or PRIORIDADE[caminho.suffix] < PRIORIDADE[atual.suffix]:
            escolhidos[caminho.stem] = caminho

faltando = PERFIS - set(escolhidos)
if faltando:
    raise SystemExit(f"arte ausente para: {', '.join(sorted(faltando))} (em {ORIGEM})")

for perfil in sorted(escolhidos):
    arquivo = escolhidos[perfil]
    saida = DESTINO / f"{RENOMEAR.get(perfil, perfil)}.png"
    recortar(arquivo).save(saida, optimize=True)
    print(f"{arquivo.name} -> {saida.name} ({saida.stat().st_size // 1024} KB)")
