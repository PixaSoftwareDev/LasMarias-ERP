import type { Config } from 'tailwindcss';
import { colors, typography, radius, shadow } from './index';

// Preset Tailwind compartido — apps/web y futuros frontends lo extienden.
// Materializa los tokens de design-tokens como utilidades Tailwind.

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // Surfaces / texto
        background: colors.background.primary,
        surface: {
          DEFAULT: colors.background.primary,
          subtle: colors.background.secondary,
          elevated: colors.background.elevated,
        },
        foreground: {
          DEFAULT: colors.text.primary,
          muted: colors.text.secondary,
          subtle: colors.text.tertiary,
          inverse: colors.text.inverse,
        },
        border: {
          DEFAULT: colors.border.default,
          subtle: colors.border.subtle,
          strong: colors.border.strong,
        },
        // Primario y secundario oficiales Las Marías
        primary: colors.primary,
        secondary: colors.secondary,
        // Semánticos
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
        info: colors.info,
      },
      // Casts a tipos mutables porque los tokens usan `as const`
      fontFamily: typography.fontFamily as unknown as Record<string, string[]>,
      fontSize: typography.fontSize as unknown as Record<string, [string, { lineHeight: string }]>,
      fontWeight: typography.fontWeight as unknown as Record<string, string>,
      borderRadius: {
        sm: radius.sm,
        DEFAULT: radius.md,
        md: radius.md,
        lg: radius.lg,
      },
      boxShadow: {
        sm: shadow.sm,
        DEFAULT: shadow.md,
        md: shadow.md,
        lg: shadow.lg,
      },
      minHeight: {
        touch: '44px', // CLAUDE.md §5.1 — botones táctiles
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
};

export default preset;
