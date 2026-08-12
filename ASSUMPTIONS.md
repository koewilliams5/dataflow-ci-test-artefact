# ASSUMPTIONS.md — Hypothèses fonctionnelles

Le brief Artefact CI laisse volontairement certains points d'interprétation ouverts. Compte tenu du
calendrier (pas de créneau disponible avec le tuteur avant que ces points ne deviennent bloquants
pour avancer), les points ci-dessous ont été **tranchés de façon autonome**, sur la base du brief, du
bon sens produit, et des données de test fournies. Ce ne sont pas des devinettes : chaque décision a
une raison explicite et un impact documenté si elle s'avère erronée, pour pouvoir la revoir vite et
la défendre à l'oral sans détour.

Chaque hypothèse ci-dessous a une décision technique associée dans [DECISIONS.md](DECISIONS.md)
quand elle a un impact d'architecture.

---

## 1. Qui est « l'utilisateur·rice » de la plateforme

**Décision** : les utilisateurs authentifiés sont des opérateur·rice·s **internes à DataFlow CI**,
pas les clients finaux (Orange CI, banques, etc.). Tous les utilisateurs authentifiés partagent le
même espace de travail — le MVP est **single-tenant**.

**Pourquoi** : le brief liste le multi-tenant (« chaque client de DataFlow CI ne voit que ses propres
sources ») explicitement comme un _bonus_, ce qui implique que le MVP cœur n'a pas cette contrainte.

**Impact si fausse** : si les utilisateurs sont en réalité les clients finaux, il faudrait réintroduire
une notion de tenant/organisation dès le MVP (isolation des sources), ce qui touche le modèle de
données (`Source`, `User`) et l'autorisation sur toutes les routes API — changement structurant, pas
un ajustement superficiel.

---

## 2. Traitement des fichiers Excel

**Décision** :

- Seul le format **`.xlsx`** est supporté (pas le legacy `.xls`).
- Seule la **première feuille** du classeur est lue ; les feuilles suivantes sont ignorées sans
  erreur.
- Le fichier Excel est traité **ligne par ligne comme un CSV** une fois converti (même moteur de
  validation, la source du parsing diffère seulement).
- La première ligne de la feuille est toujours l'en-tête (noms de colonnes), pas de ligne de titre
  ou de fusion de cellules au-dessus.

**Pourquoi** : `.xlsx` est le format Excel actuel et le plus simple à parser de façon fiable et
sûre (bibliothèques matures type `exceljs`) ; se limiter à la première feuille évite d'avoir à
construire une UI de sélection de feuille pour un MVP.

**Impact si fausse** : si plusieurs feuilles doivent être traitées ou sélectionnées par
l'utilisateur, il faut ajouter une étape de choix de feuille dans le flux d'upload (UI + modèle de
données `IngestionFile.sheetName`) — extension additive, pas une remise en cause du pipeline.

---

## 3. Gestion des colonnes supplémentaires ou manquantes

**Décision** :

- **Colonne supplémentaire** dans le fichier (non déclarée dans le schéma) : **ignorée
  silencieusement**, ne bloque pas la ligne ni le fichier. Elle n'est pas incluse dans l'export des
  lignes valides.
- **Colonne obligatoire absente de l'en-tête** du fichier entier (pas juste d'une ligne) : erreur
  **au niveau du fichier**, statut `FAILED` avec un message explicite (« colonne `montant_fcfa`
  attendue par le schéma, absente du fichier ») — le fichier n'est pas traité ligne par ligne dans ce
  cas, car la structure elle-même ne correspond pas au schéma.
- **Valeur manquante sur une colonne obligatoire, pour une ligne donnée** (colonne présente dans
  l'en-tête mais cellule vide) : erreur **au niveau de la ligne** (`raison: "valeur requise
manquante"`), le reste du fichier continue d'être traité normalement.

**Pourquoi** : distinguer une erreur structurelle (mauvais fichier / mauvais schéma sélectionné) d'une
erreur de donnée (une ligne incomplète) donne un rapport plus actionnable pour l'utilisateur — le
premier cas dit « ce fichier ne correspond pas à cette source », le second dit « corrigez ces lignes
précises ».

**Impact si fausse** : si les colonnes supplémentaires doivent au contraire être signalées (ex.
détecter un fichier envoyé avec le mauvais schéma), il faut ajouter un contrôle de correspondance
stricte de l'en-tête — extension du moteur de validation, pas un changement de modèle de données.

---

## 4. Détection des doublons

**Décision** :

- La détection se fait **uniquement à l'intérieur d'un même fichier** (pas de comparaison avec
  l'historique déjà ingéré pour la source).
- Une colonne (ou une combinaison de colonnes) doit être explicitement marquée comme **clé
  d'unicité** (`isUniqueKey`) dans le schéma de la source pour activer la détection — sans clé
  définie, aucune vérification de doublon n'est faite.
- Une ligne dont la combinaison de valeurs-clé a déjà été rencontrée plus tôt dans le fichier est
  flaguée en erreur (`raison: "duplicate_key"`) ; **la première occurrence reste valide**, seules les
  occurrences suivantes sont invalidées.

**Pourquoi** : c'est le comportement le plus simple qui reste cohérent avec les données de test
fournies (`ventes-sale.csv` contient des doublons intra-fichier) ; la détection contre tout
l'historique déjà ingéré poserait des questions de performance et de fenêtre temporelle hors
périmètre du MVP (voir ADR-011 dans DECISIONS.md).

**Impact si fausse** : si la détection doit couvrir l'historique déjà ingéré, il faut une requête de
lookup supplémentaire par ligne (ou par lot) contre `IngestionRowError`/lignes déjà validées d'une
source — impact performance à évaluer, mais additif au modèle existant.

---

## 5. Définition des statuts d'un fichier ingéré

**Décision** — les cinq statuts du brief sont définis ainsi, sans ambiguïté :

| Statut       | Déclenché quand                                                                                                                                           | Lignes valides / invalides   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `pending`    | Fichier uploadé et stocké, job en attente dans la queue, worker pas encore démarré                                                                        | —                            |
| `processing` | Le worker a pris le job et est en train de parser/valider                                                                                                 | —                            |
| `success`    | Traitement terminé, **0 ligne invalide**                                                                                                                  | invalides = 0                |
| `partial`    | Traitement terminé, **au moins une ligne valide et au moins une ligne invalide**                                                                          | valides > 0 ET invalides > 0 |
| `failed`     | Le fichier n'a pas pu être traité du tout : illisible/corrompu, colonne obligatoire absente de l'en-tête, ou **0 ligne valide** sur l'ensemble du fichier | valides = 0                  |

**Pourquoi** : le brief nomme les cinq statuts sans les définir précisément ; cette lecture aligne
`failed` sur « le fichier en lui-même est inexploitable » plutôt que « certaines lignes sont
mauvaises » (couvert par `partial`), ce qui rend le statut immédiatement actionnable pour
l'utilisateur (→ `failed` = renvoie-moi un autre fichier, `partial` = corrige ces lignes précises).

**Impact si fausse** : lecture alternative possible (ex. `failed` seulement pour les erreurs
techniques, un fichier à 0 ligne valide resterait `partial`) — changement localisé à la fonction qui
calcule le statut final en fin de job worker, sans impact sur le modèle de données.

---

## 6. Re-soumission d'un fichier corrigé

**Décision** : chaque upload est traité comme une entité **indépendante** — il n'existe pas de lien
structurel (« ce fichier corrige tel autre ») dans le MVP. L'historique des fichiers d'une source,
trié par date, permet de suivre visuellement les tentatives successives sans modélisation dédiée.

**Pourquoi** : un lien explicite (`supersedesFileId`) ajoute un champ, une UI de rattachement et une
règle de cycle de vie (que devient l'ancien fichier ? reste-t-il visible ?) pour un bénéfice limité
tant que l'historique par source suffit à reconstituer le fil des tentatives.

**Impact si fausse** : si un lien explicite est requis, ajouter un champ nullable
`supersedesFileId` sur `IngestionFile` est additif — n'invalide aucune donnée existante, juste une
migration Prisma de plus.

---

## 7. Période du dashboard

**Décision** : la « dernière période » du dashboard est fixée à **30 jours glissants** par défaut
pour le MVP. Un sélecteur de période (7j/30j/90j) reste une amélioration _Should Have_ (voir T35
dans [TASKS.md](TASKS.md)) si le temps le permet, mais 30 jours est la valeur committée pour la
version livrée si le sélecteur n'est pas fait.

**Pourquoi** : 30 jours est une fenêtre de reporting opérationnel standard — assez longue pour être
représentative de l'activité, assez courte pour rester une « dernière période » au sens du brief.
Fixer une valeur par défaut évite de bloquer le développement du dashboard sur une décision UI
secondaire.

**Impact si fausse** : changer la fenêtre par défaut est un changement d'un paramètre dans la
requête d'agrégation, pas une refonte.

---

## 8. Exhaustivité du rapport d'erreurs

**Décision** : le **stockage** des erreurs de ligne est exhaustif — `IngestionRowError` ne plafonne
pas artificiellement le nombre d'erreurs écrites en base pour un fichier. La **consultation** est en
revanche paginée côté API et UI (page de 50 lignes par défaut) pour rester fluide à l'affichage.

**Pourquoi** : le brief demande explicitement le détail des erreurs par ligne — le tronquer au
stockage romprait la traçabilité recherchée. La limite de 10 Mo par fichier garde de toute façon la
volumétrie dans un ordre de grandeur raisonnable (au pire quelques dizaines de milliers de lignes) ;
seule la pagination d'affichage doit être gérée (voir T39 dans TASKS.md).

**Impact si fausse** : si le stockage exhaustif s'avère un problème de performance en pratique (fichier
pathologique avec des centaines de milliers de lignes toutes invalides), la mitigation serait un cap
configurable au niveau du worker — changement localisé, pas une remise en cause du modèle.

---

## 9. Seuil de détection d'anomalies (z-score) et historique minimal requis

**Décision** : un signal d'anomalie se déclenche à `|z-score| ≥ 3` (moyenne d'une colonne numérique
du fichier comparée à la moyenne/écart-type historique de la même colonne pour la même source), et
seulement si la source a **au moins 5 ingestions terminées** dans son historique — en dessous, la
fonctionnalité affiche "historique insuffisant" plutôt qu'un signal peu fiable sur un échantillon
trop petit.

**Pourquoi** : ±3 écarts-types est un seuil standard en détection d'anomalies simple (≈ 0,3 % de
faux positifs sous hypothèse de normalité) — assez strict pour ne pas noyer l'opérateur sous des
signaux sur du bruit normal, assez sensible pour capter un écart réellement significatif (l'exemple
donné : un montant moyen 100× supérieur à l'habitude). Le seuil de 5 ingestions est arbitraire mais
raisonnable : sous ce seuil, un écart-type calculé sur 1-2 points n'a pas de sens statistique.

**Impact si fausse** : ce sont deux constantes isolées (`ANOMALY_ZSCORE_THRESHOLD`,
`ANOMALY_MIN_HISTORY_SIZE`), faciles à ajuster sans toucher à l'architecture si l'usage réel montre
trop ou trop peu de signaux — voir ADR-037 pour le raisonnement complet sur le choix d'un z-score
plutôt qu'un modèle ML entraîné.

---

## Pourquoi ces décisions sont tranchées sans validation tuteur

Le format initial de ce document prévoyait de poser ces points au tuteur pendant le challenge et de
les geler ensuite. Le calendrier ne laissant pas de créneau réaliste pour cet aller-retour, ces
9 points ont été tranchés de façon autonome plutôt que de bloquer l'avancement — cohérent avec ce que
le brief valorise (« savoir demander de l'aide est une compétence senior », mais aussi savoir trancher
et documenter quand l'aide n'est pas disponible à temps).

Chaque décision ci-dessus reste **réversible et documentée** : si la lecture retenue s'avère
incorrecte au moment de la restitution, l'impact exact est déjà écrit plus haut, prêt à être corrigé
sans remettre en cause l'architecture globale.
