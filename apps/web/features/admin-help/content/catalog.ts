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
          "Elige bajo pedido para productos del Estudio o stock físico para productos terminados; el servidor fuerza bajo pedido si interviene el Estudio.",
          "Crea cada variante con SKU único, precio, peso y dimensiones correctos; solo en stock físico registra existencias y reserva de seguridad.",
          "Configura personalización y receta de materiales cuando apliquen.",
          "Revisa SEO, escalas de volumen, publicación en el canal web y visibilidad pública.",
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
      "La purga definitiva desde la papelera es irreversible y exige escribir ELIMINAR más verificación MFA reciente (≤ 10 min).",
    ],
    faqs: [
      {
        question: "¿Dónde edito el costo unitario de fabricación del producto?",
        answer:
          "El costo unitario se gobierna de forma centralizada en Costos y márgenes (/admin/costos). En la pestaña Avanzado de la ficha verás el valor vigente en modo lectura con enlace directo.",
      },
      {
        question: "¿Qué hago antes de cambiar una URL?",
        answer:
          "Al cambiar el slug de un producto, categoría u ocasión existente se registra redirección 301 automática; aun así verifica tus enlaces en Redirecciones.",
      },
    ],
    related: ["inventario", "categorias", "mayorista", "costos", "plantillas", "redirects"],
    keywords: [
      "SKU",
      "variante",
      "precio",
      "SEO",
      "BOM",
      "receta",
      "personalización",
      "publicar",
      "bajo pedido",
      "stock físico",
    ],
    version: 2,
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
    summary:
      "Existencias reales de productos terminados, reserva de seguridad, disponible neto y kardex por canal.",
    purpose:
      "Controla únicamente variantes PHYSICAL_STOCK. Separa stock físico, safetyStock y disponible neto (stock − reserva, con piso 0); los productos MADE_TO_ORDER se administran por activación e insumos, sin contaminar este inventario.",
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
    keywords: [
      "stock",
      "existencias",
      "kardex",
      "agotado",
      "umbral",
      "ajuste",
      "reserva",
      "disponible neto",
      "bajo pedido",
    ],
    version: 2,
  },
  {
    id: "mayorista",
    title: "Precios al por mayor",
    area: "Catálogo y producción",
    route: "/admin/mayorista",
    summary:
      "Escalas automáticas de descuento por volumen con validación anti-inversión y control de margen BOM.",
    purpose:
      "Define precios unitarios escalonados desde una cantidad mínima (por producto o globales). Editable por Superadmin y Gerencia Operativa, con auditoría de solo lectura para Analista Financiero.",
    whenToUse: [
      "Para configurar o ajustar una escala de compra por cantidad.",
      "Para auditar qué tramos tienen margen saludable o están bajo costo BOM.",
      "Para verificar qué regla específica de producto hace sombra sobre la escala global.",
    ],
    concepts: [
      {
        term: "Coherencia monotónica",
        definition:
          "El servidor bloquea tramos que igualen o superen el precio público de referencia o que cobren igual/más caro a mayor cantidad.",
      },
      {
        term: "Sombra sobre escala global",
        definition:
          "Cuando un producto tiene al menos un tramo propio activo, reemplaza por completo las escalas globales del catálogo.",
      },
    ],
    sections: [
      {
        id: "escalas",
        title: "Configuración y simulador de margen",
        summary: "Define alcance, umbrales, precios unitarios y revisa el margen frente a Costos.",
        topics: [
          {
            id: "alcance",
            label: "Opción específica, producto o global",
            description:
              "Determina si el tramo aplica a una opción/tamaño específico, a todas las opciones del producto o a todo el catálogo.",
            interpretation:
              "Precedencia estricta: opción específica > producto completo > escala global. Las opciones del producto definen solo atributos físicos (tamaño/imán) y todo descuento por cantidad vive acá.",
          },
          {
            id: "minimo",
            label: "Cantidad mínima (2 hasta el tope del producto)",
            description:
              "Umbral desde el cual el carrito aplica automáticamente el precio unitario, acotado al selector de cada producto (15 unid., 6 packs, 4 calendarios, 10 sets o 100 en stock físico).",
            interpretation:
              "A mayor cantidad mínima, el precio unitario debe ser estrictamente menor. Cuando el umbral coincide con el máximo del selector (ej. 6 packs), se muestra sin el signo +.",
          },
          {
            id: "precio",
            label: "Precio unitario y alerta BOM",
            description:
              "Simula en vivo el ahorro %, el total mínimo y el margen frente al costo unitario.",
            caution:
              "Si el precio cae por debajo del costo BOM se resalta en rojo como alerta de liquidación; eliminar un tramo exige MFA reciente (≤ 10 min).",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "crear-escala",
        title: "Crear y auditar una escala de volumen",
        goal: "Publicar un tramo coherente sin erosionar el margen.",
        steps: [
          "Selecciona el producto específico o el alcance global.",
          "Ingresa cantidad mínima (≥ 2) y precio unitario inferior al precio base.",
          "Revisa en el simulador en vivo el ahorro % y el margen bruto frente a Costos.",
          "Verifica que no haya conflicto de escala invertida con otros tramos activos.",
          "Guarda y comprueba la salud del tramo en el gráfico de márgenes.",
        ],
        expected:
          "El carrito recalcula automáticamente el precio unitario al alcanzar el umbral y conserva coherencia económica.",
      },
    ],
    cautions: [
      "Un cupón de campaña puede combinarse en el checkout sobre el subtotal resultante; contrasta el margen combinado.",
      "Eliminar definitivamente un tramo requiere confirmación MFA reciente (≤ 10 min); si es temporal, desactívalo.",
    ],
    faqs: [
      {
        question: "¿Por qué el sistema bloquea guardar o reactivar un tramo?",
        answer:
          "Porque la cantidad mínima supera el tope del selector de ese producto, el precio iguala o supera el precio público de referencia, o rompe el orden decreciente frente a otro tramo activo del mismo alcance.",
      },
      {
        question: "¿La escala es exclusiva para empresas?",
        answer:
          "No: las escalas activas aplican automáticamente en el carrito público al cumplir las unidades mínimas; para cotizaciones a medida desde 25 unidades usa Oportunidades B2B.",
      },
    ],
    related: ["productos", "costos", "cupones", "oportunidades"],
    keywords: ["volumen", "mayorista", "descuento", "cantidad", "escala", "B2B", "margen"],
    version: 2,
  },
  {
    id: "materiales",
    title: "Materiales e insumos",
    area: "Catálogo y producción",
    route: "/admin/materiales",
    summary: "Catálogo de insumos de taller, costos unitarios, unidades y alertas de bajo stock.",
    purpose:
      "Mantiene la información base de materia prima para el taller y el costeo por receta BOM. Cada material define su unidad, stock actual vs mínimo y costo unitario que alimenta el costo sugerido en Costos y márgenes.",
    whenToUse: [
      "Para registrar o actualizar insumos de fabricación (papel, tinta, imanes, empaques).",
      "Para actualizar el costo por unidad usado en recetas BOM.",
      "Para revisar alertas de baja disponibilidad de materiales en taller.",
    ],
    concepts: [
      {
        term: "Unidad de consumo",
        definition:
          "Medida en la que se expresa el stock y cada receta BOM (unidad, pliego, metro, ml, paquete).",
      },
      {
        term: "Stock mínimo",
        definition:
          "Umbral operativo por debajo del cual un insumo activo se marca con alerta de Bajo stock.",
      },
    ],
    sections: [
      {
        id: "insumo",
        title: "Datos del material",
        summary: "Configura información que alimenta las recetas BOM y el costo sugerido.",
        topics: [
          {
            id: "costo",
            label: "Costo por unidad",
            description:
              "Valor en pesos asociado a la unidad de medida registrada (guardado internamente en centavos COP).",
            interpretation:
              "Debe corresponder a la misma unidad usada en las recetas BOM de productos.",
          },
          {
            id: "recetas",
            label: "Recetas BOM vinculadas",
            description: "Indica cuántos productos usan el insumo en su receta de fabricación.",
            interpretation:
              "Actualizar su costo recalcula de inmediato el costo sugerido en Costos y márgenes.",
          },
          {
            id: "stock",
            label: "Disponibilidad y alerta",
            description: "Control operativo de insumos de taller frente a su stock mínimo.",
            interpretation:
              "Es independiente del stock de productos terminados gestionado en Inventario.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "actualizar-material",
        title: "Actualizar un material",
        goal: "Mantener recetas BOM y costos sugeridos con datos coherentes.",
        steps: [
          "Verifica material y unidad de consumo.",
          "Actualiza costo unitario o existencias con información real de compra.",
          "Revisa cuántos productos usan el insumo en su receta BOM.",
          "Abre Costos y márgenes para revisar la diferencia frente al costo vigente.",
        ],
        expected: "Las recetas calculan con una unidad y costo actualizados sin ambigüedad.",
      },
    ],
    cautions: [
      "Cambiar unidades sin revisar las recetas de los productos puede multiplicar o dividir el costo sugerido.",
    ],
    faqs: [
      {
        question: "¿Materiales e Inventario son lo mismo?",
        answer:
          "No. Materiales gestiona insumos de fabricación de taller; Inventario controla existencias de variantes vendibles.",
      },
    ],
    related: ["costos", "productos", "inventario"],
    keywords: ["insumo", "BOM", "taller", "unidad", "costo", "materia prima"],
    version: 2,
  },
  {
    id: "costos",
    title: "Costos y márgenes",
    area: "Catálogo y producción",
    route: "/admin/costos",
    summary:
      "Gobierno centralizado del costo unitario, costo sugerido por receta BOM y margen bruto.",
    purpose:
      "Centraliza el costo de fabricación por unidad de cada producto activo y calcula su margen bruto frente al precio mínimo de venta de sus variantes. Superadmin y Operaciones actualizan costos; Analista Financiero consulta y audita en modo de solo lectura.",
    whenToUse: [
      "Para registrar o actualizar el costo unitario de fabricación de un producto.",
      "Para aplicar con un clic el costo sugerido por su receta BOM («Usar sugerido»).",
      "Para auditar productos en pérdida o con margen ajustado (< 20%) antes de ajustar precios o escalas mayoristas.",
    ],
    concepts: [
      {
        term: "Costo unitario vigente",
        definition:
          "Valor en centavos COP guardado en el producto para calcular su margen bruto real.",
      },
      {
        term: "Sugerido por materiales (BOM)",
        definition:
          "Suma informativa de cantidad × costo unitario de la receta del producto; solo actualiza el costo vigente cuando pulsas «Usar sugerido».",
      },
      {
        term: "Margen bruto mínimo",
        definition:
          "Diferencia entre el precio activo más bajo de las variantes del producto y su costo unitario.",
      },
    ],
    sections: [
      {
        id: "simulador",
        title: "Lectura de costos y rentabilidad",
        summary: "Compara costo manual, receta BOM y precio mínimo de venta.",
        topics: [
          {
            id: "costo-unitario",
            label: "Costo unitario",
            description: "Única superficie donde se edita el costo de fabricación del producto.",
            interpretation:
              "Operaciones y Superadmin pueden guardarlo; Analista Financiero lo ve en modo lectura.",
          },
          {
            id: "receta",
            label: "Sugerido por receta BOM",
            description:
              "Cálculo automático según los insumos asignados en la pestaña Materiales del producto.",
            interpretation:
              "Si difiere de tu costo vigente, verás una insignia ámbar con la brecha exacta.",
          },
          {
            id: "margen",
            label: "Margen bruto ($ y %)",
            description:
              "Rentabilidad calculada en el escenario conservador (variante más económica).",
            interpretation:
              "Verde ≥ 20 % (sano), ámbar 0–20 % (ajustado frente a fletes/pasarela), rosa < 0 % (en pérdida).",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "simular-margen",
        title: "Actualizar y auditar el costo de un producto",
        goal: "Mantener márgenes saludables con trazabilidad de auditoría.",
        steps: [
          "Filtra por «Sin costo», «Difieren de BOM» o «En pérdida» para priorizar.",
          "Verifica la receta BOM del producto si el sugerido parece atípico.",
          "Ingresa el costo unitario en pesos o pulsa «Usar sugerido» (si tienes rol de Operaciones o Superadmin).",
          "Comprueba que el margen resultante supere el umbral saludable antes de activar descuentos o escalas.",
        ],
        expected: "El costo queda auditado en bitácora y sincronizado con la ficha del producto.",
      },
    ],
    cautions: [
      "El margen bruto sobre costo de fabricación no incluye comisiones de pasarela ni impuestos; no lo confundas con utilidad neta.",
    ],
    faqs: [
      {
        question: "¿Por qué veo la tabla en modo de solo lectura?",
        answer:
          "El rol Analista Financiero tiene acceso de auditoría financiera (lectura), mientras la edición de costos unitarios pertenece a Operaciones y Superadmin.",
      },
      {
        question: "¿Por qué cambió el costo sugerido sin editar el producto?",
        answer:
          "Porque cambió el costo por unidad de algún insumo en Materiales o la cantidad en su receta BOM.",
      },
    ],
    related: ["materiales", "productos", "mayorista", "finanzas"],
    keywords: ["margen", "rentabilidad", "BOM", "receta", "costo", "fabricación"],
    version: 2,
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
    cautions: [
      "Ocultar una plantilla no debe usarse para alterar diseños o pedidos históricos.",
      "Eliminar definitivamente una plantilla huérfana no aprobada es irreversible y exige escribir ELIMINAR más código MFA reciente (≤ 10 min).",
    ],
    faqs: [
      {
        question: "¿Aprobar una plantilla la imprime automáticamente?",
        answer:
          "No. Solo la habilita para personalización; producción depende del pedido, diseño y moderación.",
      },
    ],
    related: ["productos", "disenos", "moderacion", "pedidos"],
    keywords: ["Estudio", "lienzo", "capas", "preview", "aprobar", "personalización"],
    version: 2,
  },
  {
    id: "disenos",
    title: "Artes de galería para el Estudio",
    area: "Catálogo y producción",
    route: "/admin/disenos",
    summary: "Activos digitales sin SKU ni stock físico para personalizar en el Estudio.",
    purpose:
      "Administra artes de galería y fichas ilustradas que los clientes aplican a sus personalizaciones. No son productos terminados ni consumen inventario físico. La pestaña de fichas concentra los abecedarios ilustrados; la antigua ruta independiente Fichas converge aquí.",
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
    cautions: [
      "No subas material con datos personales o sin derechos de uso.",
      "Eliminar permanentemente un diseño archivado borra sus archivos del servidor y exige escribir ELIMINAR más código MFA reciente (≤ 10 min).",
    ],
    faqs: [
      {
        question: "¿Dónde está la antigua página Fichas?",
        answer: "Redirige a la pestaña integrada en Diseños prediseñados.",
      },
    ],
    related: ["plantillas", "productos", "moderacion"],
    keywords: [
      "galería",
      "abecedario",
      "letras",
      "fichas",
      "imágenes",
      "Estudio",
      "artes digitales",
      "sin stock",
    ],
    version: 3,
  },
];
