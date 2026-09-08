#!/usr/bin/env bash
#
# Installation en une commande du portail de depot de pieces.
#
# Ce script est idempotent : on peut le relancer sans casser une stack deja
# installee. Il ne s'arrete jamais sur un "ca devrait marcher" — chaque etape
# attend une preuve (sonde de sante, code HTTP) avant de passer a la suivante,
# et le script echoue bruyamment si la preuve n'arrive pas.
#
# Usage :
#   ./install.sh              installation complete
#   ./install.sh --rebuild    force la reconstruction des images
#   ./install.sh --pull       tire les images du registre au lieu de construire

set -Eeuo pipefail

cd "$(dirname "$0")"

# ----------------------------------------------------------------- affichage --
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'

step()  { printf "\n${BLUE}${BOLD}==>${NC} ${BOLD}%s${NC}\n" "$1"; }
info()  { printf "    %s\n" "$1"; }
ok()    { printf "    ${GREEN}OK${NC}  %s\n" "$1"; }
warn()  { printf "    ${YELLOW}!${NC}   %s\n" "$1"; }
fail()  { printf "\n${RED}${BOLD}Echec :${NC} %s\n\n" "$1" >&2; exit 1; }

trap 'fail "interrompu a la ligne $LINENO. Diagnostic : docker compose logs --tail=50"' ERR

REBUILD=false
PULL=false
for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=true ;;
    --pull)    PULL=true ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) fail "option inconnue : $arg" ;;
  esac
done

# ------------------------------------------------------------ prerequis ------
step "Verification des prerequis"

command -v docker >/dev/null 2>&1 || fail "Docker n'est pas installe. https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 est requis (plugin 'docker compose')."
docker info >/dev/null 2>&1 || fail "Le demon Docker ne repond pas. Demarrez Docker Desktop."
command -v openssl >/dev/null 2>&1 || fail "openssl est requis pour generer les secrets."
command -v curl >/dev/null 2>&1 || fail "curl est requis pour les tests de sante."
ok "Docker, Compose, openssl et curl sont disponibles"

DC="docker compose"

# ------------------------------------------------------------- secrets -------
step "Configuration (.env)"

if [ -f .env ]; then
  ok ".env existant conserve (supprimez-le pour repartir de zero)"
else
  info "Generation des secrets avec openssl..."
  cp .env.example .env

  # Les cles Garage suivent le format attendu par `garage key import` :
  # identifiant GK + 24 hex, secret sur 64 hex.
  set_var() {
    # Portable macOS/Linux : pas de -i sans argument.
    python3 - "$1" "$2" <<'PY'
import re, sys
key, value = sys.argv[1], sys.argv[2]
path = '.env'
content = open(path).read()
content = re.sub(rf'^{re.escape(key)}=.*$', f'{key}={value}', content, count=1, flags=re.M)
open(path, 'w').write(content)
PY
  }

  set_var POSTGRES_PASSWORD  "$(openssl rand -hex 16)"
  set_var SERVER_PEPPER      "$(openssl rand -hex 32)"
  set_var AUDIT_IP_SALT      "$(openssl rand -hex 32)"
  set_var GARAGE_RPC_SECRET  "$(openssl rand -hex 32)"
  set_var GARAGE_ADMIN_TOKEN "$(openssl rand -hex 32)"
  set_var S3_ACCESS_KEY      "GK$(openssl rand -hex 12)"
  set_var S3_SECRET_KEY      "$(openssl rand -hex 32)"
  set_var GRAFANA_PASSWORD   "$(openssl rand -hex 8)"
  set_var SEED_DEMO_PASSWORD "DemoPass123!"

  chmod 600 .env
  ok ".env genere (permissions 600, ignore par git)"
fi

# `set -f` desactive le globbing pendant la lecture : sans lui, une valeur
# comme le cron du reaper ("0 * * * * *") serait developpee en noms de fichiers.
set -f
set -a; . ./.env; set +a
set +f

: "${PUBLIC_ORIGIN:?PUBLIC_ORIGIN manquant dans .env}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY manquant dans .env}"

# ------------------------------------------------------------ ports ---------
step "Verification des ports"

# Detecte les conflits avant de construire quoi que ce soit : echouer a
# mi-parcours sur un port pris est le pire moment pour l'apprendre. Chaque
# port est surchargeable dans .env, le message le rappelle.
port_in_use() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    nc -z 127.0.0.1 "$1" >/dev/null 2>&1
  fi
}

# Nom du conteneur qui publie ce port, s'il y en a un.
port_owner() {
  docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null \
    | awk -v pattern=":$1->" 'index($0, pattern) { print $1; exit }'
}

CONFLICTS=""
check_port() {
  local port="$1" owner_expected="$2" variable="$3"

  port_in_use "$port" || return 0

  # Un port tenu par notre propre conteneur n'est pas un conflit : c'est une
  # stack deja demarree, que install.sh va simplement mettre a jour.
  [ "$(port_owner "$port")" = "$owner_expected" ] && return 0

  CONFLICTS="${CONFLICTS}
      ${port}\t(attendu : ${owner_expected})\tvariable ${variable}"
  return 0
}

check_port "${HTTP_PORT:-8080}"        div-nginx      HTTP_PORT
check_port "${API_PORT:-4000}"         div-api        API_PORT
check_port "${WEB_PORT:-3000}"         div-web        WEB_PORT
check_port "${POSTGRES_PORT:-5434}"    div-db         POSTGRES_PORT
check_port "${GARAGE_S3_PORT:-3900}"   div-garage     GARAGE_S3_PORT
check_port "${PROMETHEUS_PORT:-9090}"  div-prometheus PROMETHEUS_PORT
check_port "${GRAFANA_PORT:-3001}"     div-grafana    GRAFANA_PORT

if [ -n "$CONFLICTS" ]; then
  printf "    ${YELLOW}Ports deja occupes par un autre programme :${NC}%b\n" "$CONFLICTS"
  fail "Liberez ces ports, ou changez leur valeur dans .env puis relancez ./install.sh"
fi
ok "Tous les ports necessaires sont libres"

# --------------------------------------------------------------- images ------
if [ "$PULL" = true ]; then
  step "Recuperation des images depuis le registre"
  $DC pull api web
  ok "Images tirees (aucune compilation locale)"
else
  step "Construction des images applicatives"
  if [ "$REBUILD" = true ]; then
    $DC build --no-cache api web
  else
    $DC build api web
  fi
  ok "Images api et web construites"
fi

# ------------------------------------------------------- socle de donnees ----
step "Demarrage de PostgreSQL et Garage"
$DC up -d db garage

info "Attente de PostgreSQL..."
for i in $(seq 1 60); do
  if $DC exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    ok "PostgreSQL est pret"; break
  fi
  [ "$i" -eq 60 ] && fail "PostgreSQL n'a pas demarre. Voir : docker compose logs db"
  sleep 1
done

info "Attente de Garage..."
for i in $(seq 1 60); do
  if $DC exec -T garage /garage status >/dev/null 2>&1; then
    ok "Garage repond"; break
  fi
  [ "$i" -eq 60 ] && fail "Garage n'a pas demarre. Voir : docker compose logs garage"
  sleep 1
done

# ------------------------------------------------------ provisioning S3 ------
step "Provisioning du stockage objet"

garage_cmd() { $DC exec -T garage /garage "$@"; }

# Le layout doit etre applique avant toute ecriture : sans lui, Garage accepte
# les connexions mais ne peut stocker aucun objet.
if garage_cmd status 2>/dev/null | grep -q "NO ROLE ASSIGNED"; then
  NODE_ID="$(garage_cmd node id -q 2>/dev/null | cut -d'@' -f1 | tr -d '\r\n')"
  [ -n "$NODE_ID" ] || fail "Identifiant du noeud Garage introuvable."

  info "Attribution du layout au noeud ${NODE_ID:0:16}..."
  garage_cmd layout assign -z dc1 -c 10G "$NODE_ID" >/dev/null 2>&1

  # Garage indique lui-meme la version a appliquer ; la deduire serait fragile.
  LAYOUT_VERSION="$(garage_cmd layout show 2>/dev/null \
    | grep -oE 'layout apply --version [0-9]+' | grep -oE '[0-9]+$' | head -1)"
  [ -n "$LAYOUT_VERSION" ] || fail "Version de layout Garage introuvable."

  garage_cmd layout apply --version "$LAYOUT_VERSION" >/dev/null 2>&1
  ok "Layout applique (version $LAYOUT_VERSION)"
else
  ok "Layout deja configure"
fi

if garage_cmd bucket info "$S3_BUCKET" >/dev/null 2>&1; then
  ok "Bucket $S3_BUCKET deja present"
else
  garage_cmd bucket create "$S3_BUCKET" >/dev/null
  ok "Bucket $S3_BUCKET cree"
fi

if garage_cmd key info "$S3_ACCESS_KEY" >/dev/null 2>&1; then
  ok "Cle d'acces deja importee"
else
  info "Import de la cle d'acces applicative..."
  garage_cmd key import --yes -n div-api "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
  ok "Cle importee"
fi

garage_cmd bucket allow --read --write --owner "$S3_BUCKET" --key "$S3_ACCESS_KEY" >/dev/null
ok "Droits lecture/ecriture accordes sur $S3_BUCKET"

# Aucune ACL publique : le bucket n'est jamais joignable sans URL signee.
if garage_cmd bucket info "$S3_BUCKET" 2>/dev/null | grep -qi "website access: enabled"; then
  garage_cmd bucket website --deny "$S3_BUCKET" >/dev/null 2>&1 || true
fi

# ------------------------------------------------------------ application ----
step "Demarrage de l'application"
# Les migrations Prisma sont jouees par l'entrypoint du conteneur api.
$DC up -d api web nginx prometheus grafana

info "Attente de l'API (migrations comprises)..."
API_READY=false
for i in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${API_PORT:-4000}/ready" >/dev/null 2>&1; then
    API_READY=true; ok "API prete (PostgreSQL et Garage joignables)"; break
  fi
  sleep 1
done
[ "$API_READY" = true ] || fail "L'API n'est pas prete. Voir : docker compose logs api"

# ------------------------------------------------------------------ seed -----
step "Jeu de donnees de demonstration"
$DC exec -T api node dist/seed.js
ok "Comptes de demonstration et demande d'exemple crees"

# ------------------------------------------------------------ smoke test -----
step "Verification du parcours (smoke test)"

BASE="${PUBLIC_ORIGIN}"

http_code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

info "Front joignable..."
[ "$(http_code "${BASE}/avocat/login")" = "200" ] || fail "Le front ne repond pas sur ${BASE}"
ok "Page de connexion servie"

info "API joignable a travers Nginx..."
[ "$(http_code "${BASE}/api/health")" = "200" ] || fail "L'API ne repond pas sur ${BASE}/api"
ok "API accessible sur ${BASE}/api"

info "Parcours avocat de bout en bout..."
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

LOGIN_CODE="$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"demo@divprotocol.com\",\"password\":\"${SEED_DEMO_PASSWORD}\"}" \
  "${BASE}/api/auth/login")"
[ "$LOGIN_CODE" = "201" ] || [ "$LOGIN_CODE" = "200" ] || fail "Connexion avocat impossible (HTTP $LOGIN_CODE)"
ok "Connexion avocat"

CREATED="$(curl -s -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"title":"Smoke test install.sh","expiresInHours":24}' \
  "${BASE}/api/requests")"

SMOKE_TOKEN="$(printf '%s' "$CREATED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["url"].rsplit("/d/",1)[1])' 2>/dev/null || true)"
SMOKE_PIN="$(printf '%s' "$CREATED" | python3 -c 'import json,sys; print(json.load(sys.stdin)["pin"])' 2>/dev/null || true)"
[ -n "$SMOKE_TOKEN" ] || fail "Creation de demande impossible. Reponse : $CREATED"
ok "Demande creee, token et PIN generes"

[ "$(http_code "${BASE}/api/public/${SMOKE_TOKEN}")" = "200" ] || fail "Le lien public n'est pas resolu"
ok "Lien public resolu"

UNLOCK_CODE="$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
  -d "{\"pin\":\"${SMOKE_PIN}\"}" "${BASE}/api/public/${SMOKE_TOKEN}/unlock")"
[ "$UNLOCK_CODE" = "200" ] || [ "$UNLOCK_CODE" = "201" ] || fail "Deverrouillage par PIN impossible (HTTP $UNLOCK_CODE)"
ok "Deverrouillage par PIN"

BAD_PIN_CODE="$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
  -d '{"pin":"00000000"}' "${BASE}/api/public/${SMOKE_TOKEN}/unlock")"
[ "$BAD_PIN_CODE" = "401" ] || warn "Un PIN invalide renvoie $BAD_PIN_CODE au lieu de 401"
[ "$BAD_PIN_CODE" = "401" ] && ok "PIN invalide correctement refuse"

info "Observabilite..."
[ "$(http_code "http://127.0.0.1:${PROMETHEUS_PORT:-9090}/-/ready")" = "200" ] \
  && ok "Prometheus pret" || warn "Prometheus n'est pas encore pret"
[ "$(http_code "http://127.0.0.1:${GRAFANA_PORT:-3001}/api/health")" = "200" ] \
  && ok "Grafana pret" || warn "Grafana n'est pas encore pret"

# --------------------------------------------------------------- resultat ----
printf "\n${GREEN}${BOLD}  La stack est operationnelle.${NC}\n\n"

printf "${BOLD}  Portail${NC}\n"
printf "    Espace avocat      %s/avocat/login\n" "$BASE"
printf "    API                %s/api\n" "$BASE"
printf "\n${BOLD}  Identifiants de demonstration${NC}\n"
printf "    Avocat             demo@divprotocol.com / %s\n" "$SEED_DEMO_PASSWORD"
printf "    Confrere (test d'isolation)\n"
printf "                       confrere@divprotocol.com / %s\n" "$SEED_DEMO_PASSWORD"
printf "\n${BOLD}  Observabilite${NC}\n"
printf "    Grafana            http://127.0.0.1:%s   (%s / %s)\n" \
  "${GRAFANA_PORT:-3001}" "${GRAFANA_USER:-admin}" "${GRAFANA_PASSWORD}"
printf "    Dashboard          http://127.0.0.1:%s/d/div-depot\n" "${GRAFANA_PORT:-3001}"
printf "    Prometheus         http://127.0.0.1:%s\n" "${PROMETHEUS_PORT:-9090}"
printf "    Alertes            http://127.0.0.1:%s/alerts\n" "${PROMETHEUS_PORT:-9090}"
printf "\n${BOLD}  Stockage objet${NC}\n"
printf "    Garage (S3)        %s   bucket : %s\n" "$STORAGE_PUBLIC_ORIGIN" "$S3_BUCKET"
printf "\n${BOLD}  Commandes utiles${NC}\n"
printf "    make logs          suivre les logs\n"
printf "    make test          lancer les tests Jest\n"
printf "    make down          arreter la stack\n"
printf "    make clean         arreter et supprimer les volumes\n\n"
