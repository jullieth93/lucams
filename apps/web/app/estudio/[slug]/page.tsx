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
import { StudioEditorLoader } from "./studio-editor-loader";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { buildWhatsAppUrl } from "@/lib/wa";
import { getStorefrontProductBySlug } from "@/features/products/public-service";
import {
  listTemplatesForKind,
  getOwnedDesign,
  cloneDesignForEdit,
} from "@/features/personalization/service";
import { parsePhotoProductConfig } from "@/features/personalization/schemas";
import { resolvePersonalizationSurface } from "@/features/personalization/surface";
import {
  listLetterStyles,
  listLetterThemeOptions,
  ALPHABET,
} from "@/features/personalization/letter-tiles";
import { listGalleryImages } from "@/features/personalization/design-gallery";
import { NameEditor } from "./name-editor";
import { LetterSetEditor } from "./letter-set-editor";
import { peekCartSession } from "@/lib/cart-session";
import { getCurrentCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { refreshCustomerUploadSignedUrl } from "@/lib/storage";
import type { CanvasData, StudioAsset } from "./types";
import { getCmsBlock } from "@/lib/cms";
import { getStudioTexts } from "./studio-texts.server";
import { StudioTextsProvider } from "./studio-texts-provider";
import { fillStudioText, splitStudioText, type StudioTexts } from "./studio-texts";

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
  // Roadmap B1 — título/description del Estudio son campos CMS (seo.page.estudio.*,
  // editables en /admin/contenido → SEO). {producto} se interpola acá; los fallbacks
  // son los textos exactos pre-CMS.
  const [product, titleBlock, descBlock, notFoundBlock] = await Promise.all([
    getStorefrontProductBySlug(slug),
    getCmsBlock("seo.page.estudio.title"),
    getCmsBlock("seo.page.estudio.description"),
    getCmsBlock("seo.page.estudio.not-found"),
  ]);
  if (!product) return { title: notFoundBlock?.body ?? "Producto no encontrado" };
  return {
    title: fillStudioText(titleBlock?.body ?? "Personalizar — {producto}", {
      producto: product.name,
    }),
    description: fillStudioText(
      descBlock?.body ?? "Diseña tu {producto} en vivo. Estudio de personalización Lucams.",
      { producto: product.name.toLowerCase() },
    ),
    robots: { index: false, follow: false },
  };
}

// StudioEditor (react-konva) se carga vía <StudioEditorLoader> — frontera CLIENTE con ssr:false, para
// que react-konva NO se evalúe en el build del servidor (rompía /_global-error, ADR-073).

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
  const { mergeVariantOverProduct, parseVariantAttributes, selectableVariants } =
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

  // Roadmap B1 — textos CMS del Estudio (UNA query por prefijo estudio.*, con
  // fallback exacto pre-CMS por campo). Se inyectan al árbol client vía provider.
  const texts = await getStudioTexts();

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
    // themeOptions incluye los sets AÚN VACÍOS (0 fichas) para que el selector de tema
    // se vea siempre con su hint de "sube las ilustraciones en /admin/fichas"
    // (el gate styles.length>0 lo escondía por completo — feedback Lucy 2026-07-22).
    const [styles, themeOptions] = await Promise.all([
      listLetterStyles(surface.config.language),
      listLetterThemeOptions(surface.config.language),
    ]);
    return (
      <div className="bg-brand-cream flex min-h-screen flex-col">
        <SiteHeader />
        <main id="contenido" tabIndex={-1} className="flex flex-1 flex-col">
          <StudioTextsProvider texts={texts}>
            <NameEditor
              product={{ id: product.id, slug: product.slug, name: product.name }}
              variantId={selectedVariant.id}
              config={surface.config}
              pricePerTile={pricePerTile}
              initialCount={initialCount}
              styles={styles}
              themeOptions={themeOptions}
            />
          </StudioTextsProvider>
        </main>
      </div>
    );
  }

  // Superficie "letterset": Abecedario Completo / Pack Vocales → color de marco.
  if (surface.surface === "letterset" && selectedVariant) {
    // Ola 2A (Lucy 2026-07-22) — el TEMA y el IDIOMA ya no son dimensiones de la PDP: se
    // eligen en el Estudio. Acá se cargan: los sets por idioma (incluidos los vacíos, que
    // degradan a letra estándar), las fichas ilustradas, los alfabetos y las variantes
    // (para re-resolver la línea de cotización al cambiar tema/idioma conservando
    // tamaño/imantado). La variante de la PDP solo PRESELECCIONA tema e idioma.
    const variantAttrs = parseVariantAttributes(selectedVariant.attributes);
    const initialLanguage = variantAttrs.language === "en" ? ("en" as const) : ("es" as const);
    const selectable = selectableVariants(product.variants);
    const availableLanguages = Array.from(
      new Set(
        selectable
          .map((v) => parseVariantAttributes(v.attributes).language)
          .filter((l): l is "es" | "en" => l === "es" || l === "en"),
      ),
    );
    const [stylesEs, stylesEn, themeEs, themeEn] = await Promise.all([
      listLetterStyles("es"),
      listLetterStyles("en"),
      listLetterThemeOptions("es"),
      listLetterThemeOptions("en"),
    ]);
    const stylesForSubtitle = initialLanguage === "en" ? stylesEn : stylesEs;
    const letters =
      surface.config.letterSet === "vowels"
        ? ["A", "E", "I", "O", "U"]
        : (ALPHABET[initialLanguage] ?? ALPHABET.es);
    return (
      <div className="bg-brand-cream flex min-h-screen flex-col">
        <SiteHeader />
        <main id="contenido" tabIndex={-1} className="flex flex-1 flex-col">
          <StudioTextsProvider texts={texts}>
            <LetterSetEditor
              product={{ id: product.id, slug: product.slug, name: product.name }}
              variantId={selectedVariant.id}
              variants={selectable.map((v) => {
                const a = parseVariantAttributes(v.attributes);
                return {
                  id: v.id,
                  price: v.price,
                  sizeCm: a.sizeCm,
                  magnet: a.magnet,
                  theme: a.theme,
                  language: a.language,
                };
              })}
              basePrice={product.basePrice}
              letterSet={surface.config.letterSet}
              alphabets={{ es: [...ALPHABET.es], en: [...ALPHABET.en] }}
              availableLanguages={availableLanguages.length > 0 ? availableLanguages : ["es"]}
              initialLanguage={initialLanguage}
              themeOptions={{ es: themeEs, en: themeEn }}
              initialTheme={variantAttrs.theme ?? null}
              stylesByLanguage={{ es: stylesEs, en: stylesEn }}
              subtitle={letterSetSubtitle(
                surface.config.letterSet,
                letters.length,
                stylesForSubtitle.length > 0,
                texts,
              )}
            />
          </StudioTextsProvider>
        </main>
      </div>
    );
  }

  // D1 (ADR-063) — superficies declaradas en surface.ts pero SIN editor propio (phrase/event/logo).
  // Ningún producto activo las usa hoy; si se activa una, gateamos con un aviso claro + cotización
  // por WhatsApp en vez de cargar silenciosamente el editor de FOTO (producto equivocado, landmine).
  if (surface.surface === "phrase" || surface.surface === "event" || surface.surface === "logo") {
    const waUrl = await buildWhatsAppUrl({
      kind: "product",
      productName: product.name,
      sku: product.sku,
    });
    return (
      <div className="bg-brand-cream flex min-h-screen flex-col">
        <SiteHeader />
        <main
          id="contenido"
          tabIndex={-1}
          className="flex flex-1 items-center justify-center px-6 py-16"
        >
          <div className="max-w-md text-center">
            <h1 className="font-display text-brand-purple-dark text-2xl">
              {texts.comun.gateTitulo}
            </h1>
            <p className="text-brand-purple-dark/70 mt-3">
              {(() => {
                // {producto} se interpola conservando el <strong> del nombre (roadmap B1).
                // Si el texto editado ya no trae el placeholder, se interpola como texto plano.
                const parts = splitStudioText(texts.comun.gateCuerpo, "producto");
                if (!parts) {
                  return fillStudioText(texts.comun.gateCuerpo, { producto: product.name });
                }
                return (
                  <>
                    {parts[0]}
                    <strong>{product.name}</strong>
                    {parts[1]}
                  </>
                );
              })()}
            </p>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-brand-purple-dark hover:bg-brand-purple mt-6 inline-block rounded-full px-6 py-3 text-sm font-semibold text-white transition-colors"
            >
              {texts.comun.gateCta}
            </a>
          </div>
        </main>
      </div>
    );
  }

  // Llegados aquí, las superficies no-foto (name/letterset/phrase/event/logo) ya retornaron y los
  // NONE sin marcador cayeron a direct-cart (redirect). Lo que queda es la ruta de FOTO (kind ≠ NONE).
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
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
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
  // Edición desde el carrito (auditoría 2026-07-13): id del diseño original a reemplazar en el
  // carrito al finalizar (evita duplicar el item).
  let replacesCartDesignId: string | null = null;

  if (sp.designId) {
    const customer = await getCurrentCustomer();
    const sessionId = customer ? null : await peekCartSession();
    const owner = { customerId: customer?.customer.id ?? null, sessionId };
    let design = await getOwnedDesign(sp.designId, owner);
    // Los diseños que están en el carrito son READY. "Editar" desde el carrito → clonamos a un
    // DRAFT editable (el original queda intacto: si el cliente abandona, el item del carrito
    // sigue válido) y al finalizar reemplazamos el item (no duplicar).
    if (design && design.status === "READY") {
      const clone = await cloneDesignForEdit(sp.designId, owner);
      if (clone) {
        replacesCartDesignId = sp.designId;
        design = await getOwnedDesign(clone.id, owner);
      }
    }
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
        <StudioTextsProvider texts={texts}>
          <StudioEditorLoader
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
            // Precio de la variante elegida (o base) → vista previa pre-carrito.
            unitPriceCents={selectedVariant?.price ?? product.basePrice}
            // Edición desde el carrito: reemplazar el item original al finalizar (no duplicar).
            replacesCartDesignId={replacesCartDesignId}
            templates={templates}
            initialDesignId={initialDesignId}
            initialDesignCanvas={initialDesignCanvas}
            initialDesignAssets={initialDesignAssets}
            photoSlots={photoConfig.photoSlots}
            predesigned={predesigned}
            slotLabels={slotLabels}
            calendarYear={calendarYear}
          />
        </StudioTextsProvider>
      </main>
    </div>
  );
}

/**
 * Subtítulo del editor de set de letras (roadmap B1 — texts.letras.*, CMS).
 *
 * #15 — la promesa "cada una con su dibujito" solo es veraz si HAY estilos ilustrados
 * subidos (hasStyles). Sin estilos, las fichas salen como letra de color: prometer
 * un dibujo sería publicidad engañosa (Ley 1480). "dibujito" (no "animalito") porque el
 * estilo puede ser Navidad/Espacio/etc., no solo animales.
 */
function letterSetSubtitle(
  letterSet: "full" | "vowels",
  letterCount: number,
  hasStyles: boolean,
  texts: StudioTexts,
): string {
  if (letterSet === "vowels") {
    return hasStyles ? texts.letras.subVocalesIlustrado : texts.letras.subVocales;
  }
  const template = hasStyles ? texts.letras.subFullIlustrado : texts.letras.subFull;
  return fillStudioText(template, { n: letterCount });
}
