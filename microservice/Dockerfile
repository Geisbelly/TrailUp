# Microsserviço BrainHex (Node/Express + tsx) — imagem de desenvolvimento
FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=development

# instala dependências primeiro (camada cacheada)
# .puppeteerrc.cjs precisa chegar antes do npm install: é o postinstall
# (puppeteer browsers install chrome) que le esse arquivo pra saber onde
# baixar o Chrome (node_modules/.puppeteer_cache em vez do ~/.cache padrao)
COPY package*.json .puppeteerrc.cjs ./
RUN npm install

# código (em dev é sobreposto pelo volume do compose)
COPY . .

EXPOSE 3000

# roda server.ts via tsx
CMD ["npm", "run", "dev"]
