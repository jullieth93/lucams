import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite que el dev server acepte requests HMR / dev-resources desde
  // hosts distintos a localhost. Necesario cuando se navega a la app
  // por la IP LAN de la VM (192.168.x.x) en lugar de localhost — Next 16
  // bloquea esos accesos por default por seguridad. Esta lista NO aplica
  // en producción (Vercel no usa next dev).
  allowedDevOrigins: ["192.168.20.180", "localhost", "127.0.0.1"],
};

export default nextConfig;
