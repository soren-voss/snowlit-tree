import type { ThemeId } from '../data/gifts';

type Rgb = [number, number, number];

export interface Theme {
  label: string;
  swatch: [string, string];
  mirror: number[];
  satin: number[];
  pearl: number[];
  hardware: number;
  bulbDeep: Rgb;
  bulbBright: Rgb;
  spill: Rgb;
  garland: number;
  star: { face: number; rim: number; emissive: number; halo: Rgb };
  particles: [Rgb, Rgb, Rgb];
}

export const THEMES: Record<ThemeId, Theme> = {
  classic: {
    label: '经典红金', swatch: ['#a8283a', '#d9ae5a'],
    mirror: [0x9e1a2c, 0xc0283a, 0xd8a64c, 0xe9cf98, 0x7e1426], satin: [0x8c1b2b, 0xb0263a, 0xc69244, 0xd9be8c], pearl: [0xe8d2a8, 0xd4b483],
    hardware: 0xc9a25a, bulbDeep: [1, .62, .26], bulbBright: [1, .8, .52], spill: [1, .5, .17], garland: 0xd9a74e,
    star: { face: 0xe0b45c, rim: 0xb98535, emissive: 0xffb84d, halo: [1, .7, .35] },
    particles: [[1, .72, .36], [1, .93, .78], [1, .32, .3]],
  },
  ice: {
    label: '冰蓝银', swatch: ['#8fb0d6', '#e3e9f1'],
    mirror: [0xc9d6e6, 0xe8eef6, 0x8fa9c9, 0x5d7fa8, 0xdfe6ee], satin: [0xb7c7da, 0x7d97b8, 0xe6ebf2, 0x9fb4cc], pearl: [0xf2f4f7, 0xdce4ee],
    hardware: 0xc0c6cf, bulbDeep: [.86, .9, 1], bulbBright: [1, .97, .92], spill: [.72, .78, .92], garland: 0xc9d0da,
    star: { face: 0xe2e8f1, rim: 0xa9b3c2, emissive: 0xcfe0ff, halo: [.75, .85, 1] },
    particles: [[.7, .84, 1], [1, 1, 1], [.55, .7, 1]],
  },
  rose: {
    label: '粉金', swatch: ['#dc98a4', '#e3b48f'],
    mirror: [0xd98a9a, 0xe8b4b8, 0xc76a7e, 0xf0d2c8, 0xd9a088], satin: [0xc97b8c, 0xe2a9a9, 0xd9a088, 0xf3d9cf], pearl: [0xf6e3dc, 0xead0c4],
    hardware: 0xd4a283, bulbDeep: [1, .66, .42], bulbBright: [1, .84, .68], spill: [1, .55, .32], garland: 0xd9a088,
    star: { face: 0xe8b394, rim: 0xb57a5f, emissive: 0xffb38a, halo: [1, .72, .58] },
    particles: [[1, .7, .6], [1, .92, .86], [1, .5, .62]],
  },
  forest: {
    label: '森林绿铜', swatch: ['#2f6e4a', '#c07a3e'],
    mirror: [0xb87333, 0xd08c4a, 0xc9a25a, 0x8a4a22, 0x2f7a4f], satin: [0x9a5b2a, 0xc98b4e, 0xe0b070, 0x7a3a1c], pearl: [0xe8d8b8, 0xcdb48a],
    hardware: 0xb87d4a, bulbDeep: [1, .58, .22], bulbBright: [1, .76, .45], spill: [1, .48, .15], garland: 0xb8733a,
    star: { face: 0xd9a35e, rim: 0xa86a32, emissive: 0xffa94d, halo: [1, .66, .3] },
    particles: [[1, .66, .3], [1, .9, .7], [.5, .9, .55]],
  },
};
