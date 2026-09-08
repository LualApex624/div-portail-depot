#!/usr/bin/env bash
#
# Obtention et renouvellement automatique du certificat Let's Encrypt.
#
# A n'executer que sur le serveur fourni, avec un vrai sous-domaine : une
# autorite publique ne signe rien pour "localhost". En local, le portail
# tourne en HTTP sur 127.0.0.1 (voir README).
#
# Usage : ./setup-letsencrypt.sh <sous-domaine> <email> [--staging]

set -Eeuo pipefail

cd "$(dirname "$0")/.."

DOMAIN="${1:?Usage: setup-letsencrypt.sh <sous-domaine> <email> [--staging]}"
EMAIL="${2:?Usage: setup-letsencrypt.sh <sous-domaine> <email> [--staging]}"
STAGING_FLAG=""

# Let's Encrypt limite le nombre de certificats par domaine et par semaine, et
# plusieurs candidats partagent le meme serveur : on itere TOUJOURS sur le
# staging avant de demander un certificat de production.
if [ "${3:-}" = "--staging" ]; then
  STAGING_FLAG="--staging"
  echo "Mode staging : le certificat obtenu ne sera pas reconnu par les navigateurs."
else
  echo "Mode PRODUCTION. Verifiez d'abord que le staging fonctionne (--staging)."
  read -rp "Continuer ? [y/N] " confirm
  [ "$confirm" = "y" ] || exit 0
fi

mkdir -p infra/certbot/www infra/certbot/conf

# Le challenge http-01 arrive sur le port 80, route par en-tete Host depuis le
# proxy frontal de la machine.
docker run --rm \
  -v "$(pwd)/infra/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/infra/certbot/www:/var/www/certbot" \
  certbot/certbot certonly \
    --webroot -w /var/www/certbot \
    $STAGING_FLAG \
    --email "$EMAIL" \
    --agree-tos --no-eff-email \
    -d "$DOMAIN"

echo "Certificat obtenu pour $DOMAIN."

# Renouvellement : certbot ne renouvelle que si le certificat expire dans
# moins de 30 jours, l'appel deux fois par jour est donc sans effet le reste
# du temps. C'est la recommandation officielle.
cat > infra/renew-cert.sh <<RENEW
#!/usr/bin/env bash
set -e
cd "\$(dirname "\$0")/.."
docker run --rm \\
  -v "\$(pwd)/infra/certbot/conf:/etc/letsencrypt" \\
  -v "\$(pwd)/infra/certbot/www:/var/www/certbot" \\
  certbot/certbot renew --webroot -w /var/www/certbot
docker compose exec -T nginx nginx -s reload
RENEW
chmod +x infra/renew-cert.sh

echo
echo "Renouvellement automatique : ajoutez cette ligne a la crontab (crontab -e)"
echo "  0 3,15 * * * $(pwd)/infra/renew-cert.sh >> $(pwd)/infra/renew.log 2>&1"
