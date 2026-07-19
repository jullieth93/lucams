import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";
import { LegalPageHeader } from "@/components/legal/legal-page-header";

export const metadata: Metadata = {
  title: "Subprocesadores",
};

// P0-008 (Bloque B 2026-06-27) — actualizado de Venndelo a Aveonline (ADR-039).
// Aveonline es un agregador logístico que rutea cada envío por una de varias
// transportadoras colombianas; esas transportadoras reciben los datos de entrega
// (nombre, dirección, teléfono) para hacer la entrega, por eso se listan.
const FALLBACK = `Lucams_shop usa los siguientes proveedores que pueden tratar datos personales en nuestro nombre. Mantenemos un Acuerdo de Procesamiento de Datos (DPA) con cada uno y exigimos garantías de seguridad adecuadas.

| Proveedor | País | Propósito | DPA |
|---|---|---|---|
| Supabase | US / EU | Base de datos PostgreSQL, autenticación, almacenamiento de archivos | [Ver](https://supabase.com/legal/dpa) |
| Vercel | US | Hosting, despliegue y CDN del sitio web | [Ver](https://vercel.com/legal/dpa) |
| Resend | US | Envío de correos transaccionales y newsletter | [Ver](https://resend.com/legal/dpa) |
| Wompi | Colombia | Procesamiento de pagos en línea (tarjetas y PSE) | [Ver](https://wompi.com/legal) |
| Aveonline | Colombia | Agregador de logística: cotiza y genera las guías de envío, y gestiona el recaudo del pago contraentrega | [Ver](https://www.aveonline.co/) |
| Cloudflare | US | Anti-bot (Turnstile) y protección DDoS | [Ver](https://www.cloudflare.com/cloudflare-customer-dpa/) |
| Google (Gemini API) | US | Asistente de IA que sugiere ideas de diseño en el Estudio | [Ver](https://cloud.google.com/terms/data-processing-addendum) |

### Transportadoras

Aveonline entrega tu pedido a través de una de estas transportadoras, según la
cobertura y tarifa de tu ciudad. La transportadora recibe tus datos de entrega
(nombre, dirección, teléfono) únicamente para completar el envío:

- Envía
- Coordinadora
- Servientrega
- Interrapidísimo
- TCC
- Deprisa
- Saferbo

Notificaremos por correo a los clientes registrados cualquier cambio sustancial en este listado con al menos **30 días** de anticipación.`;

export default function Page() {
  return (
    <>
      <LegalPageHeader blockKey="legal.subprocesadores.heading" defaultTitle="Subprocesadores" />
      <CmsMarkdown blockKey="legal.subprocesadores" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
