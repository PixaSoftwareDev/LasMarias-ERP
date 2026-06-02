// Destino del backend para el proxy de /api. En la misma máquina es localhost:4000.
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // typedRoutes desactivado mientras hay rutas placeholder en navigation.ts (recetas, etc.)
  // que se irán implementando módulo a módulo.
  transpilePackages: ['@lasmarias/shared-schemas', '@lasmarias/design-tokens'],
  // El navegador llama /api/* al MISMO origen (la web) y Next lo reenvía al backend.
  // Así con exponer un solo puerto (la web) ya funciona todo, sin CORS. No hace falta
  // exponer el API por separado.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_PROXY_TARGET}/api/:path*` }];
  },
};

export default nextConfig;
