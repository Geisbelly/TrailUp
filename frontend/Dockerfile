# Frontend (Vite + React) — imagem de desenvolvimento
FROM node:22-slim

WORKDIR /app

# instala dependências primeiro (camada cacheada)
COPY package*.json ./
RUN npm install

# código (em dev é sobreposto pelo volume do compose)
COPY . .

EXPOSE 8080

# vite dev acessível fora do container (host 0.0.0.0)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
