import type { AdminModuleGuide } from "../types";

export const CATALOG_GUIDES: AdminModuleGuide[] = [
  {
    id: "productos",
    title: "Productos y variantes",
    area: "Catálogo y producción",
    route: "/admin/productos",
    summary:
      "Gestión integral del catálogo: contenido, variantes, precios, imágenes, SEO, receta y personalización.",
    purpose:
      "Define qué se vende, cómo se presenta y qué especificaciones usa cada variante. La página principal administra el producto y las vistas de creación, edición y variantes controlan su configuración completa.",
    whenToUse: [
      "Para crear o actualizar un producto y sus variantes.",
      "Para corregir visibilidad, contenido, precios, imágenes o SEO.",
      "Para revisar receta de materiales y esquema de personalización.",
    ],
    concepts: [
      {
        term: "Producto",
        definition:
          "Entidad comercial principal que agrupa contenido y una o más variantes vendibles.",
      },
      {
        term: "Variante",
        definition: "Opción concreta con SKU, atributos, precio, stock y datos físicos propios.",
      },
      {
        term: "Receta BOM",
        definition:
          "Lista de materiales y cantidades utilizada para estimar el costo de fabricación.",
      },
    ],
    sections: [
      {
        id: "contenido",
        title: "Información comercial",
        summary: "Controla identidad, presentación y visibilidad en tienda.",
        topics: [
          {
            id: "slug",
            label: "Nombre y slug",
            description: "Identifican el producto y construyen su URL pública.",
            caution: "Cambiar el slug puede romper enlaces; crea la redirección correspondiente.",
          },
          {
            id: "visibilidad",
            label: "Visibilidad en tienda",
            description: "Resume si el producto puede mostrarse según su configuración y estado.",
            interpretation:
              "Revisa tanto el producto como sus variantes, imágenes y categorías si no aparece.",
          },
          {
            id: "seo",
            label: "SEO",
            description:
              "Título, descripción e información usada en buscadores y enlaces compartidos.",
            interpretation: "Debe describir el producto real sin promesas que la tienda no cumple.",
          },
          {
            id: "imagenes",
            label: "Imágenes",
            description: "Material visual de la ficha pública y vistas del producto.",
            caution: "Usa imágenes propias, nítidas y coherentes con la variante ofrecida.",
          },
        ],
      },
      {
        id: "variantes",
        title: "Variantes y fabricación",
        summary: "Define la opción vendible y sus consecuencias económicas y técnicas.",
        topics: [
          {
            id: "sku",
            label: "SKU",
            description: "Identificador único de la variante para operación e inventario.",
            caution: "No reutilices SKU entre opciones distintas.",
          },
          {
            id: "precio",
            label: "Precio",
            description: "Valor unitario almacenado internamente en centavos COP.",
            interpretation: "Verifica el precio público y las escalas mayoristas antes de guardar.",
          },
          {
            id: "fisicos",
            label: "Peso y dimensiones",
            description: "Datos usados por cotización, empaque y reglas logísticas.",
            interpretation: "Valores incompletos pueden impedir o distorsionar fletes.",
          },
          {
            id: "personalizacion",
            label: "Esquema de personalización",
            description: "Define qué experiencia del Estudio y qué datos necesita la variante.",
            caution:
              "Un cambio puede afectar diseños y pedidos futuros; valida el Estudio después de editarlo.",
          },
          {
            id: "bom",
            label: "Materiales",
            description: "Insumos y cantidades que componen la receta de la variante.",
            interpretation:
              "Alimenta el simulador de costos; no descuenta por sí solo inventario de materiales.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "publicar-producto",
        title: "Crear o actualizar un producto",
        goal: "Publicar una oferta completa, coherente y operable.",
        steps: [
          "Completa nombre, slug, descripción, categoría e imágenes.",
          "Crea cada variante con SKU único, precio, stock, peso y dimensiones correctos.",
          "Configura personalización y receta de materiales cuando apliquen.",
          "Revisa SEO, escalas de volumen y visibilidad pública.",
          "Guarda y abre la ficha pública para comprobar contenido, variantes y compra.",
          "Si cambiaste el slug de un producto existente, registra la redirección desde la URL anterior.",
        ],
        expected:
          "La ficha pública ofrece exactamente lo que inventario, producción y logística pueden cumplir.",
        exceptions: [
          "Si el producto no aparece, revisa archivado, estado activo, variantes y categoría antes de duplicarlo.",
        ],
      },
    ],
    cautions: [
      "No edites SKU o personalización de forma improvisada cuando existan pedidos históricos; conserva la trazabilidad.",
      "Los cambios de precio no deben presentarse como retroactivos a compras ya realizadas.",
    ],
    faqs: [
      {
        question: "¿Por qué el precio no coincide con Costos?",
        answer:
          "Productos define el precio de venta; Costos calcula insumos, cargos y margen estimado con ese valor.",
      },
      {
        question: "¿Qué hago antes de cambiar una URL?",
        answer:
          "Guarda la URL anterior, actualiza el slug y crea una redirección permanente hacia la nueva.",
      },
    ],
    related: ["inventario", "categorias", "mayorista", "costos", "plantillas", "redirects"],
    keywords: ["SKU", "variante", "precio", "SEO", "BOM", "receta", "personalización", "publicar"],
    version: 1,
  },
  {
    id: "categorias",
    title: "Categorías",
    area: "Catálogo y producción",
    route: "/admin/categorias",
    summary:
      "Árbol de categorías, contenido editorial, filtros, ventanas estacionales y producto destacado.",
    purpose:
      "Organiza el catálogo y define cómo se navega cada grupo de productos. Las categorías padre e hijas estructuran la tienda, mientras sus textos y facetas orientan la exploración.",
    whenToUse: [
      "Para reorganizar la navegación del catálogo.",
      "Para configurar filtros visibles, contenido o producto insignia.",
      "Para programar una categoría estacional.",
    ],
    concepts: [
      {
        term: "Categoría padre",
        definition: "Nivel superior que agrupa subcategorías y orienta la jerarquía pública.",
      },
      {
        term: "Facetas",
        definition: "Filtros disponibles para acotar productos dentro de una categoría.",
      },
      {
        term: "Ventana estacional",
        definition: "Período configurado para la presencia o énfasis de una categoría temporal.",
      },
    ],
    sections: [
      {
        id: "configuracion",
        title: "Jerarquía y experiencia de categoría",
        summary: "Administra estructura, presentación y descubrimiento.",
        topics: [
          {
            id: "jerarquia",
            label: "Padre e hijas",
            description: "Determina la relación entre categorías y su navegación.",
            caution: "Evita ciclos o cambios que dejen productos en una ubicación inesperada.",
          },
          {
            id: "intro",
            label: "Introducción enriquecida",
            description: "Texto editorial que explica el contenido de la categoría.",
            interpretation:
              "Debe ayudar a elegir y mantenerse sincronizado con los productos reales.",
          },
          {
            id: "filtros",
            label: "Filtros visibles",
            description: "Selecciona qué facetas puede usar el visitante.",
            interpretation:
              "Muestra solo filtros con valores útiles en los productos de la categoría.",
          },
          {
            id: "destacado",
            label: "Producto insignia",
            description: "Fija un producto representativo con distintivo visual.",
            interpretation: "Debe estar activo y pertenecer coherentemente a la categoría.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "configurar-categoria",
        title: "Configurar una categoría",
        goal: "Mejorar navegación sin perder acceso a productos existentes.",
        steps: [
          "Define nombre, slug y posición jerárquica.",
          "Redacta contenido acorde con los productos incluidos.",
          "Selecciona filtros útiles y, opcionalmente, producto insignia y ventana estacional.",
          "Guarda y revisa la categoría pública en escritorio y móvil.",
          "Comprueba productos, filtros, URL y enlaces anteriores; crea redirección si cambiaste el slug.",
        ],
        expected:
          "La categoría presenta productos correctos y filtros funcionales desde una navegación coherente.",
      },
    ],
    cautions: [
      "No elimines una categoría como atajo para ocultar productos; revisa primero sus relaciones y URLs públicas.",
    ],
    faqs: [
      {
        question: "¿Por qué un filtro no muestra resultados?",
        answer:
          "Puede no corresponder con los atributos de los productos activos; revisa variantes y facetas seleccionadas.",
      },
    ],
    related: ["productos", "ocasiones", "redirects"],
    keywords: ["jerarquía", "subcategoría", "facetas", "filtros", "destacado", "estacional"],
    version: 1,
  },
  {
    id: "ocasiones",
    title: "Ocasiones",
    area: "Catálogo y producción",
    route: "/admin/ocasiones",
    summary:
      "Etiquetas transversales para descubrir productos según celebración, destinatario o momento.",
    purpose:
      "Agrupa productos por ocasión sin alterar su categoría principal. Permite construir recorridos como fechas especiales o tipos de regalo manteniendo una taxonomía transversal.",
    whenToUse: [
      "Para crear o editar una ocasión de compra.",
      "Para asociar productos a una celebración o momento.",
      "Para revisar la presentación pública de una etiqueta.",
    ],
    concepts: [
      {
        term: "Ocasión",
        definition:
          "Etiqueta comercial transversal que puede reunir productos de varias categorías.",
      },
    ],
    sections: [
      {
        id: "etiqueta",
        title: "Configuración de la ocasión",
        summary: "Controla identidad, contenido y productos relacionados.",
        topics: [
          {
            id: "slug",
            label: "Nombre y slug",
            description: "Texto visible e identificador de la URL de ocasión.",
            caution: "Crea una redirección si cambias el slug de una ocasión publicada.",
          },
          {
            id: "productos",
            label: "Productos asociados",
            description: "Selección que aparece al explorar la ocasión.",
            interpretation: "Revisa que estén activos y realmente sean apropiados para el momento.",
          },
          {
            id: "contenido",
            label: "Descripción e imagen",
            description: "Presentación editorial de la ocasión.",
            interpretation:
              "Debe orientar la elección sin duplicar innecesariamente la descripción de categoría.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "publicar-ocasion",
        title: "Publicar una ocasión",
        goal: "Crear un recorrido transversal coherente.",
        steps: [
          "Define nombre, slug y contenido de la ocasión.",
          "Asocia productos activos y pertinentes.",
          "Guarda y revisa la página pública y sus enlaces.",
          "Crea redirección si reemplazaste una URL existente.",
        ],
        expected: "La ocasión reúne una selección vigente y navegable sin modificar categorías.",
      },
    ],
    cautions: [
      "Una ocasión no sustituye la categoría ni el inventario; retirarla no archiva sus productos.",
    ],
    faqs: [
      {
        question: "¿Un producto puede tener varias ocasiones?",
        answer:
          "Sí, precisamente las ocasiones permiten descubrirlo en distintos momentos de compra.",
      },
    ],
    related: ["productos", "categorias", "redirects"],
    keywords: ["celebración", "regalo", "etiqueta", "fecha especial", "ocasión"],
    version: 1,
  },
  {
    id: "inventario",
    title: "Inventario",
    area: "Catálogo y producción",
    route: "/admin/inventario",
    summary: "Existencias por variante, umbrales de stock bajo y trazabilidad de movimientos.",
    purpose:
      "Controla disponibilidad de productos terminados y facilita ajustes auditables. Permite diferenciar el stock físico, el umbral de alerta y el historial que explica cada cambio.",
    whenToUse: [
      "Para revisar agotados o existencias bajas.",
      "Para ajustar stock después de un conteo o movimiento real.",
      "Para investigar diferencias mediante el kardex.",
    ],
    concepts: [
      {
        term: "Stock",
        definition:
          "Cantidad disponible registrada para una variante; debe corresponder con la realidad operativa.",
      },
      {
        term: "Umbral",
        definition: "Nivel a partir del cual una variante se considera baja y requiere revisión.",
      },
      {
        term: "Kardex",
        definition: "Historial de movimientos y ajustes que explica la evolución del stock.",
      },
    ],
    sections: [
      {
        id: "existencias",
        title: "Existencias y alertas",
        summary: "Resume disponibilidad por variante y facilita filtros operativos.",
        topics: [
          {
            id: "disponible",
            label: "Cantidad disponible",
            description: "Existencia actual usada por la operación de catálogo.",
            interpretation: "Contrástala con pedidos y conteo físico si hay diferencias.",
          },
          {
            id: "bajo",
            label: "Stock bajo",
            description: "Filtro que compara disponibilidad con el umbral configurado.",
            interpretation: "No significa agotado; indica necesidad de reposición o revisión.",
          },
          {
            id: "ajuste",
            label: "Ajuste manual",
            description: "Corrige la cantidad registrada y deja movimiento en el historial.",
            caution:
              "Documenta el motivo y no uses ajustes para ocultar pérdidas o errores de proceso.",
          },
          {
            id: "kardex",
            label: "Movimientos",
            description: "Entradas, salidas y correcciones asociadas a la variante.",
            interpretation:
              "Revisa fecha, cantidad, saldo y referencia antes de hacer otro ajuste.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "ajustar-stock",
        title: "Corregir una existencia",
        goal: "Alinear sistema y conteo físico conservando trazabilidad.",
        steps: [
          "Identifica producto y variante por SKU.",
          "Realiza o verifica el conteo físico.",
          "Revisa movimientos recientes para evitar duplicar una corrección.",
          "Registra la diferencia con motivo claro.",
          "Comprueba el nuevo saldo y la disponibilidad pública.",
        ],
        expected: "El saldo coincide con la operación y el kardex explica el ajuste.",
      },
    ],
    cautions: [
      "No edites stock desde varios lugares simultáneamente ni uses valores negativos para representar pedidos pendientes.",
    ],
    faqs: [
      {
        question: "¿Stock bajo y agotado son iguales?",
        answer:
          "No. Stock bajo depende del umbral; agotado indica que no hay unidades disponibles.",
      },
    ],
    related: ["productos", "materiales", "pedidos"],
    keywords: ["stock", "existencias", "kardex", "agotado", "umbral", "ajuste"],
    version: 1,
  },
  {
    id: "mayorista",
    title: "Precios al por mayor",
    area: "Catálogo y producción",
    route: "/admin/mayorista",
    summary: "Escalas públicas de descuento por volumen para productos específicos o el catálogo.",
    purpose:
      "Define precios unitarios que se activan al alcanzar cantidades determinadas. Permite configurar incentivos por volumen sin crear cupones ni duplicar variantes.",
    whenToUse: [
      "Para configurar una escala de compra por cantidad.",
      "Para revisar qué regla global o de producto aplica.",
      "Para validar márgenes antes de publicar un descuento.",
    ],
    concepts: [
      {
        term: "Escala",
        definition:
          "Relación entre una cantidad mínima y el precio unitario aplicable a partir de ella.",
      },
      {
        term: "Regla global",
        definition:
          "Escala aplicable de forma general, contrastada con reglas específicas de producto.",
      },
    ],
    sections: [
      {
        id: "escalas",
        title: "Configuración de escalas",
        summary: "Define alcance, umbrales y precios unitarios.",
        topics: [
          {
            id: "alcance",
            label: "Global o por producto",
            description: "Determina qué ofertas puede afectar la escala.",
            interpretation: "Revisa especificidad y posibles solapamientos antes de guardar.",
          },
          {
            id: "minimo",
            label: "Cantidad mínima",
            description: "Umbral desde el cual aplica el nivel de precio.",
            interpretation: "Ordena niveles coherentemente y evita umbrales duplicados.",
          },
          {
            id: "precio",
            label: "Precio por unidad",
            description: "Valor aplicable a cada unidad cuando se cumple la escala.",
            caution: "Comprueba margen, impuestos y presentación en centavos antes de publicar.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "crear-escala",
        title: "Crear una escala de volumen",
        goal: "Aplicar el descuento correcto en el carrito.",
        steps: [
          "Selecciona alcance y producto cuando corresponda.",
          "Define cantidad mínima y precio unitario.",
          "Contrasta el precio con Costos y otras escalas existentes.",
          "Guarda y simula cantidades por debajo y por encima del umbral.",
          "Verifica el total y el precio unitario mostrados en tienda.",
        ],
        expected: "El carrito aplica una sola escala coherente y el negocio conserva margen.",
      },
    ],
    cautions: [
      "No asumas que una escala reemplaza cupones o promociones; valida el resultado final del carrito.",
    ],
    faqs: [
      {
        question: "¿La escala es solo para empresas?",
        answer:
          "Las escalas públicas se aplican según cantidad; no dependen por sí solas de una oportunidad B2B.",
      },
    ],
    related: ["productos", "costos", "cupones", "oportunidades"],
    keywords: ["volumen", "mayorista", "descuento", "cantidad", "escala", "B2B"],
    version: 1,
  },
  {
    id: "materiales",
    title: "Materiales e insumos",
    area: "Catálogo y producción",
    route: "/admin/materiales",
    summary: "Catálogo de insumos, costos, unidades, mermas y alertas de disponibilidad.",
    purpose:
      "Mantiene la información base para producción y costeo por receta. Cada material define cómo se mide y qué costo utiliza el simulador de margen.",
    whenToUse: [
      "Para registrar o actualizar insumos de fabricación.",
      "Para corregir costo, unidad o merma usados en recetas.",
      "Para revisar alertas de baja disponibilidad de materiales.",
    ],
    concepts: [
      {
        term: "Unidad de consumo",
        definition: "Medida en la que la receta descuenta o estima el material.",
      },
      {
        term: "Merma",
        definition: "Proporción adicional considerada para desperdicio normal de producción.",
      },
    ],
    sections: [
      {
        id: "insumo",
        title: "Datos del material",
        summary: "Configura información que alimenta las recetas y el costo estimado.",
        topics: [
          {
            id: "costo",
            label: "Costo",
            description: "Valor asociado a la unidad de medida registrada.",
            interpretation: "Debe corresponder a la misma unidad usada en las recetas.",
          },
          {
            id: "merma",
            label: "Merma",
            description: "Ajuste por desperdicio incluido en el costeo.",
            interpretation: "No la uses para esconder errores o variaciones sin revisar.",
          },
          {
            id: "stock",
            label: "Disponibilidad y alerta",
            description: "Información operativa de insumos y su nivel de reposición.",
            interpretation:
              "Es distinta del stock de productos terminados gestionado en Inventario.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "actualizar-material",
        title: "Actualizar un material",
        goal: "Mantener recetas y costos con datos coherentes.",
        steps: [
          "Verifica material y unidad de consumo.",
          "Actualiza costo, merma o disponibilidad con información real.",
          "Revisa las variantes que usan el material en su receta.",
          "Abre Costos y comprueba el efecto en el margen.",
        ],
        expected: "Las recetas calculan con una unidad y costo actualizados sin ambigüedad.",
      },
    ],
    cautions: [
      "Cambiar unidades sin revisar recetas puede multiplicar o dividir costos de forma incorrecta.",
    ],
    faqs: [
      {
        question: "¿Materiales e Inventario son lo mismo?",
        answer:
          "No. Materiales gestiona insumos de fabricación; Inventario controla existencias de variantes vendibles.",
      },
    ],
    related: ["costos", "productos", "inventario"],
    keywords: ["insumo", "BOM", "merma", "unidad", "costo", "materia prima"],
    version: 1,
  },
  {
    id: "costos",
    title: "Costos de fabricación",
    area: "Catálogo y producción",
    route: "/admin/costos",
    summary: "Simulador de costo unitario y margen bruto por variante.",
    purpose:
      "Permite entender cómo insumos, mermas, empaque y comisiones afectan la rentabilidad estimada. Es una herramienta de análisis, no un registro contable ni una liquidación de pagos.",
    whenToUse: [
      "Antes de cambiar precios o descuentos por volumen.",
      "Para comparar escenarios de materiales y comisiones.",
      "Para detectar variantes con margen insuficiente.",
    ],
    concepts: [
      {
        term: "Costo unitario",
        definition: "Estimación de producir una unidad con la receta y parámetros seleccionados.",
      },
      {
        term: "Margen bruto",
        definition:
          "Diferencia entre precio y costos considerados, expresada en valor o porcentaje según la vista.",
      },
    ],
    sections: [
      {
        id: "simulador",
        title: "Lectura del simulador",
        summary: "Descompone el resultado para identificar qué lo explica.",
        topics: [
          {
            id: "receta",
            label: "Materiales y empaque",
            description: "Costos derivados de la receta y los insumos configurados.",
            interpretation: "Revisa unidades y mermas si un valor parece atípico.",
          },
          {
            id: "comision",
            label: "Comisión de pago",
            description: "Estimación del cargo del medio seleccionado.",
            interpretation:
              "No incluye automáticamente cualquier costo contable o financiero no configurado.",
          },
          {
            id: "margen",
            label: "Margen bruto",
            description: "Resultado entre ingreso y costos simulados.",
            interpretation:
              "Compara siempre usando el mismo escenario y no lo confundas con utilidad neta.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "simular-margen",
        title: "Evaluar el margen de una variante",
        goal: "Validar un precio con supuestos explícitos.",
        steps: [
          "Selecciona variante y escenario de pago.",
          "Verifica receta, unidades, mermas y empaque.",
          "Revisa costo unitario y descomposición de cargos.",
          "Compara el margen con precios normales y escalas de volumen.",
          "Ajusta Productos o Materiales si procede y vuelve a simular.",
        ],
        expected:
          "La decisión de precio se basa en un escenario reproducible y no en una estimación mental.",
      },
    ],
    cautions: ["El margen bruto simulado no es utilidad neta ni reemplaza la contabilidad."],
    faqs: [
      {
        question: "¿Por qué cambió el margen sin editar el producto?",
        answer: "Puede haber cambiado un material, merma, comisión u otro parámetro de la receta.",
      },
    ],
    related: ["materiales", "productos", "mayorista", "finanzas"],
    keywords: ["margen", "rentabilidad", "simulador", "comisión", "empaque", "fabricación"],
    version: 1,
  },
  {
    id: "plantillas",
    title: "Plantillas del Estudio",
    area: "Catálogo y producción",
    route: "/admin/plantillas",
    summary:
      "Revisión, aprobación y disponibilidad de plantillas usadas en el Estudio de personalización.",
    purpose:
      "Controla qué plantillas están disponibles para clientes y permite inspeccionar su vista previa real antes de aprobarlas. Conecta configuración editorial con la experiencia de diseño y producción.",
    whenToUse: [
      "Para revisar una plantilla nueva o modificada.",
      "Para ocultar o restaurar una plantilla del Estudio.",
      "Para comprobar geometría y vista previa por variante.",
    ],
    concepts: [
      {
        term: "Plantilla",
        definition:
          "Configuración de lienzo, capas y superficies que guía la personalización de una variante.",
      },
    ],
    sections: [
      {
        id: "revision",
        title: "Vista previa y disponibilidad",
        summary: "Muestra el comportamiento visual y el estado de aprobación.",
        topics: [
          {
            id: "preview",
            label: "Vista previa real",
            description: "Render usado para comprobar cómo se presenta la plantilla.",
            interpretation:
              "Revisa todas las escenas o superficies relevantes, no solo la miniatura.",
          },
          {
            id: "aprobada",
            label: "Aprobada o visible",
            description: "Determina si la plantilla puede ofrecerse al cliente.",
            caution: "Aprobar sin revisar puede publicar geometrías o contenido incorrectos.",
          },
          {
            id: "variante",
            label: "Variantes relacionadas",
            description: "Indica dónde se utiliza la plantilla.",
            interpretation:
              "Si hay varias opciones, verifica que el cliente pueda elegir correctamente.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "aprobar-plantilla",
        title: "Revisar y publicar una plantilla",
        goal: "Ofrecer una experiencia de personalización correcta.",
        steps: [
          "Abre la plantilla y revisa sus variantes.",
          "Inspecciona la vista previa y todas las superficies disponibles.",
          "Comprueba dimensiones, posición, capas y legibilidad.",
          "Aprueba o restaura solo si el resultado es correcto.",
          "Abre el Estudio público y valida selección, edición y guardado básico.",
        ],
        expected:
          "La plantilla funciona en el Estudio y coincide con las superficies de producción.",
      },
    ],
    cautions: ["Ocultar una plantilla no debe usarse para alterar diseños o pedidos históricos."],
    faqs: [
      {
        question: "¿Aprobar una plantilla la imprime automáticamente?",
        answer:
          "No. Solo la habilita para personalización; producción depende del pedido, diseño y moderación.",
      },
    ],
    related: ["productos", "disenos", "moderacion", "pedidos"],
    keywords: ["Estudio", "lienzo", "capas", "preview", "aprobar", "personalización"],
    version: 1,
  },
  {
    id: "disenos",
    title: "Diseños prediseñados y fichas",
    area: "Catálogo y producción",
    route: "/admin/disenos",
    summary: "Biblioteca de imágenes listas para el Estudio y sets ilustrados de letras.",
    purpose:
      "Administra recursos visuales que los clientes aplican a sus personalizaciones. La pestaña de fichas concentra los abecedarios ilustrados; la antigua ruta independiente Fichas converge aquí.",
    whenToUse: [
      "Para agregar o revisar diseños prediseñados.",
      "Para organizar imágenes por variante o tema.",
      "Para administrar sets y fichas de letras, números y símbolos.",
    ],
    concepts: [
      {
        term: "Diseño prediseñado",
        definition:
          "Recurso visual listo para aplicar en el Estudio sin que el cliente suba una fotografía propia.",
      },
      {
        term: "Set de fichas",
        definition:
          "Colección temática de imágenes asociadas a caracteres para editores de nombres y letras.",
      },
    ],
    sections: [
      {
        id: "galeria",
        title: "Galería prediseñada",
        summary: "Organiza imágenes y su disponibilidad por variante.",
        topics: [
          {
            id: "variante",
            label: "Variante compatible",
            description: "Determina dónde puede aplicarse el recurso.",
            interpretation: "Verifica proporciones y zona de diseño antes de asociarlo.",
          },
          {
            id: "imagen",
            label: "Imagen y miniatura",
            description: "Contenido visual que verá el cliente.",
            caution:
              "Usa recursos con derechos de uso y calidad suficiente para el resultado final.",
          },
        ],
      },
      {
        id: "fichas",
        title: "Fichas del abecedario",
        summary: "Gestiona sets temáticos y correspondencia entre caracteres e imágenes.",
        topics: [
          {
            id: "set",
            label: "Set temático",
            description: "Agrupa una colección completa bajo un estilo.",
            interpretation: "Mantén consistencia visual y cobertura de caracteres requeridos.",
          },
          {
            id: "caracter",
            label: "Carácter y ficha",
            description: "Relaciona cada letra, número o símbolo con su imagen.",
            caution: "Revisa Ñ, números y caracteres especiales antes de publicar el set.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "publicar-recurso",
        title: "Publicar recursos para el Estudio",
        goal: "Ofrecer material completo y visualmente consistente.",
        steps: [
          "Selecciona el tipo de recurso y la variante o set.",
          "Carga imágenes con nombres y caracteres correctos.",
          "Revisa miniaturas, proporciones y cobertura del set.",
          "Abre el Estudio y aplica el recurso en una personalización de prueba.",
          "Comprueba que el resultado se conserve al guardar el diseño.",
        ],
        expected: "Los recursos aparecen donde corresponde y funcionan dentro del editor.",
      },
    ],
    cautions: ["No subas material con datos personales o sin derechos de uso."],
    faqs: [
      {
        question: "¿Dónde está la antigua página Fichas?",
        answer: "Redirige a la pestaña integrada en Diseños prediseñados.",
      },
    ],
    related: ["plantillas", "productos", "moderacion"],
    keywords: ["galería", "abecedario", "letras", "fichas", "imágenes", "Estudio"],
    version: 1,
  },
];
