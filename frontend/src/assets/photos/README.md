# Photos de la boutique

Ce dossier reçoit les **vraies photos** de Comme Une Fleur, compressées automatiquement.
Ne pas y déposer les fichiers à la main : utilisez la commande d'import, qui redresse,
réduit (2400 px max), recompresse et retire les métadonnées (dont la position GPS) :

```bash
npm run photos:import                           # depuis https://commeunefleur.be
npm run photos:import -- --from-dir ~/Photos/cuf   # depuis un dossier de l'ordinateur
```

Les descriptions (textes alternatifs, catégories, photo mise en avant, photo d'accueil)
se règlent ensuite dans `src/data/photos.json` :

| champ      | rôle                                                                 |
|------------|----------------------------------------------------------------------|
| `alt`      | description lue par les lecteurs d'écran et Google (à relire !)      |
| `category` | `fleurs`, `plantes`, `pepiniere`, `evenements`, `entretien`, `sapins`, `boutique` |
| `featured` | `true` = photo de couverture de sa catégorie (cartes « Nos offres ») |
| `hero`     | `true` = photo de fond plein écran de l'accueil (idéalement au moins 1600 px de large ; l'import ne la choisit tout seul que dans ce cas) |
| `mosaic`   | `1`, `2`, `3`… = place dans la mosaïque de l'accueil (utilisée quand aucune photo de fond n'est choisie) |
| `cover`    | `["sapins"]` = sert aussi de couverture à une offre qui n'a pas encore de photo |
| `hidden`   | `true` = photo gardée mais non affichée                              |
| `focus`    | `top`, `bottom`, `left`, `right` : cadrage des vignettes             |

Au build, chaque photo est déclinée en AVIF et WebP, en plusieurs largeurs.

## Photos d'illustration (provisoires)

En attendant les photos de la boutique, le dossier contient des photos de fleurs **sous licence libre
(CC BY 2.0)**, marquées `"illustration": true` et créditées (`credit` : auteur, lien, licence). Leurs auteurs
sont cités dans la galerie (visionneuse) et dans les conditions d'utilisation (« Crédits photos »).
Le fond de l'accueil est l'une d'elles : un dahlia pêche (`"hero": true`).
Elles sont **retirées automatiquement** dès que les vraies photos sont importées.
