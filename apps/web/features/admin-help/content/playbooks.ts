import { HELP_LIVE_NUMBERS, formatThousandsEsCo } from "../constants";
import type { AdminPlaybook } from "../types";

export const ADMIN_PLAYBOOKS: AdminPlaybook[] = [
  {
    id: "playbook-pedido-web-300dpi",
    title: `1. Pedido web personalizado → Taller ${HELP_LIVE_NUMBERS.printResolutionDpi} DPI → Guía → Entrega`,
    area: "Operación",
    summary:
      "Ciclo completo de una compra directa personalizada desde el pago o confirmación COD hasta la entrega verificada y solicitud automática de reseña.",
    trigger:
      "Ingresa una orden nueva `LCM-YYYY-NNNN` con pago aprobado en Wompi o confirmada bajo modalidad contraentrega elegible.",
    durationHint: "Ciclo diario continuo",
    roles: [
      "SUPERADMIN",
      "OPERATIONS_MANAGER",
      "MANAGER",
      "PRINT_WORKSHOP",
      "FULFILLMENT",
      "CUSTOMER_SUPPORT",
    ],
    steps: [
      {
        id: "verificar-ingreso",
        title: "Confirmar estado comercial e insignias críticas",
        route: "/admin/pedidos",
        moduleLabel: "Pedidos",
        ownerRoles: ["OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN"],
        action:
          "Verifica en la cola activa que la orden esté Pagada (Wompi) o Confirmada (COD) e identifica de entrada si lleva insignia Regalo (`isGift`) o contraentrega.",
        verification:
          "La orden no está pendiente de pago ni cancelada y figura lista para revisión de arte.",
      },
      {
        id: "moderar-piezas",
        title: "Moderar el 100 % de los diseños personalizados",
        route: "/admin/moderacion",
        moduleLabel: "Moderación",
        ownerRoles: ["PRINT_WORKSHOP", "OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN"],
        action:
          "Inspecciona mosaico y piezas firmadas 300 DPI (incluyendo doble cara en Bola Navideña o lomo en Mini Libros) y comprueba si existe sello de baja resolución aceptado. Aprueba o rechaza con motivo claro.",
        verification:
          "Todos los diseños vinculados al pedido quedan en estado Aprobado (requisito obligatorio del gate de envío).",
        gateBadge: "Gate de despacho",
      },
      {
        id: "fabricar-300dpi",
        title: `Descargar paquete ZIP ${HELP_LIVE_NUMBERS.printResolutionDpi} DPI y fabricar en Taller`,
        route: "/admin/pedidos",
        moduleLabel: "Detalle de pedido (Taller)",
        ownerRoles: ["PRINT_WORKSHOP", "OPERATIONS_MANAGER", "SUPERADMIN"],
        action:
          "Abre `/admin/pedidos/[number]`, descarga el ZIP 300 DPI, contrasta variante física (con imán vs `-NOMAG`), unidades de la tanda × copias iguales e imprime también la dedicatoria si es regalo. Pasa a En producción al iniciar.",
        verification:
          "Piezas físicas fabricadas y revisadas en calidad coincidiendo 1:1 con la ficha del pedido.",
        gateBadge: "Descarga auditada",
      },
      {
        id: "alistar-guia",
        title: "Empacar, imprimir guía térmica y despachar antes del corte",
        route: "/admin/pedidos",
        moduleLabel: "Detalle de pedido (Despachos)",
        ownerRoles: ["FULFILLMENT", "OPERATIONS_MANAGER", "SUPERADMIN"],
        action:
          "Revisa conteo en mesa; si es Regalo, asegura cero precios dentro del paquete. Imprime el rótulo desde `/admin/pedidos/[number]/guia` (Aveonline nacional o Envío Lucams Bogotá/Soacha) y cambia a Enviado al entregar al operador.",
        verification:
          "Guía adherida, estado Enviado activo y comprador notificado automáticamente con su enlace `/pedido/[token]`.",
        gateBadge: "Corte horario",
      },
      {
        id: "confirmar-entrega-posventa",
        title: "Sincronizar entrega real y habilitar posventa / reseña",
        route: "/admin/pedidos",
        moduleLabel: "Pedidos y Reseñas",
        ownerRoles: ["FULFILLMENT", "OPERATIONS_MANAGER", "CUSTOMER_SUPPORT", "SUPERADMIN"],
        action:
          "En Aveonline el webhook + cron `tracking-sync` actualizan eventos; en Envío Lucams registra Entregado tras confirmación real del mensajero. El cron posterior enviará la solicitud de reseña verificada.",
        verification:
          "Pedido en `DELIVERED` (y si era COD, entra automáticamente a la cola de Conciliación contraentrega).",
      },
    ],
    edgeCases: [
      {
        scenario: "Un `RenderJob` 300 DPI aparece en error o no termina",
        resolution:
          "No imprimas miniaturas de pantalla. Escala a Superadmin para revisar `lucams-process-render-jobs` en /admin/observability y regenerar limpio.",
      },
      {
        scenario: "Falla la emisión de guía Aveonline al despachar",
        resolution:
          "Conserva el estado actual sin marcar Enviado a mano; verifica dirección DANE/peso y pide diagnóstico en /admin/integraciones/aveonline antes de reintentar una sola vez.",
      },
      {
        scenario: "Rechazaste un diseño por archivo corrupto o ilegal",
        resolution:
          "El cliente recibe correo automático con tu motivo; aguarda reemplazo/gestión por Soporte antes de producir el resto del pedido.",
      },
    ],
    dontTouch: [
      "Nunca metas factura ni precios impresos dentro de una orden con `isGift = true`.",
      "Nunca marques Enviado sin guía emitida ni antes de entregar físicamente el paquete.",
    ],
    relatedGuides: ["pedidos", "moderacion", "envios", "integraciones-aveonline", "resenas"],
    keywords: ["flujo pedido", "300 DPI", "taller", "ZIP", "Aveonline", "Envío Lucams", "regalo"],
    version: 1,
  },
  {
    id: "playbook-oportunidad-b2b-cierre",
    title: `2. Oportunidad B2B (≥ ${HELP_LIVE_NUMBERS.minB2bUnits} uds.) → Propuesta → Wompi / Bre-B MFA + Retención → Arte 300 DPI → DIAN`,
    area: "Ventas y CRM",
    summary:
      "Negociación corporativa o de eventos desde el configurador público hasta confirmación bancaria con retenciones, carga de arte maestro y cuadre fiscal.",
    trigger: `Solicitud recibida en \`/empresas-y-eventos\` (desde ${HELP_LIVE_NUMBERS.minB2bUnits} unidades físicas) o creación directa en Oportunidades B2B.`,
    durationHint: "Negociación consultiva + producción por lote",
    roles: [
      "SUPERADMIN",
      "OPERATIONS_MANAGER",
      "MANAGER",
      "CUSTOMER_SUPPORT",
      "PRINT_WORKSHOP",
      "FINANCE_ANALYST",
    ],
    steps: [
      {
        id: "calificar-solicitud",
        title: "Calificar oportunidad, propietario y viabilidad de fecha",
        route: "/admin/oportunidades",
        moduleLabel: "Oportunidades B2B",
        ownerRoles: ["OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN", "CUSTOMER_SUPPORT"],
        action:
          "Abre `/admin/oportunidades/[id]`, asigna responsable, valida contacto/empresa en Contacto 360 y revisa el semáforo de días hábiles colombianos frente a la fecha del evento.",
        verification:
          "Oportunidad en `QUALIFYING` con capacidad de taller confirmada y tarea activa.",
        gateBadge: "SLA evento",
      },
      {
        id: "emitir-propuesta",
        title: "Construir propuesta versionada con margen BOM y muestra digital",
        route: "/admin/oportunidades",
        moduleLabel: "Constructor de Propuestas",
        ownerRoles: ["OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN"],
        action:
          "Define líneas, cantidades y precios verificando margen positivo sobre costo BOM (`/admin/costos`), cotiza transporte (o flete multicaja), elige modalidad de arte (previa o post-pago) y emite la propuesta `/propuesta/[token]`.",
        verification:
          "Cliente recibe enlace seguro; si pide cambios, se emite `v2` reemplazando automáticamente `v1`.",
        gateBadge: "Piso costo BOM",
      },
      {
        id: "confirmar-pago-b2b",
        title: "Convertir a pedido y verificar pago (Wompi o Bre-B / Transferencia + MFA)",
        route: "/admin/pedidos",
        moduleLabel: "Detalle de pedido (Pago B2B)",
        ownerRoles: ["SUPERADMIN"],
        action: `Cuando el cliente aprueba en \`/propuesta/[token]\` nace la orden \`LCM\`. Si paga con Wompi se confirma por webhook; si elige Pago Directo (Bre-B / Transferencia) y sube comprobante, Superadmin verifica el abono real en extracto bancario, registra retenciones practicadas y aprueba con MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
        verification:
          "Orden pasa a Pagada y la oportunidad B2B se marca automáticamente como Ganada (`WON`).",
        gateBadge: `Superadmin + MFA ≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes}m`,
      },
      {
        id: "cargar-arte-maestro",
        title: `Subir arte maestro ${HELP_LIVE_NUMBERS.printResolutionDpi} DPI y pasar a Taller/Despacho`,
        route: "/admin/pedidos",
        moduleLabel: "Detalle de pedido (Arte B2B)",
        ownerRoles: ["OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN", "PRINT_WORKSHOP"],
        action:
          "En modalidad de arte posterior al pago, carga todas las piezas maestras 300 DPI aprobadas por el cliente corporativo para desbloquear el paquete ZIP de Taller y el posterior despacho.",
        verification: "Gate de arte B2B liberado, ZIP 300 DPI generado y lote despachado con guía.",
        gateBadge: "Gate arte 300 DPI",
      },
      {
        id: "conciliar-finanzas-dian",
        title: "Cuadrar puente de caja, retenciones y umbral DIAN 3.500 UVT",
        route: "/admin/finanzas",
        moduleLabel: "Finanzas y Métricas",
        ownerRoles: ["FINANCE_ANALYST", "SUPERADMIN"],
        action:
          "Comprueba en Finanzas que el ingreso bruto fiscal permanezca íntegro y el puente de caja descuente la retención certificada; revisa el impacto acumulado en Vigilancia Fiscal (`/admin/metricas`).",
        verification:
          "Ingreso B2B cuadrado en CSV contable DIAN y sumado en vigilancia de 3.500 UVT.",
      },
    ],
    edgeCases: [
      {
        scenario: "La empresa practica retención en la fuente al pagar transferencia",
        resolution:
          "Regístrala en el momento de confirmar el Pago Directo en el pedido (no como descuento comercial), para no reducir artificialmente el ingreso bruto tributario.",
      },
      {
        scenario: "El cliente pide agregar 20 unidades más después de enviada la propuesta `v1`",
        resolution:
          "Genera y envía `v2` desde `/admin/oportunidades/[id]`: `v1` queda revocada al instante para impedir pagos por el monto antiguo.",
      },
      {
        scenario: "El comprador corporativo pregunta si gana Puntos Lucams en la propuesta",
        resolution:
          "Aclárale con transparencia que las propuestas B2B ya tienen tarifa negociada por volumen y están excluidas del programa retail de puntos.",
      },
    ],
    dontTouch: [
      "Jamás confirmes un Pago Directo B2B solo con un PDF o captura de WhatsApp sin ver el dinero efectivo en el banco.",
      "Jamás cierres acuerdos de cambio de unidades por fuera del constructor versionado de propuestas.",
    ],
    relatedGuides: ["oportunidades", "pedidos", "costos", "finanzas", "metricas", "clientes"],
    keywords: [
      "B2B",
      "empresas",
      "eventos",
      "propuesta",
      "Bre-B",
      "transferencia",
      "retención",
      "DIAN",
      "3500 UVT",
    ],
    version: 1,
  },
  {
    id: "playbook-cod-conciliacion-bloqueos",
    title: "3. Contraentrega (COD) → Recaudo → Conciliación de remesa → Bloqueo antifraude",
    area: "Finanzas y analítica",
    summary:
      "Control extremo a extremo del efectivo contraentrega: desde validación antifraude en checkout hasta liquidación bancaria o bloqueo por no-show.",
    trigger:
      "Pedido creado con modalidad de pago contraentrega (transportadora nacional o Envío Lucams local).",
    durationHint: "Desde despacho hasta liquidación de remesa",
    roles: ["SUPERADMIN", "FINANCE_ANALYST", "FULFILLMENT", "OPERATIONS_MANAGER"],
    steps: [
      {
        id: "despacho-cod",
        title: "Verificar monto a recaudar en guía y despachar",
        route: "/admin/pedidos",
        moduleLabel: "Pedidos (Despachos)",
        ownerRoles: ["FULFILLMENT", "OPERATIONS_MANAGER", "SUPERADMIN"],
        action:
          "Al alistar una orden COD, Despachos visualiza el valor exacto a cobrar en entrega y confirma que el rótulo refleje correctamente la condición de recaudo.",
        verification: "Paquete en tránsito con recaudo COD registrado.",
      },
      {
        id: "entrega-transito-caja",
        title: "Separar evento Entregado frente a efectivo en banco",
        route: "/admin/finanzas/conciliacion",
        moduleLabel: "Conciliación contraentrega",
        ownerRoles: ["FINANCE_ANALYST", "SUPERADMIN"],
        action: `Al marcarse Entregado, el pedido entra a pendientes de conciliación. Vigila especialmente cualquier entrega que supere ${HELP_LIVE_NUMBERS.codAgingAlertDays} días sin reporte de remesa.`,
        verification: "Visibilidad clara del efectivo en calle pendiente de giro.",
        gateBadge: `Alerta > ${HELP_LIVE_NUMBERS.codAgingAlertDays} días`,
      },
      {
        id: "conciliar-remesa-mfa",
        title: "Conciliar planilla y extracto con MFA reciente",
        route: "/admin/finanzas/conciliacion",
        moduleLabel: "Conciliación contraentrega",
        ownerRoles: ["FINANCE_ANALYST", "SUPERADMIN"],
        action: `Con planilla del carrier y abono bancario en mano, registra el monto real recibido (o la discrepancia exacta si hubo faltante) confirmando MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
        verification:
          "Remesa cerrada en el puente de caja de Finanzas o marcada con discrepancia auditable para reclamo al operador.",
        gateBadge: `MFA ≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes}m`,
      },
      {
        id: "evaluar-bloqueo",
        title: "Restringir COD ante no-show o rechazo malicioso comprobado",
        route: "/admin/finanzas/bloqueos",
        moduleLabel: "Bloqueos contraentrega",
        ownerRoles: ["FINANCE_ANALYST", "SUPERADMIN"],
        action:
          "Si el paquete regresó por rechazo injustificado o datos falsos del comprador (descartando error del mensajero), bloquea su teléfono o correo con motivo objetivo y MFA reciente.",
        verification:
          "La identidad ya no verá COD en futuros checkouts, pero mantiene habilitado el pago anticipado con Wompi.",
        gateBadge: `MFA ≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes}m`,
      },
    ],
    edgeCases: [
      {
        scenario: "La dirección corresponde a un gran edificio corporativo o universidad",
        resolution:
          "Bloquea el teléfono o correo del infractor, nunca la dirección general del edificio para no perjudicar a otros compradores del mismo lugar.",
      },
      {
        scenario: "El mensajero devolvió el paquete sin haber visitado realmente al cliente",
        resolution:
          "No bloquees al comprador; gestiona el reclamo logístico con el operador y coordina reenvío desde Operaciones/Soporte.",
      },
    ],
    dontTouch: [
      "Nunca des por conciliada una orden COD sin ver el dinero reflejado en remesa/banco.",
      "Nunca fuerces a cero una diferencia de recaudo sin soporte documental.",
    ],
    relatedGuides: ["conciliacion", "bloqueos", "finanzas", "pedidos", "envios"],
    keywords: ["COD", "contraentrega", "remesa", "conciliar", "bloqueo", "no-show", "efectivo"],
    version: 1,
  },
  {
    id: "playbook-posventa-ley-1480-1581",
    title: "4. Posventa legal colombiana: PQR, Hábeas Data, Retracto y Garantía → Cierre MFA",
    area: "Servicio al cliente",
    summary:
      "Árbol de decisión y ejecución entre Soporte PQR, privacidad Ley 1581, derecho de retracto (Ley 1480/2439) y garantía legal con desembolso segregado.",
    trigger:
      "Un cliente escribe por `/contacto`, portal posventa `/pedido/[token]` o deja una reseña crítica 1★–2★.",
    durationHint: "Sujeto a SLAs legales estrictos",
    roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "CUSTOMER_SUPPORT", "FINANCE_ANALYST"],
    steps: [
      {
        id: "triaje-legal",
        title: "Clasificar el caso según su régimen y reloj legal exacto",
        route: "/admin/soporte",
        moduleLabel: "Soporte",
        ownerRoles: ["CUSTOMER_SUPPORT", "OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN"],
        action: `Identifica la vía: 1) Consulta Hábeas Data (${HELP_LIVE_NUMBERS.habeasConsultationBusinessDays}d hábiles); 2) PQR general (${HELP_LIVE_NUMBERS.pqrBusinessDays}d hábiles); 3) Retracto por arrepentimiento (${HELP_LIVE_NUMBERS.retractWindowBusinessDays}d hábiles desde entrega, SOLO productos NO personalizados); 4) Garantía por defecto o daño (${HELP_LIVE_NUMBERS.warrantyBusinessDays}d hábiles, SÍ aplica a personalizados).`,
        verification:
          "El caso queda radicado en su módulo legal propio con responsable asignado y reloj SLA corriendo.",
        gateBadge: "Triaje Ley 1480/1581",
      },
      {
        id: "investigar-expediente",
        title: "Auditar evidencia real en Pedido y Contacto 360",
        route: "/admin/pedidos",
        moduleLabel: "Pedidos y Contacto 360",
        ownerRoles: ["CUSTOMER_SUPPORT", "OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN"],
        action:
          "Contrasta fecha de entrega, meses de garantía sellados en `OrderItem`, fotos aportadas y si el diseño tenía advertencia de baja resolución aceptada por el cliente.",
        verification: "Diagnóstico objetivo documentado en notas internas antes de prometer nada.",
      },
      {
        id: "ejecutar-remedio-operativo",
        title: "Gestionar reposición/reparación (Garantía) o recepción física (Retracto)",
        route: "/admin/garantias",
        moduleLabel: "Garantías / Retractos",
        ownerRoles: ["CUSTOMER_SUPPORT", "OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN"],
        action:
          "En Garantía técnica prioriza reposición/reparación sin cobrar fletes al consumidor; en Retracto elegible aprueba retorno y marca `Bien recibido` únicamente cuando bodega inspeccione físicamente el artículo.",
        verification:
          "Reposición despachada con guía (cerrando Garantía) o bien recibido listo para reembolso.",
        gateBadge: "Inspección física",
      },
      {
        id: "desembolso-superadmin",
        title: "Ejecutar devolución bancaria/Wompi y sellar con MFA",
        route: "/admin/retractos",
        moduleLabel: "Retractos / Garantías (Superadmin)",
        ownerRoles: ["SUPERADMIN"],
        action: `Cuando procede devolver dinero (en Retracto dentro de los ${HELP_LIVE_NUMBERS.retractRefundCalendarDays} días calendario corridos de Ley 2439), Superadmin transfiere o revierte en Wompi, anota comprobante y cierra con MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
        verification:
          "Cliente notificado, puntos revertidos proporcionalmente y pasivo reflejado en Finanzas.",
        gateBadge: `Superadmin + MFA ≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes}m`,
      },
    ],
    edgeCases: [
      {
        scenario:
          "El cliente pide Retracto sobre fotoimanes personalizados porque en realidad llegaron dañados",
        resolution:
          "No lo dejes sin solución por elegir el formulario equivocado: explícale que los personalizados están excluidos de retracto por cambio de opinión, pero tramítalo inmediatamente como Garantía legal por calidad.",
      },
      {
        scenario:
          "El cliente reclama foto borrosa pero tiene sello de baja resolución aceptada en el Estudio",
        resolution:
          "Valida que la impresión corresponda al archivo subido y que no haya falla de máquina; si es exactamente la baja nitidez advertida y aceptada al comprar, sustenta el rechazo técnico con respeto y evidencia.",
      },
    ],
    dontTouch: [
      "Jamás cobres flete al consumidor en una Garantía aprobada.",
      "Jamás informes que un reembolso ya se hizo antes del cierre MFA de Superadmin.",
    ],
    relatedGuides: ["soporte", "garantias", "retractos", "pedidos", "clientes", "finanzas"],
    keywords: [
      "Ley 1480",
      "Ley 2439",
      "Ley 1581",
      "retracto",
      "garantía",
      "PQR",
      "Hábeas Data",
      "reembolso",
      "SLA",
    ],
    version: 1,
  },
  {
    id: "playbook-economia-bom-precios-promos",
    title: `5. Materiales / BOM → Costos → Mayorista → Cupones y Puntos (≤ ${HELP_LIVE_NUMBERS.loyaltyMaxEffectiveReturnPct} %)`,
    area: "Catálogo y producción",
    summary:
      "Cadena completa de fijación de costos y promociones apilables para lanzar descuentos y escalas sin vender jamás a pérdida.",
    trigger:
      "Sube el precio de un insumo de taller, creas un producto nuevo o planeas activar una promoción / escala por volumen.",
    durationHint: "15–20 min antes de cada ajuste comercial",
    roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "FINANCE_ANALYST"],
    steps: [
      {
        id: "actualizar-insumos",
        title: "Actualizar precios reales por unidad en Materiales",
        route: "/admin/materiales",
        moduleLabel: "Materiales e insumos",
        ownerRoles: ["OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN"],
        action:
          "Registra el costo real de compra expresado exactamente en la misma unidad de medida usada por las recetas de productos.",
        verification:
          "El costo sugerido BOM de todos los productos vinculados se recalcula al instante.",
      },
      {
        id: "sincronizar-costos",
        title: "Adoptar el costo en Costos y márgenes",
        route: "/admin/costos",
        moduleLabel: "Costos y márgenes",
        ownerRoles: ["OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN", "FINANCE_ANALYST"],
        action:
          "Filtra «Sin costo» y «Difieren de BOM», pulsa «Usar sugerido» (o guarda el valor validado) y confirma que ningún producto quede en rosa (< 0 %) ni ámbar crítico.",
        verification: "0 productos activos sin costo y piso BOM actualizado para Mayorista y B2B.",
        gateBadge: "Semáforo BOM",
      },
      {
        id: "ajustar-mayorista",
        title: "Configurar escalas por volumen respetando reglas de sombra",
        route: "/admin/mayorista",
        moduleLabel: "Precios al por mayor",
        ownerRoles: ["OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN"],
        action:
          "Define tramos decrecientes recordando precedencia `opción > producto > global` y el tope del selector del producto. Verifica el ahorro % y margen en el simulador.",
        verification: "Ningún tramo activo queda bajo costo BOM.",
      },
      {
        id: "validar-apilamiento",
        title: "Simular el peor caso combinado con Cupones y Puntos Lucams",
        route: "/admin/cupones",
        moduleLabel: "Cupones y Fidelización",
        ownerRoles: ["SUPERADMIN", "FINANCE_ANALYST"],
        action: `En el checkout aplica primero la escala Mayorista, luego el Cupón comercial y por último los Puntos Lucams sobre el subtotal restante (programa acotado a ≤ ${HELP_LIVE_NUMBERS.loyaltyMaxEffectiveReturnPct} % de retorno efectivo). Restringe categorías/productos en el cupón si el descuento combinado aprieta demasiado el margen.`,
        verification:
          "Campaña activa en `/admin/cupones` y tasas en `/admin/fidelizacion` dejan margen neto positivo tras pasarela.",
        gateBadge: `Candado ≤ ${HELP_LIVE_NUMBERS.loyaltyMaxEffectiveReturnPct} %`,
      },
    ],
    edgeCases: [
      {
        scenario:
          "Agregas una escala propia a un producto y desaparecen los tramos globales en su PDP",
        resolution:
          "Es el comportamiento esperado de sombra: en cuanto un producto u opción tiene al menos un tramo activo propio, reemplaza por completo la escala global.",
      },
      {
        scenario: "Subió el papel o el imán un 25 % y hay propuestas B2B en borrador",
        resolution:
          "Actualiza primero Materiales y Costos: el constructor B2B tomará de inmediato el nuevo `Product.cost` para proteger las cotizaciones aún no emitidas.",
      },
    ],
    dontTouch: [
      "Nunca lances un cupón de alto porcentaje sobre todo el catálogo sin revisar qué escalas mayoristas activas se sumarán encima.",
      "Nunca dejes productos activos con costo $0 en /admin/costos.",
    ],
    relatedGuides: ["materiales", "costos", "mayorista", "cupones", "fidelizacion", "productos"],
    keywords: [
      "BOM",
      "margen",
      "costos",
      "mayorista",
      "cupones",
      "puntos",
      "rentabilidad",
      "apilar",
    ],
    version: 1,
  },
  {
    id: "playbook-catalogo-estudio-lanzamiento",
    title: "6. Lanzamiento o cambio de producto: Bajo pedido vs Stock físico, Estudio y SEO 301",
    area: "Catálogo y producción",
    summary:
      "Checklist completo para publicar o renombrar un producto sin romper fletes, lienzos del Estudio, Google Merchant ni posicionamiento SEO.",
    trigger:
      "Vas a lanzar un producto nuevo, activar uno estacional (ej. Navidad) o cambiar opciones/URL de uno vigente.",
    durationHint: "25–30 min por lanzamiento",
    roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "CMS_EDITOR"],
    steps: [
      {
        id: "preparar-activos-estudio",
        title: "Aprobar plantilla y recursos del Estudio (si es personalizado)",
        route: "/admin/plantillas",
        moduleLabel: "Plantillas y Diseños",
        ownerRoles: ["OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN"],
        action:
          "Verifica geometría y todas las caras en `/admin/plantillas` y carga artes o sets completos (incluida Ñ) en `/admin/disenos`.",
        verification: "Plantilla aprobada y recursos listos antes de exponer la ficha pública.",
      },
      {
        id: "configurar-ficha-variantes",
        title: "Crear ficha, variantes base de 1 unidad, peso y receta BOM",
        route: "/admin/productos",
        moduleLabel: "Productos y Costos",
        ownerRoles: ["OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN"],
        action:
          "Elige `MADE_TO_ORDER` (Estudio) o `PHYSICAL_STOCK` (terminado), crea variantes físicas de 1 unidad base (incluyendo gemela `-NOMAG` si aplica) con SKU único, precio, peso en gramos y dimensiones, asigna receta BOM y fija su costo en `/admin/costos`.",
        verification: "Ficha completa con flete cotizable y costo unitario real.",
      },
      {
        id: "cargar-stock-o-taxonomia",
        title: "Ajustar Inventario (si es físico) y conectar Categoría + Ocasiones",
        route: "/admin/inventario",
        moduleLabel: "Inventario, Categorías y Ocasiones",
        ownerRoles: ["OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN"],
        action:
          "En `PHYSICAL_STOCK` registra stock y `safetyStock` en `/admin/inventario`. Vincula el producto a su Categoría (revisando facetas) y a las Ocasiones pertinentes.",
        verification: "Disponible neto correcto y presencia en colecciones y recomendador.",
      },
      {
        id: "verificar-canal-tienda",
        title: "Comprobar elegibilidad en Tienda Lucams y prueba en Estudio",
        route: "/admin/canales/tienda",
        moduleLabel: "Canal Tienda Lucams",
        ownerRoles: ["OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN"],
        action:
          "Revisa `/admin/canales/tienda` para confirmar elegibilidad en tienda y Merchant XML, y haz una prueba completa de diseño 2D/3D en `/estudio/[slug]`.",
        verification: "Producto comprable en móvil y escritorio, cotizando envío real.",
      },
      {
        id: "verificar-seo-redirects",
        title: "Validar enlaces editoriales en Contenido y Redirección 301 sin cadenas",
        route: "/admin/redirects",
        moduleLabel: "Redirecciones SEO y Contenido",
        ownerRoles: ["CMS_EDITOR", "OPERATIONS_MANAGER", "MANAGER", "SUPERADMIN"],
        action:
          "Si renombraste un slug antiguo o actualizaste un banner en `/admin/contenido`, verifica en `/admin/redirects` que la URL anterior apunte en un solo salto 301 hacia el destino 200 OK.",
        verification: "Cero enlaces 404 y cero cadenas de redirección en páginas públicas.",
      },
    ],
    edgeCases: [
      {
        scenario: "Creas un producto personalizado pero intentas asignarle unidades en Inventario",
        resolution:
          "El servidor fuerza `MADE_TO_ORDER` sobre todo producto con Estudio; gestiona sus materias primas en `/admin/materiales`.",
      },
      {
        scenario: "Renombraste dos veces seguidas el slug de un producto publicado",
        resolution:
          "Abre `/admin/redirects` y apunta ambos slugs antiguos directamente al slug definitivo para eliminar saltos intermedios.",
      },
    ],
    dontTouch: [
      "Nunca dejes peso en 0 g en variantes activas.",
      "Nunca retires una campaña estacional borrando el producto o categoría: páusalo para conservar historial y SEO.",
    ],
    relatedGuides: [
      "productos",
      "plantillas",
      "disenos",
      "inventario",
      "categorias",
      "ocasiones",
      "canales-tienda",
      "redirects",
    ],
    keywords: [
      "lanzamiento",
      "nuevo producto",
      "MADE_TO_ORDER",
      "PHYSICAL_STOCK",
      "Estudio",
      "Merchant",
      "301",
    ],
    version: 1,
  },
  {
    id: "playbook-audiencias-carritos-lifecycle",
    title: "7. Consentimiento Ley 1581, Recuperación de Carritos y Lifecycle Journeys",
    area: "Marketing",
    summary:
      "Operación segura de comunicaciones comerciales y automatizaciones respetando Hábeas Data, supresión Resend, delegación anti-duplicado y modo `DRY_RUN` en STG.",
    trigger:
      "Vas a activar un recorrido automático, recuperar carritos abandonados o exportar un segmento para campaña.",
    durationHint: "Revisión continua / por campaña",
    roles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "CUSTOMER_SUPPORT", "FINANCE_ANALYST"],
    steps: [
      {
        id: "verificar-entregabilidad-plantillas",
        title: "Revisar salud de Resend y vista previa de plantillas",
        route: "/admin/email-templates",
        moduleLabel: "Plantillas y Salud técnica",
        ownerRoles: ["SUPERADMIN"],
        action:
          "Comprueba en `/admin/observability` que la tasa de rebotes/quejas esté sana y previsualiza textos en `/admin/email-templates` antes de activar envíos automáticos.",
        verification: "Dominio de correo sano y plantillas validadas en móvil.",
      },
      {
        id: "operar-carritos",
        title: "Recuperar carritos sin duplicar recordatorios",
        route: "/admin/carritos",
        moduleLabel: "Carritos abandonados",
        ownerRoles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "CUSTOMER_SUPPORT"],
        action:
          "En modo supervisado envía un único recordatorio a carritos pendientes sin rebote ni compra posterior; en modo automático Superadmin ajusta ventanas en `/admin/carritos/configuracion` con MFA.",
        verification: "Recordatorios únicos trazados y conversiones medidas.",
      },
      {
        id: "activar-lifecycle",
        title: "Configurar, probar en borrador y activar Lifecycle con MFA",
        route: "/admin/lifecycle",
        moduleLabel: "Lifecycle Journeys",
        ownerRoles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER"],
        action: `Verifica opt-in requerido en pasos comerciales, horario de silencio Colombia y audiencia elegible en Borrador. Ejecuta prueba con MFA (en STG corre siempre en \`DRY_RUN\`) y activa con MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
        verification:
          "Recorrido activo delegando automáticamente carritos/reposiciones (`DELEGATED_*`) y atribuyendo compras pagadas a 30 días.",
        gateBadge: `MFA ≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes}m`,
      },
      {
        id: "exportar-segmento-limpio",
        title: "Exportar audiencias frescas bajo Ley 1581",
        route: "/admin/marketing/segmentos",
        moduleLabel: "Segmentos y Suscriptores",
        ownerRoles: ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER"],
        action:
          "Cuando necesites un envío puntual externo, verifica que no choque con un recorrido Lifecycle activo, descarga al instante «Exportar activos (Ley 1581)» con MFA y borra el CSV local tras usarlo.",
        verification:
          "Cero envíos a bajas, cuentas `isStaff` o rebotes duros, con descarga trazada en Auditoría.",
        gateBadge: "Ley 1581",
      },
    ],
    edgeCases: [
      {
        scenario: "Pruebas un recorrido Lifecycle en STG y no llega correo a tu bandeja",
        resolution:
          "Es el comportamiento correcto: STG fuerza `DRY_RUN` para impedir cualquier salida de correo por Resend.",
      },
      {
        scenario: "Un contacto queda pausado por rebote o queja y alguien intenta reanudarlo",
        resolution:
          "El servidor bloquea reanudar inscripciones suprimidas por baja, rebote duro o queja para proteger cumplimiento legal y entregabilidad.",
      },
    ],
    dontTouch: [
      "Jamás uses el CSV «Ledger SIC (histórico)» para hacer marketing: incluye dados de baja.",
      "Jamás marques como transaccional un paso que contenga promociones comerciales para saltarte el opt-in.",
    ],
    relatedGuides: [
      "lifecycle",
      "carritos",
      "carritos-configuracion",
      "suscriptores",
      "segmentos",
      "email-templates",
    ],
    keywords: [
      "Ley 1581",
      "opt-in",
      "carritos",
      "Lifecycle",
      "DRY_RUN",
      "Resend",
      "rebote",
      "segmentos",
    ],
    version: 1,
  },
  {
    id: "playbook-incidentes-seguridad-dian",
    title: `8. Incidentes técnicos, seguridad forense y cierre contable / vigilancia DIAN (${formatThousandsEsCo(HELP_LIVE_NUMBERS.fiscalUvtThreshold)} UVT)`,
    area: "Configuración y seguridad",
    summary:
      "Protocolo de respuesta ante alertas de crons/proveedores, investigación forense en Auditoría y corte contable mensual con vigilancia tributaria.",
    trigger:
      "Llega alerta de Salud técnica/seguridad, falla un proveedor externo o ejecutas el cierre contable semanal/mensual.",
    durationHint: "Inmediato en incidentes / Mensual en cierre",
    roles: ["SUPERADMIN", "FINANCE_ANALYST"],
    steps: [
      {
        id: "contener-diagnosticar-salud",
        title: "Acotar el incidente en Salud técnica e Integraciones",
        route: "/admin/observability",
        moduleLabel: "Observabilidad e Integraciones",
        ownerRoles: ["SUPERADMIN"],
        action:
          "Revisa en `/admin/observability` qué cron, webhook, cuota Supabase o respaldo R2 disparó la alerta y ejecuta sondas no destructivas en `/admin/integraciones` (o `/admin/integraciones/aveonline`). Si Resend/pasarela falla, pausa envíos automáticos en Lifecycle/Carritos.",
        verification: "Impacto contenido sin disparar reintentos manuales duplicados.",
        gateBadge: "Dead-man switch",
      },
      {
        id: "auditar-seguridad-forense",
        title: "Revisar bitácora de equipo, `selfDealing` y rechazos por `ipHash`",
        route: "/admin/auditoria",
        moduleLabel: "Auditoría y Usuarios",
        ownerRoles: ["SUPERADMIN"],
        action:
          "En `/admin/auditoria` inspecciona tanto acciones sensibles recientes y alertas `selfDealing` como la pestaña de eventos de seguridad bloqueados; si hay compromiso o retiro de personal, revoca acceso de inmediato en `/admin/usuarios`.",
        verification: "Trazabilidad forense preservada y cuentas administrativas al día en AAL2.",
        gateBadge: "AAL2 + Forense",
      },
      {
        id: "vigilar-umbral-dian",
        title: `Auditar avance hacia ${formatThousandsEsCo(HELP_LIVE_NUMBERS.fiscalUvtThreshold)} UVT`,
        route: "/admin/metricas",
        moduleLabel: "Métricas (Vigilancia Fiscal)",
        ownerRoles: ["SUPERADMIN", "FINANCE_ANALYST"],
        action: `Comprueba el porcentaje acumulado YTD y la proyección anual. Al tocar ${HELP_LIVE_NUMBERS.fiscalWatchPct} % (observación) o ${HELP_LIVE_NUMBERS.fiscalWarningPct} % (advertencia), activa con el contador la ruta de facturación electrónica antes de alcanzar el ${HELP_LIVE_NUMBERS.fiscalCriticalPct} %.`,
        verification: "Obligaciones DIAN anticipadas con margen suficiente.",
        gateBadge: `${HELP_LIVE_NUMBERS.fiscalWatchPct}/${HELP_LIVE_NUMBERS.fiscalWarningPct}/${HELP_LIVE_NUMBERS.fiscalCriticalPct} % UVT`,
      },
      {
        id: "exportar-cierre-contable",
        title: "Cerrar período en Finanzas y exportar CSV DIAN con MFA",
        route: "/admin/finanzas",
        moduleLabel: "Finanzas",
        ownerRoles: ["FINANCE_ANALYST", "SUPERADMIN"],
        action: `Verifica remesas COD conciliadas, reembolsos posventa cerrados y retenciones B2B practicadas; selecciona el mes en hora Colombia y descarga el CSV contable confirmando MFA reciente (≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes} min).`,
        verification: "Paquete contable íntegro entregado al contador con PII comercial protegida.",
        gateBadge: `MFA ≤ ${HELP_LIVE_NUMBERS.recentMfaMinutes}m`,
      },
    ],
    edgeCases: [
      {
        scenario: "Aparece alerta `selfDealing` en Auditoría por una compra de prueba de un admin",
        resolution:
          "Verifica que la orden no haya tenido reembolso o beneficio irregular autoaprobado; recuerda al equipo que las gestiones sobre compras propias debe ejecutarlas otro rol autorizado.",
      },
      {
        scenario: "Un integrante perdió su celular con el autenticador TOTP",
        resolution:
          "Debe ingresar usando uno de sus 10 códigos de respaldo únicos para reiniciar el factor y enrolar su teléfono nuevo de inmediato en `/admin/seguridad`.",
      },
    ],
    dontTouch: [
      "Nunca ejecutes pruebas con pagos, reembolsos o guías reales en producción para diagnosticar una caída.",
      "Nunca pegues secretos de `.env` o Vault en reportes ni tickets.",
    ],
    relatedGuides: [
      "observability",
      "integraciones",
      "integraciones-aveonline",
      "auditoria",
      "usuarios",
      "seguridad",
      "finanzas",
      "metricas",
    ],
    keywords: [
      "incidente",
      "caída",
      "cron",
      "webhook",
      "backup",
      "R2",
      "auditoría",
      "selfDealing",
      "CSV",
      "DIAN",
      "UVT",
    ],
    version: 1,
  },
];
