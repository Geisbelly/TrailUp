# API TrailUp (FastAPI) — imagem de desenvolvimento
FROM python:3.12-slim

# ffmpeg: necessário para moviepy/gTTS (geração de mídia)
# build-essential/libpq: garantem compilação de pacotes sem wheel
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
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

# código (em dev é sobreposto pelo volume do compose)
COPY . .

EXPOSE 8000

# --reload para hot-reload em desenvolvimento
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
