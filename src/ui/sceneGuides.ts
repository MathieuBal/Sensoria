/** Explain what the visitor influences, without implying direct control. */
export interface SceneGuide { concept: string; gestures: readonly string[]; }
export const SCENE_GUIDES: Record<string, SceneGuide> = {
  mosaic: {
    concept: 'Ton trait se répète en miroir pour former des rosaces. La composition se transforme à chaque geste, puis les anciens tracés s’effacent doucement.',
    gestures: ['Glisse pour dessiner ; varie la vitesse pour changer le trait.', 'Relâche : le mouvement se prolonge un instant.', 'Double-tape ou double-clique pour changer d’ambiance.']
  },
  'liquid-glass': {
    concept: 'Une vitre couverte de buée : tu dégages des passages tandis que les gouttes descendent d’elles-mêmes. La condensation revient peu à peu.',
    gestures: ['Glisse pour essuyer la vitre et faire naître des gouttes.', 'Double-tape ou double-clique pour projeter une petite pluie.']
  },
  magnetic: {
    concept: 'Ta main agit comme un aimant. Les grains sont attirés vers elle et dessinent un champ ; ils retrouvent leur place lorsque tu relâches, sauf près des pôles laissés sur place.',
    gestures: ['Maintiens et déplace ton geste pour attirer les grains.', 'Double-tape ou double-clique pour poser un pôle ; recommence près de lui pour le retirer.']
  },
  chromaflow: {
    concept: 'Les oiseaux volent ensemble de façon autonome. Ton geste représente un prédateur : la nuée s’écarte, transmet l’alerte et se rassemble à nouveau.',
    gestures: ['Glisse au milieu des oiseaux pour perturber leur vol.', 'Double-tape ou double-clique pour provoquer un envol collectif.']
  },
  cloth: {
    concept: 'Une étoffe reste suspendue par le haut. Tes gestes la poussent et la déforment ; sa souplesse et son inertie font le reste.',
    gestures: ['Glisse sur le tissu pour le déplacer et créer des plis.', 'Relâche pour le laisser osciller.', 'Double-tape ou double-clique pour déclencher une bourrasque.']
  },
  'light-garden': {
    concept: 'Tu sèmes de la lumière. Des branches naissent sous ton geste, poussent d’elles-mêmes et fleurissent avant de s’effacer.',
    gestures: ['Glisse pour semer de nouvelles pousses.', 'Double-tape ou double-clique pour provoquer une éclosion.']
  },
  'night-lake': {
    concept: 'Une surface d’eau calme réagit à ton passage. Les ondes se propagent, se croisent et s’apaisent : tu crées l’impulsion, puis tu observes.',
    gestures: ['Touche ou clique pour créer une onde.', 'Glisse pour dessiner un sillage.', 'Relâche et observe les vagues se dissiper.']
  },
  'living-paint': {
    concept: 'Une matière métallique sombre se rassemble sous ton aimant imaginaire. Les reflets révèlent son relief ; près du doigt, de petites pointes se forment. Elle garde son inertie et se réunit lorsque tu relâches.',
    gestures: ['Maintiens pour attirer la matière.', 'Glisse doucement pour l’étirer, puis relâche pour la laisser se rassembler.', 'Tension change la réaction et le relief ; les palettes changent les reflets.']
  },
  'sound-ribbons': {
    concept: 'Une harpe de lumière à explorer au toucher. Les cordes se tendent sous ton geste puis vibrent au relâchement. Le son doux est facultatif : les notes sont choisies pour se combiner harmonieusement.',
    gestures: ['Choisis Son doux pour activer la musique, ou garde Silence.', 'Attrape une corde, tire légèrement de côté puis relâche.', 'Balaie plusieurs cordes pour jouer une suite de notes ; double-tape pour un accord.', 'Registre change la hauteur des notes. Le son s’arrête en quittant le tableau.']
  },
  crystals: {
    concept: 'Tu déposes les germes d’un givre lumineux. Les cristaux se développent ensuite selon leur géométrie, comme une matière qui pousse toute seule.',
    gestures: ['Touche ou glisse pour faire naître des cristaux.', 'Double-tape ou double-clique pour provoquer un éclat.']
  },
  'cosmic-portal': {
    concept: 'Les étoiles gravitent déjà autour d’un noyau. Ton geste crée une attraction supplémentaire qui courbe leurs trajectoires et transforme leurs spirales.',
    gestures: ['Maintiens pour attirer les étoiles ; glisse pour déplacer cette attraction.', 'Relâche pour laisser le cosmos évoluer.', 'Double-tape ou double-clique pour déclencher une supernova.']
  },
  'reactive-powder': {
    concept: 'Un lit de particules que tu peux remuer et enflammer. Une étincelle se transmet aux grains voisins et produit une réaction en chaîne.',
    gestures: ['Glisse pour remuer la poudre.', 'Double-tape ou double-clique pour allumer une étincelle.']
  },
  jellyfish: {
    concept: 'La méduse nage de façon autonome. Ton doigt est un point d’attraction : elle s’oriente vers lui à son rythme, avec ses pulsations et son inertie. Tu influences son trajet sans la piloter directement.',
    gestures: ['Maintiens ton doigt ou le clic pour lui proposer un point d’attraction.', 'Glisse doucement pour déplacer ce point et la laisser venir.', 'Après avoir relâché, le dernier point reste attractif.', 'Double-tape ou double-clique pour déclencher une pulsation lumineuse.']
  },
  bubbles: {
    concept: 'Des bulles montent et évoluent d’elles-mêmes. Tu peux perturber leur mouvement, les pousser et provoquer leur éclatement.',
    gestures: ['Glisse pour pousser les bulles.', 'Double-tape ou double-clique près d’elles pour les faire éclater.']
  },
  'paper-cut': {
    concept: 'Une prairie fleurie devient un terrain de jeu pour le vent. Ton geste emporte des graines, des pétales et des feuilles. Les éléments tournent et dérivent encore après ton passage, tandis que les herbes se redressent.',
    gestures: ['Touche pour soulever une poignée de graines et de pétales.', 'Balaie pour les emporter dans la direction de ton geste ; repasse près d’eux pour les remuer.', 'Double-tape pour une grande rafale, puis laisse le vent se calmer.']
  },
  terrarium: {
    concept: 'Un petit monde soumis à la gravité. Le sable s’empile, l’eau s’écoule et la roche reste fixe : dispose les matières et observe ce qu’elles deviennent.',
    gestures: ['Choisis Sable, Eau, Roche ou Effacer en haut à droite.', 'Glisse pour déposer la matière ou effacer une zone.', 'Double-tape ou double-clique pour passer au matériau suivant.']
  },
  clay: {
    concept: 'Une galette d’argile en relief garde les traces de tes gestes. Creuse une vallée, élève une crête, puis adoucis les raccords. La lumière révèle chaque empreinte.',
    gestures: ['Choisis Creuser, Élever ou Lisser, puis glisse sur la matière.', 'Maintiens au même endroit pour accentuer l’empreinte.', 'Le réglage Outil change la largeur de ton geste. Réinitialiser retrouve la galette d’origine.']
  },
  'shadow-theatre': {
    concept: 'Les objets restent les mêmes, mais leur ombre transforme l’espace. Déplace la lumière pour allonger ou croiser les silhouettes, puis réorganise les objets.',
    gestures: ['En mode Lumière, glisse pour déplacer la source.', 'En mode Objets, saisis une forme et déplace-la.', 'Essaie une lumière rasante, douce ou haute dans les réglages.']
  },
  balance: {
    concept: 'Un mobile suspendu qui danse avec ta main. Déplace simplement une forme le long de son support : la sculpture penche et cherche un nouvel équilibre. Il n’y a rien à réussir, seulement des mouvements à explorer.',
    gestures: ['Attrape une forme colorée et glisse à gauche ou à droite.', 'Relâche pour observer les oscillations s’apaiser.', 'Touche un espace vide pour donner une petite impulsion.']
  },
  'folded-paper': {
    concept: 'Une feuille possède deux faces colorées. Chaque déplacement propose un pli en volume, qui se rabat lorsque tu relâches. Les formes se transforment à chaque étape.',
    gestures: ['Pars d’un point de la feuille et glisse vers l’endroit où tu souhaites le rabattre.', 'Relâche pour terminer le pli. Tu peux en superposer jusqu’à six.', 'Déplier annule le dernier pli ; Réinitialiser retrouve la feuille entière.']
  },
  'floating-ink': {
    concept: 'Des pigments flottent dans un courant. Tu déposes la couleur, puis tu l’étires en filaments et en marbrures. Les couleurs se mélangent et s’estompent très lentement.',
    gestures: ['En mode Encre, touche ou glisse pour déposer du pigment ; change de palette pour une autre couleur.', 'Remuer déplace le liquide sans ajouter de couleur.', 'Peigne crée plusieurs courants parallèles. Le réglage Fluidité change leur persistance.']
  },
  'gesture-echoes': {
    concept: 'Ton geste devient une petite chorégraphie. Après le relâchement, des perles parcourent son tracé en boucle ; les gestes suivants ajoutent de nouveaux rythmes dans l’espace.',
    gestures: ['Trace un mouvement, puis relâche pour créer une boucle.', 'Superpose jusqu’à cinq boucles ; la plus ancienne laisse ensuite sa place.', 'Pause suspend ou reprend la composition. Retirer enlève la dernière boucle.', 'Le tempo change la vitesse. Les boucles s’effacent doucement après environ une minute.']
  }

};
