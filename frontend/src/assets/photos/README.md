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
| `hero`     | `true` = fond flouté de l'accueil                                    |
| `hidden`   | `true` = photo gardée mais non affichée                              |
| `focus`    | `top`, `bottom`, `left`, `right` : cadrage des vignettes             |

Au build, chaque photo est déclinée en AVIF et WebP, en plusieurs largeurs.
