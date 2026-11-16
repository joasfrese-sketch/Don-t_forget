import plugin from 'tailwindcss/plugin';
import { palette } from './palette.js';

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
const vars = (roles) => Object.fromEntries(Object.entries(roles).map(([k, v]) => [`--c-${kebab(k)}`, channels(v)]));
const colors = Object.fromEntries(Object.keys(palette.light).map((k) => [kebab(k), `rgb(var(--c-${kebab(k)}) / <alpha-value>)`]));

export default {
  content: ['./index.html', './src/**/*.js'],
  darkMode: 'class',
  theme: { extend: { colors } },
  plugins: [plugin(({ addBase }) => addBase({ ':root': vars(palette.light), '.dark': vars(palette.dark) }))],
};
