import { HELP_LIVE_NUMBERS } from "../constants";
import type { AdminModuleGuide } from "../types";

export const CATALOG_GUIDES: AdminModuleGuide[] = [
  {
    id: "productos",
    title: "Productos y variantes",
    area: "Catálogo y producción",
    route: "/admin/productos",
    summary:
      "Catálogo maestro: ficha comercial, opciones físicas de 1 unidad base, gemelas `-NOMAG`, receta BOM, Estudio y SEO.",
    purpose:
      "Gobierna toda la oferta de Lucams Shop: define si un artículo es bajo pedido en el Estudio (`MADE_TO_ORDER`) o producto terminado (`PHYSICAL_STOCK`), administra sus opciones físicas de 1 unidad base (tamaño, con/sin imán `-NOMAG`), fotos, empaque logístico, receta de materiales BOM, meses de garantía y visibilidad en tienda.",
    whenToUse: [
      "Para lanzar un producto nuevo o editar fotos, textos, precios base, peso/dimensiones o meses de garantía.",
      "Para configurar opciones físicas (tamaño, imán vs sin imán) o ajustar la receta BOM de materiales.",
      "Para pausar, archivar o revisar visibilidad en el escaparate web.",
    ],
    concepts: [
      {
        term: "Opción base de 1 unidad (ADR-209)",
        definition:
          "Cada variante modela únicamente atributos físicos de 1 unidad base (1 pieza, 1 pack de 6 o 1 set); todos los descuentos por volumen viven en Precios al por mayor (/admin/mayorista).",
      },
      {
        term: "MADE_TO_ORDER vs PHYSICAL_STOCK (ADR-208)",
        definition:
          "Todo producto conectado al Estudio es forzado por el servidor a `MADE_TO_ORDER` (sin stock terminado); solo productos prefabricados operan con `PHYSICAL_STOCK` e Inventario.",
      },
      {
        term: "Gemela `-NOMAG`",
        definition:
          "Variante sin lámina magnética (acabado decorativo/fotográfico) asociada al mismo producto para que el comprador elija con o sin imán.",
      },
      {
        term: "Receta BOM",
        definition:
          "Lista de insumos y cantidades por unidad que calcula automáticamente el costo sugerido en Costos y márgenes (/admin/costos).",
      },
    ],
    sections: [
      {
        id: "contenido",
        title: "Identidad comercial, visibilidad y SEO",
        summary: "Controla cómo descubre y evalúa el comprador el producto en vitrina.",
        topics: [
          {
            id: "slug",
            label: "Nombre, slug y redirección 301 automática",
            description:
              "Construye la URL `/productos/[slug]`; al renombrar un slug existente el sistema registra redirección 301 automática.",
            caution:
              "Evita cambiar slugs en medio de campañas activas salvo necesidad real y compruébalo luego en /admin/redirects.",
          },
          {
            id: "visibilidad",
            label: "Estado activo y publicación en tienda (`publishedOnStorefront`)",
            description:
              "Para aparecer en la web y en Google Merchant un producto debe estar activo, publicado en tienda, con foto principal y al menos una variante activa.",
            interpretation:
              "Usa Pausar/Desactivar para retirar temporalmente; reserva la papelera solo para retiro definitivo.",
          },
          {
            id: "garantia-seo",
            label: "Plazo de garantía y SEO veraz",
            description:
              "Los meses de garantía configurados aquí se sellan de forma inmutable en cada `OrderItem` comprado.",
            caution:
              "Nunca prometas en descripción o SEO atributos físicos o plazos que Taller no cumpla (Ley 1480 arts. 23 y 29).",
          },
        ],
      },
      {
        id: "variantes",
        title: "Variantes físicas, peso logístico, Estudio y BOM",
        summary: "Conecta la compra con cotización de fletes, lienzo Konva/3D y costeo.",
        topics: [
          {
            id: "sku-precio",
            label: "SKU único y precio base en COP",
            description:
              "Cada opción exige SKU irrepetible y precio unitario entero (almacenado internamente en centavos COP).",
            interpretation:
              "No crees variantes de «pack x3» o «pack x10» para dar descuento: crea la opción base de 1 unidad y configura los tramos en /admin/mayorista.",
          },
          {
            id: "fisicos",
            label: "Peso (g) y dimensiones de empaque",
            description:
              "Alimentan el cálculo apilado de Aveonline y los filtros de peso en /admin/envios.",
            caution:
              "Un peso en cero o irreal distorsiona el flete cobrado al cliente frente a lo facturado por la transportadora.",
          },
          {
            id: "personalizacion-bom",
            label: "Esquema del Estudio y pestaña Materiales (BOM)",
            description: `Vincula plantilla aprobada (topes de ${HELP_LIVE_NUMBERS.maxDesignUnits} diseños/tanda, ${HELP_LIVE_NUMBERS.maxPhotoPackUnits} packs, ${HELP_LIVE_NUMBERS.maxCalendarUnits} calendarios, ${HELP_LIVE_NUMBERS.maxLetterSetUnits} sets de letras, ${HELP_LIVE_NUMBERS.maxDesignSlots} ranuras máx.) y define los insumos consumidos por unidad.`,
            caution:
              "Tras tocar el esquema de personalización, abre siempre el Estudio público para probar lienzo 2D, vista 3D y guardado.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "publicar-producto",
        title: "Crear o actualizar un producto de punta a punta",
        goal: "Dejar la ficha lista para vender con flete exacto, margen positivo y Estudio verificado.",
        route: "/admin/productos",
        steps: [
          "Completa nombre, categoría, descripción honesta, meses de garantía e imágenes nítidas.",
          "Define `MADE_TO_ORDER` (si pasa por el Estudio) o `PHYSICAL_STOCK` (producto terminado sin Estudio).",
          "Configura las variantes físicas de 1 unidad base con SKU único, precio en pesos, peso en gramos y dimensiones.",
          "Asigna la receta de insumos en la pestaña Materiales y luego aplica o valida su costo unitario en /admin/costos.",
          "Si aplica descuento por cantidad, configúralo en /admin/mayorista verificando margen positivo sobre BOM.",
          "Guarda, comprueba cobertura en /admin/canales/tienda y haz una prueba real en la PDP y en el Estudio.",
        ],
        expected:
          "El producto aparece en vitrina, cotiza envío real, abre su plantilla correcta en el Estudio y protege el margen bruto.",
      },
    ],
    cautions: [
      `Purgar definitivamente un producto desde la papelera es irreversible y exige escribir ELIMINAR más MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
    ],
    dontTouch: [
      "No crees variantes multi-unidad para simular descuentos por volumen: para eso existe exclusivamente /admin/mayorista.",
      "No cambies el esquema de personalización de un producto activo sin probar de inmediato el Estudio 2D/3D.",
      "No reutilices el SKU de una variante histórica en otro producto distinto.",
    ],
    checklist: [
      "Fotos cargadas, categoría activa y `publishedOnStorefront` revisado.",
      "Variantes de 1 unidad base con SKU único, peso real y dimensiones.",
      "Receta BOM vinculada y costo validado en /admin/costos.",
      "Estudio público probado si el producto es personalizado.",
    ],
    subroutes: [
      {
        id: "producto-nuevo",
        pattern: "/admin/productos/nuevo",
        title: "Alta de producto nuevo",
        summary:
          "Estás creando un producto desde cero: define primero su modo de inventario (`MADE_TO_ORDER` vs `PHYSICAL_STOCK`) y su categoría principal.",
        tips: [
          "Guarda primero la ficha base para habilitar pestañas complementarias de imágenes, variantes y materiales BOM.",
          "No actives visibilidad pública hasta terminar variantes, fotos, receta BOM y costo unitario.",
        ],
        highlightSectionIds: ["contenido", "variantes"],
        highlightProcedureIds: ["publicar-producto"],
      },
      {
        id: "producto-variantes",
        pattern: "/admin/productos/[id]/variants",
        title: "Gestión de opciones físicas y gemelas `-NOMAG`",
        summary:
          "Administras SKUs, precios base, pesos, dimensiones y variantes con/sin imán del producto actual.",
        tips: [
          "Modela solo opciones físicas de 1 unidad base (ej. tamaño o acabado con/sin imán); lleva cualquier precio por cantidad a /admin/mayorista.",
          "Verifica peso y medidas en todas las opciones activas para no romper cotizaciones de Aveonline.",
        ],
        highlightSectionIds: ["variantes"],
      },
      {
        id: "producto-edicion",
        pattern: "/admin/productos/[id]",
        title: "Edición integral de ficha de producto",
        summary:
          "Editas contenido comercial, fotos, personalización, receta BOM y estado de un producto existente.",
        tips: [
          "El costo unitario vigente se muestra aquí en lectura; usa el enlace directo a /admin/costos para actualizarlo.",
          "Si cambias el slug, verifica en /admin/redirects que no hayas generado una cadena sobre cambios anteriores.",
        ],
        highlightSectionIds: ["contenido", "variantes"],
        highlightProcedureIds: ["publicar-producto"],
      },
    ],
    faqs: [
      {
        question: "¿Dónde edito el costo unitario de fabricación de un producto?",
        answer:
          "De forma centralizada en Costos y márgenes (/admin/costos). En la ficha del producto ves el valor vigente y armas la receta de materiales que calcula el sugerido.",
      },
      {
        question: "¿Por qué no me deja poner stock en un producto personalizado?",
        answer:
          "Porque todo producto del Estudio es `MADE_TO_ORDER`: se fabrica bajo demanda y su capacidad depende de Materiales e insumos (/admin/materiales), no de stock terminado.",
      },
    ],
    related: [
      "inventario",
      "mayorista",
      "costos",
      "materiales",
      "plantillas",
      "categorias",
      "redirects",
    ],
    relatedPlaybooks: [
      "playbook-catalogo-estudio-lanzamiento",
      "playbook-economia-bom-precios-promos",
    ],
    keywords: [
      "SKU",
      "variante",
      "NOMAG",
      "precio",
      "SEO",
      "BOM",
      "receta",
      "personalización",
      "bajo pedido",
      "stock físico",
    ],
    version: 3,
  },
  {
    id: "categorias",
    title: "Categorías",
    area: "Catálogo y producción",
    route: "/admin/categorias",
    summary:
      "Jerarquía padre/hija del catálogo, facetas de filtrado, ventanas estacionales y producto insignia.",
    purpose:
      "Estructura la navegación principal de la tienda: organiza categorías madre y subcategorías, textos introductorios SEO, qué facetas ve el visitante al filtrar, ventanas temporales de temporada y cuál es el producto estrella destacado.",
    whenToUse: [
      "Al crear o reordenar una línea de productos en el menú público.",
      "Para elegir qué filtros (tamaño, acabado, formato) aparecen en una categoría.",
      "Para programar visibilidad estacional o fijar el producto insignia.",
    ],
    concepts: [
      {
        term: "Árbol padre / hija",
        definition:
          "Relación jerárquica que construye migas de pan, menús y páginas de colección sin ciclos.",
      },
      {
        term: "Facetas visibles",
        definition:
          "Subconjunto de atributos habilitados como filtros interactivos dentro de esa categoría.",
      },
      {
        term: "Ventana estacional",
        definition:
          "Rango opcional de fechas durante el cual una categoría de temporada cobra protagonismo.",
      },
    ],
    sections: [
      {
        id: "configuracion",
        title: "Estructura, facetas y curaduría",
        summary: "Alinea taxonomía, filtros y productos activos.",
        topics: [
          {
            id: "jerarquia",
            label: "Categoría superior y slug",
            description: "Ubica la colección en el árbol y define su URL pública.",
            caution:
              "Renombrar el slug genera redirección 301 automática, pero revisa que ningún banner del CMS siga apuntando al enlace viejo.",
          },
          {
            id: "filtros-destacado",
            label: "Filtros activos y producto insignia",
            description:
              "Activa únicamente facetas presentes en las variantes reales de esa categoría y selecciona un producto activo como insignia.",
            interpretation:
              "Un filtro sin productos compatibles aparecerá vacío o confuso para el comprador.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "configurar-categoria",
        title: "Configurar o actualizar una categoría",
        goal: "Ofrecer navegación clara y filtros útiles en escritorio y móvil.",
        route: "/admin/categorias",
        steps: [
          "Define nombre, slug, categoría padre (si es subcategoría) y texto introductorio fiel a los productos incluidos.",
          "Marca las facetas de filtro que realmente existan en las variantes de esa colección.",
          "Elige opcionalmente un producto activo como insignia y ventana estacional si aplica.",
          "Guarda y recorre la página pública comprobando orden, filtros y versión móvil.",
        ],
        expected:
          "La colección pública carga con sus productos vigentes, filtros operativos y SEO limpio.",
      },
    ],
    cautions: [
      "Desactivar o eliminar una categoría padre afecta el descubrimiento de los productos que solo colgaban de ella.",
    ],
    dontTouch: [
      "No borres una categoría para «apagar temporalmente» una campaña anual (ej. Navidad): desactívala o ajusta su ventana estacional para conservar su URL y SEO.",
    ],
    checklist: [
      "Productos activos asignados correctamente a la categoría.",
      "Filtros probados en la página pública.",
      "Producto insignia activo y perteneciente a la categoría.",
    ],
    subroutes: [
      {
        id: "categoria-edicion",
        pattern: "/admin/categorias/[id]",
        title: "Edición de categoría individual",
        summary:
          "Ajustas jerarquía, copy editorial, facetas visibles, ventana estacional y producto insignia de esta categoría.",
        tips: [
          "Si el producto insignia fue pausado o archivado, actualízalo aquí por uno vigente.",
          "Comprueba en tienda móvil cómo luce la introducción antes de dar por cerrada la edición.",
        ],
        highlightSectionIds: ["configuracion"],
        highlightProcedureIds: ["configurar-categoria"],
      },
    ],
    faqs: [
      {
        question: "¿Por qué una faceta activada no filtra nada en la tienda?",
        answer:
          "Porque las variantes activas de esa categoría no tienen valores cargados para ese atributo en /admin/productos.",
      },
    ],
    related: ["productos", "ocasiones", "redirects"],
    relatedPlaybooks: ["playbook-catalogo-estudio-lanzamiento"],
    keywords: ["categoría", "subcategoría", "jerarquía", "facetas", "filtros", "insignia"],
    version: 2,
  },
  {
    id: "ocasiones",
    title: "Ocasiones",
    area: "Catálogo y producción",
    route: "/admin/ocasiones",
    summary:
      "Colecciones transversales por celebración o intención (`/ocasion/[slug]`) conectadas al recomendador de regalos.",
    purpose:
      "Agrupa productos de distintas categorías alrededor de un momento de regalo (Cumpleaños, Aniversario, Navidad, Día de la Madre, Mascotas, Empresas) alimentando páginas `/ocasion/[slug]`, filtros y el recomendador público.",
    whenToUse: [
      "Antes de una temporada comercial para curar la selección de productos de esa fecha.",
      "Al lanzar un producto nuevo para sumarlo a todas las ocasiones donde encaja.",
    ],
    concepts: [
      {
        term: "Taxonomía transversal (N:M)",
        definition:
          "Un mismo producto pertenece a una categoría estructural, pero puede participar simultáneamente en múltiples ocasiones.",
      },
    ],
    sections: [
      {
        id: "etiqueta",
        title: "Identidad editorial y curaduría de productos",
        summary: "Conecta inspiración de regalo con fichas comprables.",
        topics: [
          {
            id: "productos",
            label: "Selección curada",
            description:
              "Lista de productos asociados que alimenta la landing de ocasión y el recomendador.",
            interpretation:
              "Asegúrate de incluir solo productos activos y coherentes con el motivo de celebración.",
          },
          {
            id: "slug-copy",
            label: "Slug, imagen y descripción",
            description:
              "Construyen `/ocasion/[slug]` con redirección 301 automática si renombras el slug.",
            caution:
              "No dupliques literalmente el texto de una categoría: enfoca la redacción en la intención de regalo.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "publicar-ocasion",
        title: "Curar una ocasión comercial",
        goal: "Mantener landings de regalo y recomendador con oferta fresca y disponible.",
        route: "/admin/ocasiones",
        steps: [
          "Abre la ocasión, revisa título, slug, imagen y descripción enfocada al momento de compra.",
          "Vincula los productos activos pertinentes y retira los que no apliquen.",
          "Guarda y abre `/ocasion/[slug]` y `/recomendador` para validar el resultado.",
        ],
        expected:
          "Los compradores encuentran ideas listas para regalar sin toparse con colecciones vacías.",
      },
    ],
    cautions: ["Quitar un producto de una ocasión no lo desactiva del catálogo general."],
    dontTouch: ["No dejes una ocasión activa publicada con cero productos activos asociados."],
    checklist: [
      "Al menos 2–3 productos activos vinculados.",
      "Página `/ocasion/[slug]` verificada en tienda.",
    ],
    subroutes: [
      {
        id: "ocasion-edicion",
        pattern: "/admin/ocasiones/[id]",
        title: "Edición y productos de la ocasión",
        summary:
          "Editas presentación SEO y selección de productos asociados a esta ocasión de regalo.",
        tips: [
          "Cada vez que actives un producto estacional (como Bola Navideña), verifica aquí su asociación con la ocasión respectiva.",
        ],
        highlightSectionIds: ["etiqueta"],
        highlightProcedureIds: ["publicar-ocasion"],
      },
    ],
    faqs: [
      {
        question: "¿En qué se diferencia una Ocasión de una Categoría?",
        answer:
          "La Categoría define qué es físicamente el producto (ej. Fotoimanes, Separadores); la Ocasión define para qué momento se regala (ej. Aniversario, Navidad) cruzando varias categorías.",
      },
    ],
    related: ["productos", "categorias", "redirects"],
    relatedPlaybooks: ["playbook-catalogo-estudio-lanzamiento"],
    keywords: ["ocasión", "celebración", "regalo", "recomendador", "Navidad", "fecha especial"],
    version: 2,
  },
  {
    id: "inventario",
    title: "Inventario",
    area: "Catálogo y producción",
    route: "/admin/inventario",
    summary:
      "Control exclusivo de productos terminados (`PHYSICAL_STOCK`), reserva de seguridad (`safetyStock`), disponible neto y kardex por canal.",
    purpose:
      "Administra existencias reales de variantes prefabricadas (`PHYSICAL_STOCK`), separando stock físico en bodega, colchón de seguridad (`safetyStock`) y disponible neto vendible (`stock − safetyStock`, piso 0). Los productos personalizados `MADE_TO_ORDER` no contaminan esta vista porque se gobiernan por insumos de taller.",
    whenToUse: [
      "Para ingresar producción terminada o compras de artículos con stock físico.",
      "Para ajustar diferencias tras conteo físico dejando motivo en kardex.",
      "Para investigar agotados, disparos de alerta «Avísame cuando vuelva» (`back-in-stock`) o reversas por órdenes expiradas.",
    ],
    concepts: [
      {
        term: "Disponible neto (`stock − safetyStock`)",
        definition:
          "Unidades efectivamente ofrecidas a los canales de venta tras descontar la reserva de seguridad para evitar sobreventa.",
      },
      {
        term: "Decremento atómico y reversa",
        definition:
          "El sistema compromete/descuenta unidades de forma atómica y las restituye automáticamente en kardex si expira o se cancela una orden no despachada.",
      },
      {
        term: "Kardex auditable",
        definition:
          "Libro inmutable de entradas, salidas, reservas y ajustes manuales con usuario, canal, motivo y saldo resultante.",
      },
    ],
    sections: [
      {
        id: "existencias",
        title: "Saldos, reserva de seguridad y movimientos",
        summary: "Visibilidad clara de bodega sin mezclar productos bajo pedido.",
        topics: [
          {
            id: "disponible",
            label: "Stock físico vs reserva (`safetyStock`)",
            description:
              "Permite proteger un colchón mínimo cuando compartas inventario entre canales.",
            interpretation:
              "Si una variante tiene 5 en stock físico y 5 en `safetyStock`, su disponible neto en tienda será 0 (agotado público).",
          },
          {
            id: "ajuste-kardex",
            label: "Ajuste manual y lectura de kardex",
            description:
              "Registra conteos físicos con justificación obligatoria; subir de 0 a >0 disponible habilita avisos `back-in-stock` en el siguiente ciclo del cron.",
            caution:
              "Revisa siempre los últimos movimientos del kardex antes de aplicar un ajuste para no duplicar una entrada o reversa automática.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "ajustar-stock",
        title: "Conciliar conteo físico en bodega con el Kardex",
        goal: "Alinear existencias reales de `PHYSICAL_STOCK` con trazabilidad completa.",
        route: "/admin/inventario",
        steps: [
          "Localiza la variante por SKU y abre su historial de kardex reciente.",
          "Contrasta tu conteo físico en estantería descontando paquetes ya cerrados pendientes de recoger.",
          "Registra el ajuste indicando motivo verificable (conteo cíclico, lote ingresado, merma comprobada) y revisa `safetyStock`.",
          "Comprueba el nuevo disponible neto y su estado en la página pública del producto.",
        ],
        expected:
          "El saldo en sistema refleja la bodega real, queda auditado y activa reposición automática de alertas si estaba agotado.",
      },
    ],
    cautions: [
      "Subir stock disponible de un artículo agotado con interesados inscritos disparará correos automáticos de «Ya volvió» en el cron de media hora.",
    ],
    dontTouch: [
      "No busques aquí fotoimanes o calendarios personalizados: sus insumos (papel, imán, tinta) se controlan en Materiales (/admin/materiales).",
      "Nunca cargues stock ficticio que aún no esté físicamente listo para empacar.",
    ],
    checklist: [
      "Kardex reciente revisado antes de ajustar.",
      "Conteo físico contrastado contra pedidos pagados sin despachar.",
      "Motivo claro documentado en el ajuste.",
    ],
    faqs: [
      {
        question: "¿Por qué no aparecen aquí los productos del Estudio?",
        answer:
          "Porque son `MADE_TO_ORDER` (ADR-208): no existen como unidades prefabricadas en estantería; su disponibilidad depende de estar activos y contar con materia prima en /admin/materiales.",
      },
    ],
    related: ["productos", "materiales", "pedidos", "canales"],
    relatedPlaybooks: [
      "playbook-catalogo-estudio-lanzamiento",
      "playbook-economia-bom-precios-promos",
    ],
    keywords: [
      "stock",
      "existencias",
      "kardex",
      "agotado",
      "safetyStock",
      "reserva",
      "disponible neto",
      "PHYSICAL_STOCK",
    ],
    version: 3,
  },
  {
    id: "mayorista",
    title: "Precios al por mayor",
    area: "Catálogo y producción",
    route: "/admin/mayorista",
    summary:
      "Escalas automáticas por volumen (`minQty ≥ 2`) con precedencia `opción > producto > global` y alerta de margen BOM.",
    purpose:
      "Centraliza todos los descuentos por cantidad del carrito público (promos por llevar varios fotoimanes, packs, bolas o sets) verificando coherencia monotónica (a más unidades, menor precio unitario), tope real del selector del producto y margen bruto contra Costos.",
    whenToUse: [
      "Para configurar promociones por cantidad (ej. 3× o 5× unidades) sin crear variantes falsas.",
      "Para auditar qué escalas hacen sombra sobre la regla global o están cerca del costo BOM.",
      "Como Finanzas para revisar rentabilidad de tramos en modo solo lectura.",
    ],
    concepts: [
      {
        term: "Jerarquía de sombra (`opción > producto > global`)",
        definition:
          "Si una opción tiene tramos propios activos, ignora los del producto y los globales; si el producto tiene tramos propios, ignora los globales.",
      },
      {
        term: "Coherencia monotónica estricta",
        definition:
          "El servidor rechaza cualquier tramo que cobre igual o más caro que el precio base o que un tramo de menor cantidad del mismo alcance.",
      },
      {
        term: "Tope del selector por producto (ADR-209)",
        definition: `Ningún tramo puede pedir más unidades de las que permite comprar el selector directo (${HELP_LIVE_NUMBERS.maxDesignUnits} uds., ${HELP_LIVE_NUMBERS.maxPhotoPackUnits} packs, ${HELP_LIVE_NUMBERS.maxCalendarUnits} calendarios, ${HELP_LIVE_NUMBERS.maxLetterSetUnits} sets de letras o ${HELP_LIVE_NUMBERS.maxSelfServicePhysicalUnits} en stock físico).`,
      },
    ],
    sections: [
      {
        id: "escalas",
        title: "Alcance, simulador de ahorro y semáforo BOM",
        summary: "Valida el impacto económico exacto antes de activar un tramo.",
        topics: [
          {
            id: "alcance",
            label: "Selección de alcance",
            description:
              "Elige opción puntual (ej. con imán vs `-NOMAG`), producto completo o catálogo global.",
            interpretation:
              "Cuando un producto tiene opciones con precios base distintos (ej. con imán vs sin imán), define escalas por opción para cuidar el margen de ambas.",
          },
          {
            id: "precio-bom",
            label: "Simulador en vivo y alerta de pérdida",
            description:
              "Calcula % de ahorro y margen frente al costo unitario vigente de /admin/costos.",
            caution: `Si un tramo queda bajo costo BOM se marca en rojo; además recuerda que en checkout puede apilarse un cupón comercial y hasta ${HELP_LIVE_NUMBERS.loyaltyMaxEffectiveReturnPct} % de retorno en puntos.`,
          },
        ],
      },
    ],
    procedures: [
      {
        id: "crear-escala",
        title: "Publicar una escala por volumen protegiendo el margen",
        goal: "Activar incentivos por cantidad en PDP y carrito sin vender a pérdida.",
        route: "/admin/mayorista",
        steps: [
          "Verifica primero en /admin/costos que el producto tenga su costo unitario BOM actualizado.",
          "Selecciona en /admin/mayorista el alcance exacto (opción específica, producto o global).",
          "Ingresa cantidad mínima (`≥ 2`, dentro del tope del selector) y el nuevo precio unitario en pesos COP.",
          "Comprueba en el simulador que el margen siga saludable aun si el cliente aplica un cupón vigente.",
          "Guarda y verifica la tabla de ahorro publicada en la PDP del producto.",
        ],
        expected:
          "La PDP anuncia el tramo exacto y el carrito recalcula automáticamente al alcanzar esa cantidad.",
      },
    ],
    cautions: [
      `Eliminar definitivamente un tramo exige MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min); usa Desactivar cuando solo quieras pausarlo.`,
    ],
    dontTouch: [
      "Nunca actives una escala en rojo (bajo costo BOM) sin autorización expresa de Dirección.",
      "No olvides que agregar un primer tramo a un producto apaga por sombra todas las escalas globales sobre ese producto.",
    ],
    checklist: [
      "Costo BOM del producto verificado en /admin/costos.",
      "Orden decreciente de precios por tramo comprobado.",
      "Margen combinado revisado frente a cupones activos en /admin/cupones.",
    ],
    faqs: [
      {
        question: `¿Qué hago si un cliente quiere cotizar más de ${HELP_LIVE_NUMBERS.minB2bUnits} o ${HELP_LIVE_NUMBERS.maxSelfServicePhysicalUnits} unidades?`,
        answer: `Las escalas de este módulo cubren autoservicio directo en carrito; para proyectos corporativos o eventos desde ${HELP_LIVE_NUMBERS.minB2bUnits} unidades dirígelo a /empresas-y-eventos y cotízalo en Oportunidades B2B.`,
      },
    ],
    related: ["productos", "costos", "cupones", "fidelizacion", "oportunidades"],
    relatedPlaybooks: ["playbook-economia-bom-precios-promos"],
    keywords: ["volumen", "mayorista", "descuento", "cantidad", "escala", "promo", "sombra", "BOM"],
    version: 3,
  },
  {
    id: "materiales",
    title: "Materiales e insumos",
    area: "Catálogo y producción",
    route: "/admin/materiales",
    summary:
      "Materia prima de taller (papel fotográfico, imán, laminado, tinta, bolas, empaque), stock mínimo y costo unitario para BOM.",
    purpose:
      "Controla las existencias operativas de taller y el costo de reposición por unidad de medida que alimenta las recetas BOM de todo el catálogo personalizado y de propuestas B2B.",
    whenToUse: [
      "Cada vez que compres un lote de insumos con nuevo precio de proveedor.",
      "Para controlar alertas de bajo stock de materia prima antes de picos estacionales.",
      "Antes de armar la receta BOM de un producto nuevo.",
    ],
    concepts: [
      {
        term: "Coherencia de unidad de consumo",
        definition:
          "La unidad declarada en el material (unidad, hoja/pliego, metro, ml, caja) debe ser idéntica a la fracción usada en la receta del producto.",
      },
      {
        term: "Propagación hacia Costos",
        definition:
          "Actualizar el costo de un material recalcula al instante el «Sugerido por BOM» en /admin/costos, mostrando brecha hasta que confirmes el nuevo costo vigente.",
      },
    ],
    sections: [
      {
        id: "insumo",
        title: "Costo por unidad, recetas vinculadas y umbral de taller",
        summary: "Base real de rentabilidad y continuidad de producción.",
        topics: [
          {
            id: "costo-unidad",
            label: "Costo unitario en COP",
            description:
              "Registra el costo real puesto en taller para una unidad de medida (no el precio de toda la caja si la unidad es pieza/hoja).",
            caution:
              "Confundir el costo del paquete completo con el costo de una pieza multiplica por error el costo BOM de los productos.",
          },
          {
            id: "alerta-stock",
            label: "Stock actual vs stock mínimo",
            description: "Dispara señal preventiva de reabastecimiento interno de taller.",
            interpretation:
              "No bloquea compras web automáticamente: si un insumo crítico se agota por completo, pausa temporalmente el producto afectado en /admin/productos.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "actualizar-material",
        title: "Actualizar costo o stock de materia prima y propagar a Costos",
        goal: "Mantener márgenes de tienda y de propuestas B2B anclados a precios reales de compra.",
        route: "/admin/materiales",
        steps: [
          "Localiza el insumo y verifica su unidad de medida exacta.",
          "Calcula el costo real por esa unidad (incluyendo transporte del proveedor si aplica) y guarda.",
          "Actualiza el stock físico de taller y su umbral mínimo.",
          "Entra enseguida a /admin/costos, filtra «Difieren de BOM» y actualiza los productos impactados.",
        ],
        expected:
          "Tanto el catálogo web como el constructor de propuestas B2B calculan márgenes con costos reales vigentes.",
      },
    ],
    cautions: [
      "Agotar en taller un insumo sin pausar el producto correspondiente generará pedidos pagados bloqueados en producción.",
    ],
    dontTouch: [
      "Nunca cambies la unidad de medida de un insumo (ej. de pliego a unidad) sin ajustar en el mismo acto todas las recetas de productos que lo usan.",
    ],
    checklist: [
      "Costo calculado en la misma unidad que usan las recetas BOM.",
      "Brechas revisadas inmediatamente después en /admin/costos.",
    ],
    faqs: [
      {
        question: "¿Las ventas web descuentan automáticamente hojas o imanes en Materiales?",
        answer:
          "No: la receta BOM gobierna el costeo unitario; el stock de Materiales se actualiza por control de taller/compras, mientras Inventario (/admin/inventario) descuenta automáticamente productos terminados `PHYSICAL_STOCK`.",
      },
    ],
    related: ["costos", "productos", "inventario", "oportunidades"],
    relatedPlaybooks: ["playbook-economia-bom-precios-promos"],
    keywords: ["insumo", "materia prima", "papel", "imán", "tinta", "BOM", "taller", "costo"],
    version: 3,
  },
  {
    id: "costos",
    title: "Costos y márgenes",
    area: "Catálogo y producción",
    route: "/admin/costos",
    summary:
      "Única fuente de edición del costo unitario de fabricación, brecha contra receta BOM y semáforo de margen bruto.",
    purpose:
      "Gobierna de forma centralizada `Product.cost` (en centavos COP), compara contra la suma viva de su receta BOM (`Usar sugerido`) y audita el margen bruto frente a la variante activa más económica. Alimenta tanto las alertas de `/admin/mayorista` como el piso de rentabilidad del constructor de propuestas B2B.",
    whenToUse: [
      "Después de actualizar precios de insumos en /admin/materiales.",
      "Al dar de alta un producto nuevo antes de activarlo o crearle descuentos.",
      "Mensualmente para auditar que ningún producto activo esté sin costo, desfasado de BOM o en pérdida.",
    ],
    concepts: [
      {
        term: "Costo vigente vs Sugerido BOM",
        definition:
          "El sugerido recalcula en vivo desde Materiales; el costo vigente solo cambia cuando Operaciones o Superadmin lo guarda o pulsa «Usar sugerido».",
      },
      {
        term: "Semáforo de margen bruto mínimo",
        definition:
          "Evalúa contra la variante activa más barata: verde ≥ 20 %, ámbar 0–20 % (riesgo frente a pasarela/merma) y rosa < 0 % (pérdida directa).",
      },
    ],
    sections: [
      {
        id: "simulador",
        title: "Filtros de brecha, adopción de BOM y auditoría",
        summary: "Prioriza correcciones en segundos.",
        topics: [
          {
            id: "filtros-salud",
            label: "Sin costo, Difieren de BOM y En pérdida",
            description: "Tres filtros rápidos en cabecera para atacar desviaciones críticas.",
            interpretation:
              "Un producto activo jamás debe operar con costo $0: falsearía los márgenes de Mayorista y permitiría cotizar bajo costo en B2B.",
          },
          {
            id: "usar-sugerido",
            label: "Botón «Usar sugerido»",
            description:
              "Copia y guarda con trazabilidad de auditoría el cálculo exacto de la receta BOM.",
            interpretation:
              "Analista Financiero consulta toda esta matriz en modo de solo lectura para control contable.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "simular-margen",
        title: "Sincronizar costos BOM y sanear márgenes del catálogo",
        goal: "Garantizar cero productos sin costo y visibilidad real antes de promociones.",
        route: "/admin/costos",
        steps: [
          "Activa los filtros «Sin costo», «Difieren de BOM» y «En pérdida».",
          "Si el sugerido BOM luce extraño, abre la pestaña Materiales del producto para corregir cantidades de la receta.",
          "Pulsa «Usar sugerido» o guarda el costo unitario verificado.",
          "Si algún producto queda en ámbar o rosa, revisa enseguida su precio base en /admin/productos y sus tramos en /admin/mayorista.",
        ],
        expected:
          "Todo el catálogo activo cuenta con costo fidedigno auditado y márgenes protegidos.",
      },
    ],
    cautions: [
      "El margen aquí mostrado es bruto de fabricación: recuerda dejar colchón suficiente para comisión de Wompi, empaque secundario y campañas.",
    ],
    dontTouch: [
      "Nunca pongas costo $0 o simbólico ($1) para destrabar una propuesta B2B o escala mayorista.",
    ],
    checklist: [
      "0 productos activos en el filtro «Sin costo».",
      "0 productos activos en el filtro «En pérdida».",
      "Diferencias frente a receta BOM revisadas y justificadas.",
    ],
    faqs: [
      {
        question: "¿Por qué este costo bloquea precios en Oportunidades B2B?",
        answer:
          "El constructor de propuestas B2B lee `Product.cost` para impedir que se envíen cotizaciones por debajo del costo de fabricación sin autorización de Superadmin.",
      },
    ],
    related: ["materiales", "productos", "mayorista", "oportunidades", "finanzas"],
    relatedPlaybooks: ["playbook-economia-bom-precios-promos", "playbook-oportunidad-b2b-cierre"],
    keywords: ["margen", "rentabilidad", "BOM", "receta", "costo", "pérdida", "fabricación"],
    version: 3,
  },
  {
    id: "plantillas",
    title: "Plantillas del Estudio",
    area: "Catálogo y producción",
    route: "/admin/plantillas",
    summary:
      "Inspección visual real, aprobación y ocultamiento de lienzos Konva/3D para personalización.",
    purpose:
      "Controla qué plantillas geométricas (`PersonalizationTemplate`) están aprobadas y visibles para los compradores dentro del Estudio 2D/3D y asegura que sus márgenes de sangrado coincidan con el corte real a 300 DPI.",
    whenToUse: [
      "Antes de habilitar una plantilla nueva o modificada en un producto personalizado.",
      "Para ocultar temporalmente una plantilla sin romper pedidos ni borradores existentes.",
      "Para depurar plantillas huérfanas nunca aprobadas.",
    ],
    concepts: [
      {
        term: "Sangrado y zona segura 300 DPI",
        definition:
          "Geometría del lienzo que garantiza que el render de taller cubra bordes de corte y doblez (ej. lomo en Mini Libros o cara B en Bola Navideña).",
      },
    ],
    sections: [
      {
        id: "revision",
        title: "Vista previa real y estado de publicación",
        summary: "Lo que apruebas aquí es exactamente el lienzo que abre el cliente.",
        topics: [
          {
            id: "preview",
            label: "Previsualización interactiva",
            description:
              "Permite inspeccionar proporciones, máscaras, caras y variantes vinculadas antes de exponerla.",
            caution:
              "Revisa todas las caras (anverso y reverso/interior cuando aplique), no solo la tarjeta miniatura.",
          },
          {
            id: "aprobada",
            label: "Aprobada vs Oculta",
            description:
              "Ocultar retira la opción para nuevos diseños sin corromper órdenes históricas.",
            caution: `Eliminar definitivamente una plantilla huérfana exige escribir ELIMINAR más MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
          },
        ],
      },
    ],
    procedures: [
      {
        id: "aprobar-plantilla",
        title: "Validar y aprobar una plantilla para el Estudio",
        goal: "Asegurar coincidencia 1:1 entre el visor del cliente y el archivo 300 DPI de Taller.",
        route: "/admin/plantillas",
        steps: [
          "Abre la vista previa de la plantilla y revisa sus variantes compatibles.",
          "Comprueba relación de aspecto, zonas de recorte, textos y todas sus caras.",
          "Aprueba la plantilla y entra al Estudio público (`/estudio/[slug]`) subiendo fotos de prueba.",
          "Verifica el visor 3D y el guardado de borrador antes de anunciar el producto.",
        ],
        expected:
          "El cliente personaliza sin desbordes y Taller recibe renders alineados al troquel físico.",
      },
    ],
    cautions: [
      "Si ocultas la única plantilla aprobada de un producto personalizado, los clientes no podrán diseñarlo.",
    ],
    dontTouch: [
      "Nunca apruebes una plantilla sin abrir primero su previsualización completa y probarla en el Estudio.",
    ],
    checklist: [
      "Geometría y caras verificadas en vista previa.",
      "Prueba real hecha en `/estudio/[slug]` en móvil y escritorio.",
    ],
    faqs: [
      {
        question: "¿Ocultar una plantilla daña los pedidos ya pagados que la usaron?",
        answer:
          "No. Los diseños guardados y pedidos históricos conservan su instantánea para renderizar e imprimir en Taller.",
      },
    ],
    related: ["productos", "disenos", "moderacion", "pedidos"],
    relatedPlaybooks: ["playbook-catalogo-estudio-lanzamiento"],
    keywords: ["Estudio", "plantilla", "lienzo", "Konva", "3D", "sangrado", "aprobar"],
    version: 3,
  },
  {
    id: "disenos",
    title: "Artes de galería para el Estudio",
    area: "Catálogo y producción",
    route: "/admin/disenos",
    summary:
      "Fondos/artes prediseñados y sets de fichas ilustradas del abecedario (sin SKU ni stock físico).",
    purpose:
      "Reúne en un solo módulo (incluyendo la antigua ruta `/admin/fichas`) los recursos gráficos listos que el comprador aplica con un toque en el Estudio y las colecciones temáticas de letras, números y símbolos para editores de nombres.",
    whenToUse: [
      "Para cargar colecciones estacionales de marcos o artes listos por variante.",
      "Para crear o completar un abecedario ilustrado en la pestaña Fichas del abecedario.",
      "Para archivar recursos obsoletos sin afectar pedidos pasados.",
    ],
    concepts: [
      {
        term: "Activo digital del Estudio",
        definition:
          "Recurso gráfico aplicable dentro del lienzo; no se vende suelto ni lleva inventario físico.",
      },
      {
        term: "Set de fichas completo",
        definition:
          "Abecedario ilustrado que debe cubrir A–Z, Ñ, tildes/números o símbolos previstos para que ningún nombre deje huecos.",
      },
    ],
    sections: [
      {
        id: "galeria",
        title: "Pestaña Galería prediseñada y Pestaña Fichas",
        summary: "Calidad de impresión a 300 DPI y cobertura completa de caracteres.",
        topics: [
          {
            id: "resolucion-derechos",
            label: "Nitidez para 300 DPI y derechos de autor",
            description:
              "El arte elegido por el cliente se inyecta directamente en el render final de Taller.",
            caution:
              "Sube únicamente ilustraciones propias o con licencia comercial vigente y resolución suficiente para impresión física.",
          },
          {
            id: "fichas-cobertura",
            label: "Cobertura de Ñ y caracteres en sets de letras",
            description: "Asocia cada carácter con su arte PNG correspondiente.",
            caution:
              "Verifica siempre la letra Ñ y dígitos antes de activar un set nuevo en Colombia.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "publicar-recurso",
        title: "Cargar y verificar artes o sets de letras en el Estudio",
        goal: "Habilitar recursos nítidos y completos sin huecos de caracteres.",
        route: "/admin/disenos",
        steps: [
          "Elige la pestaña Galería prediseñada o Fichas del abecedario y selecciona la variante o set destino.",
          "Sube los archivos en alta resolución verificando proporción y asignación exacta de cada carácter.",
          "Revisa especialmente la letra Ñ, vocales y símbolos habituales en sets de nombres.",
          "Abre el Estudio público y escribe un nombre de prueba (ej. con Ñ) o aplica el arte para confirmar encuadre.",
        ],
        expected:
          "Los clientes aplican el arte o arman nombres completos con calidad lista para imprenta.",
      },
    ],
    cautions: [
      `La eliminación permanente de un arte archivado borra sus archivos del Storage y exige escribir ELIMINAR más MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
    ],
    dontTouch: [
      "Jamás subas personajes con copyright de terceros ni imágenes descargadas de internet sin licencia comercial.",
      "No publiques un set de abecedario incompleto donde falten letras frecuentes o la Ñ.",
    ],
    checklist: [
      "Licencia comercial o autoría propia confirmada.",
      "Resolución apta para impresión a 300 DPI.",
      "Cobertura completa de letras (incluida Ñ) probada en el Estudio.",
    ],
    faqs: [
      {
        question: "¿Qué pasa si entro a la ruta antigua /admin/fichas?",
        answer:
          "Se resuelve automáticamente hacia este módulo, donde los abecedarios ilustrados viven integrados en su pestaña propia.",
      },
    ],
    related: ["plantillas", "productos", "moderacion"],
    relatedPlaybooks: ["playbook-catalogo-estudio-lanzamiento"],
    keywords: [
      "galería",
      "abecedario",
      "letras",
      "fichas",
      "artes digitales",
      "Estudio",
      "prediseñados",
    ],
    version: 4,
  },
];
