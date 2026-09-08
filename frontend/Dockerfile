# syntax=docker/dockerfile:1

# --- Etape 1 : build --------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# L'URL de l'API est inlinee dans le bundle au build : elle doit donc etre
# fournie comme argument de construction, pas seulement a l'execution.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Etape 2 : image finale -------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache tini

# `output: standalone` : on ne copie que le serveur et ses dependances reelles.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/avocat/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
