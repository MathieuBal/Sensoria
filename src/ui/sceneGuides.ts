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
    concept: 'Un liquide métallique se rassemble et se hérisse sous l’effet de ton aimant imaginaire. Il conserve sa propre souplesse lorsque tu le sollicites.',
    gestures: ['Maintiens pour attirer le fluide et faire apparaître des pointes.', 'Déplace ton geste, puis relâche pour le laisser retomber.', 'Double-tape ou double-clique pour créer une éclaboussure.']
  },
  'sound-ribbons': {
    concept: 'Un instrument visuel fait de cordes lumineuses. Chaque corde se déforme et vibre après ton passage, puis revient progressivement au calme.',
    gestures: ['Touche ou clique près d’une corde pour la pincer.', 'Balaie horizontalement pour faire vibrer plusieurs cordes.', 'Double-tape ou double-clique pour les faire vibrer ensemble.']
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
    concept: 'Ton geste devient du vent dans une prairie. Les herbes se courbent en vagues, puis se redressent avec souplesse.',
    gestures: ['Balaie la prairie pour coucher les herbes.', 'Double-tape ou double-clique pour déclencher une rafale.']
  },
  terrarium: {
    concept: 'Un petit monde soumis à la gravité. Le sable s’empile, l’eau s’écoule et la roche reste fixe : dispose les matières et observe ce qu’elles deviennent.',
    gestures: ['Choisis Sable, Eau, Roche ou Effacer en haut à droite.', 'Glisse pour déposer la matière ou effacer une zone.', 'Double-tape ou double-clique pour passer au matériau suivant.']
  }
};
