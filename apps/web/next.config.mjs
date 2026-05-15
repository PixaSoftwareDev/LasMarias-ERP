/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // typedRoutes desactivado mientras hay rutas placeholder en navigation.ts (recetas, etc.)
  // que se irán implementando módulo a módulo.
  transpilePackages: ['@lasmarias/shared-schemas', '@lasmarias/design-tokens'],
};

export default nextConfig;
