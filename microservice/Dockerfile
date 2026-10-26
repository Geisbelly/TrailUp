# Microsserviço BrainHex (Node/Express + tsx) — imagem de desenvolvimento
FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=development

# instala dependências primeiro (camada cacheada)
COPY package*.json ./
RUN npm install

# código (em dev é sobreposto pelo volume do compose)
COPY . .

ARG TRAILUP_BUILD_COMMIT
ENV TRAILUP_BUILD_COMMIT=$TRAILUP_BUILD_COMMIT

EXPOSE 3000

# roda server.ts via tsx
CMD ["npm", "run", "dev"]
