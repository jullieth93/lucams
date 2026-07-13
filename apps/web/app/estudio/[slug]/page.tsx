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
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getStorefrontProductBySlug } from "@/features/products/public-service";
import { listTemplatesForKind, getOwnedDesign } from "@/features/personalization/service";
import { parsePhotoProductConfig } from "@/features/personalization/schemas";
import { resolvePersonalizationSurface } from "@/features/personalization/surface";
import { listLetterStyles, ALPHABET } from "@/features/personalization/letter-tiles";
import { listGalleryImages } from "@/features/personalization/design-gallery";
import { formatCOP } from "@/lib/format";
import { NameEditor } from "./name-editor";
import { LetterSetEditor } from "./letter-set-editor";
import { peekCartSession } from "@/lib/cart-session";
import { getCurrentCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { refreshCustomerUploadSignedUrl } from "@/lib/storage";
import type { CanvasData, StudioAsset } from "./types";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{
  designId?: string;
  template?: string;
  variant?: string;
  /** ADR-057 — nº de letras pre-elegido en la ficha (Nombre por ficha). Hint inicial. */
  letters?: string;
}>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getStorefrontProductBySlug(slug);
  if (!product) return { title: "Producto no encontrado" };
  return {
    title: `Personalizar — ${product.name}`,
    description: `Diseña tu ${product.name.toLowerCase()} en vivo. Estudio de personalización Lucams.`,
    robots: { index: false, follow: false },
  };
}

const StudioEditor = dynamic(
  () => import("./studio-editor").then((mod) => ({ default: mod.StudioEditor })),
  {
    loading: () => (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="text-brand-muted flex items-center gap-3">
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
  // Nota: NO bloqueamos por kind===NONE aquí. Un producto NONE con marcador `letterSet`
  // (Abecedario Completo / Pack Vocales) SÍ abre el Estudio (color de marco). El
  // enrutador de superficie decide: los NONE sin marcador caen a direct-cart → redirect.

  // M.3.b.CAT.4 — Si el query trae ?variant=id, mergear sus attributes
  // sobre el personalizationSchema base. Esto cambia photoSlots, sizeCm,
  // shape, etc. del editor según la variant elegida.
  const requestedVariantId = typeof sp.variant === "string" ? sp.variant : undefined;
  const selectedVariant =
    product.variants.find((v) => v.id === requestedVariantId) ?? product.variants[0] ?? null;
  const { mergeVariantOverProduct, parseVariantAttributes } =
    await import("@/features/products/variant-schemas");
  const mergedSchema = selectedVariant
    ? mergeVariantOverProduct(
        product.personalizationSchema as Record<string, unknown>,
        parseVariantAttributes(selectedVariant.attributes),
      )
    : (product.personalizationSchema as Record<string, unknown>);

  // ADR-057 — Enrutador de superficie: cada tipo de producto (y variante) abre la
  // experiencia correcta, no el editor de foto genérico.
  const surface = resolvePersonalizationSurface(
    product.personalizationKind,
    mergedSchema as Record<string, unknown>,
  );

  // Set fijo (abecedario completo/vocales) o no personalizable → no abrir el Estudio.
  if (surface.surface === "direct-cart") {
    redirect(`/producto/${product.slug}`);
  }

  // Superficie "nombre": editor de nombre (solo palabra + colores). El tamaño, idioma e
  // imantado se eligen en la FICHA (VariantSelector) → llegan resueltos en selectedVariant.
  if (surface.surface === "name" && selectedVariant) {
    // ADR-057 — precio POR FICHA: el price de la variante es el precio de UNA ficha; el
    // editor muestra el total en vivo = nº de letras × precio-por-ficha.
    const pricePerTile = selectedVariant.price ?? product.basePrice;
    // Hint de cantidad pre-elegido en la ficha (?letters=N), acotado a [min, max].
    const rawCount = Number.parseInt(sp.letters ?? "", 10);
    const initialCount = Number.isFinite(rawCount)
      ? Math.min(surface.config.max, Math.max(surface.config.min, rawCount))
      : surface.config.min;
    // Estilos ilustrados del idioma (Animales, Navidad…). Vacío = solo "Solo letra".
    const styles = await listLetterStyles(surface.config.language);
    return (
      <div className="bg-brand-cream flex min-h-screen flex-col">
        <SiteHeader />
        <main id="contenido" tabIndex={-1} className="flex flex-1 flex-col">
          <NameEditor
            product={{ id: product.id, slug: product.slug, name: product.name }}
            variantId={selectedVariant.id}
            config={surface.config}
            pricePerTile={pricePerTile}
            initialCount={initialCount}
            styles={styles}
          />
        </main>
      </div>
    );
  }

  // Superficie "letterset": Abecedario Completo / Pack Vocales → color de marco.
  if (surface.surface === "letterset" && selectedVariant) {
    const priceLabel = formatCOP(selectedVariant.price ?? product.basePrice);
    const styles = await listLetterStyles(surface.config.language);
    const letters =
      surface.config.letterSet === "vowels"
        ? ["A", "E", "I", "O", "U"]
        : (ALPHABET[surface.config.language] ?? ALPHABET.es);
    return (
      <div className="bg-brand-cream flex min-h-screen flex-col">
        <SiteHeader />
        <main id="contenido" tabIndex={-1} className="flex flex-1 flex-col">
          <LetterSetEditor
            product={{ id: product.id, slug: product.slug, name: product.name }}
            variantId={selectedVariant.id}
            letters={letters}
            styles={styles}
            priceLabel={priceLabel}
            subtitle={
              surface.config.letterSet === "vowels"
                ? "Las 5 vocales con su animalito. Pinta cada ficha del color que quieras — así se imprime."
                : `Las ${letters.length} letras, cada una con su animalito. Pinta cada ficha del color que quieras — así se imprime.`
            }
          />
        </main>
      </div>
    );
  }

  // Llegados aquí, las superficies no-foto (name/letterset) ya retornaron y los NONE sin
  // marcador cayeron a direct-cart (redirect). Lo que queda es la ruta de FOTO (kind ≠ NONE).
  if (product.personalizationKind === "NONE") notFound();

  const photoConfig = parsePhotoProductConfig(mergedSchema);

  // ADR-057 B2 — diseños prediseñados de la galería (si el producto define un galleryTag).
  const galleryTag =
    typeof (mergedSchema as { galleryTag?: unknown }).galleryTag === "string"
      ? (mergedSchema as { galleryTag: string }).galleryTag
      : null;
  const predesigned = galleryTag ? await listGalleryImages(galleryTag) : [];

  // ADR-057 Fase D — Calendario: slots etiquetados por mes (Ene…Dic) + año, para que el cliente
  // sepa qué foto va en qué mes (hoy son 12 fotos sueltas sin etiqueta).
  const MONTHS_ES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const isCalendarMonth = product.personalizationKind === "CALENDAR_PHOTO_MONTH";
  const slotLabels =
    isCalendarMonth && (mergedSchema as { monthLabels?: boolean }).monthLabels
      ? MONTHS_ES.slice(0, photoConfig.photoSlots)
      : undefined;
  const calendarYear =
    isCalendarMonth && typeof (mergedSchema as { year?: unknown }).year === "number"
      ? (mergedSchema as { year: number }).year
      : undefined;

  // Cargar plantillas activas del kind (globales + product-specific).
  // Filtra por aspect ratio del producto físico — solo plantillas cuyo stage
  // matchee el aspect físico aparecen en el sidebar (M.3.b.B.4 aterrizado).
  const templatesRaw = await listTemplatesForKind(product.personalizationKind, {
    productId: product.id,
    productAspectRatio: photoConfig.aspectRatio,
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

      <main id="contenido" tabIndex={-1} className="flex flex-1 flex-col">
        <StudioEditor
          product={{
            id: product.id,
            slug: product.slug,
            name: product.name,
            sku: product.sku,
            personalizationKind: product.personalizationKind,
            // M.3.b.CAT.4 — pasar mergedSchema (variant attributes sobre base)
            personalizationSchema: mergedSchema,
            images: product.images,
          }}
          // M.3.b.CAT — variant elegido en PDP, propagado al cart al finalizar
          variantId={selectedVariant?.id}
          templates={templates}
          initialDesignId={initialDesignId}
          initialDesignCanvas={initialDesignCanvas}
          initialDesignAssets={initialDesignAssets}
          photoSlots={photoConfig.photoSlots}
          predesigned={predesigned}
          slotLabels={slotLabels}
          calendarYear={calendarYear}
        />
      </main>
    </div>
  );
}
