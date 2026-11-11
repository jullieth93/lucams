export const CHRISTMAS_ORNAMENT_SLUG = "bola-navidena-personalizada";
export const MINI_BOOK_SLUG = "mini-libros-magneticos";

export const MINI_BOOK_SIZES = [
  {
    key: "grande",
    label: "Grande",
    sizeCm: "7.1×5",
    aspectRatio: "7.1:5",
    width: 710,
    height: 500,
  },
  {
    key: "pequeno",
    label: "Pequeño",
    sizeCm: "5×2.5",
    aspectRatio: "2:1",
    width: 500,
    height: 250,
  },
];

const sharedExperience = {
  freeUnitDesign: true,
  volumePricingByPhysicalUnit: true,
};

export const NEW_PRODUCT_COMMERCIAL = {
  basePrice: 1_000_000,
  isActive: true,
  physicalSpecs: {
    weightGrams: 200,
    widthCm: 8,
    heightCm: 8,
    depthCm: 8,
  },
  wholesaleTiers: [
    { minQty: 3, unitPrice: 900_000, note: "Promoción por cantidad" },
    { minQty: 5, unitPrice: 800_000, note: "Promoción por cantidad" },
  ],
};

export const NEW_PRODUCTS = [
  {
    slug: CHRISTMAS_ORNAMENT_SLUG,
    sku: "NAV-BOLA-8",
    name: "Bola Navideña Personalizada",
    ...NEW_PRODUCT_COMMERCIAL,
    description:
      "Un inserto circular plano dúplex de 8 cm dentro de una esfera transparente. Elige plantillas o sube tus diseños para el frente y el reverso, revisa cómo se ven al girar y personaliza cada bola por separado. Disponible sin imán o con imán: con imán, los 2 diseños (frente y reverso) van imantados cada uno.",
    compareAtPrice: null,
    categorySlug: "de-temporada",
    isPersonalizable: true,
    isFeatured: false,
    personalizationKind: "CUSTOM_DECOR",
    personalizationSchema: {
      photoSlots: 1,
      facesPerUnit: 2,
      backOptional: false,
      aspectRatio: "1:1",
      sizeCm: "8",
      shape: "circle",
      finish: "glossy",
      allowText: true,
      galleryTag: CHRISTMAS_ORNAMENT_SLUG,
      experience: "christmas-ornament",
      ...sharedExperience,
    },
    images: ["/products/bola-navidena.webp"],
    seoTitle: "Bola Navideña Personalizada con tu foto | Lucams Shop",
    seoDescription:
      "Crea una bola navideña dúplex con tus fotos de frente y reverso en un inserto circular plano de 8 cm, con imán o sin imán, y revisa su vista 3D.",
    idealFor: ["regalo navidad familia", "decoración árbol navidad", "recuerdo fin de año"],
    variants: [
      {
        sku: "NAV-BOLA-8CM-NOMAG",
        name: "Foto circular de 8 cm · Sin imán",
        price: NEW_PRODUCT_COMMERCIAL.basePrice,
        attributes: {
          shape: "circle",
          magnet: false,
          sizeCm: "8",
          quantity: 1,
          photoSlots: 1,
          aspectRatio: "1:1",
          variantShape: "foto-plana-en-esfera",
        },
      },
      {
        // 2026-11-11 (owner): la bola también se vende CON imán (+$1.000). Con
        // imán los 2 diseños (frente y reverso) van imantados cada uno. Las
        // promos por volumen (3×$27.000 / 5×$40.000) son a nivel producto y
        // aplican igual a ambas variantes (decisión del owner).
        sku: "NAV-BOLA-8CM-MAG",
        name: "Foto circular de 8 cm · Con imán",
        price: 1_100_000,
        attributes: {
          shape: "circle",
          magnet: true,
          sizeCm: "8",
          quantity: 1,
          photoSlots: 1,
          aspectRatio: "1:1",
          variantShape: "foto-plana-en-esfera",
        },
      },
    ],
  },
  {
    slug: MINI_BOOK_SLUG,
    sku: "MINI-LIBRO",
    name: "Mini Libros Magnéticos",
    ...NEW_PRODUCT_COMMERCIAL,
    // 2026-11-11 (owner): el catálogo ACTIVO de referencia es el de PRD + la
    // bola navideña; los mini libros quedan sembrados pero INACTIVOS en
    // ambientes frescos hasta nueva decisión comercial (el update del seed
    // nunca toca isActive — en STG/PRD el estado vivo manda).
    isActive: false,
    description:
      "Mini libros decorativos con carátula envolvente personalizada: contraportada, lomo y portada. Tamaño grande extendido de 7,1 × 5 cm o pequeño extendido de 5 × 2,5 cm; ambos con 0,5 cm de grosor. Disponibles con imán o sin imán.",
    compareAtPrice: null,
    categorySlug: "recuerdos",
    isPersonalizable: true,
    isFeatured: false,
    personalizationKind: "CUSTOM_DECOR",
    personalizationSchema: {
      photoSlots: 1,
      aspectRatio: "7.1:5",
      sizeCm: "7.1×5",
      shape: "rectangle",
      allowText: true,
      galleryTag: MINI_BOOK_SLUG,
      experience: "mini-book",
      spineWidthCm: 0.5,
      ...sharedExperience,
    },
    images: ["/products/mini-libros-magneticos.webp"],
    seoTitle: "Mini Libros Personalizados con imán o sin imán | Lucams Shop",
    seoDescription:
      "Diseña un mini libro con portada, lomo y contraportada coordinados, o elige un prediseñado. Dos tamaños.",
    idealFor: ["regalo para lectores", "detalle literario personalizado", "recuerdo para eventos"],
    variants: MINI_BOOK_SIZES.flatMap((size) =>
      [true, false].map((magnet) => ({
        sku: `ML-${size.key === "grande" ? "71X50" : "50X25"}${magnet ? "" : "-NOMAG"}`,
        name: `${size.label} · ${size.sizeCm.replace("×", " × ")} cm extendido · ${magnet ? "Con imán" : "Sin imán"}`,
        price: NEW_PRODUCT_COMMERCIAL.basePrice,
        attributes: {
          shape: "rectangle",
          magnet,
          sizeCm: size.sizeCm,
          quantity: 1,
          photoSlots: 1,
          aspectRatio: size.aspectRatio,
          variantShape: "caratula-envolvente",
        },
      })),
    ),
  },
];

const text = (id, x, y, value, options = {}) => ({
  id,
  type: "text",
  x,
  y,
  text: value,
  fontFamily: "Fredoka",
  fontSize: options.fontSize ?? 32,
  fill: options.fill ?? "#3D2E5C",
  fontWeight: options.fontWeight ?? "bold",
  align: "center",
  editable: true,
  ...(options.width ? { width: options.width } : {}),
  ...(options.rotation ? { rotation: options.rotation } : {}),
  ...(options.allowOnShape ? { allowOnShape: true } : {}),
});

const background = (color) => ({ id: "background", type: "background", color });
const photo = (x, y, width, height, label, cornerRadius = 0) => ({
  id: "p1",
  type: "image-placeholder",
  x,
  y,
  width,
  height,
  cornerRadius,
  label,
});
const asset = (src, width, height) => ({
  id: "artwork",
  type: "asset",
  src,
  x: 0,
  y: 0,
  width,
  height,
  rotation: 0,
  opacity: 1,
});
const stage = (width, height) => ({ width, height, dpiPreview: 90, dpiProduction: 300 });

function miniTemplate(size, style, productId) {
  const small = size.key === "pequeno";
  const coverX = size.key === "grande" ? 380 : 275;
  const spineX = size.key === "grande" ? 355 : 250;
  const inset = small ? 10 : 16;
  const photoHeight = small ? 154 : 350;
  const titleY = small ? 202 : 421;
  const authorY = small ? 229 : 468;
  const backX = small ? 14 : 24;
  const backWidth = size.key === "grande" ? 282 : 197;
  const art = `mini-libro-${style}-${size.key}`;
  return {
    slug: `${art}-asistido`,
    productId,
    kind: "CUSTOM_DECOR",
    name: `${style === "clasico" ? "Tu foto · Clásico" : "Tu foto · Fantasía"} · ${size.label}`,
    order: style === "clasico" ? 1 : 2,
    previewUrl: `/templates/${art}-preview.svg`,
    canvasData: {
      version: 1,
      stage: stage(size.width, size.height),
      layers: [
        background(style === "clasico" ? "#FFF8F0" : "#3D2E5C"),
        photo(
          coverX + inset,
          inset,
          size.width - coverX - inset * 2,
          photoHeight,
          "Foto para la portada",
        ),
        asset(`/templates/${art}.svg`, size.width, size.height),
        text("title", coverX + inset, titleY, "Título de tu historia", {
          fontSize: small ? 20 : 30,
          width: size.width - coverX - inset * 2,
          fill: style === "clasico" ? "#3D2E5C" : "#FFD93D",
        }),
        text("spine_title", spineX, size.height / 2, "Título de tu historia", {
          fontSize: small ? 14 : 22,
          width: size.height - inset * 2,
          rotation: -90,
          fill: style === "clasico" ? "#3D2E5C" : "#FFD93D",
        }),
        text("author", coverX + inset, authorY, "Tu nombre o dedicatoria", {
          fontSize: small ? 11 : 16,
          width: size.width - coverX - inset * 2,
          fontWeight: "normal",
          fill: style === "clasico" ? "#7C6AAD" : "#FFF8F0",
        }),
        text(
          "back_message",
          backX + backWidth / 2,
          size.height / 2,
          "Una dedicatoria para la contraportada",
          {
            fontSize: small ? 13 : 22,
            width: backWidth,
            fontWeight: "normal",
            fill: style === "clasico" ? "#7C6AAD" : "#FFF8F0",
          },
        ),
      ],
    },
  };
}

function fullWrapTemplate(size, productId) {
  return {
    slug: `mini-libro-completo-${size.key}`,
    productId,
    kind: "CUSTOM_DECOR",
    name: `Carátula completa · ${size.label}`,
    order: 3,
    previewUrl: `/templates/mini-libro-completo-${size.key}-preview.svg`,
    canvasData: {
      version: 1,
      stage: stage(size.width, size.height),
      layers: [
        background("#FFFFFF"),
        photo(0, 0, size.width, size.height, "Carátula completa: contraportada, lomo y portada"),
      ],
    },
  };
}

function ornamentTemplate(style, productId, order) {
  const simple = style === "foto-circular";
  const names = {
    "foto-circular": "Foto circular",
    nieve: "Nieve y estrellas",
    luces: "Luces de Navidad",
    reno: "Reno kawaii",
  };
  return {
    slug: `bola-navidena-${style}`,
    productId,
    kind: "CUSTOM_DECOR",
    name: names[style],
    order,
    previewUrl: `/templates/bola-navidena-${style}-preview.svg`,
    canvasData: {
      version: 1,
      stage: stage(800, 800),
      layers: [
        background("#FFFFFF"),
        photo(0, 0, 800, 800, simple ? "Tu foto circular" : "Foto para tu bola navideña"),
        ...(simple ? [] : [asset(`/templates/bola-navidena-${style}.svg`, 800, 800)]),
        ...(simple
          ? []
          : [
              text("message", 400, 690, style === "nieve" ? "Navidad 2026" : "Mi familia", {
                fontSize: 48,
                width: 560,
                allowOnShape: true,
                fill: style === "luces" ? "#FFD93D" : "#3D2E5C",
              }),
            ]),
      ],
    },
  };
}

export function buildNewProductTemplates(productIds) {
  const ornamentId = productIds[CHRISTMAS_ORNAMENT_SLUG] ?? null;
  const miniBookId = productIds[MINI_BOOK_SLUG] ?? null;
  return [
    // 2026-11-07 (owner): la bola ofrece SOLO «Foto circular» — nieve/luces/reno
    // eran «muy básicos» y salen del catálogo (soft-delete en STG/LOCAL; un
    // diseño más elaborado llega después). ornamentTemplate conserva el
    // machinery de estilos para esa futura plantilla.
    ...["foto-circular"].map((style, index) => ornamentTemplate(style, ornamentId, index + 1)),
    ...MINI_BOOK_SIZES.flatMap((size) => [
      miniTemplate(size, "clasico", miniBookId),
      miniTemplate(size, "fantasia", miniBookId),
      fullWrapTemplate(size, miniBookId),
    ]),
  ];
}

const MINI_BOOK_THEMES = [
  {
    key: "bosque",
    name: "Bosque Encantado · Fantasía",
    title: "Bosque encantado",
    motif: "forest",
    bg: "#183F38",
    accent: "#A8E6CF",
    ink: "#FFF8F0",
  },
  {
    key: "amor",
    name: "Amor entre Páginas · Romance",
    title: "Amor entre páginas",
    motif: "heart",
    bg: "#8E2F59",
    accent: "#FFB8D9",
    ink: "#FFF8F0",
  },
  {
    key: "misterio",
    name: "Detective Nocturno · Misterio",
    title: "Detective nocturno",
    motif: "mystery",
    bg: "#17233C",
    accent: "#FFD93D",
    ink: "#FFF8F0",
  },
  {
    key: "exploradores",
    name: "Pequeños Exploradores · Infantil",
    title: "Pequeños exploradores",
    motif: "balloon",
    bg: "#5DD9D1",
    accent: "#FFD93D",
    ink: "#3D2E5C",
  },
  {
    key: "navidad",
    name: "Navidad en Casa · Navidad",
    title: "Navidad en casa",
    motif: "tree",
    bg: "#A62B3F",
    accent: "#F5E6A8",
    ink: "#FFF8F0",
  },
  {
    key: "espacio",
    name: "Aventura Espacial · Ciencia ficción",
    title: "Aventura espacial",
    motif: "rocket",
    bg: "#3D2E5C",
    accent: "#5DD9D1",
    ink: "#FFF8F0",
  },
  {
    key: "jardin",
    name: "Jardín de Versos · Poesía",
    title: "Jardín de versos",
    motif: "flower",
    bg: "#F4B8C8",
    accent: "#FFF8F0",
    ink: "#3D2E5C",
  },
  {
    key: "lectura",
    name: "Una Pausa para Leer · Minimalista",
    title: "Una pausa para leer",
    motif: "book",
    bg: "#F5E6A8",
    accent: "#7C6AAD",
    ink: "#3D2E5C",
  },
];

export const NEW_PRODUCT_GALLERY = [
  ...MINI_BOOK_THEMES.flatMap((theme, themeIndex) =>
    MINI_BOOK_SIZES.map((size, sizeIndex) => ({
      tag: MINI_BOOK_SLUG,
      name: `${theme.name} · ${size.label}`,
      fileBase: `mini-libro-${theme.key}-${size.key}`,
      sizeCm: size.sizeCm,
      width: size.width,
      height: size.height,
      order: themeIndex * 2 + sizeIndex,
      theme,
      product: "mini-book",
    })),
  ),
  ...[
    {
      key: "adviento",
      name: "Noche de Adviento",
      title: "Noche de adviento",
      motif: "stars",
      bg: "#243B69",
      accent: "#FFD93D",
      ink: "#FFF8F0",
    },
    {
      key: "dulce",
      name: "Dulce Navidad",
      title: "Dulce Navidad",
      motif: "candy",
      bg: "#E85B9F",
      accent: "#FFF8F0",
      ink: "#FFF8F0",
    },
    {
      key: "bosque-nevado",
      name: "Bosque Nevado",
      title: "Bosque nevado",
      motif: "tree",
      bg: "#B8DCE5",
      accent: "#FFFFFF",
      ink: "#3D2E5C",
    },
    {
      key: "estrella",
      name: "Estrella de Belén",
      title: "Estrella de Belén",
      motif: "star",
      bg: "#7C6AAD",
      accent: "#FFD93D",
      ink: "#FFF8F0",
    },
  ].map((theme, index) => ({
    tag: CHRISTMAS_ORNAMENT_SLUG,
    name: theme.name,
    fileBase: `bola-navidena-predisenado-${theme.key}`,
    sizeCm: "8",
    width: 800,
    height: 800,
    order: index,
    theme,
    product: "ornament",
  })),
];

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char],
  );

function motif(motifName, x, y, scale, color) {
  const common = `transform="translate(${x} ${y}) scale(${scale})"`;
  const paths = {
    heart: '<path d="M0 18 C-35-5-55 20 0 55 C55 20 35-5 0 18Z" fill="COLOR"/>',
    tree: '<path d="M0-45 32 0H15L40 35H10V60H-10V35H-40L-15 0H-32Z" fill="COLOR"/><rect x="-7" y="48" width="14" height="20" fill="#8B5A3C"/>',
    forest:
      '<path d="M-35-20 0 25H-15L5 55H-50L-25 20H-45ZM25-45 60 0H45L70 35H40V55H20V35H-5L15 0H0Z" fill="COLOR"/>',
    stars:
      '<path d="M0-45 10-12 45-10 17 10 27 45 0 25-27 45-17 10-45-10-10-12Z" fill="COLOR"/><circle cx="-42" cy="-28" r="6" fill="COLOR"/><circle cx="45" cy="38" r="5" fill="COLOR"/>',
    star: '<path d="M0-55 13-17 55-15 22 12 33 52 0 28-33 52-22 12-55-15-13-17Z" fill="COLOR"/>',
    mystery:
      '<circle cx="-8" cy="-8" r="32" fill="none" stroke="COLOR" stroke-width="12"/><path d="M16 16 55 55" stroke="COLOR" stroke-width="14" stroke-linecap="round"/>',
    balloon:
      '<ellipse cx="0" cy="-10" rx="34" ry="43" fill="COLOR"/><path d="M0 33-8 45H8ZM0 45C-25 65 25 70 0 90" fill="none" stroke="COLOR" stroke-width="4"/>',
    rocket:
      '<path d="M0-55C30-30 30 15 0 40-30 15-30-30 0-55Z" fill="COLOR"/><circle cx="0" cy="-15" r="10" fill="#3D2E5C"/><path d="M-15 30-35 50-12 45M15 30 35 50 12 45M-8 42 0 65 8 42" fill="COLOR"/>',
    flower:
      '<g fill="COLOR"><circle cx="0" cy="-25" r="22"/><circle cx="24" cy="-8" r="22"/><circle cx="15" cy="22" r="22"/><circle cx="-15" cy="22" r="22"/><circle cx="-24" cy="-8" r="22"/><circle cx="0" cy="0" r="14" fill="#FFD93D"/></g>',
    book: '<path d="M0-30C-20-45-45-45-60-35V35C-40 25-20 25 0 40 20 25 40 25 60 35V-35C45-45 20-45 0-30Z" fill="COLOR"/><path d="M0-30V40" stroke="#3D2E5C" stroke-width="4"/>',
    candy:
      '<path d="M-35-20-60-40V40L-35 20M35-20 60-40V40L35 20" fill="COLOR"/><rect x="-38" y="-28" width="76" height="56" rx="24" fill="COLOR"/><path d="M-20-24 20 24M0-28 38 12" stroke="#E85B9F" stroke-width="10"/>',
  };
  return `<g ${common}>${(paths[motifName] ?? paths.stars).replaceAll("COLOR", color)}</g>`;
}

function miniBookArt(item, preview = false) {
  const { width: w, height: h, theme } = item;
  const spineW = 50;
  const coverW = (w - spineW) / 2;
  const frontX = coverW + spineW;
  const small = h <= 250;
  const titleSize = small ? 25 : 42;
  const subSize = small ? 12 : 19;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="cover" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.bg}"/><stop offset="1" stop-color="${theme.accent}" stop-opacity=".72"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="${theme.bg}"/>
  <rect x="${frontX}" width="${coverW}" height="${h}" fill="url(#cover)"/>
  <rect x="${coverW}" width="${spineW}" height="${h}" fill="${theme.accent}" fill-opacity=".26"/>
  <path d="M${coverW} 0V${h}M${frontX} 0V${h}" stroke="${theme.ink}" stroke-opacity=".45" stroke-width="${small ? 2 : 3}"/>
  <rect x="${small ? 12 : 22}" y="${small ? 12 : 22}" width="${coverW - (small ? 24 : 44)}" height="${h - (small ? 24 : 44)}" rx="${small ? 8 : 14}" fill="none" stroke="${theme.accent}" stroke-width="${small ? 2 : 3}"/>
  ${motif(theme.motif, frontX + coverW / 2, h * 0.32, small ? 0.55 : 0.95, theme.accent)}
  <text x="${frontX + coverW / 2}" y="${h * 0.66}" text-anchor="middle" fill="${theme.ink}" font-family="Fredoka, sans-serif" font-size="${titleSize}" font-weight="700">${esc(theme.title.toUpperCase())}</text>
  <text x="${frontX + coverW / 2}" y="${h * 0.76}" text-anchor="middle" fill="${theme.ink}" fill-opacity=".86" font-family="Inter, sans-serif" font-size="${subSize}">UNA HISTORIA PARA REGALAR</text>
  <text x="${coverW / 2}" y="${h * 0.26}" text-anchor="middle" fill="${theme.ink}" font-family="Fredoka, sans-serif" font-size="${titleSize * 0.7}" font-weight="700">${esc((theme.name ?? "Mini libro").split(" · ")[1] ?? "MINI LIBRO")}</text>
  <text x="${coverW / 2}" y="${h * 0.38}" text-anchor="middle" fill="${theme.ink}" fill-opacity=".82" font-family="Inter, sans-serif" font-size="${subSize}">Recuerdos que se quedan</text>
  <text x="${coverW / 2}" y="${h * 0.82}" text-anchor="middle" fill="${theme.ink}" font-family="Fredoka, sans-serif" font-size="${subSize + 2}" font-weight="700">Lucams</text>
  <text transform="translate(${coverW + spineW / 2} ${h / 2}) rotate(-90)" text-anchor="middle" fill="${theme.ink}" font-family="Fredoka, sans-serif" font-size="${subSize + 3}" font-weight="700">${esc(theme.title.toUpperCase())}</text>
  ${preview ? `<rect x="${frontX + 8}" y="8" width="${coverW - 16}" height="${h - 16}" rx="8" fill="#FFF8F0" fill-opacity=".08"/>` : ""}
</svg>`;
}

function ornamentArt(item) {
  const { theme } = item;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="${theme.bg}"/>
  <circle cx="400" cy="400" r="385" fill="none" stroke="${theme.accent}" stroke-width="16"/>
  <circle cx="400" cy="400" r="350" fill="none" stroke="${theme.accent}" stroke-opacity=".4" stroke-width="4" stroke-dasharray="8 18"/>
  ${motif(theme.motif, 400, 290, 2.4, theme.accent)}
  <text x="400" y="570" text-anchor="middle" fill="${theme.ink}" font-family="Fredoka, sans-serif" font-size="64" font-weight="700">${esc(theme.title.toUpperCase())}</text>
  <text x="400" y="635" text-anchor="middle" fill="${theme.ink}" fill-opacity=".85" font-family="Inter, sans-serif" font-size="30">Un recuerdo para siempre</text>
  <text x="400" y="710" text-anchor="middle" fill="${theme.ink}" font-family="Fredoka, sans-serif" font-size="30" font-weight="700">Lucams</text>
</svg>`;
}

export function gallerySvg(item) {
  return item.product === "mini-book" ? miniBookArt(item) : ornamentArt(item);
}

export function templateSvg(template) {
  const src = template.canvasData.layers.find((layer) => layer.type === "asset")?.src;
  const base = src?.split("/").pop()?.replace(".svg", "") ?? template.slug;
  if (base.startsWith("mini-libro-")) {
    const size =
      MINI_BOOK_SIZES.find((candidate) => base.endsWith(candidate.key)) ?? MINI_BOOK_SIZES[0];
    const style = base.includes("fantasia") ? "fantasia" : "clasico";
    const theme =
      style === "fantasia"
        ? { bg: "#3D2E5C", accent: "#FFD93D", ink: "#FFF8F0", motif: "stars", title: "Tu historia" }
        : { bg: "#FFF8F0", accent: "#7C6AAD", ink: "#3D2E5C", motif: "book", title: "Tu historia" };
    if (base.includes("completo")) return miniBookArt({ ...size, theme }, true);
    const w = size.width;
    const h = size.height;
    const coverW = (w - 50) / 2;
    const frontX = coverW + 50;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="${w}" height="${h}" fill="${theme.bg}"/>
      <rect x="${frontX}" width="${coverW}" height="${h}" fill="${theme.accent}" fill-opacity=".12"/>
      <path d="M${coverW} 0V${h}M${frontX} 0V${h}" stroke="${theme.accent}" stroke-width="3" stroke-dasharray="10 6"/>
      <rect x="${frontX + 16}" y="16" width="${coverW - 32}" height="${h * 0.68}" rx="12" fill="${theme.accent}" fill-opacity=".18" stroke="${theme.accent}" stroke-width="3"/>
      ${motif(theme.motif, frontX + coverW / 2, h * 0.27, h <= 250 ? 0.5 : 0.9, theme.accent)}
      <path d="M${frontX + 30} ${h * 0.82}H${w - 30}M${frontX + 30} ${h * 0.9}H${w - 60}" stroke="${theme.accent}" stroke-width="5" stroke-linecap="round"/>
      <path d="M35 ${h * 0.38}H${coverW - 35}M35 ${h * 0.46}H${coverW - 55}M35 ${h * 0.54}H${coverW - 45}" stroke="${theme.accent}" stroke-width="4" stroke-linecap="round" opacity=".65"/>
    </svg>`;
  }
  const style = base.replace("bola-navidena-", "");
  const accent = style === "luces" ? "#FFD93D" : style === "reno" ? "#E85B9F" : "#7C6AAD";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    ${style === "nieve" ? '<path d="M0 0H800V150C680 110 620 180 510 130S300 180 190 120 50 160 0 130Z" fill="#FFF8F0"/><g fill="#7C6AAD"><circle cx="120" cy="210" r="10"/><circle cx="680" cy="190" r="8"/><circle cx="580" cy="90" r="7"/></g>' : ""}
    ${style === "luces" ? '<path d="M30 130Q400 20 770 130" fill="none" stroke="#3D2E5C" stroke-width="8"/><g fill="#FFD93D"><circle cx="100" cy="105" r="20"/><circle cx="260" cy="72" r="20"/><circle cx="430" cy="67" r="20"/><circle cx="600" cy="83" r="20"/><circle cx="730" cy="112" r="20"/></g>' : ""}
    ${style === "reno" ? '<g transform="translate(610 570)"><ellipse cx="0" cy="45" rx="85" ry="75" fill="#B77B52"/><circle cx="0" cy="-15" r="62" fill="#C98D62"/><circle cx="-20" cy="-20" r="7" fill="#3D2E5C"/><circle cx="20" cy="-20" r="7" fill="#3D2E5C"/><circle cx="0" cy="15" r="18" fill="#E85B9F"/><path d="M-35-65-70-110M35-65 70-110M-55-90-85-85M55-90 85-85" stroke="#8B5A3C" stroke-width="12" stroke-linecap="round"/></g>' : ""}
    <circle cx="400" cy="400" r="388" fill="none" stroke="${accent}" stroke-width="14"/>
  </svg>`;
}

export function productCoverSvg(slug) {
  if (slug === CHRISTMAS_ORNAMENT_SLUG) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000" viewBox="0 0 1200 1000"><rect width="1200" height="1000" fill="#FFF8F0"/><path d="M80 170Q400 80 760 180" stroke="#315D46" stroke-width="55" stroke-linecap="round" fill="none"/><path d="M610 155V280" stroke="#B79A78" stroke-width="10"/><rect x="570" y="245" width="80" height="70" rx="16" fill="#D4AF37"/><circle cx="610" cy="565" r="280" fill="#DDF3F5" fill-opacity=".5" stroke="#A8D5DC" stroke-width="12"/><circle cx="610" cy="565" r="218" fill="#7C6AAD"/><circle cx="610" cy="565" r="205" fill="#FFD93D"/><path d="M610 405 640 510 750 510 660 575 695 680 610 620 525 680 560 575 470 510 580 510Z" fill="#FFF8F0"/><path d="M420 400Q480 320 540 335" stroke="#FFFFFF" stroke-width="24" stroke-linecap="round" opacity=".75"/><text x="610" y="920" text-anchor="middle" fill="#3D2E5C" font-family="Fredoka, sans-serif" font-size="48" font-weight="700">Tu foto dentro de la esfera</text></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000" viewBox="0 0 1200 1000"><rect width="1200" height="1000" fill="#FFF8F0"/><ellipse cx="610" cy="790" rx="390" ry="65" fill="#3D2E5C" opacity=".12"/><path d="M330 250 810 250 900 320 900 770 330 770Z" fill="#3D2E5C"/><path d="M810 250 900 320V770L810 700Z" fill="#7C6AAD"/><path d="M330 250 810 250 810 700 330 700Z" fill="#E85B9F"/><path d="M350 280H780V670H350Z" fill="#FFF8F0" opacity=".16"/><path d="M380 740H850" stroke="#F5E6A8" stroke-width="12" stroke-dasharray="12 12"/><path d="M585 340 610 420 695 420 630 470 655 550 585 500 515 550 540 470 475 420 560 420Z" fill="#FFD93D"/><text x="565" y="620" text-anchor="middle" fill="#FFF8F0" font-family="Fredoka, sans-serif" font-size="48" font-weight="700">TU HISTORIA</text><text x="600" y="890" text-anchor="middle" fill="#3D2E5C" font-family="Fredoka, sans-serif" font-size="44" font-weight="700">Portada · lomo · contraportada</text></svg>`;
}

export function templatePreviewSvg(template) {
  if (template.slug.startsWith("bola-navidena-foto-circular")) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="#FFF8F0"/><circle cx="400" cy="400" r="350" fill="#A8D5DC"/><circle cx="400" cy="340" r="90" fill="#FFF8F0"/><path d="M210 650Q400 430 590 650" fill="#FFF8F0"/><circle cx="400" cy="400" r="385" fill="none" stroke="#7C6AAD" stroke-width="12"/></svg>`;
  }
  const art = templateSvg(template);
  if (template.slug.startsWith("bola-navidena-")) {
    return art.replace(
      '<rect width="800" height="800"',
      '<rect width="800" height="800" fill="#DDF3F5"',
    );
  }
  return art;
}
