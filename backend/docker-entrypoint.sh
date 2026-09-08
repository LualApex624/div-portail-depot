#!/bin/sh
# Les migrations sont appliquees au demarrage du conteneur, pas depuis la
# machine hote : le serveur ne recoit que des images, jamais le code source ni
# la chaine de build. `migrate deploy` est idempotent et ne genere rien.
set -e

echo "[entrypoint] Application des migrations Prisma..."
./node_modules/.bin/prisma migrate deploy

echo "[entrypoint] Demarrage de l'API."
exec "$@"
