/*
 * /productos/[categoria]/[subcategoria] — PLAN_CATALOG_V2 1.3 + 1.4.
 *
 * Página de sub-categoría con grid de productos. SEO específico.
 * Sub-cat invisible si Category.isActive=false o no existe.
 */

import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getCategoryBySlug, listCatalogProducts, getCatalogProductDetail } from "@/lib/catalog";
import type { CatalogProductSummary } from "@/lib/catalog";
import { ProductFromCatalogCard } from "@/components/product-from-catalog-card";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbList, collectionPage } from "@/lib/seo/structured-data";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CategoryIntro } from "@/components/category-intro";

export async function generateMetadata(
  { params }: { params: Promise<{ categoria: string; subcategoria: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { categoria, subcategoria } = await params;
  const cat = await getCategoryBySlug(subcategoria);
  // Auditoría SEO 2026-10-28 — los guards de existencia/estado/jerarquía se replican
  // acá (además del body del page) para decidir el 404/308 ANTES de que la metadata
  // confirme el stream con 200; si no, Next solo puede emitir meta refresh + noindex
  // (soft 404 / redirect blando, ver nota en el page).
  if (!cat || !cat.isActive || !cat.parentSlug) notFound();
  if (cat.parentSlug !== categoria) {
    permanentRedirect(`/productos/${cat.parentSlug}/${subcategoria}`);
  }
  // #23 — canonical desde el padre REAL (no el segmento crudo): un acceso con el padre incorrecto
  // igual canoniza a la URL válida. La validación/redirect vive en el body del page.
  const canonicalParent = cat.parentSlug;
  // #25 — heredar las imágenes OG del layout (el merge shallow de Next las borraría al declarar
  // un openGraph propio). CategoryNode.image se antepone si existe.
  const previousImages = (await parent).openGraph?.images ?? [];
  const ogImages = cat.image
    ? [{ url: cat.image, alt: cat.name }, ...previousImages]
    : previousImages;
  return {
    // #27 — solo el nombre; el template global añade "· Lucams Shop" una vez.
    title: cat.name,
    description:
      cat.richDescription?.slice(0, 160) ??
      cat.description ??
      `Imanes magnéticos personalizados — ${cat.name} Colombia`,
    // Canonical self-referencial (auditoría 2026-07-17): sin esto, accesos con utm_*/fbclid podían
    // indexarse como variantes duplicadas.
    alternates: { canonical: `/productos/${canonicalParent}/${subcategoria}` },
    openGraph: {
      title: cat.name,
      description: cat.richDescription?.slice(0, 200) ?? cat.description ?? cat.name,
      type: "website",
      siteName: "Lucams Shop",
      locale: "es_CO",
      images: ogImages,
    },
  };
}

export default async function SubCategoryPage({
  params,
}: {
  params: Promise<{ categoria: string; subcategoria: string }>;
}) {
  const { categoria, subcategoria } = await params;

  const subCat = await getCategoryBySlug(subcategoria);
  if (!subCat || !subCat.isActive) notFound();
  // #23 — validar la ruta padre/hijo: una raíz accedida como subcat no es una URL válida; un padre
  // incorrecto redirige a la ruta correcta en vez de renderizar un breadcrumb roto y URLs
  // duplicadas infinitas indexables. El destino usa el parentSlug real → no hay loop.
  //
  // Nota (Next 16): estos mismos guards corren primero en generateMetadata (auditoría SEO
  // 2026-10-28), así que el 404/308 se decide antes de confirmar el stream. Los guards de acá
  // quedan como respaldo: si el body los alcanzara tras el commit del stream, Next solo puede
  // emitir meta refresh + noindex (streaming.md).
  if (!subCat.parentSlug) notFound();
  if (subCat.parentSlug !== categoria) {
    permanentRedirect(`/productos/${subCat.parentSlug}/${subcategoria}`);
  }

  const parentCat = await getCategoryBySlug(categoria);

  const products = await listCatalogProducts({
    subCategorySlug: subcategoria,
    sort: (subCat.defaultSort as "recent" | "price_asc" | "price_desc" | "featured") ?? "recent",
    limit: 48,
  });

  // Category.featuredProductSlug: el destacado de la sub-categoría va PRIMERO
  // en el grid con badge "Destacado", sin importar el defaultSort (ambos son
  // curaduría de la misma categoría; acá no hay control de orden del cliente).
  // Si no está en el lote (p. ej. más allá del limit 48), se valida con el
  // detalle cacheado; slug inválido/archivado/de otra categoría → se ignora
  // en silencio (fallback al listado normal).
  let displayProducts = products;
  if (subCat.featuredProductSlug) {
    const featuredSlug = subCat.featuredProductSlug;
    const inBatch = products.find((p) => p.slug === featuredSlug);
    let featured: CatalogProductSummary | null = inBatch ?? null;
    if (!featured) {
      const detail = await getCatalogProductDetail(featuredSlug);
      // El detalle viene con el gate storefront (F-04); pertenencia = su
      // categoría directa es esta sub-categoría.
      if (detail && detail.categorySlug === subcategoria) featured = detail;
    }
    if (featured) {
      displayProducts = [
        { ...featured, categoryFeatured: true },
        ...products.filter((p) => p.slug !== featuredSlug),
      ];
    }
  }

  // JSON-LD (auditoría 2026-07-17): BreadcrumbList (Inicio→Productos→[categoría]→subcategoría) +
  // CollectionPage/ItemList de los productos visibles.
  const subPath = `/productos/${categoria}/${subcategoria}`;
  const crumbs = [
    { name: "Inicio", path: "/" },
    { name: "Productos", path: "/productos" },
    ...(parentCat
      ? [{ name: parentCat.name, path: `/productos?categoria=${parentCat.slug}` }]
      : []),
    { name: subCat.name, path: subPath },
  ];
  const jsonLdData = [
    breadcrumbList(crumbs),
    collectionPage({
      name: subCat.name,
      path: subPath,
      description: subCat.description ?? undefined,
      products: displayProducts.map((p) => ({ name: p.name, slug: p.slug })),
    }),
  ];

  return (
    <div className="bg-brand-cream flex min-h-screen flex-col">
      <JsonLd data={jsonLdData} />
      <SiteHeader />
      <main id="contenido" tabIndex={-1} className="flex-1">
        <section className="from-brand-cream to-brand-pink/5 bg-gradient-to-br py-8 md:py-12">
          <div className="mx-auto max-w-6xl px-6">
            <nav aria-label="Breadcrumb" className="text-brand-muted mb-4 text-sm">
              <Link href="/" className="hover:text-brand-purple">
                Inicio
              </Link>
              <span className="mx-2">›</span>
              <Link href="/productos" className="hover:text-brand-purple">
                Productos
              </Link>
              {parentCat && (
                <>
                  <span className="mx-2">›</span>
                  <Link
                    href={`/productos?categoria=${parentCat.slug}`}
                    className="hover:text-brand-purple"
                  >
                    {parentCat.name}
                  </Link>
                </>
              )}
              <span className="mx-2">›</span>
              <span className="font-semibold">{subCat.name}</span>
            </nav>

            <h1 className="text-brand-purple-dark text-3xl font-bold md:text-4xl">{subCat.name}</h1>
            {/* 2026-10-29 — mismo criterio que la vista de categoría raíz: en
                móvil el intro va colapsado con «Leer más» (CategoryIntro). */}
            {subCat.description && (
              <CategoryIntro description={subCat.description} useCase={subCat.useCase} />
            )}
            <p className="mt-3 text-sm text-slate-500">
              {subCat.productCount} {subCat.productCount === 1 ? "producto" : "productos"}{" "}
              disponibles
            </p>
          </div>
        </section>

        <section className="py-10">
          <div className="mx-auto max-w-6xl px-6">
            {displayProducts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <Sparkles className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 font-medium text-slate-700">
                  Pronto tendremos productos en {subCat.name}.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Mientras tanto, explora{" "}
                  <Link href="/productos" className="text-brand-purple underline">
                    todo el catálogo
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {displayProducts.map((p) => (
                  <ProductFromCatalogCard key={p.slug} product={p} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Descripción rica como SEO + bot context */}
        {subCat.richDescription && (
          <section className="border-t border-slate-200 bg-white py-10">
            <div className="mx-auto max-w-3xl px-6">
              <h2 className="text-brand-purple-dark mb-3 text-lg font-bold">Sobre {subCat.name}</h2>
              <div className="text-sm leading-relaxed whitespace-pre-line text-slate-600">
                {subCat.richDescription}
              </div>
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
