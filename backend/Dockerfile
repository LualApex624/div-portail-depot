# syntax=docker/dockerfile:1

# --- Etape 1 : build --------------------------------------------------------
FROM node:22-alpine AS builder

# openssl : requis par les moteurs Prisma, et par leur detection de plateforme.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src/

RUN npx prisma generate && npm run build

# --- Etape 2 : dependances de production ------------------------------------
FROM node:22-alpine AS deps

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

# --- Etape 3 : image finale -------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# tini : reaper de processus, pour que SIGTERM atteigne Node et que l'arret
# de la stack soit propre plutot qu'un kill au bout de 10 s.
RUN apk add --no-cache tini openssl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma/
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Aucun process root : l'API n'ecrit sur aucun disque local, elle n'a besoin
# d'aucun privilege.
USER node

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
