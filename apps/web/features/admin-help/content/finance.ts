import type { AdminModuleGuide } from "../types";

export const FINANCE_GUIDES: AdminModuleGuide[] = [
  {
    id: "finanzas",
    title: "Finanzas",
    area: "Finanzas y analítica",
    route: "/admin/finanzas",
    summary: "Reporte de ingresos, descuentos, fletes y exportación contable.",
    purpose:
      "Consolida información financiera de pedidos para análisis y entrega contable. Permite leer componentes del ingreso y exportar registros sin confundir ventas, recaudos y disponibilidad de efectivo.",
    whenToUse: [
      "Para revisar resultados de un período.",
      "Para descomponer ingresos, descuentos y envíos.",
      "Para exportar información contable con filtros verificados.",
    ],
    concepts: [
      {
        term: "Ingreso",
        definition:
          "Valor registrado según los criterios del reporte; no equivale necesariamente a caja recibida.",
      },
      {
        term: "Descuento",
        definition:
          "Reducción comercial aplicada al total, separada del precio bruto de los ítems.",
      },
      {
        term: "Flete",
        definition:
          "Cargo de envío asociado al pedido, presentado por separado cuando corresponde.",
      },
    ],
    sections: [
      {
        id: "reporte",
        title: "Lectura financiera",
        summary: "Resume totales y detalle según el período seleccionado.",
        topics: [
          {
            id: "periodo",
            label: "Período (hora Colombia)",
            description:
              "Define qué pedidos entran en el reporte usando cortes exactos en zona America/Bogota (-05:00).",
            interpretation:
              "Los cortes de día y mes calendario usan siempre hora Colombia para cuadrar con contabilidad local.",
          },
          {
            id: "ingresos",
            label: "Ingresos, Pago Directo B2B y puente de caja real",
            description:
              "Separa ingresos pagados en línea (Wompi), pagos directos corporativos (Bre-B / Transferencia netos de retenciones practicadas) y recaudos contraentrega remitidos, en calle o con discrepancia.",
            interpretation:
              "En pedidos B2B con retención en la fuente, el ingreso bruto fiscal se mantiene íntegro y el puente de caja descuenta las retenciones certificadas para reflejar el efectivo real en banco.",
          },
          {
            id: "descuentos",
            label: "Descuentos y fletes",
            description: "Componentes que explican el total final del pedido.",
            interpretation: "No los mezcles con costos de fabricación o comisiones.",
          },
          {
            id: "export",
            label: "Exportación CSV y protección PII",
            description:
              "Descarga el detalle contable con verificación MFA reciente (≤ 10 min) y protección contra fórmulas.",
            caution:
              "Para Analista Financiero el correo del comprador sale enmascarado por mínimo privilegio, preservando íntegros los campos fiscales DIAN (tipo/número documento, razón social y CUFE).",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "exportar-finanzas",
        title: "Preparar un reporte contable",
        goal: "Entregar un extracto completo y reproducible.",
        steps: [
          "Selecciona el período verificando el corte en hora Colombia (COT).",
          "Contrasta totales, puente de caja real, conciliación COD y retractos del período.",
          "Pulsa Exportar CSV y confirma tu código MFA si han pasado más de 10 minutos.",
          "Comprueba columnas fiscales DIAN, registros y totales antes de compartir.",
          "Entrega el archivo por un canal autorizado indicando período y fecha de corte.",
        ],
        expected:
          "Contabilidad recibe un archivo consistente con la revisión, zona horaria Colombia y mínimo privilegio.",
      },
    ],
    cautions: [
      "No uses el total del reporte como saldo bancario ni como prueba aislada de recaudo.",
    ],
    faqs: [
      {
        question: "¿Por qué Finanzas y Dashboard difieren?",
        answer:
          "Compara períodos, estados y definiciones; Finanzas es la fuente especializada para el reporte financiero.",
      },
      {
        question: "¿Por qué veo el correo del comprador enmascarado en el CSV?",
        answer:
          "El rol Analista Financiero recibe los campos tributarios DIAN completos para conciliación contable, mientras el correo comercial se enmascara por protección de datos personales.",
      },
    ],
    related: ["conciliacion", "costos", "metricas", "pedidos", "oportunidades"],
    keywords: [
      "ingresos",
      "CSV",
      "contabilidad",
      "Bre-B",
      "retenciones",
      "descuentos",
      "fletes",
      "reporte",
      "DIAN",
    ],
    version: 3,
  },
  {
    id: "conciliacion",
    title: "Conciliación contraentrega",
    area: "Finanzas y analítica",
    route: "/admin/finanzas/conciliacion",
    summary: "Control de recaudos COD, remesas del carrier, diferencias y pendientes.",
    purpose:
      "Compara lo entregado y recaudado contra lo reportado o remitido por la transportadora. Su objetivo es demostrar qué valores ya fueron conciliados y cuáles requieren investigación.",
    whenToUse: [
      "Después de entregas con pago contraentrega.",
      "Al recibir una remesa o reporte del carrier.",
      "Para investigar diferencias entre pedido, recaudo y remesa.",
    ],
    concepts: [
      {
        term: "COD",
        definition:
          "Cobro contra entrega; el pedido puede estar entregado antes de que el negocio reciba la remesa.",
      },
      {
        term: "Remesa",
        definition:
          "Valor que la transportadora reporta o transfiere al negocio por recaudos gestionados.",
      },
      {
        term: "Discrepancia",
        definition:
          "Diferencia entre los valores esperados y los reportados que necesita explicación.",
      },
    ],
    sections: [
      {
        id: "pendientes",
        title: "Pendientes y diferencias",
        summary: "Organiza pedidos entregados, recaudos esperados y remesas.",
        topics: [
          {
            id: "esperado",
            label: "Valor esperado",
            description: "Monto que debería haberse recaudado según el pedido.",
            interpretation: "Verifica total, entrega parcial y condiciones del pedido.",
          },
          {
            id: "remesado",
            label: "Valor remesado",
            description: "Monto efectivamente reportado por la transportadora.",
            interpretation: "Registra el valor real, no el esperado, aunque exista diferencia.",
          },
          {
            id: "discrepancia",
            label: "Diferencia",
            description: "Brecha entre recaudo esperado y recibido.",
            caution: "No la ajustes a cero sin soporte; conserva evidencia y escala al carrier.",
          },
          {
            id: "fecha",
            label: "Antigüedad y confirmación MFA",
            description:
              "Destaca entregas con más de 7 días sin remesa y exige MFA reciente (≤ 10 min) al conciliar.",
            interpretation:
              "Prioriza las entregas envejecidas (> 7 días) antes de que cierre el ciclo de liquidación del carrier.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "conciliar-cod",
        title: "Conciliar una remesa COD",
        goal: "Cerrar valores verificados y aislar diferencias.",
        steps: [
          "Obtén el reporte de la transportadora y filtra por número de pedido o guía.",
          "Verifica entregas pendientes, especialmente aquellas con alerta de más de 7 días sin remesa.",
          "Registra el valor efectivamente recibido o reporta discrepancia completando la reautenticación MFA.",
          "Documenta discrepancias con soporte verificable y escala al carrier o a Bloqueos COD si hubo abuso.",
          "Comprueba el pulso de 14 días y el balance acumulado de recaudo.",
        ],
        expected:
          "Cada pedido COD queda conciliado con evidencia MFA o marcado con diferencia explícita en Pedidos.",
      },
    ],
    cautions: ["Entrega, recaudo por el mensajero y recepción bancaria son eventos distintos."],
    faqs: [
      {
        question: "¿Puedo conciliar porque el pedido aparece entregado?",
        answer: "No basta: necesitas verificar el recaudo y la remesa o evidencia equivalente.",
      },
    ],
    related: ["finanzas", "bloqueos", "pedidos", "envios"],
    keywords: ["COD", "remesa", "contraentrega", "discrepancia", "recaudo", "carrier"],
    version: 2,
  },
  {
    id: "bloqueos",
    title: "Bloqueos contraentrega",
    area: "Finanzas y analítica",
    route: "/admin/finanzas/bloqueos",
    summary: "Restricciones antifraude de identidades para la modalidad de pago contraentrega.",
    purpose:
      "Impide ofrecer COD a señales de identidad con antecedentes de abuso, sin bloquear pagos anticipados en línea. Exige confirmación MFA reciente (≤ 10 min) para agregar o levantar bloqueos y enmascara PII en roles analíticos.",
    whenToUse: [
      "Al confirmar abuso reiterado o incumplimiento COD.",
      "Para revisar si una identidad está restringida.",
      "Para levantar un bloqueo con evidencia y autorización MFA.",
    ],
    concepts: [
      {
        term: "Identidad bloqueada",
        definition: "Señal como correo, teléfono o dirección que el sistema usa para impedir COD.",
      },
      {
        term: "Normalización",
        definition:
          "Transformación consistente que permite comparar datos aunque cambie su formato.",
      },
    ],
    sections: [
      {
        id: "restriccion",
        title: "Gestión de bloqueos",
        summary: "Registra alcance, motivo y estado de la restricción con MFA reciente.",
        topics: [
          {
            id: "tipo",
            label: "Tipo de identidad",
            description:
              "Define si la regla aplica a correo, teléfono o dirección con ciudad normalizada.",
            interpretation: "Selecciona la señal respaldada por la evidencia.",
          },
          {
            id: "motivo",
            label: "Motivo y auditoría",
            description:
              "Explica el antecedente que justifica el bloqueo y queda trazado en Auditoría con PII enmascarado.",
            caution: "Registra hechos verificables y evita datos o calificativos innecesarios.",
          },
          {
            id: "alcance",
            label: "Solo contraentrega",
            description: "La restricción impide COD, no pagos verificados en línea con Wompi.",
            interpretation:
              "No prometas un bloqueo total de compra: el sistema solo restringe el riesgo de recaudo en efectivo.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "bloquear-cod",
        title: "Registrar o retirar un bloqueo",
        goal: "Aplicar una medida antifraude proporcional y revisable.",
        steps: [
          "Revisa pedidos y evidencia del incumplimiento en Conciliación COD o Pedidos.",
          "Verifica que la identidad no esté ya registrada.",
          "Ingresa tipo, valor y motivo (o pulsa Desbloquear) y confirma con MFA reciente (≤ 10 min).",
          "Comprueba que el registro quede listado y trazado en Auditoría.",
          "Escala cualquier homonimia o dirección compartida.",
        ],
        expected:
          "La restricción se aplica solo a la identidad y modalidad previstas con trazabilidad MFA.",
      },
    ],
    cautions: [
      "No bloquees por una sola sospecha sin evidencia ni uses datos de otra persona para probar la regla.",
    ],
    faqs: [
      {
        question: "¿La persona puede pagar en línea?",
        answer:
          "Sí. El bloqueo COD oculta contraentrega pero mantiene habilitados los medios en línea.",
      },
    ],
    related: ["conciliacion", "pedidos", "finanzas"],
    keywords: ["fraude", "COD", "bloqueo", "lista negra", "teléfono", "dirección", "MFA"],
    version: 2,
  },
  {
    id: "metricas",
    title: "Métricas",
    area: "Finanzas y analítica",
    route: "/admin/metricas",
    summary: "Analítica CRM, RFM, LTV, embudo diario, cohortes y vigilancia fiscal.",
    purpose:
      "Ayuda a interpretar comportamiento, retención y valor de clientes a lo largo del tiempo. Complementa Finanzas con análisis conductual y señales de gestión, no con cifras de caja aisladas.",
    whenToUse: [
      "Para estudiar embudo, recurrencia y cohortes.",
      "Para interpretar segmentos RFM y valor de vida.",
      "Para revisar alertas y proyecciones de vigilancia fiscal.",
    ],
    concepts: [
      {
        term: "RFM",
        definition:
          "Segmentación por recencia, frecuencia y valor monetario del comportamiento histórico.",
      },
      {
        term: "LTV",
        definition:
          "Estimación del valor acumulado de la relación con un cliente según los criterios del modelo.",
      },
      {
        term: "Cohorte",
        definition:
          "Grupo de clientes que comparte un período de origen para comparar comportamiento posterior.",
      },
      {
        term: "UVT",
        definition:
          "Unidad de Valor Tributaria usada como referencia en los umbrales fiscales vigilados.",
      },
    ],
    sections: [
      {
        id: "comportamiento",
        title: "Comportamiento y retención",
        summary: "Analiza cómo compran y regresan los clientes.",
        topics: [
          {
            id: "rfm",
            label: "RFM",
            description: "Clasifica recencia, frecuencia y valor.",
            interpretation:
              "Compara grupos con el mismo período y no uses la etiqueta como dato sensible.",
          },
          {
            id: "ltv",
            label: "LTV",
            description: "Resume valor histórico o estimado de la relación.",
            interpretation: "No equivale a utilidad neta ni garantiza compras futuras.",
          },
          {
            id: "cohortes",
            label: "Cohortes",
            description: "Comparan la actividad posterior según el período de adquisición.",
            interpretation: "Las cohortes recientes tienen menos tiempo de observación.",
          },
        ],
      },
      {
        id: "embudo-fiscal",
        title: "Embudo y vigilancia fiscal",
        summary: "Relaciona eventos del recorrido y señales de umbrales.",
        topics: [
          {
            id: "embudo",
            label: "Embudo diario",
            description: "Agrupa eventos del recorrido comercial por etapa.",
            interpretation:
              "Revisa consentimiento, cobertura de eventos y caídas entre pasos antes de concluir.",
          },
          {
            id: "fiscal",
            label: "Umbral y proyección",
            description: "Mide acumulado y estima cierre por ritmo reciente.",
            interpretation: "La proyección no es una obligación liquidada; valida con contador.",
          },
          {
            id: "alertas",
            label: "70, 90 y 100 por ciento",
            description: "Señales por acercamiento o cruce del umbral configurado.",
            interpretation: "Confirma año, base de cálculo y obligación aplicable antes de actuar.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "interpretar-metricas",
        title: "Analizar una variación",
        goal: "Pasar de una señal agregada a una explicación verificable.",
        steps: [
          "Define período, métrica y segmento que vas a comparar.",
          "Revisa tamaño de la muestra y madurez de las cohortes.",
          "Contrasta embudo, RFM y LTV sin mezclar sus definiciones.",
          "Abre Finanzas o Pedidos para validar la base operativa.",
          "Documenta hipótesis y acciones sin presentar correlación como causalidad.",
        ],
        expected: "La decisión se apoya en métricas comprendidas y datos de origen verificados.",
      },
    ],
    cautions: [
      "Las alertas fiscales apoyan la gestión, pero no reemplazan asesoría contable o legal.",
    ],
    faqs: [
      {
        question: "¿Una proyección al 100 % significa que ya crucé el umbral?",
        answer:
          "No necesariamente. Distingue acumulado actual de cierre estimado y revisa la alerta correspondiente.",
      },
    ],
    related: ["finanzas", "segmentos", "dashboard", "hoy"],
    keywords: ["RFM", "LTV", "cohorte", "embudo", "UVT", "DIAN", "fiscal"],
    version: 1,
  },
  {
    id: "performance",
    title: "Rendimiento web",
    area: "Finanzas y analítica",
    route: "/admin/performance",
    summary: "Core Web Vitals reales por ruta y dispositivo, con percentiles y tendencias.",
    purpose:
      "Permite identificar problemas de velocidad y estabilidad vividos por visitantes. Usa telemetría real para priorizar rutas, en lugar de depender únicamente de pruebas de laboratorio.",
    whenToUse: [
      "Cuando una página se perciba lenta o inestable.",
      "Después de cambios visuales o de JavaScript.",
      "Para comparar comportamiento móvil y escritorio.",
    ],
    concepts: [
      {
        term: "LCP",
        definition: "Tiempo hasta renderizar el elemento principal; ayuda a medir carga percibida.",
      },
      { term: "INP", definition: "Medida de respuesta ante interacciones durante la visita." },
      { term: "CLS", definition: "Acumulación de movimientos inesperados del diseño visual." },
      {
        term: "p75",
        definition:
          "Percentil 75: aproximadamente tres de cada cuatro muestras quedan en ese valor o por debajo.",
      },
    ],
    sections: [
      {
        id: "vitals",
        title: "Métricas y segmentación",
        summary: "Descompone experiencia por métrica, ruta y dispositivo.",
        topics: [
          {
            id: "lcp",
            label: "LCP",
            description: "Evalúa la carga del contenido principal.",
            interpretation:
              "Revisa imágenes, servidor y bloqueos de renderizado en la ruta afectada.",
          },
          {
            id: "inp",
            label: "INP",
            description: "Evalúa demoras al interactuar.",
            interpretation: "Investiga JavaScript y tareas largas, no solo peso de imágenes.",
          },
          {
            id: "cls",
            label: "CLS",
            description: "Evalúa estabilidad visual.",
            interpretation: "Busca elementos sin dimensiones o contenido que empuja la interfaz.",
          },
          {
            id: "muestra",
            label: "Volumen y percentil",
            description: "Contextualiza la representatividad del valor.",
            interpretation: "No tomes un p75 con pocas muestras como tendencia concluyente.",
          },
        ],
      },
    ],
    procedures: [
      {
        id: "diagnosticar-vital",
        title: "Investigar una regresión de rendimiento",
        goal: "Identificar ruta, dispositivo y métrica afectados.",
        steps: [
          "Selecciona el período y localiza la métrica fuera del objetivo.",
          "Filtra por ruta y dispositivo para reducir el alcance.",
          "Revisa volumen de muestras y evolución temporal.",
          "Contrasta con cambios recientes y errores de Observabilidad.",
          "Documenta la hipótesis técnica y vuelve a medir después de corregir.",
        ],
        expected:
          "El diagnóstico identifica una población y métrica concretas con seguimiento medible.",
      },
    ],
    cautions: ["No optimices una ruta basándote solo en tu conexión o en una única visita."],
    faqs: [
      {
        question: "¿Lighthouse y estos valores son iguales?",
        answer:
          "No necesariamente: esta vista usa datos reales de usuarios; Lighthouse es una prueba controlada.",
      },
    ],
    related: ["observability", "integraciones", "dashboard"],
    keywords: ["LCP", "INP", "CLS", "p75", "Web Vitals", "lento", "RUM"],
    version: 1,
  },
];
