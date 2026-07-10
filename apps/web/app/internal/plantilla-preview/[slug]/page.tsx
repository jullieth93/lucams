/*
 * Ruta interna para GENERAR el thumbnail de una plantilla (Fase 3). No es de cara
 * al cliente: la usa el script de Playwright que screenshotea el canvas y sube el
 * PNG a Storage. noindex. Carga el canvasData real de la plantilla y lo renderiza
 * con el StudioSlot del Estudio (fidelidad total al imán físico).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { CanvasDataV1 } from "@/app/estudio/[slug]/types";
import { PreviewCanvas } from "../preview-canvas";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamicParams = true;

type Params = Promise<{ slug: string }>;

export default async function PlantillaPreviewPage({ params }: { params: Params }) {
  // Ruta de TOOLING interno (el generador Playwright screenshotea el canvas en
  // dev/preview). NUNCA debe existir en producción: renderiza cualquier plantilla
  // por slug —incluidas ocultas (isActive=false) y descartadas (soft-deleted)—, lo
  // que permitiría enumeración/disclosure a un visitante. En vivo los previews se
  // sirven desde Storage (`previewUrl`), jamás desde esta ruta. Ver ADR-048.
  if (process.env.VERCEL_ENV === "production") notFound();

  const { slug } = await params;
  const tpl = await prisma.personalizationTemplate.findUnique({
    where: { slug },
    select: { slug: true, canvasData: true, kind: true },
  });
  if (!tpl) notFound();

  const canvasData = tpl.canvasData as unknown as CanvasDataV1;

  return (
    <main
      // Fondo neutro claro para que el imán (con su sombra) resalte en el screenshot.
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        background: "#f4f1f7",
      }}
    >
      {/* Ocultar overlays globales (banner cookies, toaster) para un screenshot
          limpio — este es un endpoint interno de generación de thumbnails. */}
      <style>{`
        [aria-labelledby="cookies-banner-title"],[data-sonner-toaster],[aria-label*="Notifications"]{display:none!important}
        /* Ocultar el badge de número de slot (overlay HTML sobre el canvas, combo
           único absolute+top-1.5+left-1.5) para un thumbnail sin chrome del editor. */
        [data-preview-root] .absolute.top-1\\.5.left-1\\.5{display:none!important}
      `}</style>
      <PreviewCanvas canvasData={canvasData} width={480} />
    </main>
  );
}
