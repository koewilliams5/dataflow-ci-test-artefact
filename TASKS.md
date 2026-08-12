# TASKS.md — Backlog

Priorités au sens **MoSCoW** :

- **Must Have (M)** — fonctionnalité cœur listée comme obligatoire dans le brief. Sans elle, pas de MVP recevable.
- **Should Have (S)** — améliore significativement la qualité/robustesse du MVP, à faire si le temps le permet après les Must Have.
- **Could Have (C)** — bonus explicitement listés comme secondaires dans le brief. Attaqués seulement si E1–E9 sont soldés en avance.

Statuts : `Not started` · `In progress` · `Blocked` · `Done`. Ce fichier est mis à jour à la fin de
chaque journée de travail (voir le planning à 14 jours en annexe).

---

## E1 — Setup & Infra

| ID  | Tâche                                                                                                                | Priorité | Statut                                                                    | Dépendances   |
| --- | -------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------- | ------------- |
| T01 | Scaffolding monorepo (pnpm workspaces + Turborepo)                                                                   | M        | **Done**                                                                  | —             |
| T02 | `docker-compose.yml` (Postgres, Redis, MinIO + init bucket)                                                          | M        | **Done** — vérifié en direct le 2026-08-12 (Docker Desktop/WSL2 débloqué) | —             |
| T03 | `packages/config` : validation des variables d'env (Zod)                                                             | M        | **Done**                                                                  | T01           |
| T04 | `packages/database` : schéma Prisma v1 (`User`, `DataSource`, `SchemaVersion`, `Ingestion`, `IngestionError`)        | M        | **Done** — migration réelle appliquée et vérifiée                         | T01, T02, T56 |
| T05 | Squelette `apps/web` (Next.js App Router)                                                                            | M        | **Done**                                                                  | T01, T03      |
| T06 | Squelette `apps/worker` (process TS, connexion DB)                                                                   | M        | **Done**                                                                  | T01, T03, T04 |
| T56 | `packages/domain` : format JSON du schéma de colonnes (types, contraintes, Zod, messages d'erreur) + tests unitaires | M        | **Done** (22/22 tests)                                                    | T01           |

**Critères d'acceptation**

- T01 : ✅ `pnpm install` réussit à la racine, les workspaces sont résolus, `pnpm typecheck` passe.
- T02 : ✅ **vérifié en direct le 2026-08-12** — `docker compose up -d` démarre Postgres/Redis/MinIO, les trois `healthy`, bucket créé par `minio-init`. Root cause du blocage précédent : virtualisation matérielle activée en BIOS mais fonctionnalités Windows ("Plateforme de machine virtuelle", "Sous-système Windows pour Linux") jamais activées + noyau WSL2 manquant — corrigé (fonctionnalités Windows + `wsl --update` + redémarrage).
- T03 : ✅ démarrer `worker` sans une variable d'env requise lève une erreur lisible listant la variable manquante.
- T04 : ✅ **`pnpm db:migrate` exécuté réellement** — migration `20260812113112_init` créée et appliquée contre le vrai Postgres, 5 tables créées, `prisma generate` a régénéré le client. Bug découvert et corrigé au passage : Prisma CLI cherche `.env` dans `packages/database` (CWD de la commande), pas à la racine — un troisième fichier `.env` copié à cet endroit, à documenter dans CLAUDE.md/README.
- T05/T06 : ✅ `pnpm build`/`pnpm typecheck` passent. **`pnpm dev` exécuté réellement** — web prêt (`http://localhost:3000`, ~17s de démarrage), worker démarré et connecté à Redis. Bug trouvé et corrigé : le script `dev` du worker (`tsx --env-file=... watch src/index.ts`) plaçait `watch` après les flags — `tsx` exige `watch` en tout premier argument, sinon il l'interprète comme le fichier à exécuter. Corrigé en `tsx watch --env-file=... src/index.ts`.
- T56 : ✅ `pnpm --filter @dataflow-ci/domain test` → 22/22 tests passants, couvrant les cas valides et invalides (types inconnus, contraintes incohérentes, regex invalide, clé de doublon inconnue, etc.).

**Parcours complet vérifié en conditions réelles le 2026-08-12** (login → source seedée → upload `samples/ventes-sale.csv` → traitement worker → rapport → export) : statut `PARTIAL`, 3 lignes valides / 6 invalides, les 6 erreurs (`INVALID_DATE`, `VALUE_NOT_ALLOWED`, `NOT_POSITIVE`, `INVALID_INTEGER`, `REGEX_MISMATCH`, `DUPLICATE_ROW`) exactement conformes à la vérification faite contre le moteur seul, export téléchargé via URL signée MinIO et contenu confirmé correct. Toute la chaîne (web → storage → queue → worker → validation → DB → API → export) fonctionne de bout en bout, pas seulement via des mocks.

**Vérification manuelle dans un vrai navigateur (Chrome) le 2026-08-12** : login réel via le formulaire UI (pas seulement via API), dashboard affiché avec les vraies données de Postgres (3 fichiers ingérés, taux de succès 33%, 247 lignes traitées, 1 source active) et les 3 visualisations Recharts rendues correctement (barres empilées par statut, donut de répartition, barres horizontales des sources actives). Aucune anomalie fonctionnelle — seul un avertissement bénin de préchargement de ressource dans la console (sans impact).

---

## E2 — Authentification

| ID  | Tâche                                                                                                 | Priorité | Statut   | Dépendances |
| --- | ----------------------------------------------------------------------------------------------------- | -------- | -------- | ----------- |
| T07 | Intégration Auth.js (Credentials, session JWT — sans adapter Prisma, voir ADR-008)                    | M        | **Done** | T04, T05    |
| T08 | Page `/login` (pas de `/register` — comptes créés uniquement par le seed, voir prompt 3)              | M        | **Done** | T07         |
| T09 | Middleware + vérification serveur (défense en profondeur) sur `/dashboard`, `/sources`, `/ingestions` | M        | **Done** | T07         |
| T10 | Script de seed : compte de test (identifiants documentés dans le README)                              | M        | **Done** | T07         |

**Critères d'acceptation**

- T07–T09 : ✅ un utilisateur non authentifié est redirigé vers `/login` sur toute route protégée (vérifié par le middleware + tests unitaires `isProtectedPath`, 9 tests) ; un compte créé peut se reconnecter (`verifyCredentials`, 3 tests).
- T10 : ✅ le seed crée `demo@dataflow-ci.com` / `password123`, documenté dans `README.md` — **exécuté réellement le 2026-08-12** (voir E1), compte utilisé pour la connexion manuelle et le test e2e.
- 5 scénarios demandés (connexion réussie, mauvais mot de passe, utilisateur inconnu, accès à une route protégée, déconnexion) : couverts par 13 tests unitaires (`apps/web/src/lib/auth/*.test.ts`). Vérification end-to-end réelle (serveur + navigateur) : ✅ faite le 2026-08-12, manuellement et via Playwright (voir T42).

---

## E3 — Sources & schéma

| ID  | Tâche                                                                                        | Priorité | Statut   | Dépendances   |
| --- | -------------------------------------------------------------------------------------------- | -------- | -------- | ------------- |
| T11 | API + UI : créer une source (nom, description)                                               | M        | **Done** | T09           |
| T12 | API + UI : lister / consulter une source                                                     | M        | **Done** | T11           |
| T13 | API + UI : définir le schéma d'une source (éditeur JSON, réutilise `schemaDefinitionSchema`) | M        | **Done** | T11, T04, T56 |
| T14 | Validation Zod des payloads API sources/schémas (schéma partagé front/back, voir ADR-016)    | M        | **Done** | T13           |

**Critères d'acceptation**

- T11 : ✅ une source créée apparaît immédiatement dans la liste (`router.refresh()`), rattachée à l'utilisateur créateur (`createdById`).
- T12 : ✅ `GET /api/sources`, `GET /api/sources/:id`, page liste + page détail (Server Components).
- T13 : ✅ un schéma avec colonne obligatoire, regex, `allowedValues`, `duplicateKeyColumns` peut être créé via l'éditeur JSON et relu à l'identique ; devient automatiquement la version active.
- T14 : ✅ un payload invalide (nom vide, définition de schéma invalide) renvoie une 400 explicite avec message lisible, jamais une 500 — vérifié par 16 tests d'intégration sur les routes API (mock du repository, pas de DB réelle nécessaire).
- Modification d'une version existante : **structurellement impossible** — aucune route `PATCH`/`PUT` n'existe pour `schema-versions`, aucune fonction de mise à jour n'existe dans `schemaVersionRepository` (voir ADR-014).

---

## E4 — Upload & traitement asynchrone

| ID  | Tâche                                                                                                                                  | Priorité | Statut                                      | Dépendances   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------- | ------------- |
| T15 | `packages/storage` : `StorageProvider` + `S3StorageProvider` + clés UUID                                                               | M        | **Done**                                    | T02           |
| T16 | `packages/queue` : connexion Redis + queue "ingestion" + **producer** (`enqueueIngestionJob`)                                          | M        | **Done**                                    | T02           |
| T17 | API upload : validation taille/type/contenu, checksum, stockage, `Ingestion` PENDING, enqueue job                                      | M        | **Done**                                    | T13, T15, T16 |
| T18 | UI upload : drag-and-drop, sélection source, barre de progression, redirection                                                         | M        | **Done**                                    | T17           |
| T19 | `packages/validation` : génération dynamique d'un validateur depuis `SchemaVersion.definition`                                         | M        | **Done**                                    | T13           |
| T20 | Worker : parsing CSV en streaming                                                                                                      | M        | **Done** (câblé dans `apps/worker` via T58) | T06, T16, T19 |
| T21 | Worker : parsing XLSX (première feuille)                                                                                               | M        | **Done** (idem T20)                         | T20           |
| T22 | Worker : validation ligne par ligne + détection de doublons intra-fichier (colonnes clé)                                               | M        | **Done** (idem T20)                         | T19, T20      |
| T23 | Worker : mise à jour du statut (`PENDING → PROCESSING → SUCCESS/PARTIAL/FAILED`) et des compteurs                                      | M        | **Done**                                    | T22           |
| T24 | Retry/backoff BullMQ + idempotence du job en cas de crash worker                                                                       | S        | **Done**                                    | T23           |
| T57 | Worker BullMQ complet : consumer, retries/backoff, logs structurés, graceful shutdown, healthcheck, verrou logique anti race condition | M        | **Done**                                    | T16, T06      |
| T58 | Worker : câblage du moteur de validation réel (`@dataflow-ci/validation`) à la place de `runSimulatedProcessing`                       | M        | **Done**                                    | T19-T22, T57  |

**Critères d'acceptation**

- T15 : ✅ clé d'objet générée par UUID (`generateObjectKey`), jamais le nom original — testé (5 tests).
- T16 : ✅ producer (`enqueueIngestionJob`, `jobId: ingestionId`, 3 tentatives + backoff exponentiel) utilisé par T17.
- T17 : ✅ un fichier > 10 Mo, d'extension interdite, vide, au contenu incohérent avec son extension, ou sans schéma actif sur la source est rejeté avec un message clair (400), jamais un crash. Checksum SHA-256 calculé, double soumission détectée. Testé par 10 tests d'intégration sur la route.
- T18 : ✅ drag-and-drop, sélection de source, barre de progression réelle (XHR), redirection vers `/ingestions/:id` sans attendre la fin du traitement.
- Parcours complet demandé (upload → stockage → ingestion PENDING → job créé) : couvert explicitement par le test `"parcours complet"` de `route.test.ts`.
- T19 : ✅ `packages/validation` — moteur indépendant de Next.js/Prisma/Redis/BullMQ (seule dépendance interne : `@dataflow-ci/domain` pour le type `SchemaDefinition`). Parsing CSV en streaming (`csv-parse`) et XLSX en chargement complet (`exceljs`, voir ADR-024), validation cellule par cellule pour les 6 types × leurs contraintes, 19 codes d'erreur (`errorCodes.ts`), détection de doublons intra-fichier sur colonnes clé, export CSV des lignes valides avec neutralisation d'injection de formule (ADR-026). 68 tests (unitaires + intégration `validateFile.test.ts` sur 7 fixtures : propre, partiellement invalide, entièrement invalide, vide, doublons, colonnes en trop, XLSX corrompu).
- T20/T21/T22/T58 : ✅ `processIngestionJob` télécharge le fichier, résout la version de schéma exacte de l'ingestion (`schemaVersionRepository.findSchemaVersionById` + `getTypedDefinition`), détecte CSV/XLSX depuis l'extension (`detectFileFormat`), appelle `validateFile()`, uploade l'export des lignes valides (si `validRows > 0`) via `StorageProvider`, persiste les erreurs (`appendIngestionErrors`) et le résultat final (`completeIngestion`). Le statut final est dérivé par `deriveIngestionOutcome` selon la règle d'ASSUMPTIONS.md §5 (`validRows === 0` → FAILED en priorité, sinon `invalidRows === 0` → SUCCESS, sinon PARTIAL). `runSimulatedProcessing` a été supprimé (plus utilisé). 12 tests d'intégration sur `processIngestionJob` (dont SUCCESS/PARTIAL/FAILED, absence d'upload d'export quand `validRows = 0`, version de schéma introuvable) + 5 tests sur `deriveIngestionOutcome` + 3 sur `detectFileFormat`.
- T23 : ✅ mécanique du statut ET valeurs de compteurs réelles (plus simulées), opérationnelle et testée.
- T24 : ✅ `jobId = ingestionId` empêche BullMQ de créer un doublon de job ; `deleteIngestionErrors` avant chaque tentative empêche un retry de dupliquer des lignes d'erreur ; testé (12 tests sur `processIngestionJob`).
- T57 : ✅ voir explication détaillée des race conditions ci-dessous et ADR-020/021 dans DECISIONS.md.
- T58 : ✅ voir T20/T21/T22 ci-dessus — même changement.

### Comment les race conditions sont évitées (worker BullMQ)

1. **Deux jobs pour la même ingestion** : impossible dès la création — `enqueueIngestionJob` utilise `jobId = ingestionId`, et BullMQ refuse/fusionne toute tentative d'ajouter un job avec un `jobId` déjà présent dans la queue.
2. **Deux workers qui traiteraient le même job en même temps** : déjà empêché par le mécanisme de verrouillage interne de BullMQ (un job actif est "loué" par le worker qui l'a pris ; un autre worker ne peut pas le prendre tant que le bail n'a pas expiré).
3. **Le vrai risque résiduel — un job relancé (retry, ou worker redémarré) pendant qu'une tentative précédente a déjà partiellement avancé** : c'est celui que l'application doit gérer elle-même. `claimIngestionForProcessing` fait un `UPDATE ... WHERE status = 'PENDING'` (via `updateMany`, jamais un `findUnique` + `update` séparés) — Postgres garantit l'atomicité de cette transition : si deux tentatives l'exécutaient au même instant, une seule verrait `count === 1`, l'autre `count === 0` et s'arrêterait (`"lost_race"`).
4. **Une ingestion déjà terminée qui reçoit quand même un job** (double livraison BullMQ, ou relance manuelle) : vérifié explicitement en premier (`TERMINAL_STATUSES`) — jamais retraitée.
5. **Un retry d'une tentative qui a échoué en cours de route** (donc déjà en `PROCESSING`, pas `PENDING`) : `processIngestionJob` ne re-tente pas le verrou (il échouerait, l'ingestion n'étant plus `PENDING`) — il **reprend directement le traitement**, après avoir vidé les erreurs déjà écrites (`deleteIngestionErrors`) pour ne jamais les dupliquer.
6. **Écriture du statut final** : `completeIngestion` n'est appelé qu'une fois par tentative _réussie_ (dans `processIngestionJob`) ou qu'après épuisement de toutes les tentatives (dans `handleJobFailure`, jamais avant) — jamais les deux pour le même job.

---

## E5 — Rapport d'ingestion & export

| ID  | Tâche                                                                            | Priorité | Statut   | Dépendances |
| --- | -------------------------------------------------------------------------------- | -------- | -------- | ----------- |
| T25 | API statut/rapport (`GET /api/ingestions/:id`) avec compteurs + erreurs paginées | M        | **Done** | T23         |
| T26 | UI rapport : polling du statut, affichage stats + table d'erreurs                | M        | **Done** | T25         |
| T27 | Worker : génération et stockage de l'export CSV des lignes valides               | M        | **Done** | T22         |
| T28 | API + UI : téléchargement de l'export CSV                                        | M        | **Done** | T27         |

**Critères d'acceptation**

- T27 : ✅ `processIngestionJob` uploade l'export (`validRowsCsv` produit par `packages/validation`, neutralisation d'injection de formule incluse — ADR-026) via `StorageProvider`, clé UUID (`generateObjectKey`), seulement si `validRows > 0` ; la clé est écrite sur `Ingestion.validFileKey` (`completeIngestion`). Testé (`processIngestionJob.test.ts`).
- T25 : ✅ `GET /api/ingestions/:id?page=&pageSize=` renvoie les métadonnées de l'ingestion, ses compteurs, `hasExport`, et une page d'erreurs (défaut 50, plafond 200 — voir ASSUMPTIONS.md §8). 9 tests d'intégration (404, pagination par défaut/explicite/plafonnée, page invalide ignorée, calcul de `totalPages`, 401). Le brief nomme cette route `GET /api/files/:id` ; renommée `/api/ingestions/:id` pour rester cohérente avec le reste de l'API (`POST /api/ingestions` existant) — même contrat fonctionnel.
- T26 : ✅ `apps/web/src/app/(app)/ingestions/[id]/page.tsx` (Server Component, premier rendu sans round-trip API) + `IngestionReport.tsx` (Client Component) qui interroge `GET /api/ingestions/:id` toutes les 2 secondes (voir ADR-009) tant que le statut n'est pas terminal, affiche les compteurs, le motif d'échec (`failureReason`) si `FAILED`, et une table d'erreurs paginée (page précédente/suivante).
- T28 : ✅ `GET /api/ingestions/:id/export` redirige (307) vers une URL signée S3/MinIO (`getSignedDownloadUrl`, expire par défaut à 300s) — jamais le fichier ne transite par le process Next.js. 404 si l'ingestion n'existe pas ou si `validFileKey` est `null` (aucune ligne valide). Lien de téléchargement affiché sur la page de rapport seulement si `hasExport`. Le CSV contient uniquement les lignes valides, dans l'ordre des colonnes du fichier source (colonnes non déclarées ignorées si `allowExtraColumns`), avec neutralisation d'injection de formule.

---

## E6 — Versionnement de schéma

| ID  | Tâche                                                                                 | Priorité | Statut      | Dépendances |
| --- | ------------------------------------------------------------------------------------- | -------- | ----------- | ----------- |
| T29 | API + UI : créer une nouvelle version de schéma à partir de la précédente             | M        | **Done** (via T13, mécanisme différent — voir note) | T13         |
| T30 | Activation d'une version (archivage automatique de l'ancienne `ACTIVE`)               | M        | **Done** (via ADR-014, mécanisme différent — voir note) | T29         |
| T31 | Figer `schemaVersionId` sur `IngestionFile` à l'upload (pas de recalcul rétroactif)   | M        | **Done**    | T17, T30    |
| T32 | UI : historique des versions par source, version utilisée affichée sur chaque fichier | S        | **Partiel** — historique par source fait, version affichée sur le rapport d'ingestion manquante | T31         |

**Note (T29/T30)** : cette section date du plan initial, avant que le modèle de données ne soit
simplifié (voir ADR-005→ADR-013, ADR-010→ADR-014). Le besoin décrit ici est couvert, mais par un
mécanisme plus simple qu'un statut `DRAFT/ACTIVE/ARCHIVED` : `schemaVersionRepository.
createSchemaVersion` crée la nouvelle version **et** la promeut automatiquement en version courante
de la source dans la même transaction (`DataSource.currentSchemaVersionId`) — une source n'a
physiquement qu'un seul pointeur, donc "une seule version active à la fois" est garanti par le
schéma de données lui-même, pas par une règle applicative à faire respecter.

**Critères d'acceptation**

- T29/T30 : ✅ une seule version courante possible par construction (`@unique` sur
  `currentSchemaVersionId`) — voir ADR-014.
- T31 : ✅ `Ingestion.schemaVersionId` est écrit une fois à la création (`createIngestion`) ; aucune
  fonction de mise à jour de ce champ n'existe dans `ingestionRepository` — modifier le schéma d'une
  source après un upload ne change jamais rétroactivement le résultat déjà calculé.
- T32 : ⏳ `apps/web/src/app/(app)/sources/[id]/page.tsx` affiche l'historique complet des versions
  d'une source (badge active/archivée). **Gap réel non comblé** : le rapport d'ingestion
  (`/ingestions/[id]`) n'affiche pas le numéro de version de schéma utilisée pour valider ce fichier
  précis — facile à ajouter (`schemaVersionId` est déjà en base et dans l'API), mais pas fait.

---

## E7 — Dashboard

| ID  | Tâche                                                                            | Priorité | Statut   | Dépendances |
| --- | -------------------------------------------------------------------------------- | -------- | -------- | ----------- |
| T33 | Requêtes d'agrégation SQL (fichiers/source, taux succès/erreur, sources actives) | M        | **Done** | T23         |
| T34 | UI dashboard : 3 visualisations Recharts justifiées dans DESIGN.md               | M        | **Done** | T33         |
| T35 | Sélecteur de période (défaut 30 jours glissants)                                 | S        | **Done** | T34         |

**Critères d'acceptation**

- T33 : ✅ `packages/database/src/repositories/dashboardRepository.ts` — `getDashboardSummary` (compteurs par statut + lignes traitées + sources actives, via `groupBy`, portable), `getDailyStatusCounts` et `getTopSourcesByVolume` (SQL brut via `$queryRaw`, cohérent avec ADR-004 — agrégations avec `date_trunc`/`FILTER` que `groupBy` ne couvre pas proprement).
- T34 : ✅ page `/dashboard` (Server Component, pas de round-trip API — même pattern que `/sources`) avec 3 visualisations Recharts : barres empilées "ingestions par jour" (volume dans le temps), donut "répartition par statut" (santé globale), barres horizontales "sources les plus actives" (concentration du volume). Chaque graphique gère l'état vide explicitement (message plutôt qu'un graphique cassé). Fonction pure `buildDailyStatusSeries` (remplit les jours sans donnée à zéro, pour un axe des temps continu) testée indépendamment de Recharts/Prisma (4 tests).
- T35 : ✅ sélecteur 7/30/90 jours (`PeriodSelector`, liens `?days=`), 30 jours par défaut (ASSUMPTIONS.md §7) si absent ou invalide.

---

## E8 — Durcissement & cas limites

| ID  | Tâche                                                                                            | Priorité | Statut                                     | Dépendances |
| --- | ------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------ | ----------- |
| T36 | Autorisation systématique sur toutes les routes API (pas d'accès sans session)                   | M        | **Done**                                   | T09         |
| T37 | Gestion des fichiers corrompus / encodage invalide (statut `FAILED` propre, pas de crash worker) | M        | **Done** (corruption ; encodage voir note) | T23         |
| T38 | États de chargement / vide sur toutes les pages listant des données                              | S        | **Done**                                   | T26, T34    |
| T39 | Limitation raisonnable des erreurs affichées (pagination) pour fichiers à fort taux d'échec      | S        | **Done**                                   | T25         |
| T59 | Revue de code senior (sécurité, cohérence, dette) + corrections                                  | M        | **Done**                                   | E1-E10      |

**Critères d'acceptation**

- T36 : ✅ vérifié par lecture de code — 7/7 routes métier (`sources`, `sources/:id`, `schema-versions`, `schema-versions/:versionId`, `ingestions`, `ingestions/:id`, `ingestions/:id/export`) appellent `requireSession()` en première instruction et renvoient sa 401 telle quelle si absente. Seule route sans session obligatoire : `api/auth/[...nextauth]` — c'est le point d'entrée du login lui-même, ne peut pas exiger une session pour se connecter. Testé explicitement (cas "401 si non authentifié") sur les routes ajoutées cette nuit (`ingestions/:id`, `ingestions/:id/export`) ; couvert pour les routes précédentes par les tests déjà existants.
- T37 : ✅ fichier corrompu (`corrupted.xlsx`, ni un ZIP valide) → `MALFORMED_FILE`, `FAILED`, testé (`validateFile.test.ts`, `processIngestionJob.test.ts`) — jamais de crash worker (l'erreur est produite comme un résultat de validation normal, pas une exception non gérée). Encodage invalide (ex. fichier non-UTF8) : pas de détection dédiée ni de code d'erreur spécifique — un tel fichier produit des cellules illisibles qui échouent normalement la validation de type/contrainte (résultat `FAILED`/`PARTIAL` selon le taux d'échec, jamais un crash), mais ce n'est pas explicitement testé avec une fixture dédiée. Limite assumée, à noter dans DESIGN.md §5.
- T38 : ✅ `UploadForm` (`isSubmitting`, barre de progression), `IngestionReport` (`loading-state` pendant PENDING/PROCESSING), pages sources/ingestions/dashboard (`empty-state` si aucune donnée) — pattern cohérent partout.
- T39 : ✅ voir T25 — pagination serveur (défaut 50, plafond 200), jamais toutes les erreurs chargées d'un coup même sur un fichier à fort taux d'échec.
- T59 : ✅ passe de relecture ciblée (auth systématique, injection/XSS, `any`, promesses non attendues, secrets, dépendances dépréciées) sur l'ensemble du code applicatif écrit cette nuit. Un vrai bug de sécurité trouvé et corrigé : `POST /api/ingestions` chargeait tout le corps de la requête (`request.formData()`) en mémoire **avant** de vérifier la taille du fichier — un client pouvait donc envoyer un corps arbitrairement volumineux et épuiser la mémoire du process avant que la limite de 10 Mo ne s'applique. Corrigé par une garde sur l'en-tête `Content-Length`, rejetée en 413 avant lecture du corps (voir ADR-033), testée explicitement. Autres points vérifiés sans anomalie : aucun `any` dans tout le monorepo, aucune promesse non attendue en dehors des `void` déjà délibérés, aucun secret commité, `dangerouslySetInnerHTML`/`eval` absents, mots de passe hashés en bcrypt (coût 10) avec comparaison à temps constant même pour un email inconnu (`DUMMY_HASH`).

---

## E9 — Tests

| ID  | Tâche                                                            | Priorité | Statut                                                   | Dépendances |
| --- | ---------------------------------------------------------------- | -------- | -------------------------------------------------------- | ----------- |
| T40 | Tests unitaires Vitest sur `packages/validation` (cœur métier)   | M        | **Done** (68 tests — voir E4)                            | T19, T22    |
| T41 | Tests d'intégration API (au moins upload + schéma)               | S        | **Done** (bien au-delà du minimum demandé — voir détail) | T17, T13    |
| T42 | Test e2e Playwright : login → création source → upload → rapport | S        | **Done** — exécuté et passant le 2026-08-12 (15.8s)      | T08, T26    |

**Critères d'acceptation**

- T41 : ✅ toutes les routes API ont des tests d'intégration mockés (repository/storage/queue/auth mockés, handler Next.js appelé directement) : `sources` (5), `sources/:id` (5), `schema-versions` (6), `ingestions` upload (11), `ingestions/:id` rapport (9), `ingestions/:id/export` (4) — 40 tests sur les routes seules.
- T42 : ✅ **`apps/web/e2e/golden-path.spec.ts` exécuté réellement contre l'infra complète le 2026-08-12** (`pnpm --filter web run e2e`, navigateur Chromium installé via `playwright install`) : login → création source → définition schéma → upload de `clean.csv` → rapport atteignant un statut terminal — **1 passed en 15.8s**. Trois problèmes réels rencontrés et corrigés au passage, tous documentés en commentaire dans le fichier de test : (1) `import.meta.url` incompatible avec la transpilation CommonJS par défaut de Playwright — remplacé par `__dirname` ; (2) hydratation React pas toujours terminée après `networkidle` en mode `next dev` sur cette machine (compiles à froid observés jusqu'à 65s) — ajout d'un délai explicite (`waitForHydration`) avant toute interaction, sans quoi un clic prématuré déclenche un submit HTML natif (GET) ; (3) timeout par défaut de Playwright (30s) trop court face à la compilation à la demande d'une route lourde (`/api/ingestions`, qui importe `bullmq`) — timeout global remonté à 90s dans `playwright.config.ts`. Les trois causes sont spécifiques au confort du mode développement (`next dev`), pas des bugs applicatifs — une vraie build de production n'a pas ce délai de compilation à la demande.

**Total tests unitaires + intégration (mockés) sur l'ensemble du monorepo, tous exécutés et passants** : 193 (`@dataflow-ci/domain` 37, `@dataflow-ci/storage` 5, `@dataflow-ci/queue` 1, `@dataflow-ci/validation` 68, `worker` 23, `web` 59) **+ 1 test e2e Playwright réel**. `@dataflow-ci/config` et `@dataflow-ci/database` n'ont pas de suite de tests dédiée : le premier ne contient que du chargement d'env (couvert indirectement par le fait que toute l'app démarre), le second (repositories Prisma) est testé indirectement via les mocks dans les tests de routes API et du worker plutôt que directement, et validé en pratique par le parcours e2e et les vérifications manuelles ci-dessus (voir E1).

---

## E10 — CI/CD & déploiement

| ID  | Tâche                                                    | Priorité | Statut                                                                                                                      | Dépendances |
| --- | -------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- | ----------- |
| T43 | GitHub Actions : lint + typecheck + test sur chaque PR   | S        | **Done** (écrit, jamais exécuté sur GitHub)                                                                                 | T40         |
| T44 | Dockerfiles `web` et `worker`                            | M        | **Done** (écrits, jamais construits — Docker indisponible)                                                                  | T05, T06    |
| T45 | Déploiement `web` + `worker` + Postgres/Redis/S3 managés | M        | **Blocked** — nécessite des comptes/identifiants qui appartiennent à l'utilisateur, ne peut pas être fait de façon autonome | T44         |
| T46 | Migrations exécutées automatiquement au déploiement      | M        | **Blocked** (dépend de T45 ; commande documentée, voir DEPLOYMENT.md §4)                                                    | T45         |
| T47 | Pipeline de déploiement continu (CD) sur push `main`     | C        | Not started (dépend de T45)                                                                                                 | T43, T45    |

**Critères d'acceptation**

- T43 : ✅ `.github/workflows/ci.yml` — sur chaque push/PR vers `main` : install, `typecheck`, `lint`, `test`, `build` sur tout le monorepo. Ne nécessite aucune infrastructure réelle (tous les tests sont mockés). Jamais exécuté en pratique : le dépôt n'a jamais été poussé sur GitHub pendant cette session (aucun `git commit`/`git push` n'a été fait sans autorisation explicite, voir CLAUDE.md).
- T44 : ✅ `apps/web/Dockerfile` et `apps/worker/Dockerfile` — build multi-étapes `turbo prune` (voir ADR-031 pour le choix de ne pas utiliser `output: "standalone"`). `.dockerignore` à la racine. Ni l'un ni l'autre n'a pu être construit ni exécuté (Docker Desktop/WSL2 indisponible pendant tout le développement) — écrits d'après le pattern documenté par Turborepo, à valider dès que Docker est disponible.
- T45 : ⏳ nécessite des comptes chez un hébergeur (Railway/Render/Fly + Postgres/Redis/stockage managés) que je ne peux pas créer à la place de l'utilisateur — voir DEPLOYMENT.md pour la procédure complète prête à suivre (recommandations d'hébergement, ordre des étapes, variables d'environnement).
- T46 : ⏳ la commande (`prisma migrate deploy`) et sa place dans l'ordre de déploiement sont documentées (DEPLOYMENT.md §4, §7) mais pas exécutées ni automatisées dans un pipeline réel — bloqué par T45.

---

## E11 — Documentation & livraison

| ID  | Tâche                                                                 | Priorité | Statut      | Dépendances |
| --- | --------------------------------------------------------------------- | -------- | ----------- | ----------- |
| T48 | Finaliser `DESIGN.md` (2–5 pages)                                     | M        | **Done** (voir prompt 14 — dépasse un peu 5 pages vu la densité demandée) | E1–E9       |
| T49 | Finaliser `README.md` (lancement local + lien déployé + identifiants) | M        | **Partiel** — tout sauf l'URL déployée (bloqué par T45) | T45         |
| T50 | Historique de commits relu (messages clairs, pas de force-push)       | M        | Not started (rien commité pour l'instant, voir CLAUDE.md) | —           |

---

## E12 — Bonus (Could Have, uniquement si E1–E9 terminés en avance)

| ID  | Tâche                                                                 | Priorité | Statut      | Dépendances |
| --- | --------------------------------------------------------------------- | -------- | ----------- | ----------- |
| T51 | Notifications in-app à la fin d'un traitement                         | C        | Not started | T23         |
| T52 | Webhooks sortants à la validation d'un fichier                        | C        | Not started | T23         |
| T53 | Multi-tenant : isolation des sources par client                       | C        | Not started | T04         |
| T54 | SSE/WebSocket en remplacement du polling de statut                    | C        | Not started | T25         |
| T55 | Extension de la couverture de tests (edge cases, e2e supplémentaires) | C        | Not started | T40, T42    |

---

## E13 — Couche IA additive (innovation, hors périmètre obligatoire du brief)

Voir DECISIONS.md ADR-034 à ADR-038 pour l'architecture (additive, à la demande, jamais dans le
chemin critique du traitement ; aucune valeur brute de cellule envoyée au LLM). Motivation : le
profil du candidat (spécialisation IA générative/ML) et l'invitation explicite du brief à innover.

| ID  | Tâche                                                                                        | Priorité | Statut      | Dépendances |
| --- | ---------------------------------------------------------------------------------------------- | -------- | ----------- | ----------- |
| T60 | Afficher la version de schéma utilisée sur le rapport d'ingestion (combler le gap de T32)      | S        | Done        | T26         |
| T61 | `IngestionColumnStat` : modèle + migration + calcul dans `packages/validation` (ADR-038)       | M        | Done        | T19         |
| T62 | Détection d'anomalies par z-score sur l'historique de la source (ADR-037) + affichage rapport  | M        | Done        | T61         |
| T63 | `packages/ai` : client Ollama (compatible OpenAI), dégradation propre si absent (ADR-035)      | M        | Done        | —           |
| T64 | Copilot qualité de données : regroupement + explication des erreurs à la demande (ADR-034/036) | M        | Done        | T63         |
| T65 | Assistant d'inférence de schéma à partir d'un fichier échantillon (human-in-the-loop)          | M        | Done        | T63         |

**Critères d'acceptation**

- T61 : les statistiques sont calculées dans la même passe que la validation (pas un second parcours
  du fichier), aucune valeur individuelle de cellule n'est persistée au-delà de l'export CSV.
- T62 : un signal d'anomalie n'apparaît qu'avec un historique suffisant (≥ 5 ingestions pour la
  source) — sinon message "historique insuffisant", jamais un faux signal sur peu de données.
- T63 : `OLLAMA_API_KEY` absente/invalide → les fonctionnalités T64/T65 se désactivent proprement
  (message explicite), le reste de l'application n'est jamais affecté — testé explicitement.
- T64 : le prompt envoyé au LLM ne contient jamais de `rawValue` — testé explicitement (voir
  ADR-036).
- T65 : l'IA propose un schéma, ne l'impose jamais — l'opérateur doit explicitement valider/modifier
  avant création de la source (human-in-the-loop, voir ADR-034).

---

## Annexe — repères planning (14 jours, voir DESIGN.md pour le détail)

| Jour | Épique(s) visé(s)        |
| ---- | ------------------------ |
| 1    | E1                       |
| 2    | E2                       |
| 3    | E3                       |
| 4    | E4 (upload bout-en-bout) |
| 5    | E4 (worker)              |
| 6    | E5                       |
| 7    | E6                       |
| 8    | E7                       |
| 9    | E8                       |
| 10   | E9                       |
| 11   | E10                      |
| 12   | E10 (déploiement)        |
| 13   | E11                      |
| 14   | Marge / E12 si avance    |
