// Tokens de diseño de Lácteos Las Marías.
// Identidad oficial extraída de https://lacteoslasmarias.com (2026-05-15):
//   - Verde primario: #009b00
//   - Azul secundario: #1c3076
//   - Tipografía: Roboto (400 / 700)
// La escala 50-900 del verde está construida alrededor de #009b00 como tono 600.

export const colors = {
  background: {
    primary: '#FAFAF9',
    secondary: '#F5F5F4',
    elevated: '#FFFFFF',
  },
  text: {
    primary: '#0C0A09',
    secondary: '#57534E',
    tertiary: '#A8A29E',
    inverse: '#FAFAF9',
  },
  border: {
    subtle: '#E7E5E4',
    default: '#D6D3D1',
    strong: '#A8A29E',
  },
  // Primario — verde oficial Las Marías (#009b00) como tono 600.
  primary: {
    50:  '#E6F7E6',
    100: '#C1EBC1',
    200: '#8FD98F',
    300: '#5CC65C',
    400: '#2EB72E',
    500: '#11A911',
    600: '#009B00', // base — verde oficial
    700: '#008300',
    800: '#006B00',
    900: '#004D00',
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
  // Semánticos — verde de éxito usa el mismo de marca para coherencia visual.
  success: '#009B00',
  warning: '#EAB308',
  danger: '#DC2626',
  info: '#1C3076',
} as const;

export const typography = {
  fontFamily: {
    // Roboto para body — legibilidad en formularios, tablas, datos densos.
    sans: ['var(--font-roboto)', 'Roboto', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
    // Inter para wordmark y títulos — sans SaaS moderna por excelencia.
    display: ['var(--font-display)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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

export const radius = {
  sm: '6px',
  md: '8px',
  lg: '12px',
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
