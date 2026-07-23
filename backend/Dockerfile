# ---------- Etapa de build ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ---------- Etapa de ejecución ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --chown=node:node docs/Documentacion_Completa_BD_STB.md ./docs/Documentacion_Completa_BD_STB.md
EXPOSE 3002
USER node
CMD ["node", "dist/index.js"]
