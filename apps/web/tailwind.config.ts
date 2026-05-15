import type { Config } from 'tailwindcss';
import preset from '@lasmarias/design-tokens/tailwind-preset';

const config: Config = {
  presets: [preset as Config],
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
