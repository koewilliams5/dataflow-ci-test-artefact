# ASSUMPTIONS.md — Les questions laissées ouvertes, et les réponses retenues

Le document du challenge Artefact CI (le "brief") ne précise pas tout — c'est normal et volontaire,
il laisse une marge d'interprétation. Plutôt que de mettre le développement en pause en attendant une
clarification sur chaque point, les questions ci-dessous ont été **tranchées de façon autonome**, en
s'appuyant sur le texte du brief, le bon sens, et les fichiers d'exemple fournis.

Ce ne sont pas des choix faits au hasard : pour chacun, ce document explique **pourquoi** ce choix a
été fait, et **ce qu'il faudrait changer** si ce choix s'avère être le mauvais — pour pouvoir en
discuter vite et clairement à l'oral.

Quand une décision ci-dessous a un impact sur la façon dont le programme est construit, le détail
technique complet se trouve dans [DECISIONS.md](DECISIONS.md).

---

## 1. Qui utilise l'application ?

**Décision retenue** : les comptes créés dans l'application sont ceux des **employés de DataFlow
CI** (les 4 personnes qui vérifiaient les fichiers à la main), pas ceux des clients finaux (Orange
CI, une banque, etc.). Tout le monde qui se connecte voit les mêmes sources et les mêmes fichiers —
il n'y a pas de cloisonnement par client dans cette version.

**Pourquoi** : le brief mentionne le cloisonnement par client (« chaque client ne voit que ses
propres sources ») explicitement comme une amélioration facultative — ce qui sous-entend que la
version de base n'a pas besoin de cette contrainte.

**Ce que ça changerait si c'était faux** : si ce sont en réalité les clients finaux qui doivent se
connecter, il faudrait ajouter une notion de "client propriétaire" partout — dans la base de données
et dans chaque vérification de droits d'accès. C'est un changement important, pas un simple ajout.

---

## 2. Traitement des fichiers Excel

**Décision retenue** :

- Seul le format **`.xlsx`** (le format Excel actuel) est accepté — pas l'ancien format `.xls`.
- Seule la **première feuille** du fichier Excel est lue ; les feuilles suivantes sont ignorées sans
  message d'erreur.
- Une fois lu, un fichier Excel est traité exactement comme un fichier CSV — les mêmes règles de
  vérification s'appliquent, seule la façon de lire le fichier change.
- La toute première ligne de la feuille doit être la ligne des titres de colonnes.

**Pourquoi** : `.xlsx` est le format actuel et le plus simple à lire de façon fiable ; se limiter à
la première feuille évite de devoir construire un écran de choix "quelle feuille lire ?" pour cette
première version.

**Ce que ça changerait si c'était faux** : s'il faut traiter plusieurs feuilles, ou laisser
l'utilisateur choisir laquelle, il faudrait ajouter une étape de sélection au moment de l'envoi du
fichier — un ajout, pas une refonte.

---

## 3. Colonnes en trop ou colonnes manquantes

**Décision retenue** :

- Une **colonne présente dans le fichier mais pas prévue dans le schéma** : elle est **ignorée
  silencieusement**, elle ne bloque rien. Elle n'apparaît simplement pas dans l'export des lignes
  correctes.
- Une **colonne obligatoire absente du fichier entier** (pas juste d'une ligne, mais du titre des
  colonnes) : c'est une erreur qui concerne **tout le fichier** — le fichier entier est refusé, avec
  un message clair (« la colonne `montant_fcfa` est attendue mais absente du fichier »). Dans ce cas,
  le fichier n'est pas vérifié ligne par ligne, car la comparaison n'aurait pas de sens.
- Une **valeur manquante sur une seule ligne**, pour une colonne obligatoire (la colonne existe, mais
  la case est vide sur cette ligne précise) : c'est une erreur qui concerne **cette ligne
  uniquement** — le reste du fichier continue d'être vérifié normalement.

**Pourquoi** : distinguer "le fichier entier ne correspond pas à ce qui était attendu" (erreur
globale) d'"une ligne précise a un problème" (erreur locale) rend le rapport plus utile : dans le
premier cas, il faut renvoyer un autre fichier ; dans le second, il faut corriger des lignes précises.

**Ce que ça changerait si c'était faux** : si les colonnes en trop doivent au contraire être
signalées (par exemple pour détecter qu'on a envoyé le fichier avec le mauvais schéma), il faudrait
ajouter une vérification stricte de correspondance des titres de colonnes — un ajout au moteur de
vérification, pas un changement de la base de données.

---

## 4. Détection des lignes en double

**Décision retenue** :

- La comparaison se fait **uniquement à l'intérieur d'un même fichier** — on ne compare pas avec les
  fichiers déjà envoyés avant pour cette source.
- Il faut désigner explicitement, dans le schéma d'une source, une colonne (ou une combinaison de
  colonnes) comme "clé" servant à repérer les doublons. Sans cette désignation, aucune vérification
  de doublon n'est faite.
- Si une même combinaison de valeurs apparaît plusieurs fois dans le fichier, la **première
  occurrence reste valide** — seules les suivantes sont marquées en erreur.

**Pourquoi** : c'est le comportement le plus simple qui reste cohérent avec les fichiers d'exemple
fournis (`ventes-orange-dirty.csv` contient des doublons à l'intérieur du fichier lui-même). Comparer avec
tout l'historique déjà envoyé poserait des questions de performance qui dépassent le périmètre de
cette première version (voir DECISIONS.md, fiche ADR-011, pour le raisonnement complet).

**Ce que ça changerait si c'était faux** : comparer avec l'historique déjà envoyé demanderait une
vérification supplémentaire par ligne contre ce qui a déjà été validé pour cette source — un ajout,
dont il faudrait mesurer l'impact sur la vitesse de traitement.

---

## 5. Le sens exact des 5 statuts d'un fichier

**Décision retenue** — le brief nomme cinq statuts sans les définir précisément ; voici la définition
retenue :

| Statut       | Se déclenche quand…                                                                                                      | Lignes correctes / en erreur   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `pending`    | Le fichier est envoyé et rangé, la tâche de vérification attend son tour dans la file, le worker n'a pas encore commencé | —                               |
| `processing` | Le worker a pris le fichier en charge et est en train de le lire/vérifier                                                | —                               |
| `success`    | La vérification est terminée, **aucune ligne en erreur**                                                                 | 0 ligne en erreur                |
| `partial`    | La vérification est terminée, **au moins une ligne correcte et au moins une ligne en erreur**                           | des deux, au moins 1 chacune    |
| `failed`     | Le fichier n'a pas pu être traité du tout (illisible, colonne obligatoire manquante), ou **aucune ligne correcte**       | 0 ligne correcte                 |

**Pourquoi** : cette lecture fait que `failed` veut dire « ce fichier lui-même est inutilisable » et
`partial` veut dire « certaines lignes sont à corriger » — deux messages différents et clairs pour la
personne qui reçoit le rapport (`failed` → renvoie un autre fichier ; `partial` → corrige ces lignes
précises).

**Ce que ça changerait si c'était faux** : une autre lecture est possible (par exemple : `failed`
réservé aux seules erreurs techniques, et un fichier à 0 ligne correcte resterait `partial`) — ce
serait un changement localisé dans la fonction qui calcule le statut final, sans toucher à la base de
données.

---

## 6. Renvoyer un fichier corrigé

**Décision retenue** : chaque envoi de fichier est traité comme un événement **indépendant** — il
n'existe pas de lien explicite du type « ce fichier corrige tel autre envoi précédent » dans cette
version. L'historique des envois d'une source, trié par date, permet de suivre les tentatives
successives sans avoir besoin de ce lien.

**Pourquoi** : ajouter un lien explicite demande un nouveau champ, un écran pour le créer, et des
règles sur ce qui arrive à l'ancien fichier — pour un bénéfice limité tant que l'historique par
source suffit à comprendre la suite des tentatives.

**Ce que ça changerait si c'était faux** : ajouter ce lien plus tard est un ajout simple (un nouveau
champ optionnel), pas une remise en cause de ce qui existe déjà.

---

## 7. Sur quelle période porte le tableau de bord ?

**Décision retenue** : le tableau de bord affiche par défaut les **30 derniers jours**. Un sélecteur
pour changer cette période (7/30/90 jours) a finalement été ajouté (voir TASKS.md, tâche T35), mais
30 jours reste la valeur affichée à l'ouverture de la page.

**Pourquoi** : 30 jours est une durée courante pour ce genre de suivi — assez longue pour représenter
l'activité réelle, assez courte pour rester une "période récente".

**Ce que ça changerait si c'était faux** : changer cette valeur par défaut est un simple réglage,
pas une refonte.

---

## 8. Le rapport garde-t-il vraiment toutes les erreurs ?

**Décision retenue** : **oui**, aucune erreur n'est jetée ou plafonnée au moment de l'enregistrer en
base de données. En revanche, l'**affichage** à l'écran se fait par pages de 50 erreurs à la fois,
pour rester agréable à consulter même sur un fichier avec beaucoup de problèmes.

**Pourquoi** : le brief demande explicitement le détail des erreurs ligne par ligne — en perdre une
partie casserait cette promesse. La limite de taille de fichier (10 Mo) garde de toute façon un
volume raisonnable (au pire quelques dizaines de milliers de lignes) ; seul l'affichage doit être
découpé en pages.

**Ce que ça changerait si c'était faux** : si un fichier extrême (des centaines de milliers de
lignes toutes en erreur) posait un vrai problème de performance en pratique, la solution serait une
limite réglable au niveau du worker — un changement localisé.

---

## 9. À partir de quand un chiffre est-il "anormal" ?

**Décision retenue** : un fichier déclenche un signal d'anomalie sur une colonne numérique quand sa
moyenne s'écarte de plus de 3 fois l'écart-type habituel de cette colonne pour cette source (ce
calcul s'appelle un **z-score** — une façon standard de mesurer "à quel point une valeur est
inhabituelle" par rapport à ce qu'on a déjà observé). Ce signal ne se déclenche que si la source a
déjà **au moins 5 fichiers traités** dans son historique — en dessous, il n'y a pas assez de recul
pour que la comparaison veuille dire quelque chose, et l'application l'indique clairement plutôt que
d'afficher un signal peu fiable.

**Pourquoi** : ce seuil de "3 fois l'écart-type" est une convention standard en détection d'écarts
simples — assez strict pour ne pas déclencher d'alertes sur du bruit normal, assez sensible pour
capter un écart vraiment significatif (l'exemple donné dans le brief : un montant moyen 100 fois plus
élevé que d'habitude). Le seuil de 5 fichiers est arbitraire mais raisonnable : en dessous, une
moyenne calculée sur 1 ou 2 fichiers n'a pas de sens statistique fiable.

**Ce que ça changerait si c'était faux** : ce sont deux réglages isolés dans le code, faciles à
ajuster sans toucher à l'architecture si l'usage réel montre qu'il y a trop ou trop peu de signaux —
voir la fiche ADR-037 dans [DECISIONS.md](DECISIONS.md) pour le raisonnement complet sur ce choix.

---

## Pourquoi trancher plutôt qu'attendre une validation

Un projet réel avance rarement avec toutes les réponses en main dès le départ. Savoir identifier un
point ambigu, trancher avec une raison explicite, documenter l'impact si ce choix s'avère incorrect,
et rester prêt à en discuter fait partie du travail — c'est l'approche retenue ici pour ces 9 points,
plutôt que de mettre le projet en pause en attendant une validation externe.

Chaque décision ci-dessus reste **réversible et expliquée** : si la lecture retenue s'avère fausse au
moment de la présentation, l'impact exact est déjà écrit plus haut — prêt à être corrigé sans remettre
en cause l'ensemble du projet.
