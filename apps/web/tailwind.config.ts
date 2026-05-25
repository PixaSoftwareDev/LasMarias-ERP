import type { Config } from 'tailwindcss';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require('@lasmarias/design-tokens/tailwind-preset');

const config: Config = {
  presets: [preset as Config],
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
