import type { Metadata } from "next";
import { CmsMarkdown } from "@/components/cms/cms-markdown";

export const metadata: Metadata = {
  title: "Seguridad",
};

const FALLBACK = `## Divulgación responsable

Si encontraste una vulnerabilidad de seguridad en Lucams_shop, te agradecemos reportarla antes de divulgarla públicamente. Escríbenos a **security@lucamsshop.co** con:

- Descripción del problema
- Pasos para reproducir
- Impacto potencial
- Tu contacto para coordinar

Nos comprometemos a:

- Confirmar recepción en máximo **3 días hábiles**
- Mantener tu identidad confidencial si lo prefieres
- Acreditarte públicamente al cerrar el reporte (si lo deseas)
- **NO** emprender acciones legales contra investigadores que actúen de buena fe

## Alcance

**En scope:** lucamsshop.co y sus subdominios.

**Fuera de scope:** vulnerabilidades sociales (phishing a empleados), DoS volumétricos, problemas en proveedores de terceros (reportarlos a su programa).

## security.txt

Archivo machine-readable disponible en [/.well-known/security.txt](/.well-known/security.txt).`;

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">Seguridad</h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <CmsMarkdown blockKey="legal.security" fallback={FALLBACK} className="mt-6" />
    </>
  );
}
