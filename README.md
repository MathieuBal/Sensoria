# Sensoria

> Galerie d'expériences interactives sensorielles — prototype.

Sensoria est une galerie de tableaux interactifs où chaque geste produit une
réponse visuelle immédiate, fluide et satisfaisante. Le site s'ouvre sur une
**galerie d'accueil** ; chaque carte ouvre un tableau en plein écran, branché
sur un **socle réutilisable** (entrées, rendu, réglages).

**Tableaux jouables**

| Tableau            | Sensation                                                    |
| ------------------ | ----------------------------------------------------------- |
| Mosaïque infinie   | Kaléidoscope génératif, courbes soyeuses, étincelles.       |
| Verre liquide      | Buée que l'on essuie, gouttes qui glissent et s'évaporent.  |
| Champ magnétique   | Milliers de grains qui dessinent les lignes de champ.       |

Les autres tableaux du catalogue (§4) apparaissent en « Bientôt » dans la
galerie ; les ajouter = écrire une classe `Scene` et basculer `available` dans
`src/scenes/registry.ts`.

## Démarrer

```bash
npm install
npm run dev        # serveur de développement (Vite)
npm run build      # vérification TypeScript + build de production
npm run preview    # sert le build de production (--host pour tester sur mobile)
npm run icons      # régénère les icônes PNG de la PWA
```

Ouvrez l'URL affichée. Sur mobile, utilisez `npm run preview` (ou `dev --host`)
puis l'adresse réseau ; l'application est installable (PWA, plein écran, hors
ligne après la première visite).

## Navigation

Choisissez un tableau dans la galerie. En plein écran, le bouton **← Galerie**
(haut gauche) y revient, le bouton **⋮** (haut droite, ou `Échap`) ouvre les
réglages. `Échap` ferme d'abord le panneau, puis revient à la galerie.

## Comment jouer (Mosaïque infinie)

- **Souris / doigt** : maintenez et déplacez pour dessiner des courbes soyeuses,
  reproduites en miroir et en rotation (kaléidoscope), avec une gerbe
  d'étincelles qui scintillent et dérivent.
- **Vitesse** : un geste lent pose des rubans épais et doux ; un geste rapide
  laisse des traînées fines, lumineuses et plus d'étincelles.
- **Double-clic / double-tap** : explosion + changement de palette (avec un
  léger retour haptique sur mobile).
- **Relâchement** : la matière continue de vivre quelques instants (inertie).
- **Réglages** (bouton ⋮ en haut à droite, ou `Échap`) : palette (×3),
  symétrie (×3), mode automatique, effets réduits, reset animé, capture PNG,
  plein écran.
- Les préférences sont **mémorisées localement** et restaurées au rechargement.

## Architecture — le socle (`src/core`)

Chaque tableau est un `Scene` interchangeable branché sur une fondation commune,
conformément au §6.1 du cadrage. L'entrée et le rendu sont **isolés**.

| Module                 | Rôle                                                                 |
| ---------------------- | ------------------------------------------------------------------- |
| `InputManager`         | Pointer Events unifiés (souris/pen/multi-touch), vitesse lissée.    |
| `RenderLoop`           | Boucle rAF, delta time borné, pause quand l'onglet est masqué.      |
| `SceneManager`         | Cycle de vie, resize, routage des frames et entrées vers la scène.  |
| `SettingsStore`        | Palettes, intensité, accessibilité, persistance locale, observable. |
| `CaptureManager`       | Export PNG de la composition.                                       |
| `PerformanceMonitor`   | FPS lissé + facteur `quality` pour dégrader proprement.             |
| `types.ts`             | Contrat `Scene` / `PointerSample` partagé.                          |

Le tableau lui-même vit dans `src/scenes/MosaicScene.ts` (Canvas 2D).
**Ajouter un tableau** = écrire une nouvelle classe `Scene` et la monter ; la
navigation, les entrées et les réglages sont déjà fournis par le socle.

## Définition de « fini » du prototype (§10.1)

- [x] Fonctionne au doigt et à la souris (Pointer Events).
- [x] Tracé sans rupture, même en mouvement rapide (events coalescés + segments connectés).
- [x] La vitesse et la direction ont un impact perceptible (largeur, luminosité).
- [x] Trois niveaux de symétrie et trois palettes.
- [x] La scène continue après le relâchement (inertie).
- [x] Reset animé et satisfaisant (anneau lumineux + fondu).
- [x] Rendu fluide après plusieurs minutes (coût par frame constant, fondu doux).
- [x] Le code isole le moteur d'entrées et la scène graphique.

## Stack

Vite + TypeScript, rendu Canvas 2D, PWA installable (PC & mobile). Le socle est
volontairement agnostique du moteur de rendu : les futurs tableaux à particules
ou shaders (Champ magnétique, etc.) pourront utiliser WebGL/WebGPU sans changer
l'architecture.

Hors périmètre de ce prototype : galerie multi-tableaux, audio génératif,
comptes/cloud (voir §9 du cadrage).
