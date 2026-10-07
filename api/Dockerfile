# API TrailUp (FastAPI) — imagem de desenvolvimento
FROM python:3.12-slim

# ffmpeg: necessário para moviepy/gTTS (geração de mídia)
# build-essential/libpq: garantem compilação de pacotes sem wheel
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# instala dependências primeiro (camada cacheada)
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Modelo FER+ para a analise de emocao local (ONNX Model Zoo, licenca MIT).
# Baixado no build, nao versionado: sao ~35 MB que nao pertencem ao git.
#
# O checksum e VERIFICADO, nao so impresso: sem isso um 404 ou uma pagina de
# erro do GitHub viraria um arquivo pequeno gravado com o nome certo, e a falha
# so apareceria na primeira inferencia, em producao. `sha256sum -c` faz o build
# quebrar aqui.
ARG FERPLUS_SHA256=a2a2ba6a335a3b29c21acb6272f962bd3d47f84952aaffa03b60986e04efa61c
ARG FERPLUS_URL=https://github.com/onnx/models/raw/main/validated/vision/body_analysis/emotion_ferplus/model/emotion-ferplus-8.onnx
# YuNet faz a deteccao do rosto. O OpenCV 5 nao empacota mais as cascatas Haar
# (`cv2.data.haarcascades` existe e vem vazio), e o YuNet erra menos com rosto
# em angulo e luz fraca — a condicao real de quem estuda segurando o celular.
ARG YUNET_SHA256=8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
ARG YUNET_URL=https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
RUN mkdir -p /opt/models \
    && curl -fsSL -o /opt/models/emotion-ferplus-8.onnx "$FERPLUS_URL" \
    && curl -fsSL -o /opt/models/face_detection_yunet_2023mar.onnx "$YUNET_URL" \
    && printf '%s  %s\n%s  %s\n' \
         "$FERPLUS_SHA256" /opt/models/emotion-ferplus-8.onnx \
         "$YUNET_SHA256"   /opt/models/face_detection_yunet_2023mar.onnx \
       | sha256sum -c -

# código (em dev é sobreposto pelo volume do compose)
COPY . .

EXPOSE 8000

# --reload para hot-reload em desenvolvimento
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
