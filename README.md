# Sensoria

> Galerie d'expériences interactives sensorielles — prototype.

Sensoria est une galerie de tableaux interactifs où chaque geste produit une
réponse visuelle immédiate, fluide et satisfaisante. Le site s'ouvre sur un
**hub d'accueil** (design *Constella* : deep space / glassmorphism / indigo) ;
chaque carte ouvre un tableau en plein écran, branché sur un **socle
réutilisable** (entrées, rendu, réglages). Tout est **éphémère** : rien n'est
enregistré ni partagé, la composition s'efface en quittant le tableau.

**Les 16 tableaux sont jouables.**

| Tableau            | Sensation                                                      | Réglage     |
| ------------------ | ------------------------------------------------------------- | ----------- |
| Mosaïque infinie   | Kaléidoscope génératif, courbes soyeuses, étincelles.         | Symétrie    |
| Verre liquide      | Buée que l'on essuie, gouttes qui glissent et s'évaporent.    | Buée        |
| Champ magnétique   | Milliers de grains qui dessinent les lignes de champ.         | Densité     |
| Nuée               | Murmuration d'étourneaux (boids) ; le doigt est un faucon.    | Volée       |
| Toile de tissu     | Étoffe Verlet suspendue, satin balayant et brise.            | Étoffe      |
| Jardin de lumière  | Le geste fait croître des branches lumineuses qui éclosent.   | Croissance  |
| Lac nocturne       | Eau sombre : effleure-la, les ondes se propagent et se calment. | Onde      |
| Ferrofluide        | Métal liquide noir (metaballs) qui se hérisse vers le doigt.  | Tension     |
| Cordes             | Cordes de lumière que l'on pince ; ondes stationnaires amorties. | Registre |
| Cristaux           | Chaque touche fait givrer un cristal à facettes.              | Réseau      |
| Portail cosmique   | Étoiles en orbite ; le doigt courbe la gravité, supernova.    | Régime      |
| Poudre réactive    | Remue la poudre ; une étincelle se propage en chaîne.         | Volatilité  |
| Méduse lumineuse   | Créature de filaments qui pulse et suit le doigt.            | Humeur      |
| Bulles             | Bulles irisées qui montent, fusionnent et éclatent.          | Densité     |
| Brise              | Prairie claire au lever du jour ; le geste couche les herbes. | Pousse      |
| Monde miniature    | Automate sable + eau sous verre (falling-sand).              | Grain       |

> Trois `id` de registry sont historiques (gardés stables) : `chromaflow` =
> Nuée, `living-paint` = Ferrofluide, `paper-cut` = Brise.

Ajouter un tableau = écrire une classe `Scene` et lui donner une fabrique
`create` dans `src/scenes/registry.ts`.

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

## Gestes par tableau

Communs : **double-tap** (< 300 ms) = action forte ; premier contact masque
l'onboarding ; léger retour **haptique** sur mobile (coupé si « Effets réduits »).

- **Mosaïque infinie** : trait → rubans en miroir, largeur/clarté pilotées par
  la vitesse, étincelles ; au relâché, comètes à inertie. Double-tap = palette +
  burst. *Mode automatique* trace une figure seul au repos.
- **Verre liquide** : glisser **essuie la buée**, gouttes qui glissent et
  s'évaporent ; la buée revient lentement. Double-tap = pluie locale.
- **Champ magnétique** : maintenir **attire les grains** (lignes de champ) ;
  double-tap = pose/retire un **pôle** (max 6).
- **Jardin de lumière** : glisser fait **croître des branches** qui bifurquent
  et **éclosent** ; double-tap = éclosion radiale.
- **Lac nocturne** : effleurer **ride la surface** ; les ondes se propagent,
  interfèrent puis se dissipent.

Réglages (bouton ⋮ / `Échap`) : palette (×3), réglage propre au tableau (×3),
mode automatique (Mosaïque), effets réduits, réinitialiser, plein écran. Le
réglage propre revient au niveau médian à chaque entrée ; palette et effets
réduits sont conservés.

## Architecture — le socle (`src/core`)

Chaque tableau est un `Scene` interchangeable branché sur une fondation commune,
conformément au §6.1 du cadrage. L'entrée et le rendu sont **isolés**.

| Module                 | Rôle                                                                 |
| ---------------------- | ------------------------------------------------------------------- |
| `InputManager`         | Pointer Events unifiés (souris/pen/multi-touch), vitesse lissée.    |
| `RenderLoop`           | Boucle rAF, delta time borné, pause quand l'onglet est masqué.      |
| `SceneManager`         | Cycle de vie, resize, routage des frames et entrées vers la scène.  |
| `SettingsStore`        | Palettes, réglage, accessibilité, persistance locale, observable.   |
| `PerformanceMonitor`   | FPS lissé + facteur `quality` pour dégrader proprement.             |
| `types.ts`             | Contrat `Scene` / `PointerSample` partagé.                          |

Les tableaux vivent dans `src/scenes/*Scene.ts` (Canvas 2D) et exposent un
calque FX transient via `SceneContext.fx`. **Ajouter un tableau** = écrire une
classe `Scene`, l'enregistrer dans `registry.ts` ; la navigation, les entrées et
les réglages sont déjà fournis par le socle.

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
