# Portail de dépôt de pièces — DIV Protocol

Un avocat crée une demande de dépôt, obtient un lien expirable et un code PIN,
et les transmet à son client. Le client ouvre le lien, saisit le code, dépose
ses pièces. L'avocat suit l'avancement depuis son dashboard. À l'expiration,
les fichiers sont **détruits**, pas marqués comme expirés.

Implémentation de l'architecture **Split-Secret Deposit**.

---

## Démarrage

```bash
./install.sh
```

Une seule commande : vérification des prérequis et des ports, génération des
secrets, construction des images, démarrage de la stack, provisioning de
Garage, migrations Prisma, seed, puis **smoke test du parcours complet** avant
d'afficher les URLs. `make install` fait la même chose.

Prérequis : Docker + Docker Compose v2, `openssl`, `curl`. Rien d'autre —
ni Node ni npm sur la machine hôte.

À la fin, le script affiche :

| Service | URL |
|---|---|
| Espace avocat | http://localhost:8080/avocat/login |
| API | http://localhost:8080/api |
| Grafana | http://127.0.0.1:3001 (mot de passe affiché par `install.sh`) |
| Prometheus | http://127.0.0.1:9090 |
| Garage (S3) | http://localhost:3900 |

**Identifiants de démonstration** (créés par le seed) :

| Compte | Mot de passe | Usage |
|---|---|---|
| `demo@divprotocol.com` | `DemoPass123!` | Parcours principal |
| `confrere@divprotocol.com` | `DemoPass123!` | Vérifier à la main l'isolation entre avocats |

Une demande d'exemple (« Dossier Martin, pièces 2026 ») est seedée sur le
premier compte.

### Essayer le parcours en 2 minutes

1. Se connecter avec `demo@divprotocol.com`.
2. **Créer une demande** → un lien et un code PIN à 8 chiffres s'affichent.
   Le code n'apparaît **qu'une fois** : le copier avant de fermer.
3. Ouvrir le lien dans une fenêtre privée (le client n'a pas de compte).
4. Saisir le code, déposer un PDF, un JPG ou un PNG.
5. Revenir au dashboard : le statut passe à *Complète*, la pièce est
   téléchargeable.

Pour voir la purge à l'œuvre sans attendre 24 h :

```bash
docker compose exec -T db psql -U div -d div_depot \
  -c "UPDATE \"DepositRequest\" SET \"expiresAt\" = now() - interval '1 hour';"
make purge
```

Le compte-rendu du réaper indique les objets réellement supprimés du bucket.

### Commandes

| Commande | Effet |
|---|---|
| `make install` | Installation complète (idempotente) |
| `make test` | Tests Jest du backend |
| `make logs` | Logs de tous les services |
| `make purge` | Force un passage du réaper |
| `make down` | Arrête la stack, conserve les données |
| `make clean` | Arrête **et supprime** les volumes |

---

## Ce qui a été changé par rapport au cahier des charges initial, et pourquoi

Quatre décisions divergent du CDC de départ. Chacune corrige un défaut qui se
verrait en production sur des pièces d'identité.

### 1. Garage à la place de MinIO

MinIO Community Edition est **archivé depuis le 25 avril 2026** : plus de
correctifs de sécurité, plus d'images officielles. Déployer un stockage non
maintenu pour héberger des pièces d'identité est un contresens.

[Garage](https://garagehq.deuxfleurs.fr/) est S3-compatible, activement
maintenu, et tient dans ~50 Mo. Le code applicatif ne connaît ni l'un ni
l'autre : il parle S3 via `ObjectStoreService`, configuré par `S3_ENDPOINT` /
`S3_BUCKET` / `S3_ACCESS_KEY`. Revenir à MinIO ne demanderait qu'un changement
de variables d'environnement — c'est le sens de l'abstraction, pas un
verrouillage.

### 2. PIN à 8 chiffres, Argon2id, verrouillage

Un PIN à 6 chiffres, c'est 10⁶ combinaisons : quelques minutes de brute-force
en ligne sans limitation. Trois mesures se combinent ici :

- **8 chiffres** → 10⁸ combinaisons ;
- **Argon2id** (19 MiB, 2 passes, OWASP 2026) → chaque essai coûte cher ;
- **verrouillage à 5 échecs pendant 15 minutes**, plus un throttle à
  10 requêtes/minute/IP.

Le compteur d'échecs vit en base, pas en mémoire : redémarrer l'API ne remet
pas le brute-force à zéro.

### 3. L'expiration détruit les données

Une ligne `status = EXPIRED` avec le PDF toujours dans le bucket n'est pas une
expiration, c'est un booléen. Le RGPD (art. 5-1-e) parle de destruction.

Le réaper (`ReaperService`, toutes les minutes) fait quatre choses dans cet
ordre : supprime les objets des deux préfixes, révoque les sessions de dépôt
ouvertes, **supprime les métadonnées des pièces**, puis marque la demande et
horodate `purgedAt`. L'ordre est un invariant testé : si le job meurt en
cours, les objets sont déjà partis et la demande sera reprise au passage
suivant.

Les métadonnées partent aussi parce qu'un nom de fichier est lui-même une
donnée personnelle — `passeport-jean-dupont.pdf` en dit long. Seul le journal
d'audit conserve la trace horodatée : combien de pièces, jamais lesquelles.

### 4. Le binaire ne traverse jamais l'API

Le client téléverse **directement vers Garage** avec une URL présignée valable
5 minutes. NestJS autorise, signe, vérifie et promeut — il ne porte pas le flux
binaire.

Faire transiter des PDF de 25 Mo par l'API sur un serveur partagé, c'est offrir
un levier de déni de service et une surface de fichiers temporaires. Le coût de
ce choix est un handshake en trois temps (`init` → `PUT` → `complete`) au lieu
d'un simple upload multipart — environ 80 lignes, contre un débogage de
`PayloadTooLargeError` entre Nginx et Multer.

---

## Architecture

```
                        ┌──────────────────────────────┐
   Navigateur ─────────▶│  Nginx (origine unique)      │
        │               │  /  → web   /api/ → api      │
        │               └───────┬──────────────┬───────┘
        │                       │              │
        │              ┌────────▼──────┐  ┌────▼─────────────────┐
        │              │ Next.js 15    │  │ NestJS 10            │
        │              │ Chakra UI v3  │  │ auth · requests      │
        │              └───────────────┘  │ public-deposit       │
        │                                 │ files · reaper       │
        │                                 │ audit · /metrics     │
        │                                 └──┬────────────┬──────┘
        │  PUT présigné (5 min)               │            │
        └────────────────────────┐    ┌───────▼────┐  ┌────▼──────┐
                                 │    │ PostgreSQL │  │  Garage   │
                                 └───▶│ métadonnées│  │ quarantine│
                                      │  audit     │  │ deposits  │
                                      └────────────┘  └───────────┘
                                                Prometheus → Grafana
```

**Monolithe modulaire**, pas de microservices : le produit tient en six modules
qui partagent une base et un cycle de vie. Découper aurait ajouté du réseau, de
la sérialisation et des modes de panne, sans résoudre un problème observé.

### Le split-secret en une phrase

> Le token authentifie le dossier, le PIN authentifie l'humain, l'URL présignée
> authentifie l'octet, le réaper authentifie l'oubli.

Trois secrets, trois rôles distincts :

| Secret | Où | Entropie | Stockage | Rôle |
|---|---|---|---|---|
| Token | dans l'URL `/d/:token` | 256 bits | HMAC-SHA256 + pepper | prouve qu'on détient le lien |
| PIN | transmis hors bande | 8 chiffres | Argon2id | prouve qu'on est le destinataire |
| Session de dépôt | cookie `deposit_sid` | 256 bits | HMAC-SHA256 + pepper | autorise l'écriture, TTL 30 min, révocable |

Aucun des deux premiers n'ouvre directement l'accès aux fichiers : le
déverrouillage délivre une troisième valeur, révocable en supprimant une ligne.

**Règle appliquée** : les secrets à basse entropie (mot de passe, PIN) passent
par Argon2id ; ceux à haute entropie (token, session) par HMAC-SHA256 + pepper.
Hasher un token de 256 bits avec Argon2 serait inutile — un attaquant ne peut
pas l'énumérer — et coûterait une passe mémoire à chaque lookup.

Le pepper vit dans `.env`, hors base : un dump SQL volé seul ne permet pas de
retrouver les tokens.

### Pas de JWT, et c'est délibéré

Un JWT ne se révoque pas sans denylist, et le stocker côté client l'expose au
XSS. Les deux côtés utilisent des **sessions opaques en base** : un `SELECT`
indexé par requête, une suppression de ligne pour révoquer instantanément.
`User.sessionVersion` permet en plus d'invalider d'un coup toutes les sessions
d'un avocat.

| Cookie | SameSite | TTL | Pourquoi |
|---|---|---|---|
| `div_session` (avocat) | `Lax` | 8 h | L'avocat doit rester connecté en arrivant depuis un lien externe. `Lax` bloque déjà les POST cross-site, donc le CSRF sur les routes mutantes. |
| `deposit_sid` (client) | `Strict` | 30 min | Ce cookie n'a aucune raison d'accompagner une navigation venue d'ailleurs : c'est le seul rempart devant l'écriture d'objets. |

Les deux sont `HttpOnly`, et `Secure` dès que `COOKIE_SECURE=true`.

### Le cycle de vie d'une pièce

```
init ──▶ quarantine/{requestId}/{fileId}   PUT présigné, 5 min, taille signée
                    │
                complete ──▶ HeadObject : la taille reçue == la taille annoncée ?
                             GetObject (64 Ko) : magic-bytes == format annoncé ?
                    │
        ┌───────────┴───────────┐
     accepté                  refusé
        │                       │
  CopyObject vers          DeleteObject
  deposits/…               statut REJECTED + motif
  DeleteObject quarantine
  statut ACCEPTED
```

Le `Content-Type` annoncé par un client est déclaratif, donc falsifiable : un
exécutable annoncé en `application/pdf` passe toutes les vérifications d'en-tête.
Seuls les octets font foi, et ils ne peuvent être lus qu'**après** réception —
d'où la quarantaine. Un fichier refusé n'est pas seulement marqué : il est
effacé.

La clé objet est dérivée de l'identifiant généré, **jamais** du nom fourni : la
traversée de chemin est structurellement impossible. Le nom d'origine est
conservé comme simple métadonnée, assaini.

### Modèle de données

| Entité | Rôle | Points notables |
|---|---|---|
| `User` | Avocat | `passwordHash` Argon2id, `sessionVersion` pour révoquer en masse |
| `AuthSession` | Session avocat | `idHash` uniquement — l'identifiant en clair n'existe que dans le cookie |
| `DepositRequest` | Demande | `tokenHash` unique et indexé, `pinHash`, `failedPinAttempts`, `lockedUntil`, `purgedAt` |
| `UploadedFile` | Métadonnée d'une pièce | Aucun binaire en base, seulement `objectKey` |
| `DepositSession` | Session de dépôt | TTL court, liée à une demande précise |
| `AuditLog` | Journal append-only | **Sans clé étrangère** : les lignes survivent à la purge de la demande auditée |

Index posés sur ce qui est réellement interrogé : `tokenHash` (résolution du
lien à chaque requête publique), `(userId, createdAt)` (dashboard paginé),
`expiresAt` (balayage du réaper).

**Conséquence assumée du modèle** : seule l'empreinte du token est conservée,
le lien n'est donc **pas ré-affichable** après création. Si l'avocat le perd,
il recrée une demande. C'est le prix de « aucun secret en clair en base », et
l'interface le dit explicitement au moment de la remise.

---

## Tests

```bash
make test          # ou : cd backend && npm test
```

**71 tests, ~5 secondes, aucun service externe requis.** Prisma et le stockage
objet sont simulés ; le chemin réel PostgreSQL + Garage est couvert par le
smoke test d'`install.sh`, qui déroule login → création → lien → PIN → PIN
invalide sur la stack réellement démarrée.

Les tests portent sur les invariants métier, pas sur un pourcentage de
couverture :

| Fichier | Ce qui est verrouillé |
|---|---|
| `request-status.spec.ts` | Expiration exacte, transitions, une demande expirée ne ressuscite jamais |
| `public-deposit.service.spec.ts` | PIN correct/incorrect, verrouillage au 5ᵉ échec, réouverture après 15 min, absence d'oracle, rejeu de session sur un autre lien |
| `upload.spec.ts` | Taille, type déclaré, quota, type **réel**, promotion, idempotence de `complete` |
| `reaper.service.spec.ts` | Ordre des opérations, purge des objets **et** des métadonnées, révocation des sessions, non-concurrence |
| `requests.service.spec.ts` | Isolation entre avocats sur chaque requête, secrets absents de la base |
| `auth.service.spec.ts` | Login, révocation par `sessionVersion`, réponses indistinctes |
| `crypto.service.spec.ts` | Entropie, déterminisme des empreintes, effet du pepper |
| `magic-bytes.spec.ts` | Exécutable déguisé en PDF, traversée de chemin |
| `configuration.spec.ts` | Coercition des types (voir plus bas) |

Trois tests méritent d'être signalés parce qu'ils ont attrapé de vrais bugs
pendant le développement :

- **`LOCKED` ≠ expiré.** Une demande verrouillée renvoyait 401 « lien invalide »
  au lieu de 403, et ne se rouvrait jamais après les 15 minutes : la logique
  confondait les deux états. Le test du bon PIN après verrouillage l'a révélé.
- **Le typage de la configuration.** `ConfigService` de `@nestjs/config` relit
  `process.env` et court-circuite la coercition Zod. `ALLOWED_MIME_TYPES`
  arrivait en chaîne CSV : `allowlist.includes(mimeType)` devenait une
  comparaison de sous-chaîne, et une allowlist qui accepte `"pdf"` n'est plus
  une allowlist. D'où `AppConfigService`, typé, et `configuration.spec.ts` qui
  garde la régression.
- **Le CORS de Garage.** Garage renvoie toutes les `AllowedOrigins` d'une règle
  dans un seul en-tête `Access-Control-Allow-Origin` ; le navigateur refuse le
  preflight. La correction — une règle par origine — n'était visible qu'en
  testant dans un vrai navigateur, `curl` ne s'en plaint pas.

---

## Observabilité

Le périmètre est un choix, pas une checklist. Quatre signaux, parce qu'ils
correspondent à ce qui menace réellement le parcours :

| Métrique | Ce qu'elle protège |
|---|---|
| `http_requests_total`, `http_request_duration_seconds` | Santé technique, et base de l'alerte 5xx |
| `pin_failures_total`, `pin_lockouts_total` | Attaque sur le seul secret devinable du système |
| `uploads_failed_total{reason}` | Le point où le parcours casse côté client. Le label distingue une erreur d'usage (taille, format) d'une tentative de contournement (`mime_real`) |
| `purge_deleted_objects_total` | **Preuve** que l'expiration détruit vraiment les données |

Aucun label à forte cardinalité : jamais de token, jamais d'identifiant de
demande. Le label `route` porte le motif de route (`/public/:token/unlock`) et
non l'URL brute — sinon chaque token créerait une série temporelle.

**Trois alertes, chacune avec une action** (`infra/alerts.yml`) :

- `TauxErreur5xxEleve` — plus de 5 % de 5xx sur 5 min → vérifier les logs de
  l'API puis `/api/ready`, qui distingue une panne PostgreSQL d'une panne Garage.
- `ApiInjoignable` — plus aucun scrape → `docker compose ps`, redémarrer.
- `SalveDePinInvalides` — plus de 20 PIN invalides sur 5 min → le verrouillage
  fait déjà son travail, mais ce volume signale une attaque distribuée :
  consulter `AuditLog` et resserrer le throttler.

Une alerte qui ne dit pas quoi faire n'est pas une alerte. Un dashboard sans
décision associée n'apporte rien : celui-ci tient en huit panneaux, dont un
seul compteur de purge qui répond à la question « les données sont-elles
vraiment détruites ».

**Logs JSON** (Pino) avec `requestId` propagé par `AsyncLocalStorage`, secrets
expurgés. Nginx tronque `/d/<token>` dans ses access logs : le token est le
premier facteur du split-secret, le laisser en clair dans un fichier texte
annulerait la mesure.

**Journal d'audit** en base (`AuditLog`) : login, création, ouverture de lien,
déverrouillage, échec de PIN, verrouillage, dépôt, rejet, téléchargement,
purge. IP hachée (SHA-256 + sel), jamais en clair. Un incident sur un dossier
juridique se raconte avec des lignes horodatées, pas avec un dashboard.

---

## Sécurité — récapitulatif

| Contrôle | Mise en œuvre |
|---|---|
| Auth avocat | Session opaque en base, cookie `HttpOnly` `Secure` `SameSite=Lax` |
| PIN | 8 chiffres, Argon2id (19 MiB / 2 passes), verrouillage 5 échecs / 15 min, throttle 10/min/IP |
| Token | 256 bits, HMAC-SHA256 + pepper hors base, jamais journalisé |
| Isolation entre avocats | `where: { userId }` sur **chaque** requête, y compris la signature d'URL de téléchargement — testé |
| Absence d'oracle | Lien inconnu et lien expiré renvoient une réponse identique ; mot de passe faux et compte inexistant aussi, avec vérification à temps constant |
| Upload | Allowlist MIME, taille signée dans l'URL présignée, quota, **magic-bytes** après réception |
| Traversée de chemin | Clé objet dérivée d'un identifiant généré, nom d'origine assaini |
| Bucket | Privé, aucune ACL publique — un accès sans URL signée renvoie 403 |
| Expiration | Contrôlée **côté serveur** à chaque opération, jamais par l'interface |
| RGPD | Purge physique, IP hachée, aucun compte client, aucun log du contenu |
| En-têtes | Helmet (CSP, `nosniff`, `no-referrer`), `X-Robots-Tag: noindex` |
| Secrets | Hors dépôt, générés par `openssl`, `.env` en `600`, `.env.example` sans valeur |
| Isolation réseau | Tous les ports publiés sur `127.0.0.1` uniquement |
| Conteneurs | Utilisateur non-root, `tini` comme PID 1 |

---

## Déploiement

Les images sont construites **hors serveur** et publiées sur GHCR par GitHub
Actions (`.github/workflows/ci.yml`), sur `main` et sur les tags. Le serveur ne
reçoit que de la configuration :

```bash
# Sur le serveur : pointer .env vers le registre, puis
./install.sh --pull      # tire les images, ne compile rien
```

Les migrations Prisma sont appliquées par l'entrypoint du conteneur `api`
(`migrate deploy`, idempotent) : la chaîne de build ne monte jamais sur la
machine de destination.

### HTTPS

En local, le portail tourne en **HTTP sur `127.0.0.1:8080`**. C'est volontaire :
aucune autorité de certification publique ne signe pour `localhost`, et un
certificat auto-signé imposerait d'accepter manuellement deux exceptions de
sécurité — sur l'origine de la page *et* sur celle du stockage, sous peine de
voir les téléversements échouer sans message clair.

La configuration HTTPS de production est fournie, commentée et prête :
`infra/nginx/conf.d/production.conf.example` et `infra/setup-letsencrypt.sh`
(webroot http-01, staging par défaut, renouvellement par cron). Elle fait
passer le stockage objet derrière le même hôte (`/storage/`), ce qui est
**obligatoire** en HTTPS : une page servie en `https` ne peut pas téléverser
vers un `http://…` — le navigateur bloque le contenu mixte. Le
`proxy_set_header Host $host` y est indispensable, la signature SigV4 couvrant
l'en-tête `Host`.

Basculer demande trois variables dans `.env` (`PUBLIC_ORIGIN`,
`STORAGE_PUBLIC_ORIGIN`, `COOKIE_SECURE=true`) et une reconstruction de l'image
web — `NEXT_PUBLIC_API_URL` est inlinée au build.

---

## Limites connues

Ce qui n'a **pas** été fait, et pourquoi :

- **Antivirus (ClamAV).** ~300 Mo et un processus de plus pour un moteur aux
  faux positifs notoires sur les PDF. La validation par magic-bytes plus
  l'allowlist couvrent le cas réaliste. Le point d'insertion est prêt : un scan
  du préfixe `quarantine/` avant promotion, en fail-closed.
- **Chiffrement au repos applicatif.** Le bucket est privé et l'accès passe par
  des URL signées courtes. Une enveloppe AES-256-GCM côté API n'apporterait
  qu'en cas de vol du disque, et déplacerait le problème vers la gestion de
  clés. À faire avec SSE-S3 quand Garage le stabilise.
- **Chiffrement de bout en bout.** Incompatible avec l'exigence produit :
  l'avocat doit pouvoir relire les pièces sans que le client soit en ligne.
  Documenté comme non retenu, pas comme oublié.
- **Le lien n'est pas ré-affichable.** Conséquence directe du modèle
  (cf. *Modèle de données*).
- **Pas de révocation manuelle d'une demande.** Une demande ne s'éteint qu'à
  l'expiration. Un bouton « révoquer » serait ~20 lignes : passer `expiresAt` à
  `now()` et laisser le réaper faire le reste.
- **Pas de notification.** Ni e-mail ni SMS : le canal hors bande pour le PIN
  est laissé à l'avocat, ce que l'interface énonce. Ajouter un envoi
  transactionnel créerait de la donnée personnelle supplémentaire à justifier.
- **Métriques en mémoire.** Les compteurs Prometheus repartent de zéro au
  redémarrage de l'API — comportement normal pour des compteurs, mais à savoir
  en lisant un graphe après un déploiement.
- **Réaper mono-instance.** Il se protège de la concurrence dans le processus,
  pas entre plusieurs réplicas. Passer à l'échelle demanderait un verrou
  consultatif PostgreSQL.
- **Taille maximale à 25 Mo.** La maquette de l'énoncé affiche 20 Mo ; le
  rapport Split-Secret retient 25 Mo. La valeur est pilotée par
  `MAX_FILE_SIZE_BYTES` et l'interface affiche celle qui est réellement
  appliquée, donc les deux restent cohérents.

---

## Structure du dépôt

```
.
├── backend/                 # NestJS 10 — API, logique métier, réaper
│   ├── prisma/              # Schéma et migration SQL versionnée
│   └── src/
│       ├── auth/            # Login avocat, sessions opaques, guard
│       ├── requests/        # Création de demandes, dashboard, téléchargement
│       ├── public-deposit/  # Déverrouillage, quota, presign, promotion
│       ├── object-store/    # Abstraction S3 (Garage)
│       ├── crypto/          # Argon2id, HMAC, pepper
│       ├── audit/           # Journal append-only
│       ├── reaper/          # Purge physique à l'expiration
│       ├── metrics/         # Compteurs Prometheus
│       └── config/          # Configuration typée et validée
├── frontend/                # Next.js 15 — App Router, Chakra UI v3
│   ├── theme/               # Charte DIV en tokens
│   ├── components/          # PinInput, FileDropzone, StatusBadge…
│   └── app/                 # /avocat/*, /d/[token]
├── infra/                   # Garage, Nginx, Prometheus, Grafana, Let's Encrypt
├── ai-logs/                 # Export des échanges IA
├── docker-compose.yml
├── install.sh               # Installation en une commande
├── Makefile
└── .env.example
```

---

## Charte graphique

Les tokens de l'énoncé sont transcrits tels quels dans `frontend/theme/index.ts`
et ne sont jamais réécrits en dur dans un composant.

Le détail qui signe le site est respecté : le bouton primaire (fond `#5100FF`,
texte blanc, graisse 600, padding 24/14, radius full) **s'inverse au survol** —
fond `#F7F6FF`, texte primary, contour inset 1 px. Le contour est un
`box-shadow: inset` et non une `border`, pour que son apparition ne décale pas
le contenu d'un pixel.

Cartes en fond blanc, bordure 1 px `#E9E9E9`, radius 12 px, **sans ombre**.
Reveal au scroll en `opacity 0 → 1` / `y 24 → 0`, 0.55 s,
`cubic-bezier(0.22, 1, 0.36, 1)`, via `IntersectionObserver` et désactivé sous
`prefers-reduced-motion`. Site **light only**, aucun mode sombre déclaré.

États vides, de chargement et d'erreur traités partout — l'énoncé demande
explicitement de ne jamais laisser un écran blanc sans explication. Le parcours
client est utilisable à **375 px** : les cases du PIN se partagent la largeur
disponible au lieu d'avoir une taille fixe, et aucune page ne défile
horizontalement.

---

## Transparence IA

Les échanges avec les assistants IA sur cet exercice sont à joindre dans
`ai-logs/`.
