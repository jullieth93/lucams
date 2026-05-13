import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Subprocesadores",
};

const FALLBACK = `Lucams_shop usa los siguientes proveedores que pueden tratar datos personales en nuestro nombre. Mantenemos un Acuerdo de Procesamiento de Datos (DPA) firmado con cada uno, y exigimos garantías de seguridad adecuadas.

| Proveedor | País | Propósito | DPA |
|---|---|---|---|
| Supabase | US / EU | Base de datos PostgreSQL, autenticación, almacenamiento de archivos | [Ver](https://supabase.com/legal/dpa) |
| Vercel | US | Hosting, despliegue y CDN del sitio web | [Ver](https://vercel.com/legal/dpa) |
| Resend | US | Envío de emails transaccionales y newsletter | [Ver](https://resend.com/legal/dpa) |
| Wompi | Colombia | Procesamiento de pagos (tarjetas y PSE) | [Ver](https://wompi.com/legal) |
| Venndelo / Coordinadora | Colombia | Logística de envíos a 1.100+ destinos | [Ver](https://venndelo.com/legal) |
| Cloudflare | US | Anti-bot Turnstile y protección DDoS | [Ver](https://www.cloudflare.com/cloudflare-customer-dpa/) |
| Anthropic (Claude API) | US | Asistente IA para personalización de productos (futuro) | [Ver](https://www.anthropic.com/legal/dpa) |

Notificaremos por email a clientes registrados cualquier cambio sustancial en este listado con al menos **30 días** de anticipación.`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.subprocesadores.heading" defaultTitle="Subprocesadores" />
      <CmsMarkdown blockKey="legal.subprocesadores" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
