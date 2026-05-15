// Tokens crudos del sistema de diseño de Lácteos Las Marías.
// Especificados en CLAUDE.md §5.2 — esta es la implementación canónica.

export const colors = {
  // Fondos neutros claros
  background: {
    primary: '#FAFAF9',   // blanco roto, fondo principal
    secondary: '#F5F5F4', // gris muy claro
    elevated: '#FFFFFF',  // cards y modales
  },
  // Texto
  text: {
    primary: '#0C0A09',   // gris muy oscuro, casi negro
    secondary: '#57534E', // gris medio
    tertiary: '#A8A29E',  // gris claro (placeholders, metadata)
    inverse: '#FAFAF9',   // sobre fondo oscuro
  },
  // Bordes
  border: {
    subtle: '#E7E5E4',
    default: '#D6D3D1',
    strong: '#A8A29E',
  },
  // Primario — verde profesional (asociación lácteo/campo)
  primary: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A', // base
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
  },
  // Semánticos (CLAUDE.md §5.2)
  success: '#16A34A', // verde — OK, confirmado, en stock
  warning: '#EAB308', // amarillo — atención, próximo a vencer, stock bajo
  danger: '#DC2626',  // rojo — error, vencido, urgente
  info: '#2563EB',    // azul — informativo, en proceso
} as const;

export const typography = {
  fontFamily: {
    sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
    mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
  },
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],
    sm: ['0.875rem', { lineHeight: '1.25rem' }],
    base: ['1rem', { lineHeight: '1.5rem' }],
    lg: ['1.125rem', { lineHeight: '1.75rem' }],
    xl: ['1.25rem', { lineHeight: '1.75rem' }],
    '2xl': ['1.5rem', { lineHeight: '2rem' }],
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

// CLAUDE.md §5.2 — border radius consistente
export const radius = {
  sm: '6px',    // botones
  md: '8px',    // inputs, cards
  lg: '12px',   // modales
  full: '9999px',
} as const;

// CLAUDE.md §5.2 — sombras sutiles, no dramáticas
export const shadow = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.05)',
} as const;

// CLAUDE.md §5.1 — botones táctiles ≥44px en mobile
export const touchTarget = {
  min: '44px',
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;
