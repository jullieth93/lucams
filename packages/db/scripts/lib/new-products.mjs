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
  const fantasy = style === "fantasia";
  const coverX = size.key === "grande" ? 380 : 275;
  const spineX = size.key === "grande" ? 355 : 250;
  const inset = small ? 10 : 16;
  const photoX = fantasy ? coverX + (small ? 55 : 68) : coverX + inset;
  const photoY = fantasy ? (small ? 52 : 82) : inset;
  const photoWidth = fantasy ? (small ? 115 : 194) : size.width - coverX - inset * 2;
  const photoHeight = fantasy ? (small ? 122 : 250) : small ? 154 : 350;
  const titleY = fantasy ? (small ? 194 : 382) : small ? 202 : 421;
  const authorY = fantasy ? (small ? 29 : 49) : small ? 229 : 468;
  const backX = small ? 14 : 24;
  const backWidth = size.key === "grande" ? 282 : 197;
  const art = `mini-libro-${style}-${size.key}`;
  return {
    slug: `${art}-asistido`,
    productId,
    kind: "CUSTOM_DECOR",
    name: `${style === "clasico" ? "Tu foto · Clásico" : "Tu foto · Reino de cristal"} · ${size.label}`,
    order: style === "clasico" ? 1 : 2,
    previewUrl: `/templates/${art}-preview.svg`,
    canvasData: {
      version: 1,
      stage: stage(size.width, size.height),
      layers: [
        background(style === "clasico" ? "#FFF8F0" : "#F7F0DF"),
        photo(
          photoX,
          photoY,
          photoWidth,
          photoHeight,
          "Foto para la portada",
          fantasy ? photoWidth / 2 : 0,
        ),
        asset(`/templates/${art}.svg`, size.width, size.height),
        text("title", coverX + inset, titleY, "Título de tu historia", {
          fontSize: fantasy ? (small ? 20 : 34) : small ? 20 : 30,
          width: size.width - coverX - inset * 2,
          fill: style === "clasico" ? "#3D2E5C" : "#E8C875",
        }),
        text(
          "spine_title",
          spineX,
          size.height - inset + (small ? 7 : 11),
          "Título de tu historia",
          {
            fontSize: small ? 14 : 22,
            width: size.height - inset * 2,
            rotation: -90,
            fill: style === "clasico" ? "#3D2E5C" : "#E8C875",
          },
        ),
        text("author", coverX + inset, authorY, "Tu nombre o dedicatoria", {
          fontSize: fantasy ? (small ? 12 : 18) : small ? 11 : 16,
          width: size.width - coverX - inset * 2,
          fontWeight: "normal",
          fill: style === "clasico" ? "#7C6AAD" : "#F7F0DF",
        }),
        text("back_message", backX, size.height / 2, "Una dedicatoria para la contraportada", {
          fontSize: fantasy ? (small ? 11 : 17) : small ? 13 : 22,
          width: backWidth,
          fontWeight: "normal",
          fill: style === "clasico" ? "#7C6AAD" : "#F7F0DF",
        }),
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
${preview ? `  <rect x="${frontX + 8}" y="8" width="${coverW - 16}" height="${h - 16}" rx="8" fill="#FFF8F0" fill-opacity=".08"/>` : ""}
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

function fantasyTemplateArt(size, preview) {
  const { width: w, height: h } = size;
  const small = size.key === "pequeno";
  const spineW = 50;
  const coverW = (w - spineW) / 2;
  const frontX = coverW + spineW;
  const photoX = frontX + (small ? 55 : 68);
  const photoY = small ? 52 : 82;
  const photoW = small ? 115 : 194;
  const photoH = small ? 122 : 250;
  const radius = photoW / 2;
  const arch = `M${photoX} ${photoY + photoH}V${photoY + radius}A${radius} ${radius} 0 0 1 ${photoX + photoW} ${photoY + radius}V${photoY + photoH}Z`;
  const stepY = photoY + photoH - (small ? 22 : 38);
  const stars = [
    [0.09, 0.16, 1.4],
    [0.18, 0.31, 1],
    [0.84, 0.12, 1.2],
    [0.91, 0.27, 1.6],
    [0.13, 0.76, 1.2],
    [0.87, 0.69, 1],
    [0.94, 0.82, 1.4],
  ]
    .map(
      ([x, y, r]) =>
        `<circle cx="${frontX + coverW * x}" cy="${h * y}" r="${small ? r * 0.65 : r}" fill="#F7E3A4" opacity=".72"/>`,
    )
    .join("");
  const steps = [0, 1, 2, 3]
    .map((index) => {
      const width = photoW * (0.48 + index * 0.16);
      const height = small ? 5 : 8;
      return `<rect x="${photoX + (photoW - width) / 2}" y="${stepY + index * (small ? 7 : 10)}" width="${width}" height="${height}" rx="${small ? 1 : 2}" fill="${["#2A9FA5", "#35B5B5", "#55C9C3", "#83DED2"][index]}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="night" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#061522"/><stop offset=".52" stop-color="#0A3347"/><stop offset="1" stop-color="#08727A"/></linearGradient>
      <linearGradient id="spine" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#040D19"/><stop offset=".5" stop-color="#17354B"/><stop offset="1" stop-color="#061522"/></linearGradient>
      <linearGradient id="portal" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#10132F"/><stop offset=".42" stop-color="#642653"/><stop offset=".78" stop-color="#D64C79"/><stop offset="1" stop-color="#F3A076"/></linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFF0B5"/><stop offset=".45" stop-color="#D5A94F"/><stop offset=".72" stop-color="#FFF0B5"/><stop offset="1" stop-color="#A77A31"/></linearGradient>
      <clipPath id="portal-clip"><path d="${arch}"/></clipPath>
    </defs>
    ${
      preview
        ? `<g clip-path="url(#portal-clip)"><rect x="${photoX}" y="${photoY}" width="${photoW}" height="${photoH}" fill="url(#portal)"/><circle cx="${photoX + photoW * 0.72}" cy="${photoY + photoH * 0.28}" r="${small ? 10 : 18}" fill="#FFE8C2" opacity=".75"/><path d="M${photoX - 10} ${photoY + photoH * 0.78}L${photoX + photoW * 0.3} ${photoY + photoH * 0.42}L${photoX + photoW * 0.52} ${photoY + photoH * 0.7}L${photoX + photoW * 0.76} ${photoY + photoH * 0.48}L${photoX + photoW + 10} ${photoY + photoH * 0.8}V${photoY + photoH}H${photoX - 10}Z" fill="#11172B" opacity=".88"/></g>`
        : ""
    }
    <path d="M0 0H${w}V${h}H0Z ${arch}" fill="url(#night)" fill-rule="evenodd"/>
    <rect x="${coverW}" width="${spineW}" height="${h}" fill="url(#spine)"/>
    <path d="M${coverW} 0V${h}M${frontX} 0V${h}" stroke="#E8C875" stroke-opacity=".38" stroke-width="${small ? 1.5 : 2.5}"/>
    <rect x="${small ? 12 : 22}" y="${small ? 12 : 22}" width="${coverW - (small ? 24 : 44)}" height="${h - (small ? 24 : 44)}" rx="${small ? 3 : 5}" fill="none" stroke="#D5A94F" stroke-opacity=".55" stroke-width="${small ? 1 : 1.5}"/>
    <path d="${arch}" fill="none" stroke="#F3D98B" stroke-opacity=".16" stroke-width="${small ? 8 : 13}"/>
    <path d="${arch}" fill="none" stroke="url(#gold)" stroke-width="${small ? 2 : 3.5}"/>
    ${stars}
    <path d="M${frontX + 12} ${h * 0.18}Q${frontX + 38} ${h * 0.3} ${frontX + 18} ${h * 0.52}M${w - 12} ${h * 0.2}Q${w - 42} ${h * 0.38} ${w - 18} ${h * 0.58}" fill="none" stroke="#6CC8BD" stroke-opacity=".28" stroke-width="${small ? 2 : 3}"/>
    ${steps}
    <g fill="#F7F0DF" text-anchor="middle" font-family="Inter, sans-serif">
      <text x="${coverW / 2}" y="${small ? 39 : 70}" font-size="${small ? 9 : 14}" letter-spacing="${small ? 1.5 : 2.5}">TU HISTORIA</text>
      <text x="${coverW / 2}" y="${small ? 53 : 94}" font-size="${small ? 7 : 10}" fill-opacity=".68" letter-spacing="${small ? 1 : 1.8}">HECHA DE MOMENTOS</text>
      <text x="${coverW / 2}" y="${h - (small ? 24 : 38)}" font-size="${small ? 10 : 15}" font-weight="700">Lucams</text>
    </g>
    <path d="M${small ? 42 : 70} ${h * 0.3}H${coverW - (small ? 42 : 70)}M${small ? 42 : 70} ${h * 0.72}H${coverW - (small ? 42 : 70)}" stroke="#D5A94F" stroke-opacity=".5" stroke-width="${small ? 1 : 1.5}"/>
    <g fill="#E8C875" text-anchor="middle" font-family="Georgia, serif">
      <text x="${coverW / 2}" y="${h * 0.19}" font-size="${small ? 12 : 20}">“</text>
      <text x="${frontX + coverW / 2}" y="${small ? 224 : 449}" font-size="${small ? 7 : 10}" letter-spacing="${small ? 1 : 1.8}">UNA HISTORIA PARA SIEMPRE</text>
    </g>
    <path d="M${frontX + coverW / 2 - (small ? 16 : 26)} ${small ? 207 : 420}H${frontX + coverW / 2 + (small ? 16 : 26)}" stroke="url(#gold)" stroke-width="${small ? 1 : 1.5}"/>
    <circle cx="${frontX + coverW / 2}" cy="${small ? 207 : 420}" r="${small ? 2 : 3}" fill="#E8C875"/>
    ${
      preview
        ? `<g text-anchor="middle"><text x="${frontX + coverW / 2}" y="${small ? 29 : 49}" fill="#F7F0DF" font-family="Georgia, serif" font-size="${small ? 12 : 18}" letter-spacing="${small ? 1 : 2}">TU NOMBRE</text><text x="${frontX + coverW / 2}" y="${small ? 194 : 382}" fill="url(#gold)" font-family="Fredoka, sans-serif" font-size="${small ? 20 : 34}" font-weight="700">TU HISTORIA</text><text transform="translate(${coverW + spineW / 2} ${h / 2}) rotate(-90)" fill="#E8C875" font-family="Fredoka, sans-serif" font-size="${small ? 14 : 22}" font-weight="700">TU HISTORIA</text><g fill="#F7F0DF" font-family="Inter, sans-serif" font-size="${small ? 10 : 15}"><text x="${coverW / 2}" y="${h / 2 - (small ? 14 : 22)}">Hay recuerdos que merecen</text><text x="${coverW / 2}" y="${h / 2 + (small ? 1 : 8)}">quedarse para siempre.</text><text x="${coverW / 2}" y="${h / 2 + (small ? 16 : 38)}" fill-opacity=".72">Escribe aquí tu dedicatoria.</text></g></g>`
        : ""
    }
  </svg>`.replace(/[ \t]+$/gm, "");
}

export function templateSvg(template, preview = false) {
  const src = template.canvasData.layers.find((layer) => layer.type === "asset")?.src;
  const base = src?.split("/").pop()?.replace(".svg", "") ?? template.slug;
  if (base.startsWith("mini-libro-")) {
    const size =
      MINI_BOOK_SIZES.find((candidate) => base.endsWith(candidate.key)) ?? MINI_BOOK_SIZES[0];
    const style = base.includes("fantasia") ? "fantasia" : "clasico";
    const theme = {
      bg: "#FFF8F0",
      accent: "#7C6AAD",
      ink: "#3D2E5C",
      motif: "book",
      title: "Tu historia",
    };
    if (base.includes("completo")) return miniBookArt({ ...size, theme }, true);
    if (style === "fantasia") return fantasyTemplateArt(size, preview);
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000" viewBox="0 0 1200 1000">
    <defs>
      <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFFDF8"/><stop offset="1" stop-color="#EDE4D6"/></linearGradient>
      <linearGradient id="cover-night" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#061522"/><stop offset=".55" stop-color="#0A3B4D"/><stop offset="1" stop-color="#08727A"/></linearGradient>
      <linearGradient id="cover-portal" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#151632"/><stop offset=".5" stop-color="#762C5C"/><stop offset="1" stop-color="#F08C77"/></linearGradient>
      <linearGradient id="cover-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFF0B5"/><stop offset=".5" stop-color="#C99B43"/><stop offset="1" stop-color="#F5D98C"/></linearGradient>
      <filter id="book-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="28" stdDeviation="24" flood-color="#261C3D" flood-opacity=".24"/></filter>
    </defs>
    <rect width="1200" height="1000" fill="url(#paper)"/>
    <circle cx="1020" cy="120" r="240" fill="#5DD9D1" opacity=".09"/><circle cx="120" cy="850" r="260" fill="#E85B9F" opacity=".06"/>
    <text x="600" y="72" text-anchor="middle" fill="#3D2E5C" font-family="Inter, sans-serif" font-size="22" font-weight="700" letter-spacing="6">MINI LIBROS MAGNÉTICOS</text>
    <ellipse cx="604" cy="790" rx="330" ry="55" fill="#3D2E5C" opacity=".13"/>
    <g transform="translate(408 132) skewY(-3)" filter="url(#book-shadow)">
      <path d="M0 26 34 0H408V610L0 636Z" fill="#07111F"/>
      <path d="M0 26 34 0V610L0 636Z" fill="#102C40"/>
      <path d="M408 22 438 38V594L408 610Z" fill="#D8CEBC"/>
      <path d="M413 55 433 65M413 85 433 95M413 115 433 125M413 145 433 155M413 175 433 185M413 205 433 215M413 235 433 245M413 265 433 275M413 295 433 305M413 325 433 335M413 355 433 365M413 385 433 395M413 415 433 425M413 445 433 455M413 475 433 485M413 505 433 515M413 535 433 545" stroke="#F8F2E6" stroke-width="4"/>
      <rect x="34" width="374" height="610" rx="5" fill="url(#cover-night)"/>
      <rect x="48" y="14" width="346" height="582" rx="3" fill="none" stroke="#D5A94F" stroke-opacity=".38"/>
      <text x="221" y="69" text-anchor="middle" fill="#F7F0DF" font-family="Georgia, serif" font-size="27" letter-spacing="3">TU NOMBRE</text>
      <path d="M128 374V225a93 93 0 0 1 186 0v149Z" fill="url(#cover-portal)" stroke="url(#cover-gold)" stroke-width="4"/>
      <circle cx="271" cy="211" r="22" fill="#FFE8C2" opacity=".72"/>
      <path d="M128 330 178 247 218 309 267 234 314 315V374H128Z" fill="#11172B" opacity=".88"/>
      <g fill="#F7E3A4"><circle cx="82" cy="132" r="2"/><circle cx="350" cy="112" r="2.5"/><circle cx="89" cy="279" r="1.8"/><circle cx="354" cy="308" r="2"/></g>
      <g><rect x="165" y="346" width="112" height="10" rx="2" fill="#2A9FA5"/><rect x="153" y="359" width="136" height="10" rx="2" fill="#35B5B5"/><rect x="140" y="372" width="162" height="10" rx="2" fill="#55C9C3"/><rect x="126" y="385" width="190" height="10" rx="2" fill="#83DED2"/></g>
      <text x="221" y="455" text-anchor="middle" fill="url(#cover-gold)" font-family="Georgia, serif" font-size="42" font-weight="700">TU HISTORIA</text>
      <path d="M173 480H269" stroke="url(#cover-gold)" stroke-width="2"/><circle cx="221" cy="480" r="4" fill="#E8C875"/>
      <text x="221" y="522" text-anchor="middle" fill="#F7F0DF" font-family="Inter, sans-serif" font-size="12" letter-spacing="3">UNA HISTORIA PARA SIEMPRE</text>
      <text x="221" y="566" text-anchor="middle" fill="#F7F0DF" font-family="Fredoka, sans-serif" font-size="18" font-weight="700">Lucams</text>
      <text transform="translate(17 330) rotate(-90)" text-anchor="middle" fill="#E8C875" font-family="Georgia, serif" font-size="17">TU HISTORIA</text>
    </g>
    <text x="600" y="890" text-anchor="middle" fill="#3D2E5C" font-family="Fredoka, sans-serif" font-size="43" font-weight="700">Portada · lomo · contraportada</text>
    <text x="600" y="934" text-anchor="middle" fill="#6B6280" font-family="Inter, sans-serif" font-size="23">Tu foto y tus palabras en una carátula envolvente</text>
  </svg>`;
}

export function templatePreviewSvg(template) {
  if (template.slug.startsWith("bola-navidena-foto-circular")) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="#FFF8F0"/><circle cx="400" cy="400" r="350" fill="#A8D5DC"/><circle cx="400" cy="340" r="90" fill="#FFF8F0"/><path d="M210 650Q400 430 590 650" fill="#FFF8F0"/><circle cx="400" cy="400" r="385" fill="none" stroke="#7C6AAD" stroke-width="12"/></svg>`;
  }
  const art = templateSvg(template, true);
  if (template.slug.startsWith("bola-navidena-")) {
    return art.replace(
      '<rect width="800" height="800"',
      '<rect width="800" height="800" fill="#DDF3F5"',
    );
  }
  return art;
}
