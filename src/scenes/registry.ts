import type { Scene } from '../core/types';
import { MosaicScene } from './MosaicScene';
import { LiquidGlassScene } from './LiquidGlassScene';
import { MagneticScene } from './MagneticScene';

/** Gallery card metadata for a tableau (§4 catalogue). */
export interface SceneMeta {
  id: string;
  name: string;
  tagline: string;
  /** CSS gradient used for the animated preview card. */
  gradient: string;
  /** Whether the scene is implemented and playable. */
  available: boolean;
  create?: () => Scene;
}

/**
 * The full catalogue (§4). Implemented tableaux expose a `create` factory;
 * the rest are shown as "Bientôt" placeholders so the gallery already reflects
 * the product's ambition. Adding a tableau = write a Scene + flip `available`.
 */
export const SCENES: SceneMeta[] = [
  {
    id: 'mosaic',
    name: 'Mosaïque infinie',
    tagline: 'Kaléidoscope génératif, symétries et inertie.',
    gradient: 'linear-gradient(135deg,#40e0d0,#5078ff,#be5aff,#ff6eb4)',
    available: true,
    create: () => new MosaicScene()
  },
  {
    id: 'liquid-glass',
    name: 'Verre liquide',
    tagline: 'Buée, gouttes qui glissent et fusionnent.',
    gradient: 'linear-gradient(135deg,#1f2a44,#3a6ea5,#8fd3ff,#dff6ff)',
    available: true,
    create: () => new LiquidGlassScene()
  },
  {
    id: 'magnetic',
    name: 'Champ magnétique',
    tagline: 'Des milliers de grains dessinent les lignes de champ.',
    gradient: 'linear-gradient(135deg,#0b132b,#3a0ca3,#7209b7,#f72585)',
    available: true,
    create: () => new MagneticScene()
  },
  {
    id: 'chromaflow',
    name: 'Chromaflow',
    tagline: 'Rubans de couleur, encre et aurore boréale.',
    gradient: 'linear-gradient(135deg,#ff8a00,#e52e71,#9b5de5,#00bbf9)',
    available: false
  },
  {
    id: 'cloth',
    name: 'Toile de tissu',
    tagline: 'Surface élastique, creux, tension et rebond.',
    gradient: 'linear-gradient(135deg,#3a1c71,#d76d77,#ffaf7b)',
    available: false
  },
  {
    id: 'light-garden',
    name: 'Jardin de lumière',
    tagline: 'Le geste fait pousser branches et fleurs.',
    gradient: 'linear-gradient(135deg,#0f2027,#2c5364,#a8e063,#f9f586)',
    available: false
  },
  {
    id: 'night-lake',
    name: 'Lac nocturne',
    tagline: 'Eau sombre, reflets, ondes et lumières.',
    gradient: 'linear-gradient(135deg,#02111b,#0a2342,#2ca6a4,#8ce3ff)',
    available: false
  },
  {
    id: 'living-paint',
    name: 'Peinture vivante',
    tagline: 'Pigments qui coulent, se mêlent et se figent.',
    gradient: 'linear-gradient(135deg,#f72585,#7209b7,#3a0ca3,#4cc9f0)',
    available: false
  },
  {
    id: 'sound-ribbons',
    name: 'Rubans sonores',
    tagline: 'Le mouvement devient instrument visuel.',
    gradient: 'linear-gradient(135deg,#ff0080,#ff8c00,#40e0d0)',
    available: false
  },
  {
    id: 'crystals',
    name: 'Cristaux',
    tagline: 'Germes qui poussent, fusionnent et se brisent.',
    gradient: 'linear-gradient(135deg,#8e2de2,#4a00e0,#00d2ff)',
    available: false
  },
  {
    id: 'cosmic-portal',
    name: 'Portail cosmique',
    tagline: 'Étoiles, trous noirs et supernovas.',
    gradient: 'linear-gradient(135deg,#000428,#004e92,#9d4edd)',
    available: false
  },
  {
    id: 'reactive-powder',
    name: 'Poudre réactive',
    tagline: 'Poudre, fumée et réactions en chaîne.',
    gradient: 'linear-gradient(135deg,#232526,#ff512f,#f09819)',
    available: false
  },
  {
    id: 'jellyfish',
    name: 'Méduse lumineuse',
    tagline: 'Une créature de filaments vivants.',
    gradient: 'linear-gradient(135deg,#1a2a6c,#b21f1f,#fdbb2d)',
    available: false
  },
  {
    id: 'bubbles',
    name: 'Bulles',
    tagline: 'Bulles qui se poussent, fusionnent et éclatent.',
    gradient: 'linear-gradient(135deg,#36d1dc,#5b86e5,#c1f0ff)',
    available: false
  },
  {
    id: 'paper-cut',
    name: 'Papier découpé',
    tagline: 'Couches, pliage, découpe et parallaxe.',
    gradient: 'linear-gradient(135deg,#ee9ca7,#ffdde1,#c9d6ff)',
    available: false
  },
  {
    id: 'terrarium',
    name: 'Monde miniature',
    tagline: 'Sable, eau et objets sous verre.',
    gradient: 'linear-gradient(135deg,#134e5e,#71b280,#f6d365)',
    available: false
  }
];
