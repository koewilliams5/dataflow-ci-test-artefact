# samples/ — Fichiers d'exemple

Récupérés le 2026-08-13 depuis le dépôt de départ Artefact CI
(https://github.com/artefact-ci/challenge-software-engineer, dossier `data/`), indisponible pendant
l'essentiel du développement de ce projet (voir [ASSUMPTIONS.md](../ASSUMPTIONS.md) pour l'historique
complet — des fichiers équivalents avaient été recréés à la main en attendant, puis remplacés par les
vrais une fois le dépôt retrouvé).

Comme dans le dépôt de départ, les deux sources ont des délimiteurs et formats de date différents,
volontairement — ça reflète la réalité du métier.

## Ventes Orange CI (`source-ventes-orange.json`)

CSV séparé par des virgules, dates `YYYY-MM-DD`. Fonctionne tel quel dans DataFlow CI :

- `ventes-orange-clean.csv` — 120 lignes, toutes valides.
- `ventes-orange-dirty.csv` — 70 lignes, 53 valides / 17 en erreur (24 erreurs au total : dates mal
  formées, région/forfait hors liste, email invalide, quantité hors bornes, ligne dupliquée, champs
  obligatoires manquants...). Chiffres et erreurs vérifiés en faisant tourner le vrai moteur
  (`packages/validation`) contre ce fichier et `source-ventes-orange.json`.

## Stock Cartes Bancaires - Banque Atlantique CI (`source-stock-banque.json`)

CSV séparé par des **points-virgules**, dates `DD/MM/YYYY` — fonctionne tel quel dans DataFlow CI
depuis l'ajout du séparateur configurable par source (`"delimiter": ";"` dans le schéma, voir
ADR-041 dans [DECISIONS.md](../DECISIONS.md)) :

- `stock-banque-clean.csv` — 80 lignes, toutes valides.
- `stock-banque-dirty.csv` — 42 lignes, 33 valides / 9 en erreur (date mal formée, agence hors
  format, type de carte hors liste, stock négatif/hors bornes, email hors domaine, ville trop
  courte, ligne dupliquée, champ obligatoire manquant). Chiffres vérifiés en faisant tourner le vrai
  moteur (`packages/validation`) contre ce fichier et `source-stock-banque.json`.

**Limite restante** : le vrai schéma de cette source contient une règle qui compare deux colonnes
entre elles (`dernier_reapprovisionnement` doit être ≤ `date_inventaire`) — le moteur ne vérifie
aujourd'hui que colonne par colonne, jamais deux colonnes l'une contre l'autre. Cette règle précise
n'est donc pas appliquée (voir [DESIGN.md](../DESIGN.md) §5 et §7). Le reste du schéma (types,
formats, motifs, listes de valeurs, doublons) est entièrement vérifié.

Ces fichiers sont conservés tels quels, comme demandé par le brief d'origine ("les échantillons
originaux doivent rester intacts pour la démonstration").
