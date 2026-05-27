// Tokens de diseño de Lácteos Las Marías.
// Identidad oficial extraída de https://lacteoslasmarias.com (2026-05-15):
//   - Verde primario: #009b00
//   - Azul secundario: #1c3076
//   - Tipografía: Inter en toda la app (body + títulos). Decisión de producto
//     por un look SaaS moderno (CLAUDE.md §5.2 ya la recomienda); reemplaza al
//     Roboto del sitio institucional, que daba un aire anticuado.
// La escala 50-900 del verde está construida alrededor de #009b00 como tono 600.

export const colors = {
  // Neutros SLATE (gris azulado frío) — estándar SaaS moderno; reemplaza al
  // stone cálido que daba un negro/gris anticuado. Combina con navy + esmeralda.
  background: {
    primary: '#F8FAFC',   // slate-50
    secondary: '#F1F5F9', // slate-100
    elevated: '#FFFFFF',
  },
  text: {
    primary: '#0F172A',   // slate-900 — títulos/números (no negro puro)
    secondary: '#475569', // slate-600 — texto secundario
    tertiary: '#94A3B8',  // slate-400 — metadatos/placeholder
    inverse: '#F8FAFC',
  },
  border: {
    subtle: '#E2E8F0',    // slate-200
    default: '#CBD5E1',   // slate-300
    strong: '#94A3B8',    // slate-400
  },
  // Primario — verde ESMERALDA moderno (escala emerald de Tailwind) como verde
  // de interacción: botones, foco de campos, ítem activo. Reemplaza al verde
  // semáforo #009B00 del sitio institucional, que se percibía saturado/anticuado.
  primary: {
    50:  '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669', // base — verde esmeralda
    700: '#047857',
    800: '#065F46',
    900: '#064E3B',
  },
  // Secundario — azul oficial Las Marías para acentos y elementos de marca.
  secondary: {
    50:  '#E8EAF2',
    100: '#C5CADD',
    200: '#9FA7C5',
    300: '#7984AD',
    400: '#5C6A9C',
    500: '#3F518A',
    600: '#2A407B',
    700: '#1C3076', // base — azul oficial
    800: '#152560',
    900: '#0E1947',
  },
  // Semánticos — verde de éxito alineado al esmeralda primario.
  success: '#059669',
  warning: '#EAB308',
  danger: '#DC2626',
  info: '#1C3076',
} as const;

export const typography = {
  fontFamily: {
    // Inter en toda la app — sans SaaS moderna, legible en formularios y datos densos.
    sans: ['var(--font-sans)', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
    // Display comparte Inter (mismo tipo); reservado para wordmark y títulos.
    display: ['var(--font-sans)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
    semibold: '700', // Roboto sin 500/600, salta a 700 directo
    bold: '700',
  },
} as const;

// Radios generosos para un look moderno/suave (estilo SaaS actual).
export const radius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  full: '9999px',
} as const;

export const shadow = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.05)',
} as const;

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

// Marca — para uso en componentes que muestran identidad
export const brand = {
  name: 'Lácteos Las Marías',
  tagline: 'Industria Láctea Especializada',
} as const;
