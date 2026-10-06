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
import { readPhotoPackDesignInfo } from "@/features/products/photo-pack-resolve";
import {
  listLetterStyles,
  listLetterThemeOptions,
  ALPHABET,
} from "@/features/personalization/letter-tiles";
import { listGalleryImages } from "@/features/personalization/design-gallery";
import { resolveGalleryTag } from "./lib/product-kind";
import { resolveRecoverVariantId } from "./lib/recover-variant";
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
  /**
   * UNIDADES A DISEÑAR elegidas en la PDP con el stepper "Unidades" (modelo
   * multi-unidad, owner 2026-09-09 — regla general: cada unidad se diseña por
   * separado en el Estudio; desaparecen las "copias idénticas" de las
   * superficies personalizables). Se conserva el nombre del parámetro por
   * compat de deep-links, pero su significado cambió: ?copies=N abre el
   * Estudio con N unidades (2 tiras = 2 × fotos-por-tira; 2 calendarios =
   * 2 × 12 tarjetas). Sin parámetro arranca en 1.
   */
  copies?: string;
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

// El finalize (finalizeDesignAction) renderiza los PNG de imprenta SERVER-SIDE
// con sharp/canvas (hasta 24 páginas de calendario por diseño) — el default de
// duración de la plataforma podía matar la función a mitad. Las Server Actions
// heredan el maxDuration de la página donde se invocan (mismo patrón que
// /checkout/pago y /admin/pedidos). 60s cabe en el tope de Vercel (300s).
export const maxDuration = 60;

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

  // Recover flow (?designId=): el dueño y el diseño se resuelven UNA vez acá y se
  // reutilizan en las tres superficies (name / letterset / foto). Además la variante
  // persistida al crear el diseño (metadata.variantId) alimenta selectedVariant más
  // abajo: el link «Editar» del carrito solo trae designId y sin esto la variante
  // caía a la primera del producto (precio mostrado incorrecto en multi-variante).
  let recoverOwner: { customerId: string | null; sessionId: string | null } | null = null;
  let recoverDesign: Awaited<ReturnType<typeof getOwnedDesign>> = null;
  if (sp.designId) {
    const customer = await getCurrentCustomer();
    recoverOwner = {
      customerId: customer?.customer.id ?? null,
      sessionId: customer ? null : await peekCartSession(),
    };
    recoverDesign = await getOwnedDesign(sp.designId, recoverOwner);
  }

  // M.3.b.CAT.4 — Si el query trae ?variant=id, mergear sus attributes
  // sobre el personalizationSchema base. Esto cambia photoSlots, sizeCm,
  // shape, etc. del editor según la variant elegida.
  const requestedVariantId = resolveRecoverVariantId({
    urlVariantId: typeof sp.variant === "string" ? sp.variant : undefined,
    designMetadata: recoverDesign?.metadata ?? null,
    productVariantIds: product.variants.map((v) => v.id),
  });
  const selectedVariant =
    product.variants.find((v) => v.id === requestedVariantId) ?? product.variants[0] ?? null;
  const {
    mergeVariantOverProduct,
    parseVariantAttributes,
    selectableVariants,
    describeVariantAttributes,
  } = await import("@/features/products/variant-schemas");
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

  // Unidades a DISEÑAR vía ?copies=N (modelo multi-unidad 2026-09-09 — el nombre
  // del parámetro se conserva por compat; el significado es "N unidades, cada una
  // diseñable por separado"). Sin parámetro arranca en 1. Entero acotado a 1..99
  // acá (la URL la puede editar cualquiera); el tope REAL por producto lo aplica
  // cada superficie (foto: slotCount ≤ 50 → floor(50/unitSlots); sets: 10).
  const rawCopies = Number.parseInt(typeof sp.copies === "string" ? sp.copies : "", 10);
  const initialCopies = Number.isFinite(rawCopies)
    ? Math.min(99, Math.max(1, rawCopies))
    : undefined;

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
    let initialCount = Number.isFinite(rawCount)
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
    // Re-abrir un diseño guardado (?designId= — "Editar" desde el carrito): hay que
    // devolverle al editor TODO lo persistido en Design.metadata (nombre, nº de fichas,
    // estilo ilustrado, tema de color, colores por ficha y la opción «Con borde / Sin
    // borde»); si no, el editor arrancaba vacío y el cliente perdía visualmente su
    // diseño. Sin la clave (diseños previos a la opción) withBorder queda en undefined
    // → el editor arranca en CON borde, lo histórico. El editor nunca reusa el id: al
    // confirmar crea un diseño NUEVO, así que acá solo se LEE el metadata (sin clonar)
    // y se propaga `replacesCartDesignId` para que el carrito REEMPLACE la línea vieja
    // en sitio (misma UX que la superficie foto, sin duplicar — ver README).
    let initialWithBorder: boolean | undefined;
    let initialName: string | undefined;
    let initialStyleId: string | null | undefined;
    let initialThemeId: string | undefined;
    let initialColors: string[] | undefined;
    let replacesCartDesignId: string | null = null;
    if (recoverDesign) {
      const meta = recoverDesign.metadata as Record<string, unknown> | null;
      if (meta && meta.surface === "name") {
        // Solo un diseño READY puede estar referenciado por una línea del carrito
        // (el alta exige READY) → solo ahí hay algo que reemplazar.
        if (recoverDesign.status === "READY") replacesCartDesignId = recoverDesign.id;
        if (typeof meta.withBorder === "boolean") initialWithBorder = meta.withBorder;
        // El display name normalizado es la forma exacta que diseñó el cliente;
        // fallback a las letras sueltas por diseños viejos sin la clave name.
        if (typeof meta.name === "string" && meta.name.trim() !== "") {
          initialName = meta.name;
        } else if (Array.isArray(meta.letters)) {
          const joined = meta.letters.filter((l): l is string => typeof l === "string").join("");
          if (joined !== "") initialName = joined;
        }
        // Conteo de fichas: el del diseño (las letras que diseñó), no el hint de la PDP.
        if (initialName) {
          initialCount = Math.min(
            surface.config.max,
            Math.max(surface.config.min, initialName.length),
          );
        }
        // Estilo ilustrado: null explícito = «Solo letra» (manda sobre el default del
        // primer estilo); id solo se acepta si el set sigue existiendo.
        if (meta.styleSetId === null) {
          initialStyleId = null;
        } else if (
          typeof meta.styleSetId === "string" &&
          styles.some((s) => s.id === meta.styleSetId)
        ) {
          initialStyleId = meta.styleSetId;
        }
        if (typeof meta.themeId === "string") initialThemeId = meta.themeId;
        if (Array.isArray(meta.colors)) {
          const colors = meta.colors.filter((c): c is string => typeof c === "string");
          if (colors.length > 0) initialColors = colors;
        }
      }
    }
    return (
      <div className="bg-brand-cream flex min-h-screen flex-col">
        <SiteHeader />
        <main id="contenido" tabIndex={-1} className="flex flex-1 flex-col">
          <StudioTextsProvider texts={texts}>
            <NameEditor
              product={{ id: product.id, slug: product.slug, name: product.name }}
              // Ola 32 — mini avatar del header sticky unificado (fallback al mascote).
              productImageUrl={product.images[0]}
              variantId={selectedVariant.id}
              // 2026-09-25 — flag Con/Sin imán de la variante para que la modal
              // de confirmación nombre bien la pieza (imán vs ficha).
              variantMagnet={parseVariantAttributes(selectedVariant.attributes).magnet}
              // Paquete F (2026-10-02) — desglose de la variante (fija en esta
              // superficie) para el resumen de la vista previa.
              variantLabel={
                describeVariantAttributes(parseVariantAttributes(selectedVariant.attributes)).join(
                  " · ",
                ) || undefined
              }
              config={surface.config}
              pricePerTile={pricePerTile}
              initialCount={initialCount}
              styles={styles}
              themeOptions={themeOptions}
              // ?copies=N (stepper "Unidades" de la PDP) → la modal de
              // "Vista previa" lo confirma tal cual (igual que letterset y el
              // editor de foto).
              initialCopies={initialCopies}
              // ?designId= (re-apertura) → opción de borde guardada en el diseño.
              initialWithBorder={initialWithBorder}
              // ?designId= (re-apertura) → nombre, estilo y colores persistidos.
              initialName={initialName}
              initialStyleId={initialStyleId}
              initialThemeId={initialThemeId}
              initialColors={initialColors}
              // Edición desde el carrito: la línea que apuntaba al diseño original se
              // reemplaza en sitio al confirmar (no duplicar).
              replacesCartDesignId={replacesCartDesignId}
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
    // Re-abrir un diseño guardado (?designId= — "Editar" desde el carrito): hay que
    // devolverle al editor TODO lo persistido en Design.metadata (idioma, estilo
    // ilustrado, borde, nº de sets y los colores por ficha de CADA set); sin esto la
    // rama ni siquiera leía el designId y el Estudio abría siempre en blanco. El editor
    // nunca reusa el id: al confirmar crea un diseño NUEVO, así que acá solo se LEE el
    // metadata del diseño (sin clonar — mismo criterio que la superficie "name") y se
    // propaga `replacesCartDesignId` para que el carrito REEMPLACE la línea vieja en
    // sitio (sin duplicar).
    let recoveredLanguage: "es" | "en" | undefined;
    let recoveredStyleId: string | null | undefined;
    let recoveredWithBorder: boolean | undefined;
    let recoveredUnits: number | undefined;
    let recoveredThemeId: string | undefined;
    let recoveredUnitColors: string[][] | undefined;
    let replacesCartDesignId: string | null = null;
    if (recoverDesign) {
      const meta = recoverDesign.metadata as Record<string, unknown> | null;
      if (meta && meta.surface === "letterset") {
        // Solo un diseño READY puede estar referenciado por una línea del carrito
        // (el alta exige READY) → solo ahí hay algo que reemplazar.
        if (recoverDesign.status === "READY") replacesCartDesignId = recoverDesign.id;
        if (meta.language === "es" || meta.language === "en") recoveredLanguage = meta.language;
        if (typeof meta.withBorder === "boolean") recoveredWithBorder = meta.withBorder;
        if (typeof meta.frameTheme === "string") recoveredThemeId = meta.frameTheme;
        if (meta.styleSetId === null) {
          recoveredStyleId = null;
        } else if (typeof meta.styleSetId === "string") {
          // Se valida contra los sets del idioma recuperado más abajo (aún no cargados).
          recoveredStyleId = meta.styleSetId;
        }
        // Colores por set: units[u].colors (multi-unidad 2026-09-09); el set 0 cae al
        // `colors` raíz (diseños de UN set, que no escriben units).
        const baseColors = Array.isArray(meta.colors)
          ? meta.colors.filter((c): c is string => typeof c === "string")
          : [];
        const unitsMeta = Array.isArray(meta.units) ? meta.units : [];
        const unitCount =
          typeof meta.unitCount === "number" && Number.isFinite(meta.unitCount)
            ? Math.max(1, Math.trunc(meta.unitCount))
            : 1;
        recoveredUnits = unitCount;
        recoveredUnitColors = Array.from({ length: unitCount }, (_, u) => {
          const raw = (unitsMeta[u] as { colors?: unknown } | undefined)?.colors;
          if (Array.isArray(raw)) return raw.filter((c): c is string => typeof c === "string");
          return u === 0 ? baseColors : [];
        });
      }
    }
    const initialLanguage = recoveredLanguage ?? (variantAttrs.language === "en" ? "en" : "es");
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
    // El estilo recuperado solo se acepta si el set sigue existiendo en el idioma
    // restaurado (un set borrado cae al default, nunca a un id colgado).
    if (typeof recoveredStyleId === "string") {
      const stylesForLang = initialLanguage === "en" ? stylesEn : stylesEs;
      if (!stylesForLang.some((s) => s.id === recoveredStyleId)) recoveredStyleId = undefined;
    }
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
              // Ola 32 — mini avatar del header sticky unificado (fallback al mascote).
              productImageUrl={product.images[0]}
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
              // ?copies=N (stepper "Unidades" de la PDP, modelo multi-unidad
              // 2026-09-09) → N sets a diseñar, cada uno con sus colores. Al
              // re-abrir (?designId=) manda el nº de sets GUARDADO en el diseño.
              initialUnits={recoveredUnits ?? initialCopies}
              // ?designId= (re-apertura) → selección persistida del diseño.
              initialStyleId={recoveredStyleId}
              initialWithBorder={recoveredWithBorder}
              initialColorTheme={recoveredThemeId}
              initialUnitColors={recoveredUnitColors}
              // Edición desde el carrito: la línea que apuntaba al diseño original se
              // reemplaza en sitio al confirmar (no duplicar).
              replacesCartDesignId={replacesCartDesignId}
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

  // ADR-057 B2 — diseños prediseñados de la galería. Default-on (2026-09-09,
  // owner): si el producto NO declara `galleryTag` explícito, el tag cae por
  // convención a su slug — TODA superficie de foto ofrece la galería (el
  // picker/sidebar muestran la sección cuando hay diseños del tag; sin uploads
  // del admin la lista llega vacía = empty state). El admin ve el mismo tag
  // efectivo en /admin/disenos (listGalleryTagOptions aplica el mismo fallback).
  // Paquete D (2026-10-02): la resolución vive en lib/product-kind — el MISMO
  // helper usa el editor (isBookmark) para que el tipo de producto no dependa
  // de dónde se lea.
  // Fase 5 (2026-10-02): la carga (`listGalleryImages`) va más abajo, ya con
  // los attributes de la variante EFECTIVA, para filtrar por variantFilter.
  const galleryTag = resolveGalleryTag(mergedSchema, product.slug);

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
    photoSlots: photoConfig.photoSlots,
  });
  const templates = templatesRaw.map((t) => ({
    ...t,
    canvasData: t.canvasData as unknown as import("./types").CanvasDataV1,
  }));

  // N-08 (2026-09-11) — consumidor real de `?template=<slug>` (lo genera el
  // TemplatesStrip de la PDP; el parámetro se declaraba acá pero NADIE lo leía y
  // el boot siempre arrancaba con la primera plantilla). Se resuelve contra la
  // MISMA lista que verá el sidebar — listTemplatesForKind ya validó isActive,
  // deletedAt:null, kind del producto, producto-o-global, mode EDITABLE y aspect
  // — así que un match acá es una plantilla plenamente válida para el boot.
  // Slug inválido/inexistente → null sin error visible: el editor arranca con la
  // primera plantilla, como siempre. El recover flow (?designId=) manda: el
  // canvas guardado del diseño es la SoT y este id solo aplica a drafts NUEVOS.
  const initialTemplateId =
    typeof sp.template === "string"
      ? (templates.find((t) => t.slug === sp.template)?.id ?? null)
      : null;

  // Recover flow: si pasaron ?designId=, levantar el Design existente
  let initialDesignId: string | null = null;
  let initialDesignCanvas: CanvasData | null = null;
  let initialDesignAssets: StudioAsset[] = [];
  // Edición desde el carrito (auditoría 2026-07-13): id del diseño original a reemplazar en el
  // carrito al finalizar (evita duplicar el item).
  let replacesCartDesignId: string | null = null;

  if (sp.designId && recoverOwner) {
    const owner = recoverOwner;
    let design = recoverDesign;
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

  // ── Lucy 2026-09-05 — packs de fotoimanes: N de fotos en el Estudio ──
  // Catálogo elegible para el stepper "¿Cuántas fotos lleva tu imán?": las
  // variantes que declaran photoSlots, con precio resuelto (override o base).
  // El N y el tamaño EFECTIVOS los manda el diseño recuperado (canvasData
  // guardado) sobre el variant del deep-link: al re-abrir un pack en el Estudio
  // (flujo "Editar") el control arranca con el N del diseño y las medidas
  // mostradas son las de su tamaño.
  const designPackInfo = readPhotoPackDesignInfo(initialDesignCanvas);
  const effectivePhotoSlots = designPackInfo?.photoSlots ?? photoConfig.photoSlots;
  const effectiveSizeCm = designPackInfo?.sizeCm ?? photoConfig.sizeCm;
  // "¿Con imán?" (Lucy 2026-09-08 — también en los packs de foto): la elección
  // la hace la PDP (dimensión `magnet` de la variante del deep-link) y viaja en
  // el mergedSchema; al re-abrir un diseño ("Editar" desde el carrito) manda el
  // magnet GUARDADO en su canvasData — misma precedencia que photoSlots/sizeCm.
  const schemaMagnet = (mergedSchema as { magnet?: unknown }).magnet;
  const effectiveMagnet =
    designPackInfo?.magnet ?? (typeof schemaMagnet === "boolean" ? schemaMagnet : undefined);
  const selectable = selectableVariants(product.variants);
  const packCatalog = selectable
    .map((v) => {
      const a = parseVariantAttributes(v.attributes);
      return {
        photoSlots: a.photoSlots,
        sizeCm: a.sizeCm,
        magnet: a.magnet,
        price: v.price ?? product.basePrice,
      };
    })
    .filter(
      (
        v,
      ): v is {
        photoSlots: number;
        sizeCm: string | undefined;
        magnet: boolean | undefined;
        price: number;
      } => v.photoSlots != null,
    );
  // Solo PHOTO_PACK con catálogo de fotos: calendarios/grid/custom quedan intactos.
  const isPhotoPackStudio = product.personalizationKind === "PHOTO_PACK" && packCatalog.length > 0;
  // Filtrado al tamaño efectivo: el stepper ofrece 1..max fotos DE ESE tamaño.
  const packVariants = isPhotoPackStudio
    ? packCatalog.filter((v) => v.sizeCm === undefined || v.sizeCm === effectiveSizeCm)
    : [];

  // Fase 5 (2026-10-02) — la galería se filtra server-side por los attributes
  // de la variante elegida (?variant= o la primera): un diseño con
  // variantFilter {sizeCm:"2×6"} solo se ofrece si la variante es 2×6 (más los
  // diseños sin filtro, que aplican a todas). En packs el tamaño EFECTIVO lo
  // manda el diseño recuperado (canvasData) sobre el del deep-link — misma
  // precedencia que photoSlots/magnet — así el filtro sigue la variante real
  // que se está editando. El picker/sidebar reciben la lista YA filtrada
  // (cero cambios en el cliente).
  const galleryVariantAttributes: Record<string, unknown> = {
    ...(selectedVariant ? parseVariantAttributes(selectedVariant.attributes) : {}),
    ...(effectiveSizeCm ? { sizeCm: effectiveSizeCm } : {}),
  };
  const predesigned = await listGalleryImages(galleryTag, galleryVariantAttributes);

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
              // M.3.b.CAT.4 — pasar mergedSchema (variant attributes sobre base);
              // Lucy 2026-09-05 — packs: photoSlots/sizeCm EFECTIVOS (del diseño
              // recuperado si existe) para que el editor muestre el N y la medida
              // correctos desde el primer paint.
              personalizationSchema: {
                ...mergedSchema,
                ...(isPhotoPackStudio
                  ? {
                      photoSlots: effectivePhotoSlots,
                      ...(effectiveSizeCm ? { sizeCm: effectiveSizeCm } : {}),
                    }
                  : {}),
              },
              images: product.images,
            }}
            // M.3.b.CAT — variant elegido en PDP, propagado al cart al finalizar
            // (NO para packs: el carrito resuelve la variante desde el diseño).
            variantId={selectedVariant?.id}
            // Precio de la variante elegida (o base) → fallback de la vista previa.
            unitPriceCents={selectedVariant?.price ?? product.basePrice}
            // ?copies=N (stepper "Unidades" de la PDP, modelo multi-unidad
            // 2026-09-09) → unidades A DISEÑAR: el Estudio abre con N unidades
            // (cada una editable; la Vista previa las muestra todas; el carrito
            // recibe 1 línea con el diseño completo). El editor las acota al
            // máximo del producto (slotCount ≤ 50); sin parámetro = 1.
            initialUnits={initialCopies}
            // Edición desde el carrito: reemplazar el item original al finalizar (no duplicar).
            replacesCartDesignId={replacesCartDesignId}
            templates={templates}
            // N-08 — ?template=<slug> de la PDP: el draft nuevo arranca con ESA
            // plantilla (el servidor la re-valida en createDraftDesign).
            initialTemplateId={initialTemplateId}
            initialDesignId={initialDesignId}
            initialDesignCanvas={initialDesignCanvas}
            initialDesignAssets={initialDesignAssets}
            photoSlots={effectivePhotoSlots}
            // Lucy 2026-09-05 — catálogo del stepper de N fotos (packs; vacío = no pack).
            packVariants={packVariants}
            // Lucy 2026-09-08 — "¿Con imán?" de la PDP (o del diseño recuperado):
            // el Estudio lo persiste en el canvasData y lo muestra read-only.
            initialMagnet={effectiveMagnet}
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
