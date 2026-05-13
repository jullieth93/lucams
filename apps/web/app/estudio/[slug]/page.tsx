/*
 * Estudio de Personalización — entry server component (M.3.b Capa 2).
 *
 * Flow:
 *   1. Verifica producto + kind != NONE
 *   2. Carga plantillas disponibles del kind
 *   3. Si hay ?designId= en query (recover flow), levanta el Design existente
 *      con sus assets ya subidos (signed URLs refrescadas)
 *   4. Lee `photoSlots` del personalizationSchema del producto
 *   5. Renderiza <StudioEditor> client-side con dynamic import (Konva
 *      requiere window)
 */

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getStorefrontProductBySlug } from "@/features/products/public-service";
import { listTemplatesForKind, getOwnedDesign } from "@/features/personalization/service";
import { parsePhotoProductConfig } from "@/features/personalization/schemas";
import { peekCartSession } from "@/lib/cart-session";
import { getCurrentCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { refreshCustomerUploadSignedUrl } from "@/lib/storage";
import type { CanvasData, StudioAsset } from "./types";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ designId?: string; template?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getStorefrontProductBySlug(slug);
  if (!product) return { title: "Producto no encontrado" };
  return {
    title: `Personalizar — ${product.name}`,
    description: `Diseñá tu ${product.name.toLowerCase()} en vivo. Estudio de personalización Lucams.`,
    robots: { index: false, follow: false },
  };
}

const StudioEditor = dynamic(
  () => import("./studio-editor").then((mod) => ({ default: mod.StudioEditor })),
  {
    loading: () => (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="text-brand-purple/70 flex items-center gap-3">
          <div className="border-brand-purple/30 border-t-brand-purple h-6 w-6 animate-spin rounded-full border-2" />
          <span>Cargando estudio...</span>
        </div>
      </div>
    ),
  },
);

export default async function EstudioPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const product = await getStorefrontProductBySlug(slug);
  if (!product) notFound();
  if (product.personalizationKind === "NONE") notFound();

  const photoConfig = parsePhotoProductConfig(product.personalizationSchema);

  // Cargar plantillas activas del kind (globales + product-specific)
  const templatesRaw = await listTemplatesForKind(product.personalizationKind, {
    productId: product.id,
  });
  const templates = templatesRaw.map((t) => ({
    ...t,
    canvasData: t.canvasData as unknown as import("./types").CanvasDataV1,
  }));

  // Recover flow: si pasaron ?designId=, levantar el Design existente
  let initialDesignId: string | null = null;
  let initialDesignCanvas: CanvasData | null = null;
  let initialDesignAssets: StudioAsset[] = [];

  if (sp.designId) {
    const customer = await getCurrentCustomer();
    const sessionId = customer ? null : await peekCartSession();
    const design = await getOwnedDesign(sp.designId, {
      customerId: customer?.customer.id ?? null,
      sessionId,
    });
    if (design && design.status === "DRAFT") {
      initialDesignId = design.id;
      initialDesignCanvas = design.canvasData as unknown as CanvasData;
      // Hidratar DesignAssets existentes con signed URLs refrescadas
      const dbAssets = await prisma.designAsset.findMany({
        where: { designId: design.id },
        select: { id: true, storageUrl: true, width: true, height: true },
      });
      initialDesignAssets = await Promise.all(
        dbAssets.map(async (a) => ({
          id: a.id,
          signedUrl: await refreshCustomerUploadSignedUrl(a.storageUrl),
          width: a.width,
          height: a.height,
        })),
      );
    }
  }

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col">
        <StudioEditor
          product={{
            id: product.id,
            slug: product.slug,
            name: product.name,
            sku: product.sku,
            personalizationKind: product.personalizationKind,
            personalizationSchema: product.personalizationSchema,
            images: product.images,
          }}
          templates={templates}
          initialDesignId={initialDesignId}
          initialDesignCanvas={initialDesignCanvas}
          initialDesignAssets={initialDesignAssets}
          photoSlots={photoConfig.photoSlots}
        />
      </main>
    </div>
  );
}
