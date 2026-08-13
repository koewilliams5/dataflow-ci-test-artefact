# DECISIONS.md — Architecture Decision Records (format simplifié)

Chaque décision technique structurante est tracée ici au moment où elle est prise, avant ou pendant
l'implémentation — pas reconstruite a posteriori. Format : Contexte → Décision → Alternatives
considérées → Conséquences. Statut : `Proposé` (pas encore implémenté) · `Adopté` · `Remplacé`.

---

## ADR-001 — Monorepo pnpm workspaces + Turborepo

**Statut** : Proposé

**Contexte** : le projet a deux processus déployables (`web`, `worker`) qui doivent partager des
types et de la logique (accès DB, schéma de validation, connexion queue, client storage) sans les
dupliquer, tout en restant simple à faire tourner en local et en CI.

**Décision** : un seul repo, organisé en `apps/*` (déployables) et `packages/*` (partagés), avec
pnpm workspaces pour la résolution des dépendances et Turborepo pour l'orchestration des scripts
(`dev`, `build`, `lint`, `typecheck`, `test`) avec cache.

**Alternatives considérées**

- _Deux repos séparés (web / worker)_ : rejeté — duplication du modèle de données et des types de
  job, risque de désynchronisation entre les deux repos sur un projet de 2 semaines.
- _Un seul process Next.js avec traitement en `setImmediate`/route API longue_ : rejeté — ne
  satisfait pas l'exigence de traitement réellement asynchrone et non bloquant du brief, et couple
  la disponibilité de l'upload à celle du serveur web.
- _Nx_ à la place de Turborepo : équivalent fonctionnellement, mais plus lourd à configurer pour la
  taille de ce projet.

**Conséquences** : un seul historique Git à lire pour la restitution ; nécessite une configuration
correcte des `exports`/`transpilePackages` pour que `web` et `worker` consomment les packages
partagés sans étape de build intermédiaire (voir ADR-012).

---

## ADR-002 — Next.js (App Router) pour l'UI et l'API

**Statut** : Proposé

**Contexte** : le brief impose React ou Next.js, et une stack TypeScript de bout en bout.

**Décision** : Next.js App Router porte à la fois l'UI (Server/Client Components) et les routes API
(Route Handlers) consommées par le worker et le frontend — pas de backend séparé de type
Express/Fastify pour `web`.

**Alternatives considérées**

- _React (Vite) + backend Express/Fastify séparé_ : rejeté — deux serveurs à déployer et à
  synchroniser pour un MVP dont le périmètre ne le justifie pas ; Next.js couvre déjà le besoin
  (SSR, routes API, auth intégrable).
- _NestJS pour l'API_ : rejeté — sur-dimensionné pour le nombre d'endpoints du MVP (surtout la
  DI/modules), Next.js Route Handlers suffisent avec une séparation claire des responsabilités par
  dossier.

**Conséquences** : la logique métier doit rester hors des composants React (dans des Route Handlers
ou des modules `lib/` dédiés) pour rester testable indépendamment du framework.

---

## ADR-003 — Worker Node/TS indépendant + BullMQ/Redis pour l'asynchrone

**Statut** : Proposé

**Contexte** : le brief exige un traitement de fichier asynchrone, potentiellement long (parsing +
validation ligne par ligne), qui ne doit pas bloquer l'utilisateur ni la disponibilité du serveur
web.

**Décision** : un process Node/TS séparé (`apps/worker`) consomme une queue BullMQ adossée à Redis.
`web` ne fait qu'enqueue un job après avoir stocké le fichier ; tout le parsing/validation se passe
dans `worker`.

**Alternatives considérées**

- _`setImmediate`/traitement en arrière-plan dans le process Next.js_ : rejeté — pas de retry, pas
  d'isolation de charge, un fichier lourd ralentirait les requêtes web concurrentes.
- _Inngest / Trigger.dev (async managé)_ : plus rapide à mettre en place mais ajoute une dépendance
  externe (compte, réseau) risquée pour la démo/correction ; BullMQ + Redis auto-hébergés sont plus
  simples à faire tourner en local et à expliquer à l'oral.
- _SQS/Cloud Tasks_ : rejeté — lie le MVP à un cloud provider spécifique avant même d'avoir choisi
  l'hébergement.

**Conséquences** : Redis devient une dépendance d'infra obligatoire (ajoutée à `docker-compose.yml`
et à l'hébergement de prod) ; le worker doit être idempotent (voir tâche T24 dans TASKS.md) pour
tolérer un redémarrage en cours de job.

---

## ADR-004 — PostgreSQL + Prisma

**Statut** : Proposé

**Contexte** : le domaine est fortement relationnel (sources → versions de schéma → colonnes →
fichiers → erreurs de ligne), avec des besoins d'agrégation SQL pour le dashboard.

**Décision** : PostgreSQL comme base de métadonnées, Prisma comme ORM/migration tool, identifiants
en UUID (standard, portable, pas de dépendance à une lib d'ID propriétaire).

**Alternatives considérées**

- _MongoDB_ : rejeté — le modèle est relationnel par nature (clés étrangères, contraintes
  d'unicité `sourceId+version`), un document store ajouterait de la complexité applicative pour
  recréer ces garanties.
- _SQLite_ : envisageable pour le développement local seul, mais rejeté comme cible de prod — pas de
  bon support des accès concurrents web+worker sur un fichier unique.
- _Kysely / Drizzle / SQL brut_ à la place de Prisma : Prisma choisi pour la vitesse de mise en
  place (migrations générées, client typé) adaptée à un délai de 2 semaines ; le coût (moins de
  contrôle fin sur certaines requêtes d'agrégation) est jugé acceptable pour le MVP.

**Conséquences** : les migrations Prisma deviennent la source de vérité du schéma DB ; toute requête
d'agrégation complexe pour le dashboard qui dépasserait les capacités confortables de Prisma sera
faite en SQL brut via `prisma.$queryRaw` plutôt que de forcer l'ORM.

---

## ADR-005 — Schéma de colonnes normalisé (`SourceColumn`) plutôt que JSON libre

**Statut** : Remplacé par ADR-013 (voir plus bas)

**Contexte** : chaque source a un schéma attendu (colonnes, types, contraintes) qui doit être
créable/modifiable via une UI de formulaire, versionné, et consommé par le moteur de validation.

**Décision** : chaque colonne d'une version de schéma est une ligne dans une table `SourceColumn`
(nom, type, obligatoire, format, valeurs autorisées, clé d'unicité, ordre) plutôt qu'un blob JSON
attaché à `SourceSchemaVersion`.

**Alternatives considérées**

- _JSON libre sur `SourceSchemaVersion.columns`_ : plus rapide à écrire au départ, mais rejeté —
  moins facile à requêter (ex. lister toutes les sources avec une colonne `montant_fcfa`), moins
  naturel pour piloter un formulaire d'édition ligne par ligne, et moins défendable à l'oral comme
  choix de modélisation.

**Conséquences** : une migration Prisma de plus à gérer si le modèle de colonne évolue, mais un
schéma de base de données qui documente lui-même les règles supportées.

---

## ADR-006 — Zod pour la validation dynamique ligne par ligne

**Statut** : Proposé

**Contexte** : le moteur de validation doit transformer une définition de schéma **stockée en base**
(donc dynamique, pas connue à la compilation) en règles de validation appliquées à chaque ligne d'un
fichier uploadé.

**Décision** : `packages/validation` construit, à l'exécution, un validateur à partir des colonnes
de `SchemaVersion.definition` (voir ADR-013), puis valide chaque ligne parsée d'un fichier contre
ce validateur généré.

**Alternatives considérées**

- _Règles de validation écrites à la main (if/else par type)_ : rejeté — moins lisible, plus sujet
  aux régressions, et perd la cohérence de messages d'erreur que Zod fournit nativement.
- _JSON Schema + Ajv_ : équivalent en pouvoir d'expression, mais rejeté pour rester sur un seul
  outil de validation (Zod) déjà utilisé pour les payloads API et les variables d'env — cohérence et
  une seule bibliothèque à maîtriser pour la restitution.

**Conséquences** : Zod est utilisé à la fois pour des schémas statiques (env, API) et un schéma
généré dynamiquement — le code de génération dynamique doit rester isolé et testé indépendamment
(voir T40 dans TASKS.md), car c'est la partie la plus délicate à défendre à l'oral.

---

## ADR-007 — MinIO (S3-compatible) pour le stockage des fichiers

**Statut** : Proposé

**Contexte** : les fichiers bruts uploadés et les exports CSV générés doivent être stockés
durablement (pas seulement en mémoire le temps du job), accessibles à la fois par `web` (upload/
download) et `worker` (lecture pour traitement, écriture de l'export).

**Décision** : un client S3 générique (`packages/storage`), pointant vers MinIO en local/dev et vers
un service S3-compatible managé en production.

**Alternatives considérées**

- _Filesystem local_ : rejeté — ne fonctionne pas si `web` et `worker` tournent sur des instances
  différentes en production, ce qui est l'architecture cible.
- _Stocker le fichier en base (bytea)_ : rejeté — gonfle la base pour un usage (blobs binaires)
  pour lequel elle n'est pas conçue, dégrade les performances des sauvegardes/migrations.

**Conséquences** : une dépendance MinIO de plus en local (déjà dans `docker-compose.yml`) ; le choix
du provider S3 managé en prod est reporté à la phase de déploiement (ADR à compléter à ce moment-là).

---

## ADR-008 — Auth.js avec provider Credentials (email + mot de passe)

**Statut** : Proposé

**Contexte** : le brief demande une authentification simple, sans gestion de rôles complexe pour le
MVP.

**Décision** : Auth.js v5 (next-auth beta), provider Credentials (mot de passe hashé avec bcrypt),
session JWT. **Sans adapter Prisma.**

**Pourquoi pas d'adapter Prisma** : l'adapter Auth.js sert à persister comptes/sessions en base
(`Account`, `Session`, `VerificationToken`) — utile pour l'OAuth (lier plusieurs providers à un
compte) ou pour des sessions "database" (révocables côté serveur). Ici, un seul provider
(Credentials) et une stratégie JWT (session encodée dans un cookie signé, jamais lue en base) : ces
tables n'auraient aucun rôle réel et ajouteraient trois modèles Prisma sans usage au schéma
métier. `User` (déjà nécessaire pour `createdById` sur les autres entités) suffit.

**Alternatives considérées**

- _OAuth (Google, GitHub...)_ : rejeté pour le MVP — introduit une dépendance à un compte tiers et à
  une configuration d'application OAuth qui complique la prise en main par le correcteur (identifiants
  de test moins triviaux à fournir dans le README).
- _Magic link (email)_ : rejeté — nécessite un fournisseur d'envoi d'email fonctionnel en
  production, complexité supplémentaire non justifiée pour un MVP à login simple.
- _Adapter Prisma malgré tout_ : rejeté (voir ci-dessus) — complexité sans bénéfice pour ce MVP.

**Conséquences** :

- Un compte de démonstration (email + mot de passe) est créé par le script de seed et documenté
  dans `README.md`. Pas de page `/register` : les comptes ne sont créés que par le seed pour ce
  MVP (pas de gestion avancée des rôles/inscriptions demandée par le brief).
- Config Auth.js scindée en deux fichiers (`auth.config.ts` edge-safe sans provider, `auth.ts`
  complet avec le provider Credentials) : le middleware, qui tourne en runtime Edge, ne peut pas
  charger bcrypt/Prisma (APIs Node non supportées côté Edge).
- Sessions JWT non révocables côté serveur avant expiration — limite assumée du MVP (pas de
  liste de révocation), notée dans DESIGN.md.
- `verifyCredentials()` compare toujours un mot de passe contre un hash bcrypt (réel ou factice si
  l'utilisateur n'existe pas) pour éviter qu'un attaquant déduise l'existence d'un compte via le
  temps de réponse ; le message d'erreur affiché au formulaire est volontairement identique dans
  les deux cas ("email ou mot de passe incorrect").
- Passer à une gestion de rôles/multi-tenant plus tard (bonus, voir T53) réutilisera cette base
  Auth.js sans la remettre en cause.

---

## ADR-009 — Polling pour le suivi de statut (pas de SSE/WebSocket dans le MVP)

**Statut** : Proposé

**Contexte** : le brief laisse le choix du mécanisme de communication du statut d'un job en cours
(« queue, background job, polling, SSE, websocket… »).

**Décision** : l'UI interroge `GET /api/files/:id` toutes les 2 secondes tant que le statut est
`PENDING`/`PROCESSING`, et s'arrête au premier statut terminal.

**Alternatives considérées**

- _SSE_ : meilleure UX (mise à jour poussée, pas de délai de polling), mais rejeté pour le MVP —
  plus délicat à faire fonctionner de façon fiable derrière certains hébergeurs/proxys, et le gain
  UX ne justifie pas le risque dans un calendrier de 14 jours.
- _WebSocket_ : rejeté pour les mêmes raisons, en plus lourd (connexion persistante à gérer côté
  serveur) pour un besoin de notification unidirectionnelle simple.

**Conséquences** : documenté comme trade-off assumé dans `DESIGN.md` ; passage à SSE listé comme
bonus (T54) si le temps le permet, sans changer le contrat de l'API (`GET /api/files/:id` reste
valide, SSE serait un canal alternatif en plus, pas un remplacement).

---

## ADR-010 — Versionnement de schéma figé à l'upload (DRAFT/ACTIVE/ARCHIVED)

**Statut** : Remplacé par ADR-014 (voir plus bas)

**Contexte** : le schéma d'une source doit pouvoir évoluer sans invalider rétroactivement les
fichiers déjà traités, et sans qu'une modification en cours d'upload ne crée une incohérence.

**Décision** : chaque `SourceSchemaVersion` a un statut (`DRAFT`, `ACTIVE`, `ARCHIVED`) ; une seule
version `ACTIVE` par source à la fois. Un `IngestionFile` référence la version qui était `ACTIVE` au
moment de l'upload (`schemaVersionId`), figée définitivement — jamais recalculée après coup.

**Alternatives considérées**

- _Toujours valider contre la dernière version, sans figer_ : rejeté — un changement de schéma
  changerait rétroactivement l'interprétation d'un rapport déjà consulté par un client, ce qui casse
  la traçabilité recherchée par le brief.

**Conséquences** : le formulaire d'upload doit indiquer clairement contre quelle version le fichier
sera validé ; toute race condition entre « activer une nouvelle version » et « uploader un fichier »
est résolue par la valeur figée à la création du job.

---

## ADR-011 — Détection de doublons intra-fichier via colonnes désignées « clé »

**Statut** : Proposé

**Contexte** : le brief mentionne les doublons comme un type d'erreur volontairement injecté dans
`ventes-orange-dirty.csv`, sans préciser le périmètre exact de la détection attendue.

**Décision** : chaque `SourceColumn` peut être marquée `isUniqueKey`. Le worker considère la
combinaison des colonnes marquées comme clé et flague en erreur (`duplicate_key`) toute ligne dont
la combinaison de valeurs a déjà été vue **dans le même fichier**.

**Alternatives considérées**

- _Détection contre tout l'historique déjà ingéré pour la source_ : plus proche d'un cas réel de
  production, mais rejeté pour le MVP — nécessite une stratégie de fenêtre/performance sur
  l'historique qui dépasse le périmètre du MVP ; noté comme next-step dans `DESIGN.md`.

**Conséquences** : documenté comme hypothèse dans `ASSUMPTIONS.md` (§4) — décision assumée faute de
créneau disponible avec le tuteur, réversible si besoin (voir l'impact documenté à cet endroit).

---

## ADR-012 — Packages partagés consommés en source TypeScript, sans build séparé

**Statut** : Proposé

**Contexte** : `packages/*` doivent être consommés par `apps/web` (Next.js, bundlé par Turbopack/
Webpack) et `apps/worker` (exécuté via `tsx`), sans ajouter une étape de compilation intermédiaire à
maintenir en plus du monorepo.

**Décision** : chaque package partagé expose directement son `src/index.ts` via le champ `exports`
de son `package.json` (`"." : "./src/index.ts"`). `apps/web` les déclare dans
`transpilePackages` (Next.js) ; `apps/worker` les exécute via `tsx`, qui transpile à la volée.

**Alternatives considérées**

- _Build `tsc` séparé par package (dist/ committé ou généré en CI)_ : rejeté pour le MVP — étape
  supplémentaire à orchestrer avec Turborepo (ordre de build, invalidation de cache) pour un gain
  faible vu la taille du projet.

**Conséquences** : `tsc --noEmit` reste utilisé pour le typecheck (pas d'émission réelle) ; si le
projet grossissait significativement après ce MVP, cette décision serait révisée (bascule vers un
build par package avec `tsup`/`tsc` classique).

---

## ADR-013 — `definition` en JSONB validé par Zod, plutôt qu'un schéma normalisé

**Statut** : Proposé — remplace ADR-005

**Contexte** : ADR-005 proposait une table `SourceColumn` normalisée pour stocker les colonnes
d'un schéma. En spécifiant le format JSON attendu pour une version de schéma (types
`string/integer/number/boolean/date/datetime`, 10 contraintes possibles par colonne, 4 réglages
globaux comme `allowExtraColumns`/`duplicateKeyColumns`), il est apparu que ce format a une forme
récursive/conditionnelle (les contraintes valides dépendent du type de la colonne) mal servie par
une table plate — et qu'il doit de toute façon être validable indépendamment de la base (API,
formulaire, tests) via Zod.

**Décision** : `SchemaVersion.definition` est une colonne `jsonb`, dont le contenu est entièrement
défini et validé par `packages/domain` (`schemaDefinitionSchema`, un union discriminé Zod sur le
type de chaque colonne). Toute écriture passe par `parseSchemaDefinition()` avant d'atteindre la
base ; toute lecture peut être considérée fiable sans re-validation.

**Alternatives considérées**

- _Table `SourceColumn` normalisée (ADR-005)_ : rejetée — un union discriminé (`string` a
  `pattern`/`allowedValues`, `integer` a `min`/`max`/`positive`, etc.) se traduirait en un grand
  nombre de colonnes nullables ou en sous-tables par type, plus complexe à faire évoluer qu'un
  schéma Zod versionné dans le code.
- _JSON Schema + Ajv au lieu de Zod_ : rejeté pour rester sur un seul outil de validation dans tout
  le projet (cohérent avec ADR-006).

**Conséquences** : la validation du format vit dans `packages/domain` (testée indépendamment de
Prisma, 22 tests unitaires) ; `packages/database` ne fait que déléguer à `parseSchemaDefinition()`
avant d'écrire. Point de vigilance documenté dans TASKS.md/ce fichier : Postgres ne peut pas, par
lui-même, garantir que `definition` respecte le format — seule la couche applicative le garantit
(pas de contrainte SQL de type `CHECK` sur le contenu du JSON dans ce MVP).

---

## ADR-014 — Version courante pointée par `DataSource.currentSchemaVersionId`, sans statut sur `SchemaVersion`

**Statut** : Proposé — remplace ADR-010

**Contexte** : ADR-010 proposait un statut `DRAFT/ACTIVE/ARCHIVED` sur chaque `SchemaVersion`, avec
la contrainte applicative "une seule version `ACTIVE` par source". En spécifiant le modèle de
données final, un pointeur direct s'est avéré plus simple et plus sûr pour la même règle.

**Décision** : `DataSource.currentSchemaVersionId` (nullable, `@unique`) référence la
`SchemaVersion` actuellement utilisée pour valider les nouveaux uploads de cette source. Créer une
nouvelle version la promeut automatiquement en version courante (voir
`schemaVersionRepository.createSchemaVersion`, qui fait les deux écritures dans la même
transaction). Il n'existe pas de fonction de mise à jour d'une `SchemaVersion` existante — une
version reste donc immuable par construction, pas seulement par convention applicative.

**Alternatives considérées**

- _Statut `DRAFT/ACTIVE/ARCHIVED` (ADR-010)_ : rejeté — "une seule version ACTIVE par source" est
  une contrainte qu'il faut alors faire respecter en application (transaction qui désactive
  l'ancienne avant d'activer la nouvelle) ; un pointeur unique la rend structurellement impossible
  à violer : une source n'a physiquement qu'un seul champ `currentSchemaVersionId`.
- _Recalculer la version courante à la volée (max `versionNumber`)_ : rejeté — empêche de revenir
  à une version antérieure sans supprimer les versions plus récentes, ce qui casserait leur usage
  éventuel par des `Ingestion` déjà créées (contrainte "une ingestion référence toujours la version
  exacte utilisée").

**Conséquences** : la contrainte Prisma `@unique` sur `currentSchemaVersionId` empêche qu'une même
version soit "courante" pour deux sources différentes (situation qui n'aurait de toute façon pas de
sens, une version appartenant à une seule source via `dataSourceId`). Le lien inverse entre les deux
relations `DataSource ↔ SchemaVersion` (l'historique complet, et la version courante) est modélisé
comme deux relations Prisma nommées distinctement (`DataSourceVersions` et
`DataSourceCurrentVersion`) sur les mêmes deux modèles.

---

## ADR-015 — Politique de suppression : `Restrict` partout, sauf `IngestionError` (`Cascade`)

**Statut** : Proposé

**Contexte** : la valeur du produit repose sur la traçabilité (voir DESIGN.md) ; il faut décider
explicitement ce qui se passe si quelqu'un tente de supprimer un `User`, une `DataSource`, une
`SchemaVersion` ou une `Ingestion` qui a de l'historique attaché.

**Décision** : toutes les relations du schéma Prisma sont en `onDelete: Restrict` — impossible de
supprimer une ligne tant qu'une autre y fait encore référence — sauf `IngestionError → Ingestion`,
en `Cascade`.

**Alternatives considérées**

- _`Cascade` par défaut_ : rejeté — supprimer une `DataSource` supprimerait silencieusement tout
  son historique d'ingestions et d'erreurs, à l'opposé de l'objectif de traçabilité du brief.
- _`SetNull`_ : rejeté pour les mêmes raisons que `Cascade` sur les champs obligatoires (`Ingestion.
dataSourceId` n'est pas nullable) ; envisagé un temps pour `DataSource.currentSchemaVersionId`
  mais écarté aussi (voir ADR-014) au profit de `Restrict`, pour forcer une action explicite plutôt
  qu'un champ qui se vide silencieusement.

**Conséquences** : dans ce MVP, un `User`, une `DataSource` ou une `SchemaVersion` avec de
l'activité ne peut pratiquement jamais être supprimé en dur — une vraie fonctionnalité de
suppression (RGPD, nettoyage) nécessiterait un soft-delete (colonne `deletedAt`), noté comme
next-step dans DESIGN.md plutôt qu'implémenté dans le MVP.

---

## ADR-016 — Éditeur de schéma en JSON brut, plutôt qu'un formulaire structuré

**Statut** : Proposé

**Contexte** : le format de `definition` (ADR-013) a 6 types de colonnes, 10 contraintes possibles
et 4 réglages globaux (voir DESIGN.md, format du schéma). Construire un formulaire structuré
(ajout/suppression de colonnes, champs qui changent selon le type choisi) est un vrai chantier UI.

**Décision** : l'éditeur de version de schéma (`SchemaEditor`, page `/sources/[id]`) est un
textarea JSON avec validation en direct côté client, via **le même schéma Zod que le serveur**
(`schemaDefinitionSchema` de `@dataflow-ci/domain`, importé tel quel côté client). Le serveur
revalide indépendamment (défense en profondeur — un client ne doit jamais être la seule ligne de
défense), mais la règle de validation n'existe qu'à un seul endroit dans le code.

**Alternatives considérées**

- _Formulaire structuré complet (colonnes dynamiques, champs conditionnels par type)_ : reporté —
  périmètre de travail disproportionné pour cette étape du MVP par rapport au reste du backlog
  (upload, worker, dashboard...). Noté comme next-step dans DESIGN.md.
- _Formulaire simple (nom/type par colonne) + JSON pour les contraintes avancées_ : envisagé comme
  compromis, écarté pour l'instant au profit du tout-JSON pour aller plus vite ; resterait une
  amélioration possible avant le formulaire complet.

**Conséquences** : l'UX de création de schéma demande de connaître le format JSON (documenté dans
DESIGN.md, avec un exemple pré-rempli dans le textarea) — moins accessible qu'un formulaire guidé,
assumé comme trade-off MVP. Aucune duplication de règle de validation entre client et serveur : les
deux appellent littéralement la même fonction Zod.

---

## ADR-017 — `StorageProvider` comme abstraction, `S3StorageProvider` comme seule implémentation

**Statut** : Proposé

**Contexte** : le brief demande MinIO en local avec une API compatible S3, et une abstraction
`StorageProvider` / implémentation `S3StorageProvider` explicitement nommées.

**Décision** : `packages/storage` expose une interface `StorageProvider` (`upload`, `download`,
`getSignedDownloadUrl`, `delete`) et une seule implémentation, `S3StorageProvider`, basée sur
`@aws-sdk/client-s3` avec `forcePathStyle` activable (nécessaire pour MinIO). Aucun code applicatif
(routes API, worker) ne dépend directement du SDK AWS — tout passe par l'interface.

**Alternatives considérées**

- _Utiliser directement le SDK AWS partout où un upload est nécessaire_ : rejeté — l'interface
  n'ajoute qu'un fichier et rend explicite ce qui deviendra utile dès qu'un deuxième provider serait
  envisagé (ex. GCS), sans complexité disproportionnée pour le MVP.

**Conséquences** : passer de MinIO à un vrai service S3 managé en production (Railway/Render/AWS)
ne change qu'une configuration (`S3_ENDPOINT`, credentials), jamais le code applicatif. Les clés
d'objet sont **toujours générées par UUID** (`generateObjectKey`), jamais à partir du nom original
du fichier — testé explicitement (le nom original reste uniquement en base, pour l'affichage).

---

## ADR-018 — `packages/queue` construit en deux temps : producer maintenant, worker consommateur ensuite

**Statut** : Proposé

**Contexte** : le parcours d'upload doit "créer un job BullMQ", mais l'étape dédiée au traitement
asynchrone (connexion Redis, retries, backoff, logs structurés, graceful shutdown, healthcheck,
**worker indépendant dans apps/worker**) est explicitement une étape séparée du backlog.

**Décision** : à cette étape, `packages/queue` contient uniquement la connexion Redis, la queue
"ingestion", et le **producer** (`enqueueIngestionJob`, avec `jobId: ingestionId` — anticipé dès
maintenant car c'est un choix structurel, pas une question de résilience). Le **consumer** (le
worker qui traite réellement les jobs) n'est pas construit ici : le job créé reste dans la queue,
non traité, jusqu'à l'étape suivante.

**Alternatives considérées**

- _Construire un worker "stub" tout de suite (résultat simulé)_ : envisagé (le brief l'autorise
  explicitement : "le job peut provisoirement terminer avec un résultat simulé"), mais écarté —
  le périmètre exact du worker (retries, idempotence, logs) est décrit en détail dans l'étape
  suivante ; le construire deux fois (stub puis version finale) aurait été un aller-retour inutile.
  Le parcours testé pour cette étape s'arrête donc explicitement à "job créé", pas "job traité".

**Conséquences** : entre cette étape et la suivante, un fichier uploadé reste visible en base avec
le statut `PENDING` indéfiniment (pas de worker pour le faire progresser) — attendu et documenté,
pas un bug.

---

## ADR-019 — Déduplication de l'upload par checksum (double soumission)

**Statut** : Proposé

**Contexte** : le brief liste la double soumission comme cas limite à gérer (ex. double-clic sur le
bouton d'upload, ou nouvel essai après un timeout apparent côté client alors que la requête a en
fait abouti côté serveur).

**Décision** : avant de stocker le fichier, la route calcule son checksum SHA-256 et vérifie s'il
existe déjà une `Ingestion` `PENDING`/`PROCESSING` avec le même `(dataSourceId, checksum)`
(`ingestionRepository.findActiveIngestionByChecksum`, qui utilise l'index déjà présent depuis la
couche base de données). Si oui, l'`ingestionId` existant est renvoyé (HTTP 200) sans re-uploader
ni recréer d'ingestion. Une fois le traitement terminé (statut final), un nouvel upload du même
fichier est de nouveau accepté normalement.

**Alternatives considérées**

- _Uniquement une garde côté client (bouton désactivé pendant l'envoi)_ : gardée en complément
  (UX), mais insuffisante seule — n'empêche ni un double onglet, ni un retry réseau automatique.
- _Verrou applicatif générique (mutex/lock table)_ : rejeté pour le MVP — plus de complexité que
  nécessaire ; le couple (source, checksum, statut actif) suffit à couvrir le cas réel.

**Conséquences** : deux fichiers strictement identiques uploadés délibérément (et non par accident)
sur la même source, pendant qu'un des deux est encore en cours de traitement, seront fusionnés en
une seule ingestion — comportement jugé correct pour ce cas d'usage (le contenu est identique).

---

## ADR-020 — Verrouillage logique par `UPDATE ... WHERE status = 'PENDING'`, pas par un statut lu puis réécrit

**Statut** : Proposé

**Contexte** : le worker doit garantir qu'une ingestion n'est jamais traitée deux fois en parallèle
(deux workers, ou un retry qui chevaucherait une tentative encore active), sans dépendre d'un
service de lock externe.

**Décision** : `ingestionRepository.claimIngestionForProcessing` fait la transition
`PENDING → PROCESSING` via `prisma.ingestion.updateMany({ where: { id, status: "PENDING" }, ... })`
et retourne `true` seulement si `count === 1`. Read-then-write (lire le statut, décider, puis
écrire séparément) n'est jamais utilisé pour cette décision — l'atomicité vient de Postgres, pas
d'une vérification applicative.

**Alternatives considérées**

- _Verrou distribué (Redlock, `SET NX` Redis)_ : rejeté — complexité et dépendance
  supplémentaire pour un besoin déjà couvert par une contrainte `WHERE` sur l'UPDATE lui-même.
- _`SELECT ... FOR UPDATE` explicite_ : équivalent en rigueur, mais rejeté pour rester dans l'API
  haut niveau de Prisma (`updateMany`) plutôt que du SQL brut pour ce cas précis.

**Conséquences** : voir l'explication complète ("Comment les race conditions sont évitées") dans
TASKS.md, épique E4. Un retry (job relancé après échec, donc déjà en `PROCESSING`) n'essaie
délibérément pas de re-verrouiller — il reprend directement, après avoir vidé les erreurs
existantes (`deleteIngestionErrors`) pour rester idempotent.

---

## ADR-021 — `FAILED` écrit seulement après épuisement des tentatives, jamais dans le handler lui-même

**Statut** : Proposé

**Contexte** : le worker doit à la fois retenter les pannes transitoires (backoff exponentiel,
ADR précédent) et finir par marquer `FAILED` si le problème persiste — sans écrire ce statut trop
tôt (ce qui empêcherait BullMQ de retenter) ni l'oublier (ingestion qui resterait bloquée en
`PROCESSING` indéfiniment).

**Décision** : `processIngestionJob` ne catch aucune erreur de téléchargement/traitement — elle
remonte telle quelle, BullMQ compte l'échec et déclenche (ou non) un retry selon `attempts`/
`backoff`. `worker.on("failed", ...)` (délégué à `handleJobFailure`) est le **seul** endroit qui
écrit `FAILED` en base, et seulement si `job.attemptsMade >= maxAttempts`.

**Alternatives considérées**

- _Try/catch dans `processIngestionJob` qui marque FAILED immédiatement_ : rejeté — empêcherait
  toute retentative automatique d'une panne transitoire (ex. MinIO indisponible 10 secondes),
  contredisant l'exigence explicite de retry/backoff.

**Conséquences** : entre deux tentatives, une ingestion reste visible en `PROCESSING` — c'est
attendu (le brief ne demande pas un statut intermédiaire "en attente de retry" dédié). Le
`failureReason` final reflète toujours la **dernière** erreur rencontrée, pas la première.

---

## ADR-022 — Journalisation structurée maison plutôt qu'une dépendance (pino/winston)

**Statut** : Proposé

**Contexte** : le worker doit produire des logs structurés incluant systématiquement
`ingestionId`, `jobId`, `sourceId`, l'étape en cours, une durée et un résultat.

**Décision** : `apps/worker/src/logger.ts` est un utilitaire maison (~30 lignes) : une fonction
`createLogger(context)` avec un pattern `.child()` pour accumuler du contexte, qui sérialise
chaque appel en une ligne JSON sur stdout.

**Alternatives considérées**

- _pino_ : l'option la plus standard en production (perf, écosystème de transports) — écartée
  pour ce MVP car le besoin réel (une ligne JSON structurée, un contexte qui s'accumule) est
  entièrement couvert sans dépendance ; réévaluer si le volume de logs ou le besoin de transports
  (ex. vers un agrégateur) grandit après le MVP.

**Conséquences** : sortie compatible avec n'importe quel agrégateur de logs qui sait parser du
JSON par ligne (CloudWatch, Datadog, etc. en production) sans configuration supplémentaire.

---

## ADR-023 — `csv-parse`/`csv-stringify`/`exceljs` comme seules dépendances du moteur de validation

**Statut** : Proposé

**Contexte** : `packages/validation` doit lire du CSV en streaming, lire du XLSX, écrire un export
CSV sécurisé, et le tout doit rester indépendant de Next.js/Prisma/Redis/BullMQ (contrainte
explicite du brief) pour être testable et réutilisable seul.

**Décision** : trois dépendances ciblées, chacune sur son propre besoin — `csv-parse` (lecture CSV
en flux, `for await`), `csv-stringify` (écriture CSV, échappement RFC 4180 correct), `exceljs`
(lecture XLSX). Aucune dépendance vers `@dataflow-ci/database`, `@dataflow-ci/queue` ou
`@dataflow-ci/storage` — seul `@dataflow-ci/domain` (le type `SchemaDefinition`) est utilisé.

**Alternatives considérées**

- _Écrire un parseur CSV/XLSX maison_ : rejeté — le format CSV a des subtilités d'échappement
  (guillemets, sauts de ligne dans une cellule) et le format XLSX est un ZIP contenant du XML ;
  les réinventer introduirait un risque de bug plus élevé qu'utiliser une bibliothèque mature, pour
  un gain de dépendance non justifié sur un projet de 2 semaines.
- _`xlsx` (SheetJS) au lieu d'`exceljs`_ : équivalent fonctionnellement ; `exceljs` retenu pour son
  API de lecture par flux/ligne plus proche du style déjà utilisé côté CSV (voir ADR-024).

**Conséquences** : le moteur reste importable et testable en dehors de tout contexte web/queue/DB
(vérifié par les tests d'intégration `validateFile.test.ts`, qui n'importent que
`@dataflow-ci/domain` et des fixtures locales).

---

## ADR-024 — XLSX chargé entièrement en mémoire, CSV lu en flux

**Statut** : Proposé

**Contexte** : le brief plafonne la taille d'un fichier uploadé à 10 Mo. `exceljs` propose deux
API : un lecteur streaming (`WorkbookReader`, plus complexe, événementiel) et un chargement complet
du classeur (`workbook.xlsx.load(buffer)`, plus simple, mais garde tout en mémoire).

**Décision** : `readXlsxRowSource` charge le classeur entier en mémoire via `workbook.xlsx.load`.
`readCsvRowSource`, lui, reste en streaming réel via `csv-parse` (`for await` sur le flux d'entrée),
car `csv-parse` ne demande pas ce compromis — le streaming CSV est "gratuit".

**Alternatives considérées**

- _`WorkbookReader` streaming pour XLSX aussi_ : rejeté pour ce MVP — API plus complexe (gestion
  d'événements plutôt que `for await`), pour un gain mémoire non déterminant vu le plafond de 10 Mo
  (quelques dizaines de milliers de lignes au plus, largement gérable en mémoire sur un worker
  Node standard).

**Conséquences** : si le plafond de taille de fichier devait significativement augmenter après ce
MVP, ce choix serait le premier point à revoir (documenté aussi dans le commentaire du code
source). Le comportement observable (résultat de validation) est identique entre les deux
approches — seul le profil mémoire diffère.

---

## ADR-025 — Une seule erreur par cellule (arrêt à la première règle violée)

**Statut** : Proposé

**Contexte** : une cellule peut violer plusieurs règles à la fois (ex. une valeur qui n'est ni un
entier valide, ni dans la plage autorisée si elle l'était). Il faut décider si `validateCell`
rapporte toutes les violations ou seulement la première.

**Décision** : `validateCell` s'arrête à la première erreur rencontrée pour une cellule donnée
(ordre : obligatoire → conversion de type → valeurs autorisées → pattern/longueur/plage). Une
cellule ne produit donc jamais plus d'une ligne dans `errors`.

**Alternatives considérées**

- _Rapporter toutes les violations d'une cellule_ : plus exhaustif, mais rejeté — dans la plupart
  des cas la première erreur (souvent une erreur de type) rend les suivantes non pertinentes ou
  redondantes (ex. si la valeur n'est pas un entier, tester ensuite `min`/`max` sur une conversion
  invalide n'a pas de sens) ; complexifierait aussi le format `DetailedError` (une cellule → liste
  au lieu d'une valeur).

**Conséquences** : documenté explicitement dans le code et dans `ASSUMPTIONS.md` — un fichier avec
beaucoup d'erreurs différentes sur une même cellule affichera un nombre d'erreurs légèrement
inférieur au nombre réel de règles violées, jamais supérieur. Simplification assumée pour la
lisibilité du rapport d'ingestion (prompt 9).

---

## ADR-026 — Neutralisation de l'injection de formule CSV (`=`/`+`/`-`/`@`) à l'export

**Statut** : Proposé

**Contexte** : le moteur produit un export CSV des lignes valides (téléchargeable depuis le rapport
d'ingestion, prompt 9). Une valeur de cellule provenant d'un fichier uploadé par un tiers peut
commencer par `=`, `+`, `-` ou `@` et être interprétée comme une formule par Excel/Sheets à
l'ouverture de l'export (OWASP "CSV Injection").

**Décision** : `sanitizeForCsvExport` préfixe d'une apostrophe (`'`) toute valeur commençant par un
de ces quatre caractères, avant l'écriture par `CsvExportWriter`. Appliqué systématiquement à
chaque cellule exportée, pas seulement sur certaines colonnes.

**Alternatives considérées**

- _Rejeter la ligne entière si une formule est détectée_ : rejeté — trop agressif, une valeur
  légitime peut commencer par `-` (ex. un montant négatif) ; l'objectif est de neutraliser
  l'interprétation en formule, pas de refuser la donnée.

**Conséquences** : la valeur affichée dans un tableur reste lisible (l'apostrophe en préfixe est
invisible à l'affichage dans Excel/Sheets, qui force la cellule en texte) ; testé explicitement
(`csvInjection.test.ts`, `csvExport.test.ts`).

---

## ADR-027 — Statut final dérivé dans le worker, jamais dans `packages/validation`

**Statut** : Proposé

**Contexte** : `packages/validation` doit rester indépendant du modèle de données `Ingestion`
(pas de dépendance vers `@dataflow-ci/database` — voir ADR-023) ; il ne peut donc pas connaître les
statuts `SUCCESS`/`PARTIAL`/`FAILED`. Il faut pourtant bien décider, quelque part, du statut final
à écrire une fois la validation terminée (règle définie dans ASSUMPTIONS.md §5 : `FAILED` si aucune
ligne valide, `SUCCESS` si aucune ligne invalide, `PARTIAL` sinon).

**Décision** : `validateFile()` retourne uniquement des compteurs neutres (`totalRows`, `validRows`,
`invalidRows`) et la liste d'erreurs — jamais un statut d'ingestion. La fonction pure
`deriveIngestionOutcome` (`apps/worker/src/deriveIngestionOutcome.ts`) applique la règle métier des
statuts à partir de ce résultat, juste avant `completeIngestion`. `validRows === 0` est vérifié en
priorité (avant `invalidRows === 0`), pour qu'un fichier vide (0 ligne au total, donc les deux
compteurs à 0) soit bien `FAILED`, pas `SUCCESS`.

**Alternatives considérées**

- _Ajouter un statut au résultat de `validateFile`_ : rejeté — coupler le moteur de validation au
  vocabulaire `SUCCESS/PARTIAL/FAILED` de `Ingestion` romprait son indépendance vis-à-vis du modèle
  de données (contrainte explicite du brief), pour une règle de trois lignes facilement isolée
  ailleurs.

**Conséquences** : la règle des statuts est testée indépendamment du moteur de parsing/validation
(5 tests unitaires sur `deriveIngestionOutcome`, purs, sans mock) ; si la définition d'un statut
change (voir "Impact si fausse" dans ASSUMPTIONS.md §5), seul ce fichier est à modifier, jamais
`packages/validation`.

---

## ADR-028 — Téléchargement de l'export via redirection vers une URL signée, jamais proxié par Next.js

**Statut** : Proposé

**Contexte** : le rapport d'ingestion doit permettre de télécharger l'export CSV des lignes valides
(stocké dans MinIO/S3, voir ADR-017). Deux façons de le servir : Next.js télécharge l'objet puis le
renvoie dans la réponse HTTP (proxy), ou Next.js renvoie une redirection vers une URL signée que le
navigateur suit directement contre le stockage.

**Décision** : `GET /api/ingestions/:id/export` ne télécharge jamais le fichier lui-même — elle
calcule une URL signée (`StorageProvider.getSignedDownloadUrl`, expiration 300s par défaut) et
répond `307 Temporary Redirect` vers cette URL. Le navigateur du client final récupère l'objet
directement depuis MinIO/S3, sans repasser par le process Next.js.

**Alternatives considérées**

- _Proxy (Next.js télécharge puis réémet le fichier)_ : rejeté — ferait transiter potentiellement
  plusieurs Mo par le process web pour chaque téléchargement, sans bénéfice (le fichier n'a besoin
  d'aucune transformation avant d'être servi) ; ne changerait rien à la sécurité puisque la route
  vérifie déjà la session avant de générer l'URL signée.

**Conséquences** : le lien de téléchargement (`<a href="/api/ingestions/:id/export">`) reste un
lien HTML classique (pas de JavaScript nécessaire pour déclencher le téléchargement) ; l'URL signée
elle-même n'est jamais visible avant que la route l'ait vérifiée (session + existence de
`validFileKey`), donc pas de contournement possible en devinant directement une URL MinIO.

---

## ADR-029 — Endpoint de rapport nommé `/api/ingestions/:id`, pas `/api/files/:id`

**Statut** : Proposé

**Contexte** : le brief nomme l'endpoint de rapport `GET /api/files/:id`. Le reste de l'API déjà
construite (upload, dédoublonnage, enqueue) vit sous `/api/ingestions` (`POST /api/ingestions`,
modèle `Ingestion` — voir ADR-014).

**Décision** : le rapport est exposé en `GET /api/ingestions/:id`, cohérent avec le préfixe déjà en
place, plutôt que d'introduire un second préfixe `/api/files` pour la même ressource.

**Alternatives considérées**

- _Respecter le nommage exact du brief (`/api/files/:id`)_ : rejeté — créerait deux préfixes
  d'API (`/api/ingestions` pour créer, `/api/files` pour consulter) pour la même entité, plus
  confus qu'utile ; le brief nomme les statuts/entités de façon descriptive sans imposer un contrat
  d'URL strict ailleurs dans le document.

**Conséquences** : à documenter explicitement à l'oral comme un écart mineur et assumé par rapport
au libellé du brief — le contrat fonctionnel (compteurs + erreurs paginées) est respecté à
l'identique, seul le chemin d'URL diffère.

---

## ADR-030 — Dashboard sans route API dédiée ; période pilotée par un paramètre d'URL

**Statut** : Proposé

**Contexte** : le dashboard affiche des agrégats (compteurs, séries temporelles, top sources) sur
une fenêtre glissante sélectionnable (7/30/90 jours — T35). Il fallait décider comment ces données
atteignent la page : via une route API dédiée appelée côté client, ou directement par le Server
Component.

**Décision** : `/dashboard` reste un Server Component qui appelle `dashboardRepository` directement
(même pattern que `/sources` et `/ingestions` — pas de round-trip HTTP interne), sans route
`/api/dashboard`. Le sélecteur de période est un ensemble de liens (`?days=7|30|90`) : changer de
période déclenche une navigation Next.js normale, qui ré-exécute le Server Component avec la
nouvelle fenêtre — aucun état client, aucun `fetch` manuel nécessaire.

**Alternatives considérées**

- _Route API `/api/dashboard` + fetch côté client_ : rejeté — utile pour du polling (voir
  ADR-009/ADR-029 sur le rapport d'ingestion, qui lui a un vrai besoin de rafraîchissement pendant
  qu'un traitement est en cours) ; le dashboard n'a pas ce besoin, une agrégation redemandée à
  chaque navigation suffit et évite un aller-retour HTTP + gestion de chargement supplémentaire.
- _Sélecteur en `useState` côté client avec fetch_ : rejeté pour la même raison — plus de code
  (composant client, état, effet) pour un résultat identique à une simple navigation avec query
  string, que Next.js sait déjà mettre en cache/précharger.

**Conséquences** : les graphiques Recharts restent des Client Components (obligatoire, ils
manipulent le DOM/SVG), mais ils ne font aucun fetch — ils reçoivent leurs données déjà calculées en
props depuis le Server Component parent, cohérent avec le reste de l'app (`IngestionReport` est la
seule page qui a un vrai besoin de re-fetch en boucle, documenté séparément).

---

## ADR-031 — Images Docker construites via `turbo prune`, sans `next.config` `output: "standalone"`

**Statut** : Proposé

**Contexte** : `apps/web` et `apps/worker` doivent chacun produire une image Docker de production
(voir DEPLOYMENT.md). Le pattern documenté par Next.js pour une image légère est `output:
"standalone"` (trace les seules dépendances réellement utilisées dans `.next/standalone`).

**Décision** : le build Docker utilise `turbo prune <app> --docker` (sous-graphe de dépendances du
monorepo réduit à une seule app) puis un `pnpm install` + `next build` normal, sans activer `output:
"standalone"` dans `next.config.ts`. L'image finale copie le résultat du build **avec** son
`node_modules` complet plutôt qu'un dossier tracé.

**Alternatives considérées**

- _`output: "standalone"`_ : essayé en premier, abandonné — sur cette machine de développement
  (Windows, sans droits de symlink/Developer Mode activé), `next build` échoue avec des erreurs
  `EPERM: operation not permitted, symlink` pendant la phase de traçage des fichiers. Fonctionnerait
  correctement à l'intérieur du conteneur Linux de l'image Docker elle-même, mais casserait
  `pnpm build`/`pnpm typecheck` en local sur cette machine (le pipeline turbo fait dépendre
  `typecheck` de `build`) — un coût jugé disproportionné par rapport au gain (image plus légère)
  pour un déploiement qui n'a de toute façon jamais pu être vérifié en pratique cette nuit (Docker
  indisponible). Documenté ici plutôt que silencieusement contourné, pour que la décision soit
  révisée en connaissance de cause dès que Docker/Linux est disponible pour vérifier.

**Conséquences** : image plus lourde que la version `standalone` (node_modules complet plutôt que
tracé), acceptable pour ce MVP. Revenir sur ce choix (réactiver `output: "standalone"`) est une
optimisation post-MVP possible, à faire depuis un environnement où `next build` peut réellement être
vérifié de bout en bout (Linux, ou Windows avec Developer Mode activé).

---

## ADR-032 — Stockage S3-compatible de production : Cloudflare R2 ou Scaleway Object Storage

**Statut** : Proposé — complète ADR-007 (qui reportait ce choix à la phase de déploiement)

**Contexte** : ADR-007 fixe MinIO comme provider S3-compatible en local/dev, et reporte
explicitement le choix du provider managé de production à cette étape.

**Décision** : recommandation pour la production — Cloudflare R2 ou Scaleway Object Storage, deux
services compatibles avec l'API S3 utilisée par `S3StorageProvider` (aucun changement de code, voir
ADR-017 — seule la configuration change : `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE=false`).

**Alternatives considérées**

- _AWS S3 directement_ : équivalent fonctionnellement (c'est l'API de référence), mais R2/Scaleway
  retenus en recommandation par défaut pour leur tarification plus prévisible sur un usage de
  démo/correction (R2 n'a notamment pas de frais de sortie réseau) — un compte AWS reste un choix
  tout aussi valide si l'utilisateur en a déjà un.
- _Garder MinIO auto-hébergé en production_ : rejeté comme recommandation par défaut — demande de
  gérer soi-même la disponibilité/sauvegarde d'un service de stockage, ce qu'un provider managé fait
  déjà pour un coût faible à ce volume.

**Conséquences** : aucun code applicatif à changer pour ce choix — uniquement des variables
d'environnement (voir DEPLOYMENT.md §3, §6). Ce choix n'a pas pu être vérifié en pratique (aucun
compte créé, aucun déploiement réalisé cette nuit) — recommandation à valider par l'utilisateur.

---

## ADR-033 — Garde `Content-Length` sur l'upload, avant lecture du corps de la requête

**Statut** : Proposé — corrigé lors de la revue de code senior (voir TASKS.md T59)

**Contexte** : revue de sécurité de `POST /api/ingestions` : `validateUploadedFile` (qui rejette un
fichier de plus de 10 Mo) ne s'exécute qu'**après** `await request.formData()`, qui charge tout le
corps de la requête en mémoire. Un client authentifié pouvait donc envoyer un corps arbitrairement
volumineux (des centaines de Mo) et faire grossir la mémoire du process `web` avant même que la
limite de taille ne soit appliquée — un vecteur d'épuisement mémoire (DoS), même limité aux
utilisateurs authentifiés (single-tenant interne, voir ASSUMPTIONS.md §1, donc pas un inconnu
anonyme sur Internet, mais un vecteur réel malgré tout).

**Décision** : la route lit l'en-tête `Content-Length` et rejette (`413 Payload Too Large`) avant
d'appeler `request.formData()` si la valeur annoncée dépasse `MAX_FILE_SIZE_BYTES` (+ une marge de
64 Ko pour les métadonnées multipart). `validateUploadedFile` reste la limite faisant autorité sur
la taille réelle du fichier (le contenu peut différer de l'en-tête annoncé) — cette garde n'est
qu'une défense en profondeur supplémentaire, la plus tôt possible dans le traitement de la requête.

**Alternatives considérées**

- _Se fier uniquement à `validateUploadedFile` (après chargement complet)_ : c'était le
  comportement avant cette revue — insuffisant, puisque le chargement complet en mémoire est
  précisément ce qu'on cherche à éviter.
- _Limiter la taille au niveau du reverse proxy/hébergeur plutôt que dans le code_ : complémentaire,
  pas exclusif — dépend d'une configuration d'infrastructure non garantie sur tous les hébergeurs
  cibles (voir DEPLOYMENT.md) ; la garde applicative reste nécessaire indépendamment de ça.

**Conséquences** : un client qui ment sur son `Content-Length` (l'annonce plus petit que le corps
réel) n'est pas couvert par cette garde — reste couvert par `validateUploadedFile` après coup, avec
le même coût mémoire qu'avant pour ce cas résiduel. Un vrai plafond au niveau transport (reverse
proxy) resterait la défense la plus robuste, notée comme amélioration possible dans DEPLOYMENT.md.
Testé explicitement (`route.test.ts`, "413 si Content-Length dépasse la taille maximale").

---

## ADR-034 — Couche IA additive, à la demande, jamais dans le chemin critique du traitement

**Statut** : Proposé

**Contexte** : le profil du candidat (spécialisation IA générative/ML) motive l'ajout d'une couche
d'assistance IA (explication d'erreurs, détection d'anomalies, aide à la définition de schéma) au
MVP. Le brief n'impose rien de tel — c'est une innovation volontaire, pas une exigence. Le risque
principal : coupler la fiabilité du pipeline d'ingestion (déterministe, déjà éprouvé — voir
ADR-020/021) à la disponibilité d'un service tiers.

**Décision** : toute fonctionnalité IA est **strictement additive et déclenchée à la demande**
(clic explicite de l'opérateur, jamais automatique après un traitement) — jamais insérée dans
`processIngestionJob`. Le statut d'une `Ingestion` (`PENDING/PROCESSING/SUCCESS/PARTIAL/FAILED`)
reste calculé à 100 % par le moteur de validation déterministe (`packages/validation`), écrit avant
même qu'une fonctionnalité IA soit sollicitée. Un appel IA qui échoue, time-out, ou n'est pas
configuré (pas de clé) ne doit jamais empêcher l'affichage du rapport ni la consultation de
l'historique — seul le composant IA concerné affiche un état d'erreur local.

**Alternatives considérées**

- _Lancer l'analyse IA automatiquement après chaque traitement (job BullMQ dédié)_ : rejeté pour le
  MVP — coût (chaque fichier traité déclenche un appel LLM, même ceux que personne ne consulte),
  latence supplémentaire non nécessaire au traitement lui-même, complexité de gestion d'échec
  partagée avec le pipeline critique pour un gain marginal (l'opérateur n'a pas besoin du résumé
  avant d'ouvrir le rapport). Resterait une évolution possible post-MVP si le besoin est confirmé.
- _Faire décider un LLM de la conformité d'une ligne_ : explicitement rejeté — le brief demande une
  validation déterministe et traçable (chaque erreur a un `errorCode` reproductible) ; un LLM
  n'apporte ni déterminisme ni traçabilité fiable pour cette décision, et introduirait un risque
  d'hallucination sur la donnée la plus sensible du système (voir ADR-036 pour la donnée elle-même).

**Conséquences** : chaque fonctionnalité IA est un endpoint/composant isolé, testable et
désactivable indépendamment (absence de clé API → fonctionnalité masquée ou message explicite,
jamais une erreur qui casse la page). Voir ADR-035 (fournisseur), ADR-036 (confidentialité),
ADR-037 (détection d'anomalies).

---

## ADR-035 — Ollama (API compatible OpenAI) comme fournisseur LLM

**Statut** : Proposé

**Contexte** : le candidat dispose d'une clé API Ollama (offre hébergée, pas une instance
auto-hébergée à déployer). Le besoin (résumer des métadonnées d'erreurs, proposer un schéma) ne
nécessite pas de fine-tuning ni de fonctionnalités propriétaires d'un fournisseur en particulier —
un simple appel de complétion de chat avec sortie structurée (JSON) suffit.

**Décision** : `packages/ai` — un client HTTP minimal (`fetch`, pas de SDK propriétaire) qui appelle
l'endpoint compatible OpenAI d'Ollama (`POST {OLLAMA_BASE_URL}/v1/chat/completions`,
`Authorization: Bearer {OLLAMA_API_KEY}`). Base URL et modèle configurables via variables d'env
(`OLLAMA_BASE_URL`, `OLLAMA_MODEL`), pas de valeur codée en dur — bascule vers un autre fournisseur
compatible OpenAI (OpenAI lui-même, Groq, etc.) réduite à changer ces deux variables.

**Alternatives considérées**

- _SDK officiel Ollama/OpenAI_ : rejeté — une dépendance de plus pour un besoin (une requête HTTP
  JSON, une réponse JSON) entièrement couvert par `fetch` natif, cohérent avec la philosophie du
  projet (éviter les dépendances pour des besoins simples — voir ADR-022).
- _Auto-héberger Ollama (conteneur dédié)_ : non applicable ici — la clé fournie est celle d'une
  offre hébergée, pas d'une instance à faire tourner ; aurait de toute façon ajouté un service Docker
  supplémentaire coûteux en ressources (pas de GPU sur les plans d'hébergement standards).

**Conséquences** : `OLLAMA_API_KEY` absente ou invalide → les fonctionnalités IA se désactivent
proprement (voir ADR-034), le reste de l'application n'est jamais affecté. Le choix d'un fournisseur
hébergé (par opposition à un auto-hébergement) signifie que les métadonnées envoyées au LLM quittent
l'infrastructure du projet — voir ADR-036 pour la politique appliquée à ce sujet.

---

## ADR-036 — Aucune valeur brute de cellule envoyée au LLM sans rédaction

**Statut** : Proposé

**Contexte** : DataFlow CI traite des données télécom/banque/grande distribution — potentiellement
des montants, identifiants clients, ou autres données à caractère commercial sensible. Le Copilot
qualité de données (ADR-034) a besoin de comprendre les erreurs pour les expliquer, ce qui pourrait
naïvement passer par l'envoi des `rawValue` des `IngestionError` (la valeur exacte qui a échoué) au
LLM — or celui-ci est un fournisseur hébergé tiers (ADR-035), donc hors de l'infrastructure du
projet.

**Décision** : le prompt envoyé au LLM ne contient jamais de `rawValue` telle quelle. Il contient
uniquement des métadonnées agrégées et non réversibles individuellement : `errorCode`, `columnName`,
le nombre de lignes concernées par ce couple (code, colonne), et — quand un exemple aide à
l'explication — une valeur **tronquée/généralisée** (ex. pour une date : le motif de non-conformité
détecté par le moteur, pas la date exacte ; pour un montant : sa plage de grandeur, pas le chiffre
précis). Le principe : le LLM doit pouvoir expliquer *pourquoi* une catégorie d'erreurs existe, sans
jamais avoir besoin de connaître une valeur métier précise pour le faire.

**Alternatives considérées**

- _Envoyer les `rawValue` telles quelles_ : rejeté — la qualité de l'explication n'en serait que
  marginalement meilleure (le moteur déterministe connaît déjà la règle violée, voir `errorCode`/
  `message`), pour un vrai risque de confidentialité sur un projet dont les données de démonstration
  imitent des cas réels (télécom/banque).
- _N'utiliser l'IA que sur des données synthétiques/anonymisées d'avance_ : rejeté comme règle
  générale — trop restrictif pour un usage réel ; la rédaction ciblée (ce ADR) couvre le besoin sans
  interdire la fonctionnalité.

**Conséquences** : la fonction qui construit le prompt (`buildErrorSummaryPrompt` ou équivalent) est
le seul point de passage vers le LLM et applique cette règle systématiquement — testée explicitement
pour garantir qu'aucun `rawValue` ne fuite dans le payload envoyé. Documenté explicitement comme
argument de soutenance ("comment protège-t-on les données").

---

## ADR-037 — Détection d'anomalies par z-score simple, pas par un modèle ML entraîné

**Statut** : Proposé

**Contexte** : le besoin (repéré par le candidat) : un fichier peut être 100 % conforme au schéma
(aucune erreur de validation) mais statistiquement suspect pour cette source précise — ex. un
montant moyen très supérieur à l'historique. Plusieurs approches possibles, de la règle de seuil
fixe à un modèle de détection d'anomalies entraîné (isolation forest, autoencodeur, etc.).

**Décision** : calcul d'un z-score simple par colonne numérique — `(valeur_moyenne_du_fichier -
moyenne_historique_de_la_source) / écart_type_historique` — sur les statistiques déjà calculées à
l'ingestion (voir ADR-038). Un z-score au-delà d'un seuil (ex. ±3) déclenche un signal "anomalie
détectée" affiché sur le rapport, avec la valeur observée et la moyenne historique en clair (aucun
LLM impliqué dans ce calcul — statistiques pures, déterministes, explicables).

**Alternatives considérées**

- _Modèle ML entraîné (isolation forest, autoencodeur...)_ : rejeté pour ce MVP — nécessiterait un
  volume d'historique conséquent pour être fiable (le projet n'a que quelques ingestions de
  démonstration), une infrastructure d'entraînement/versionnement de modèle disproportionnée par
  rapport au besoin, et serait moins explicable qu'un z-score pour l'opérateur ("pourquoi c'est
  signalé ?"). Le brief lui-même valorise un MVP solide plutôt que des fonctionnalités mal calibrées
  pour le contexte — un z-score bien expliqué démontre un meilleur jugement d'ingénierie qu'un modèle
  surdimensionné pour trois fichiers d'historique.
- _Seuil fixe (ex. "> 1 000 000 FCFA")_ : rejeté — ne s'adapte pas par source (un seuil pertinent
  pour une source de detail n'a pas de sens pour une source bancaire), contrairement au z-score qui
  compare chaque source à sa propre distribution historique.

**Conséquences** : le signal d'anomalie nécessite un minimum d'historique pour être significatif
(ex. au moins 5 ingestions passées pour la source) — en dessous, la fonctionnalité affiche
"historique insuffisant" plutôt qu'un faux signal. Évolution possible post-MVP si le volume réel
d'ingestions justifie un modèle plus riche (noté dans DESIGN.md, next steps).

---

## ADR-038 — Statistiques de colonnes numériques persistées à l'ingestion (`IngestionColumnStat`)

**Statut** : Proposé

**Contexte** : la détection d'anomalies (ADR-037) et un futur historique de tendances par colonne
ont besoin de connaître la distribution des valeurs numériques d'une source dans le temps. Le
pipeline actuel ne persiste que des compteurs globaux (`totalRows`/`validRows`/`invalidRows`) —
aucune donnée au niveau colonne. Recalculer ces statistiques à la demande impliquerait de
retélécharger et reparser chaque export CSV historique depuis le stockage — coûteux et fragile (les
exports peuvent en théorie être purgés indépendamment).

**Décision** : nouveau modèle Prisma `IngestionColumnStat` (`ingestionId`, `columnName`, `count`,
`mean`, `min`, `max`, `stddev`), une ligne par colonne de type `integer`/`number` du schéma, calculée
en une seule passe par `packages/validation` (extension de `validateFile`, pas un second parcours du
fichier) au même moment que la validation elle-même. Écrite par le worker avec le reste du résultat
de l'ingestion.

**Alternatives considérées**

- _Recalcul à la demande depuis l'export CSV stocké_ : rejeté — plus lent (téléchargement + reparse
  à chaque consultation du dashboard/rapport), et dépend de la rétention de l'export dans le
  stockage, une garantie que le projet ne fait pas aujourd'hui.
- _Stocker toutes les valeurs individuelles_ : rejeté sans hésitation — reviendrait à dupliquer le
  contenu du fichier client en base, un choix de confidentialité et de volumétrie indéfendable pour
  un gain (recalcul exact plutôt qu'agrégé) qui ne change rien à l'utilité de la fonctionnalité.

**Conséquences** : `packages/validation` reste indépendant de Prisma/Next.js/BullMQ (voir ADR-023) —
il retourne les statistiques calculées comme une valeur de plus dans `ValidateFileResult`, c'est le
worker qui les persiste via `packages/database`, exactement comme pour les erreurs et l'export.
Aucune donnée individuelle (aucune valeur de cellule) n'est stockée durablement au-delà de la durée
de vie de l'export CSV — seules les statistiques agrégées le sont.

---

## ADR-039 — Assistant d'inférence de schéma : échantillon brut envoyé au LLM, tradeoff distinct d'ADR-036

**Statut** : Proposé

**Contexte** : l'assistant d'inférence de schéma (T65) propose un schéma (types de colonnes,
formats de date, valeurs autorisées) à partir d'un fichier échantillon fourni par l'opérateur au
moment de créer une source. Contrairement au Copilot qualité de données (ADR-036), il n'existe ici
aucun moyen de deviner un type ou un format sans regarder de vraies valeurs — une colonne pleine de
`"2026-01-15"` n'est reconnaissable comme date `YYYY-MM-DD` qu'en observant la valeur elle-même. La
règle "jamais de rawValue" d'ADR-036 ne peut donc pas s'appliquer telle quelle sans vider la
fonctionnalité de son utilité : c'est un tradeoff de confidentialité différent, qui mérite sa propre
décision plutôt qu'une exception silencieuse à ADR-036.

**Décision** : le prompt envoyé au LLM contient l'en-tête et un échantillon **volontairement borné**
du fichier fourni pour cet usage précis — au maximum 20 lignes, chaque cellule tronquée à 80
caractères. Trois garde-fous distinguent cet usage de tout accès aux données de production :
1. **Fichier explicitement dédié à cet usage** : l'opérateur choisit et upload un fichier
   spécifiquement pour l'inférence, au moment de la création de la source — jamais un fichier
   d'ingestion réel traité automatiquement en arrière-plan.
2. **Borné et jetable** : l'échantillon n'est ni stocké, ni journalisé au-delà de la requête HTTP —
   contrairement au fichier d'upload d'une ingestion, il ne transite jamais par le stockage S3/MinIO
   du projet.
3. **Human-in-the-loop obligatoire** (cohérent avec ADR-034) : la réponse du LLM ne fait que
   pré-remplir l'éditeur JSON existant (`SchemaEditor`) — l'opérateur voit, peut modifier, et doit
   explicitement soumettre avant qu'une `SchemaVersion` soit créée. Le schéma proposé est
   revalidé côté serveur par `schemaDefinitionSchema` (comme toute soumission manuelle) avant
   d'être accepté.

**Alternatives considérées**

- _Réutiliser la rédaction d'ADR-036 (comptages agrégés seulement)_ : rejeté — impossible de deviner
  un `dateFormat`, un `pattern` regex ou une liste `allowedValues` réaliste sans exemples de valeurs ;
  la fonctionnalité perdrait toute son utilité.
- _Ne jamais envoyer le fichier au LLM, uniquement les en-têtes de colonnes_ : rejeté comme option
  par défaut — testé mentalement, la qualité des suggestions (types, formats) chute fortement sans
  exemples de valeurs, pour un gain de confidentialité marginal puisque le fichier est déjà un
  échantillon volontairement fourni par l'opérateur pour cet usage.
- _Limiter aux N premières colonnes seulement_ : jugé inutile pour la volumétrie de ce projet (schémas
  de quelques dizaines de colonnes au plus) — non retenu, mais signalé comme garde-fou simple à
  ajouter si un client avait un schéma anormalement large.

**Conséquences** : cette fonctionnalité a un profil de confidentialité différent de celui du Copilot
qualité de données — à documenter explicitement en soutenance ("pourquoi cette fonctionnalité envoie
des données réelles au LLM alors que l'autre ne le fait jamais"). L'opérateur reste seul décisionnaire
de ce qu'il upload pour cet usage ; aucune automatisation ne peut déclencher cette fonctionnalité sur
un fichier de production.

---

## ADR-040 — Webhooks sortants : best-effort, une tentative, jamais bloquant

**Statut** : Proposé

**Contexte** : le brief liste en bonus des webhooks sortants notifiant un système externe à la
validation d'un fichier (T52). L'app reste mono-tenant (voir ASSUMPTIONS.md §1) mais chaque
`DataSource` représente déjà un client/flux distinct — un point de configuration par source est
donc le bon niveau de granularité, plutôt qu'un réglage global. La question structurante est la
garantie de livraison : un vrai système de webhooks fiable (retries avec backoff, file d'attente
dédiée, statut de livraison consultable) est un projet en soi, disproportionné pour un bonus de fin
de MVP.

**Décision** : `DataSource.webhookUrl` (optionnel). Le worker appelle le webhook juste après avoir
écrit le statut terminal d'une ingestion (`SUCCESS`/`PARTIAL`/`FAILED`, y compris après épuisement
des tentatives BullMQ dans `handleJobFailure`). Livraison **best-effort** :
- une seule tentative, timeout 5s, aucun retry ;
- un échec (timeout, réseau, réponse HTTP non-2xx) est loggé (`log.warn`) et **ignoré** — ne fait
  jamais échouer ni retenter le job ; même philosophie qu'ADR-034 pour la couche IA (additif, jamais
  bloquant) ;
- signature HMAC-SHA256 du corps JSON dans l'en-tête `X-DataFlow-Signature`, via un secret partagé
  optionnel (`WEBHOOK_SIGNING_SECRET`) — permet au destinataire de vérifier l'authenticité. Absent :
  le webhook part quand même, simplement non signé (dégradation propre, comme les variables Ollama).

**Alternatives considérées**

- _File d'attente dédiée avec retries (BullMQ)_ : rejeté pour ce bonus — ajoute une deuxième queue,
  une politique de retry/dead-letter et un écran de suivi des livraisons, hors de proportion avec le
  temps disponible et la valeur démontrée à l'oral. Noté comme évolution naturelle post-MVP.
  Actuellement une livraison manquée nécessite une re-consultation manuelle du rapport d'ingestion —
  déjà accessible dans l'app.
- _Webhook global (une seule URL pour toute l'app)_ : rejeté — chaque source représente un flux/client
  distinct, un seul point de configuration par source colle mieux au modèle de données existant sans
  introduire de notion de tenant.
- _Pas de signature_ : envisagé pour rester minimal, mais l'ajout (une ligne HMAC) est trivial et
  distingue clairement ce webhook d'un simple `fetch` non authentifiable — retenu comme option
  optionnelle plutôt qu'obligatoire pour ne pas bloquer un premier test sans configuration.

**Conséquences** : pas de garantie de livraison — à assumer explicitement en soutenance comme
limite connue d'un bonus de fin de MVP, pas une fonctionnalité entreprise. Si `WEBHOOK_SIGNING_SECRET`
n'est jamais configuré, tous les webhooks partent non signés (comportement voulu, pas un bug).

---

## ADR-041 — Séparateur CSV configurable par source, valeur par défaut `,`

**Statut** : Adopté

**Contexte** : le dépôt de départ Artefact CI (inaccessible pendant l'essentiel du développement,
voir ASSUMPTIONS.md) a pu être consulté le 2026-08-13. Son deuxième exemple de source ("Stock Cartes
Bancaires - Banque Atlantique") utilise un fichier CSV séparé par des points-virgules (`;`), alors
que le moteur de ce projet (`packages/validation`, via `csv-parse`) avait le séparateur virgule câblé
en dur. Le fichier README du dépôt de départ précise explicitement : *"les deux sources ont des
délimiteurs et formats de date différents. C'est volontaire, ça reflète la réalité du métier."* —
gérer plusieurs délimiteurs différents, simultanément, est donc une exigence du brief lui-même, pas
un cas limite à ignorer.

**Décision** : nouveau champ optionnel `delimiter` (un seul caractère, `,` par défaut) dans le format
de schéma (`packages/domain/schemaDefinitionSchema`), transmis par `validateFile` au lecteur CSV
(`readCsvRowSource`, lui-même un simple passage au paramètre `delimiter` de `csv-parse`). Tout schéma
existant qui ne déclare pas ce champ garde le comportement actuel (virgule) sans migration —
rétrocompatible par construction grâce à `.default(",")` côté Zod.

**Alternatives considérées**

- _Détection automatique du délimiteur_ (compter virgules vs points-virgules sur la première ligne) :
  rejeté — fragile (un champ texte contenant une virgule dans un fichier `;` peut fausser la
  détection), et incohérent avec le principe du reste du format de schéma : tout y est déclaré
  explicitement et vérifié par Zod, jamais deviné à l'exécution.
- _Délimiteur fixe global pour toute l'application_ : rejeté d'office — les deux formats (`,` et `;`)
  doivent coexister au même moment, pour des sources différentes.

**Conséquences** : le format de schéma s'enrichit d'un champ de plus, mais reste rétrocompatible.
N'ajoute pas de mécanisme de règle inter-colonnes (ex. "cette date doit être antérieure à une autre
colonne") — le second exemple du brief en a aussi besoin, mais c'est un chantier distinct, non couvert
ici (voir DESIGN.md §5/§7).
