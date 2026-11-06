import type { AdminModuleGuide } from "../types";

export const CMS_GUIDES: AdminModuleGuide[] = [
  {
    id: "contenido",
    title: "Contenido y CMS",
    area: "Contenido",
    route: "/admin/contenido",
    summary: "Páginas, campos, bloques, borradores, mediateca y configuración editorial del sitio.",
    purpose:
      "Administra el contenido público mediante una estructura de páginas, secciones y campos. Permite editar, previsualizar y publicar sin cambiar código, conservando borradores, historial y reutilización de medios.",
    whenToUse: [
      "Para actualizar textos, imágenes o secciones del sitio.",
      "Para preparar un borrador y revisarlo antes de publicar.",
      "Para administrar medios reutilizables o ajustes globales autorizados.",
    ],
    concepts: [
      {
        term: "Página",
        definition: "Contenedor editorial asociado a una superficie pública y sus secciones.",
      },
      {
        term: "Campo",
        definition: "Unidad editable de contenido con una clave estable y un tipo definido.",
      },
      {
        term: "Bloque",
        definition: "Contenido estructurado o Markdown reutilizado dentro de una sección.",
      },
      {
        term: "Borrador",
        definition: "Versión de trabajo que todavía no debe considerarse publicada.",
      },
    ],
    sections: [
      {
        id: "paginas",
        title: "Páginas, secciones y campos",
        summary: "Organiza el contenido siguiendo la estructura prevista por el sitio.",
        topics: [
          {
            id: "campo",
            label: "Campo y clave",
            description: "Identifica el contenido dentro del mapa editorial.",
            caution:
              "No cambies claves ni tipos para resolver una necesidad visual; puedes desconectar el campo de la interfaz.",
          },
          {
            id: "texto",
            label: "Texto y Markdown",
            description: "Contenido enriquecido con encabezados, listas o enlaces admitidos.",
            interpretation: "Usa la vista previa para comprobar formato, enlaces y lectura móvil.",
          },
          {
            id: "setting",
            label: "Ajuste",
            description: "Valor de configuración editorial, distinto de un bloque de contenido.",
            interpretation: "Verifica su alcance: algunos ajustes afectan varias páginas.",
          },
          {
            id: "global",
            label: "Configuración global",
            description: "Contenido transversal como identidad o parámetros compartidos.",
            caution: "Está restringido y su impacto no se limita a la página que estás viendo.",
          },
        ],
      },
      {
        id: "publicacion",
        title: "Borradores y publicación",
        summary: "Controla qué versión se está editando y cuál ve el público.",
        topics: [
          {
            id: "borrador",
            label: "Borrador",
            description: "Versión editable previa a publicación.",
            interpretation: "Guardar un borrador no garantiza que el cambio ya sea visible.",
          },
          {
            id: "preview",
            label: "Vista previa",
            description: "Permite revisar el resultado antes de publicar.",
            interpretation: "Comprueba enlaces, imágenes y adaptación móvil, no solo el texto.",
          },
          {
            id: "publicar",
            label: "Publicación",
            description: "Convierte la versión revisada en contenido vigente y renueva su caché.",
            caution:
              "Revisa el conjunto de cambios: publicar puede afectar visitantes inmediatamente.",
          },
          {
            id: "historial",
            label: "Historial",
            description: "Permite identificar versiones anteriores y entender cambios.",
            interpretation: "Úsalo para comparar antes de restaurar o revertir.",
          },
        ],
      },
      {
        id: "mediateca",
        title: "Mediateca",
        summary: "Biblioteca de imágenes reutilizables para campos compatibles.",
        topics: [
          {
            id: "subir",
            label: "Carga de medios",
            description: "Registra una imagen para reutilizarla en contenido.",
            interpretation:
              "Usa un nombre descriptivo, buena resolución y texto alternativo adecuado.",
          },
          {
            id: "alt",
            label: "Texto alternativo",
            description: "Describe el propósito o contenido de la imagen para accesibilidad.",
            interpretation: "No repitas «imagen de» ni uses el nombre técnico del archivo.",
          },
          {
            id: "reuso",
            label: "Uso en campos",
            description: "Relaciona el mismo medio con varias ubicaciones.",
            caution: "Reemplazar o retirar un medio puede afectar todas sus referencias.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "publicar-contenido",
        title: "Editar y publicar contenido",
        goal: "Actualizar el sitio sin publicar errores ni perder el borrador.",
        steps: [
          "Abre la página y localiza la sección y el campo correctos.",
          "Edita el contenido respetando tipo, clave y estructura.",
          "Guarda el borrador y revisa la vista previa en escritorio y móvil.",
          "Comprueba ortografía, enlaces, imágenes, textos legales y datos de contacto.",
          "Publica cuando el conjunto esté aprobado.",
          "Abre la página pública y verifica el resultado después de la renovación de caché.",
        ],
        expected:
          "La versión pública coincide con el borrador revisado y no altera contenido ajeno.",
        exceptions: [
          "Si el cambio no aparece de inmediato, verifica que publicaste la versión correcta y espera la renovación de caché antes de duplicar cambios.",
        ],
      },
      {
        id: "gestionar-medio",
        title: "Agregar y usar una imagen",
        goal: "Reutilizar un recurso accesible y optimizado.",
        steps: [
          "Carga la imagen en Mediateca con un nombre reconocible.",
          "Agrega texto alternativo según su función.",
          "Selecciónala en el campo de imagen correspondiente.",
          "Revisa recorte, peso y presentación en la vista previa.",
          "Publica y verifica todas las ubicaciones relacionadas.",
        ],
        expected: "La imagen se muestra nítida, accesible y coherente en cada uso.",
      },
    ],
    cautions: [
      "No pegues HTML o código de origen desconocido; utiliza los formatos admitidos.",
      "Los cambios legales, de contacto o condiciones comerciales deben sincronizarse con las fuentes oficiales del negocio.",
    ],
    faqs: [
      {
        question: "¿Guardar y publicar son lo mismo?",
        answer:
          "No. Guardar conserva el trabajo; publicar convierte la versión en contenido visible.",
      },
      {
        question: "¿Por qué no puedo editar Ajustes globales?",
        answer: "Esa superficie requiere una capacidad adicional y está limitada a dirección.",
      },
    ],
    related: ["email-templates", "redirects", "ayuda"],
    keywords: ["CMS", "página", "campo", "bloque", "borrador", "publicar", "mediateca", "Markdown"],
    version: 1,
  },
  {
    id: "email-templates",
    title: "Plantillas de correo",
    area: "Contenido",
    route: "/admin/email-templates",
    summary: "Personalización y previsualización de correos transaccionales y operativos.",
    purpose:
      "Permite ajustar textos editoriales de las plantillas registradas sin modificar su lógica de envío ni variables obligatorias. Cada plantilla conserva una finalidad y eventos de negocio concretos.",
    whenToUse: [
      "Para editar asunto, preheader o titular de una plantilla.",
      "Para revisar cómo se verá un correo antes de activar cambios.",
      "Para diagnosticar diferencias entre contenido editorial y datos variables.",
    ],
    concepts: [
      {
        term: "Plantilla base",
        definition: "Implementación registrada en código que define estructura, variables y envío.",
      },
      {
        term: "Override",
        definition:
          "Personalización editorial almacenada que reemplaza únicamente los textos permitidos.",
      },
      {
        term: "Preheader",
        definition: "Texto breve que puede aparecer junto al asunto en la bandeja de entrada.",
      },
    ],
    sections: [
      {
        id: "editor",
        title: "Edición y vista previa",
        summary: "Muestra textos editables y una representación del correo resultante.",
        topics: [
          {
            id: "asunto",
            label: "Asunto",
            description: "Texto principal visible en la bandeja.",
            interpretation: "Debe reflejar el evento real sin prometer estados no confirmados.",
          },
          {
            id: "preheader",
            label: "Preheader",
            description: "Complementa el asunto y mejora el contexto previo a apertura.",
            interpretation: "Evita repetir exactamente el asunto.",
          },
          {
            id: "variables",
            label: "Datos variables",
            description: "Información que la aplicación inserta al renderizar.",
            caution:
              "No borres ni alteres marcadores necesarios; valida la vista previa con datos de ejemplo.",
          },
          {
            id: "preview",
            label: "Vista previa",
            description: "Render de referencia del correo.",
            interpretation:
              "Puede diferir entre clientes de correo; revisa texto y enlaces esenciales.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "editar-correo",
        title: "Actualizar una plantilla",
        goal: "Mejorar el mensaje sin romper su contenido dinámico.",
        steps: [
          "Identifica la plantilla por evento y finalidad, no solo por nombre.",
          "Edita únicamente los campos editoriales permitidos.",
          "Conserva variables, enlaces y condiciones del mensaje.",
          "Revisa la vista previa de escritorio y móvil.",
          "Guarda y verifica el resultado con el mecanismo de prueba disponible sin usar clientes reales.",
        ],
        expected:
          "El correo conserva datos dinámicos y comunica el evento correcto con la nueva redacción.",
      },
    ],
    cautions: [
      "Una vista previa no confirma entrega; los problemas de envío se investigan en Integraciones y Observabilidad.",
    ],
    faqs: [
      {
        question: "¿Puedo crear un correo nuevo desde aquí?",
        answer:
          "El módulo personaliza plantillas registradas; una nueva finalidad requiere implementación técnica.",
      },
    ],
    related: ["contenido", "integraciones", "observability", "carritos"],
    keywords: ["correo", "asunto", "preheader", "Resend", "preview", "transaccional"],
    version: 1,
  },
  {
    id: "redirects",
    title: "Redirecciones SEO",
    area: "Contenido",
    route: "/admin/redirects",
    summary: "Gestión de URLs antiguas hacia destinos vigentes con códigos 301 o 302.",
    purpose:
      "Conserva navegación y valor de búsqueda cuando cambia una URL. Permite redirigir enlaces antiguos y revisar cuántas veces se han utilizado.",
    whenToUse: [
      "Después de cambiar el slug de un producto, categoría u ocasión.",
      "Para retirar una página sin dejar un enlace roto.",
      "Para corregir una redirección o revisar sus impactos.",
    ],
    concepts: [
      {
        term: "301",
        definition: "Redirección permanente para una URL que cambió definitivamente.",
      },
      {
        term: "302",
        definition:
          "Redirección temporal para una sustitución que no debe considerarse definitiva.",
      },
      {
        term: "Cadena o bucle",
        definition:
          "Secuencia innecesaria o circular de redirecciones que degrada acceso e indexación.",
      },
    ],
    sections: [
      {
        id: "regla",
        title: "Regla de redirección",
        summary: "Define origen, destino, tipo y actividad.",
        topics: [
          {
            id: "origen",
            label: "URL de origen",
            description: "Ruta antigua que debe dejar de responder como contenido independiente.",
            interpretation:
              "Escríbela exactamente como se enlazaba, sin dominio si el módulo espera ruta interna.",
          },
          {
            id: "destino",
            label: "URL de destino",
            description: "Página vigente que mejor reemplaza el contenido anterior.",
            interpretation: "Debe responder correctamente y ser equivalente para el visitante.",
          },
          {
            id: "tipo",
            label: "301 o 302",
            description: "Indica si el cambio es permanente o temporal.",
            caution:
              "No uses 302 para ocultar una migración permanente ni 301 para una prueba temporal.",
          },
          {
            id: "impactos",
            label: "Contador de impactos",
            description: "Registra usos de la redirección.",
            interpretation:
              "Ayuda a conocer tráfico residual, pero no equivale a visitantes únicos.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "crear-redirect",
        title: "Crear una redirección segura",
        goal: "Llevar la URL antigua al destino correcto sin ciclos.",
        steps: [
          "Comprueba que la URL antigua aparece en enlaces o índices y que la nueva funciona.",
          "Registra origen, destino y tipo adecuado.",
          "Revisa que no exista otra regla conflictiva o un destino que vuelva al origen.",
          "Guarda y abre la URL antigua en una ventana privada.",
          "Verifica destino final, ausencia de cadenas y comportamiento de enlaces relacionados.",
        ],
        expected: "La ruta antigua responde con una sola transición hacia contenido vigente.",
      },
    ],
    cautions: [
      "No redirijas a la página de inicio por defecto si no es un reemplazo relevante del contenido.",
    ],
    faqs: [
      {
        question: "¿Cuándo puedo eliminar una redirección?",
        answer:
          "Solo cuando la URL antigua ya no tenga uso ni valor de enlaces; revisa impactos y fuentes externas antes.",
      },
    ],
    related: ["productos", "categorias", "ocasiones", "contenido"],
    keywords: ["301", "302", "URL", "SEO", "slug", "enlace roto", "redirección"],
    version: 1,
  },
];
