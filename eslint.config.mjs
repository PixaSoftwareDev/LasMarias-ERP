// Config raíz de ESLint (flat). Parsea TS con typescript-eslint y aplica un set
// liviano y conservador: el control fuerte de tipos lo hace `tsc` (strict).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.cjs',
    ],
  },
  // JavaScript plano (scripts, configs sueltos).
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // `== null` es idiomático (matchea null y undefined); el resto exige ===.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  // TypeScript (back y front). Parser de typescript-eslint, sin type-checking pesado.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Scripts de carga/seed: son CLIs, el console es su salida esperada.
  {
    files: ['**/database/seed*.ts', '**/database/reset*.ts'],
    rules: { 'no-console': 'off' },
  },
);
