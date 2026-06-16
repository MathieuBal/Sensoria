import type { Scene } from '../core/types';
import { MosaicScene } from './MosaicScene';
import { LiquidGlassScene } from './LiquidGlassScene';
import { MagneticScene } from './MagneticScene';
import { NightLakeScene } from './NightLakeScene';
import { LightGardenScene } from './LightGardenScene';
import { BubbleScene } from './BubbleScene';
import { CrystalScene } from './CrystalScene';
import { CosmosScene } from './CosmosScene';
import { MurmurationScene } from './MurmurationScene';
import { JellyfishScene } from './JellyfishScene';
import { ClothScene } from './ClothScene';
import { PowderScene } from './PowderScene';
import { StringsScene } from './StringsScene';
import { FerroScene } from './FerroScene';
import { GrassScene } from './GrassScene';
import { TerrariumScene } from './TerrariumScene';

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
 * The full catalogue (§4), in registry order — all 16 tableaux are playable.
 * Three `id`s are historical (kept stable): `chromaflow` is now « Nuée »,
 * `living-paint` is « Ferrofluide », `paper-cut` is « Brise ».
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
    name: 'Nuée',
    tagline: "Une nuée d'oiseaux qui ondule ; ton doigt la fend comme un faucon.",
    gradient: 'linear-gradient(135deg,#1a1430,#4a3f6b,#c98a6b,#f4c97a)',
    available: true,
    create: () => new MurmurationScene()
  },
  {
    id: 'cloth',
    name: 'Toile de tissu',
    tagline: 'Une étoffe suspendue que tu pousses, creuses et tends.',
    gradient: 'linear-gradient(135deg,#3a1c71,#d76d77,#ffaf7b)',
    available: true,
    create: () => new ClothScene()
  },
  {
    id: 'light-garden',
    name: 'Jardin de lumière',
    tagline: 'Le geste fait pousser des branches de lumière qui éclosent.',
    gradient: 'linear-gradient(135deg,#0f2027,#2c5364,#a8e063,#f9f586)',
    available: true,
    create: () => new LightGardenScene()
  },
  {
    id: 'night-lake',
    name: 'Lac nocturne',
    tagline: 'Eau sombre : effleure-la et les ondes se reflètent.',
    gradient: 'linear-gradient(135deg,#02111b,#0a2342,#2ca6a4,#8ce3ff)',
    available: true,
    create: () => new NightLakeScene()
  },
  {
    id: 'living-paint',
    name: 'Ferrofluide',
    tagline: 'Un métal liquide noir qui se hérisse de pointes vers ton doigt.',
    gradient: 'linear-gradient(135deg,#05050b,#1a1a2e,#3a3a5c,#8a8ab0)',
    available: true,
    create: () => new FerroScene()
  },
  {
    id: 'sound-ribbons',
    name: 'Cordes',
    tagline: 'Des cordes de lumière que tu pinces ; elles vibrent et résonnent.',
    gradient: 'linear-gradient(135deg,#ff0080,#ff8c00,#40e0d0)',
    available: true,
    create: () => new StringsScene()
  },
  {
    id: 'crystals',
    name: 'Cristaux',
    tagline: 'Chaque touche fait givrer un cristal à facettes.',
    gradient: 'linear-gradient(135deg,#8e2de2,#4a00e0,#00d2ff)',
    available: true,
    create: () => new CrystalScene()
  },
  {
    id: 'cosmic-portal',
    name: 'Portail cosmique',
    tagline: 'Des étoiles spiralent ; ton doigt courbe la gravité.',
    gradient: 'linear-gradient(135deg,#000428,#004e92,#9d4edd)',
    available: true,
    create: () => new CosmosScene()
  },
  {
    id: 'reactive-powder',
    name: 'Poudre réactive',
    tagline: 'Remue la poudre ; une étincelle se propage en chaîne.',
    gradient: 'linear-gradient(135deg,#232526,#ff512f,#f09819)',
    available: true,
    create: () => new PowderScene()
  },
  {
    id: 'jellyfish',
    name: 'Méduse lumineuse',
    tagline: 'Une créature de filaments qui pulse et te suit.',
    gradient: 'linear-gradient(135deg,#1a2a6c,#3a0ca3,#4cc9f0)',
    available: true,
    create: () => new JellyfishScene()
  },
  {
    id: 'bubbles',
    name: 'Bulles',
    tagline: 'Des bulles irisées montent, fusionnent et éclatent.',
    gradient: 'linear-gradient(135deg,#36d1dc,#5b86e5,#c1f0ff)',
    available: true,
    create: () => new BubbleScene()
  },
  {
    id: 'paper-cut',
    name: 'Brise',
    tagline: 'Une prairie de lumière ; ton geste couche les herbes en vagues.',
    gradient: 'linear-gradient(135deg,#bcd4e6,#e8e0d0,#b8d68a,#f6e3a1)',
    available: true,
    create: () => new GrassScene()
  },
  {
    id: 'terrarium',
    name: 'Monde miniature',
    tagline: 'Sable et eau sous verre : creuse, verse, façonne.',
    gradient: 'linear-gradient(135deg,#134e5e,#71b280,#f6d365)',
    available: true,
    create: () => new TerrariumScene()
  }
];
