# BRICKS.co : Export CSV et JSON

Extension Chrome pour exporter vos investissements Bricks.co en CSV (Excel/Numbers) et JSON (compatible AllMyCapital).

## Fonctionnalités

- **Export CSV** — Fichier lisible dans Excel, Numbers et Google Sheets avec séparateur `;` et encodage UTF-8
- **Export JSON** — Format compatible [AllMyCapital](https://allmycapital.com), l'agrégateur qui centralise tous vos investissements (immobilier, crowdfunding, SCPI, bourse...) dans un seul tableau de bord
- **Données complètes** — Projets, revenus, remboursements de capital, métriques portefeuille
- **Thème sombre** — Interface intégrée au style Bricks.co
- **100% local** — Aucune donnée envoyée à un serveur tiers, tout reste sur votre machine

## Installation

1. Téléchargez ou clonez ce dépôt
2. Ouvrez `chrome://extensions/` dans Chrome
3. Activez le **Mode développeur** (en haut à droite)
4. Cliquez sur **Charger l'extension non empaquetée**
5. Sélectionnez le dossier de l'extension

## Utilisation

1. Connectez-vous sur [app.bricks.co](https://app.bricks.co)
2. Cliquez sur l'icône de l'extension dans la barre Chrome
3. Cliquez sur **Récupérer les données**
4. Exportez en CSV ou JSON selon votre besoin

## Contenu des exports

### CSV
- Résumé du portefeuille (valeur, solde, nombre de bricks)
- Détail de chaque projet (montant investi, taux, durée, revenus, statut...)
- Historique des revenus par projet
- Remboursements de capital

### JSON (AllMyCapital)
- Format structuré pour import direct dans [AllMyCapital](https://allmycapital.com) (agrégateur de patrimoine et d'investissements)
- Projets avec paiements associés

## Confidentialité

- Le token d'authentification est lu à la volée depuis le localStorage de Bricks.co et **n'est jamais stocké** par l'extension
- Toutes les données sont traitées localement dans votre navigateur
- Aucune donnée n'est envoyée à un serveur externe
- Les permissions sont restreintes aux domaines `app.bricks.co` et `api.bricks.co`

## Licence

MIT
