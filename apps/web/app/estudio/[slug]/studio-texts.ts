/*
 * Textos del Estudio de Personalización — fuente ÚNICA de defaults (roadmap B1).
 *
 * Cada texto visible del Estudio vive en el CMS v2 (página «estudio» de
 * /admin/contenido, keys `estudio.*` declaradas en packages/db/scripts/cms-site-map.mjs).
 * El servidor los resuelve con getStudioTexts() (studio-texts.server.ts) y los inyecta
 * al árbol client vía <StudioTextsProvider>; cada componente los lee con useStudioTexts().
 *
 * REGLA DE ORO: DEFAULT_STUDIO_TEXTS = texto EXACTO pre-CMS. Si la DB cae o el campo no
 * está publicado, el Estudio se ve idéntico a antes. El mismo DEFAULT sirve de fixture
 * en los tests (el contexto sin provider cae a estos valores).
 *
 * GENERADO inicialmente desde cms-site-map.mjs — al agregar/cambiar un texto, hazlo en
 * el site map Y acá (body = mismo texto). Los placeholders {…} se interpolan en runtime
 * con fillStudioText(); están documentados en el helpText de cada campo del admin.
 */

export type StudioTexts = {
  /** Textos compartidos. */
  comun: {
    /** Lucy 2026-09-09 — rótulo del CTA de cierre en los editores de nombre y
     *  letras (antes «¡Listo!», renombrado por el owner): abre la vista previa
     *  de confirmación, no agrega nada al carrito todavía. */
    listo: string;
    armando: string;
    preparando: string;
    agregando: string;
    guardando: string;
    volver: string;
    anterior: string;
    siguiente: string;
    editar: string;
    gateTitulo: string;
    gateCuerpo: string;
    gateCta: string;
    editarSr: string;
    cerrar: string;
    cerrarVista3d: string;
    cerrarPersonalizacion: string;
    cerrarAsistente: string;
    cerrarTip: string;
    cerrarComparador: string;
    saltarTutorial: string;
  };
  /** Lienzo y barra superior. */
  lienzo: {
    headerExit: string;
    headerTitle: string;
    autosaveEditando: string;
    autosaveGuardado: string;
    autosaveGuardadoS: string;
    autosaveGuardadoM: string;
    autosaveError: string;
    progressBadge: string;
    /** Lucy 2026-09-09 — rótulo del botón de cierre del editor (antes «¡Listo!»,
     *  renombrado por el owner: abre la vista previa de confirmación, no finaliza). */
    finalizeBtn: string;
    finalizeTooltip: string;
    /** Ola 26 (owner 2026-09-09) — «Vista previa» bloqueado por textos requeridos
     *  sin llenar (Polaroid Instagram). {campos} = lista de campos faltantes. */
    finalizeTooltipTextos: string;
    finalizeGuardando: string;
    gesturesButtonTitle: string;
    slotEmptyInvite: string;
    slotEmptyDrop: string;
    slotIndicator: string;
    slotLabelFallback: string;
    slotTocaElegir: string;
    unitSeparador: string;
    /** ADR-101 (owner 2026-09-15) — rótulo de la tarjeta que agrupa un PACK de
     *  unidades sueltas en la grilla plana (fotoimanes: "Pack 1", "Pack 2"…). */
    unitPack: string;
    /** Nombre audible genérico de una tarjeta-unidad agrupada ("{nombre} {n} de {total}"). */
    unidadGrupoAria: string;
    unitCaraA: string;
    unitCaraB: string;
    /** Badge del slot VACÍO de Cara B cuando el producto tiene backOptional
     *  (separadores 2026-09-25): la cara B puede quedar sin diseñar. */
    slotCaraBOpcional: string;
    /** Línea de doblez de la tira de separador (solo plegables, no noFold):
     *  "Doblez · Desplegado: {tamano}" — {tamano} = tamaño total desplegado. */
    doblezDesplegado: string;
    /** Nota junto al doblez (solo plegables, 2026-09-25): la Cara B se imprime
     *  rotada 180° para que al doblar sobre la página ambas caras lean derechas. */
    doblezNotaRotacion: string;
    slotTooltipCentrar: string;
    slotTooltipEditarAmbos: string;
    slotTooltipEditarFoto: string;
    slotTooltipQuitar: string;
    slotZoomTitle: string;
    slotSizeTitle: string;
    slotQualityChip: string;
    qualityErrorTitle: string;
    qualityWarnTitle: string;
    sizePrefix: string;
    sizeMedida: string;
    loadingLienzo: string;
    loadingEstudio: string;
    loadingTitulo: string;
    loadingSubtitulo: string;
    bootTitulo: string;
    bootSubtitulo: string;
    btnIdeas: string;
    btnCalendario: string;
    btnLibro: string;
    btnEspacio: string;
    libroTitulo: string;
    loadingLibro: string;
    sheetTitulo: string;
    calBannerTitulo: string;
    calBannerAno: string;
    calBannerHint: string;
    /** Lucy 2026-09-07 — selector de tipo de letra del título/mes del calendario (banner).
     *  2026-09-14 (owner): 8 opciones (fredoka/inter/caveat + 5 nuevas OFL). */
    calFontLabel: string;
    calFontOptionFredoka: string;
    calFontOptionInter: string;
    calFontOptionCaveat: string;
    calFontOptionBaloo2: string;
    calFontOptionNunito: string;
    calFontOptionPatrick: string;
    calFontOptionPlayfair: string;
    calFontOptionDancing: string;
    calFontAria: string;
    /** Lucy 2026-09-05 — packs: stepper "¿Cuántas fotos lleva tu imán?" (junto a la toolbar). */
    photoCountLabel: string;
    photoCountHint: string;
    photoCountFixedHint: string;
    photoCountOne: string;
    photoCountMany: string;
    photoCountGroupAria: string;
    photoCountMinusAria: string;
    photoCountPlusAria: string;
    /** Ola 28 (owner 2026-09-11, 1.3.A) — stepper "Unidades" del Estudio para
     *  productos de COMPOSICIÓN fija (tiras: las fotos por tira se eligen en la
     *  PDP; acá se ajusta cuántas tiras se diseñan). Reemplaza al stepper de
     *  fotos en ese caso. */
    unitsCountLabel: string;
    unitsCountHint: string;
    unitsCountOne: string;
    unitsCountMany: string;
    unitsCountGroupAria: string;
    unitsCountMinusAria: string;
    unitsCountPlusAria: string;
    /** Lucy 2026-09-08 — badge read-only "¿Con imán?" junto al stepper (lo fija la PDP). */
    magnetCon: string;
    magnetSin: string;
    magnetHint: string;
    gesturesTitulo: string;
    gesturesTouchMoverLead: string;
    gesturesTouchZoomLead: string;
    gesturesTouchZoomRest: string;
    gesturesTouchCentrarLead: string;
    gesturesMouseMoverLead: string;
    gesturesMouseZoomLead: string;
    gesturesMouseZoomRest: string;
    gesturesMouseCentrarLead: string;
    gesturesRestMover: string;
    gesturesRestCentrar: string;
    onboardingPaso: string;
    onboarding1Titulo: string;
    onboarding1Cuerpo: string;
    onboarding1CuerpoMovil: string;
    onboarding2Titulo: string;
    onboarding2Cuerpo: string;
    onboarding2CuerpoMovil: string;
    onboarding3Titulo: string;
    onboarding3Cuerpo: string;
    onboardingCtaEmpezar: string;
    onboardingSaltar: string;
    finalizeAria: string;
    finalizeAriaBloqueado: string;
    guiaLinea: string;
    guiaDescripcion: string;
    guiaTamano: string;
    calAnoAria: string;
    editarAria: string;
    editarEspacioAria: string;
    altTuFoto: string;
    sustantivoIman: string;
    sustantivoSeparador: string;
    libroAria: string;
    salirAria: string;
    gestosAria: string;
    lienzoAria: string;
    unidadAria: string;
    tarjetaDetalleAria: string;
    tarjetaAnteriorAria: string;
    tarjetaSiguienteAria: string;
    herramientasAria: string;
    mascotaAria: string;
    ideasSr: string;
    calBtnSr: string;
    libroBtnSr: string;
    espacioBtnSr: string;
    tamanoChipAria: string;
    zoomAria: string;
    /** Ola 22 — zoom de LIENZO (botones +/−): acerca toda la plantilla, no la foto. */
    stageZoomTitle: string;
    stageZoomInAria: string;
    stageZoomOutAria: string;
    stageZoomResetAria: string;
    slotTamanoAria: string;
    slotCentrarAria: string;
    slotEditarAria: string;
    slotQuitarAria: string;
  };
  /** Plantillas y diseños. */
  plantillas: {
    titulo: string;
    vacio: string;
    toastAplicada: string;
    predisenadosTitulo: string;
    predisenadosHint: string;
    toastPredisenado: string;
    toastError: string;
    toastSinSlot: string;
    elegirAria: string;
    aplicarDisenoAria: string;
    itemAria: string;
    itemSeleccionada: string;
    itemTamano: string;
  };
  /** Fotos: subida y selección. */
  fotos: {
    titulo: string;
    toggleOcultar: string;
    toggleTodas: string;
    toggleTitleOcultar: string;
    toggleTitleTodas: string;
    consentimiento: string;
    subirCta: string;
    subirCtaPicker: string;
    subiendo: string;
    subiendoPicker: string;
    formatos: string;
    guiaPx: string;
    guiaGenerica: string;
    errorCalidad: string;
    errorCalidadMinima: string;
    /** C2 (owner 2026-09-15) — la foto se mejoró automáticamente al subir
     *  (upscale local) y AÚN así quedó bajo lo recomendado. {size} = tamaño
     *  físico del producto (ej "5×5"). */
    avisoMejoraAuto: string;
    autofillCta: string;
    tipVacio: string;
    todoLleno: string;
    thumbUsada: string;
    thumbAviso: string;
    thumbArrastrar: string;
    /** ADR-101 (owner 2026-09-15) — badge de la foto que se ajustó automáticamente
     *  al subir (upscale local, client-photo-upscale). 2026-09-24: wording honesto —
     *  "Optimizada", sin prometer nitidez (el re-muestreo no crea detalle). */
    badgeMejorada: string;
    badgeMejoradaTitle: string;
    calidadTituloFuerte: string;
    calidadTituloSuave: string;
    calidadSubSuave: string;
    calidadSubFuerte: string;
    calidadMensajeFallback: string;
    calidadAccionesTitulo: string;
    calidadTip1: string;
    calidadTip2: string;
    calidadCerrar: string;
    pickerTitulo: string;
    pickerDesc: string;
    pickerVacio: string;
    progresoTitulo: string;
    progresoCompleto: string;
    progresoVacio: string;
    progresoFaltan: string;
    subirAria: string;
    autofillAria: string;
    listaAria: string;
    tusFotosAria: string;
    fotoSubidaAlt: string;
    usadaAria: string;
    resolucionBajaAria: string;
    avisoCalidadAria: string;
    fotoRevisionAlt: string;
  };
  /** Texto, estilos y filtros. */
  texto: {
    mensajeLabel: string;
    mensajeOpcional: string;
    mensajePlaceholder: string;
    mensajeAyuda: string;
    /** Lucy 2026-09-08 — aviso de que el mensaje aplica a TODO el set (pack-level). */
    mensajeGlobalAviso: string;
    editorTitulo: string;
    editorDesc: string;
    editorCerrar: string;
    sinTexto: string;
    campoLabel: string;
    campoPlaceholder: string;
    /** Ola 26 (owner 2026-09-09) — nombres legibles de los campos de texto
     *  requeridos de la Polaroid Instagram (para el aviso de «Vista previa»
     *  bloqueado: "Completa los textos…: usuario, ubicación…"). */
    campoIgUsuario: string;
    campoIgUbicacion: string;
    campoIgTitulo: string;
    campoIgHashtags: string;
    tamanoLabel: string;
    negrita: string;
    cursiva: string;
    colorLabel: string;
    /** Ola 28 (owner 2026-09-11, 1.2.1.A) — aviso cuando el color de texto elegido
     *  casi no contrasta con la tarjeta (blanco sobre tarjeta blanca = invisible). */
    colorSinContrasteHint: string;
    tipografiaLabel: string;
    reset: string;
    aplicar: string;
    /** Lucy 2026-09-08 — estado de PROCESANDO del botón «Aplicar» (spinner + disabled). */
    aplicando: string;
    estiloColorTitulo: string;
    estiloSinColor: string;
    estiloBordeTitulo: string;
    estiloConBorde: string;
    estiloSinBorde: string;
    /** Ola 24 — aviso cuando la paleta de color queda desactivada por «Sin borde». */
    estiloColorDeshabilitadoHint: string;
    /** Ola 24 (tiras) — variante del aviso para la tira photobooth (foto a foto, sin canaletas). */
    estiloColorDeshabilitadoHintTira: string;
    slotEditTitulo: string;
    slotEditTituloIndice: string;
    slotEditDesc: string;
    tabFoto: string;
    tabTexto: string;
    cambiarFoto: string;
    // Ola 17 — foto de perfil del header del post (plantilla Polaroid Instagram).
    perfilTitulo: string;
    perfilHint: string;
    perfilCambiar: string;
    perfilQuitar: string;
    perfilPickerTitulo: string;
    perfilPickerDesc: string;
    /** Ola 22 — tooltip del avatar tappeable del chrome IG (abre el picker de perfil). */
    perfilAvatarHint: string;
    slotEditListo: string;
    capasVolver: string;
    capasElegir: string;
    capaEditadaBadge: string;
    capaEditando: string;
    ajustarReset: string;
    ajustarRotar: string;
    /** Lucy 2026-09-08 — selector de letra del calendario DENTRO de "Ajustar Foto". */
    calFontModalHint: string;
    previewHint: string;
    filtrosTitulo: string;
    filtroSinLabel: string;
    filtroSinDesc: string;
    filtroVividLabel: string;
    filtroVividDesc: string;
    filtroVintageLabel: string;
    filtroVintageDesc: string;
    filtroPolaroidLabel: string;
    filtroPolaroidDesc: string;
    filtroPastelLabel: string;
    filtroPastelDesc: string;
    filtroBwLabel: string;
    filtroBwDesc: string;
    tamanoAria: string;
    rotarAria: string;
    filtrosAria: string;
    tipografiaAria: string;
    estiloColorAria: string;
    estiloBordeAria: string;
  };
  /** Vista previa y carrito. */
  exportar: {
    tituloPedido: string;
    tituloCalendario: string;
    tituloSeparadores: string;
    descCalendario: string;
    descCalendarioTamano: string;
    descCalendarioRevisa: string;
    descSeparadores: string;
    descSeparadoresTamano: string;
    /** Separadores PLANOS (noFold, Alargados): sin "doblado" — la pieza no se pliega. */
    descSeparadoresTamanoPlano: string;
    descImanUno: string;
    descImanes: string;
    descImanTamano: string;
    descRevisaUno: string;
    descRevisaMuchos: string;
    resumenCalendario: string;
    resumenSeparadorUno: string;
    resumenSeparadores: string;
    resumenUno: string;
    resumenMuchos: string;
    resumenTamanoCada: string;
    resumenTamano: string;
    volverEditar: string;
    confirmarCta: string;
    confirmarGuardando: string;
    errorCarrito: string;
    errorCarritoNombre: string;
    errorCarritoSet: string;
    errorSubidaSlot: string;
    errorGuardar: string;
    piezaIman: string;
    piezaFicha: string;
    piezaImanes: string;
    piezaFichas: string;
    /** Dato de copias cuando la PDP fijó N>1 (regla 2026-09-08b: sin stepper acá). */
    copiasIdenticas: string;
    copiasAjusteCarrito: string;
  };
  /** Vistas 3D y escenas. */
  escenas: {
    titulo: string;
    volverDetalle: string;
    chipNevera: string;
    chipPolaroid: string;
    chipMural: string;
    chipTablero: string;
    chipLibro: string;
    chipRepisa: string;
    chipRegalo: string;
    armando: string;
    error: string;
    errorHint: string;
    hintTouch: string;
    hintMouse: string;
    hintPlana: string;
    loadingNevera: string;
    loadingTablero: string;
    loadingPolaroid: string;
    loadingLibro: string;
    regaloEtiqueta: string;
    calTitulo: string;
    calBtnEspacio: string;
    calHintTouch: string;
    calHintMouse: string;
    nombreTableroTitulo: string;
    setTableroTitulo: string;
    nombreBtnTablero: string;
    setBtnTablero: string;
    nombreTableroAria: string;
    setTableroAria: string;
    setBtnTableroAria: string;
    galeriaAria: string;
    grupoAria: string;
  };
  /** Editor de nombre. */
  nombre: {
    titulo: string;
    subtitulo: string;
    inputLabel: string;
    contadorUna: string;
    contadorMuchas: string;
    placeholderEs: string;
    placeholderEn: string;
    ayudaEs: string;
    ayudaEn: string;
    pruebaLabel: string;
    repetidas: string;
    temaVacioHint: string;
    vacioHint: string;
    tocaHint: string;
    faltan: string;
    precioVivo: string;
    precioHint: string;
    estiloTitulo: string;
    estiloHint: string;
    coloresTitulo: string;
    coloresHint: string;
    /** Lucy 2026-09-09 — opción «Con borde / Sin borde» de las fichas (espejo del set de letras). */
    bordeTitulo: string;
    bordeHint: string;
    bordeCon: string;
    bordeSin: string;
    bordeSinColoresHint: string;
    swatchTitulo: string;
    menosAria: string;
    masAria: string;
    ejemplosEs: string;
    ejemplosEn: string;
    swatchAria: string;
    listoSr: string;
  };
  /** Editor de set de letras. */
  letras: {
    titulo: string;
    subVocalesIlustrado: string;
    subVocales: string;
    subFullIlustrado: string;
    subFull: string;
    temaTitulo: string;
    soloLetra: string;
    idiomaTitulo: string;
    idiomaEs: string;
    idiomaEn: string;
    tocaHint: string;
    temaAria: string;
    temaHint: string;
    pintarAria: string;
    letraAlt: string;
    listoSr: string;
    bordeTitulo: string;
    bordeHint: string;
    bordeCon: string;
    bordeSin: string;
    bordeSinColoresHint: string;
  };
  /**
   * Modelo MULTI-UNIDAD (owner 2026-09-09): N unidades físicas del mismo
   * producto, cada una diseñable por separado en el Estudio. Pager de unidades,
   * headers de sección, "Aplicar este diseño a todas" y la línea de la modal.
   */
  unidades: {
    /** Aria del pager de unidades sobre el lienzo. */
    pagerAria: string;
    /** Título de la sección de una unidad: "{nombre} {n} de {total}". */
    unidadDe: string;
    /** Sustantivos de la unidad según el producto. */
    nombreTira: string;
    nombreCalendario: string;
    nombreSeparador: string;
    nombreSet: string;
    /** ADR-101 (owner 2026-09-15) — sustantivo de la unidad en familias vendidas
     *  por packs de unidades sueltas (fotoimanes: "Pack 1", "Pack 2"…). */
    nombrePack: string;
    nombrePieza: string;
    /** Aria del chip de progreso de una unidad ("{n} de {total} fotos listas…"). */
    progresoAria: string;
    /** "Aplicar este diseño a todas" (copia la unidad actual a las demás). */
    aplicarATodas: string;
    aplicarATodasAria: string;
    aplicarATodasTitle: string;
    /** Feedback aria-live tras aplicar a todas. */
    aplicadaFeedback: string;
    /** Modal de confirmación: línea de unidades ("{n} unidades — cada una…"). */
    modalUnidades: string;
    /** Modal — descripción de TIRAS photobooth (plural y singular). {n} tiras, {m} fotos c/u. */
    descTiras: string;
    descTiraUna: string;
    /** Modal — resumen de tiras (línea bajo el nombre del producto). */
    resumenTiras: string;
    resumenTiraUna: string;
    /** Modal — descripción de N calendarios ({n} sets de {m} páginas, {año} opcional). */
    descCalendarios: string;
    resumenCalendarios: string;
  };
  /** Asistente de ideas (IA). */
  ia: {
    titulo: string;
    label: string;
    placeholder: string;
    notaPrivacidad: string;
    enviar: string;
    cargando: string;
    fraseLabel: string;
    copiar: string;
    copiada: string;
    colorLabel: string;
    composicionLabel: string;
    tipLabel: string;
    pie: string;
    panelAria: string;
  };
  /** Errores del Estudio. */
  errores: {
    bootTitulo: string;
    boot: string;
    preview: string;
    vista3d: string;
    espacio: string;
    calendario: string;
    generico: string;
  };
};

export const DEFAULT_STUDIO_TEXTS: StudioTexts = {
  comun: {
    listo: "Vista previa",
    armando: "Armando…",
    preparando: "Preparando…",
    agregando: "Agregando…",
    guardando: "Guardando...",
    volver: "Volver",
    anterior: "Anterior",
    siguiente: "Siguiente",
    editar: "Editar",
    gateTitulo: "Este producto lo hacemos a medida",
    gateCuerpo:
      "Para {producto} preparamos tu diseño contigo por WhatsApp — así queda justo como lo imaginas.",
    gateCta: "Escríbenos por WhatsApp",
    editarSr: ": abre las herramientas de plantillas y fotos",
    cerrar: "Cerrar",
    cerrarVista3d: "Cerrar vista 3D",
    cerrarPersonalizacion: "Cerrar personalización",
    cerrarAsistente: "Cerrar asistente",
    cerrarTip: "Cerrar este tip",
    cerrarComparador: "Cerrar comparador",
    saltarTutorial: "Saltar tutorial",
  },
  lienzo: {
    headerExit: "Salir",
    headerTitle: "Personalizar · {producto}",
    autosaveEditando: "Editando…",
    autosaveGuardado: "Guardado",
    autosaveGuardadoS: "Guardado hace {n}s",
    autosaveGuardadoM: "Guardado hace {n}m",
    autosaveError: "Error al guardar",
    progressBadge: "{n}/{total} fotos",
    finalizeBtn: "Vista previa",
    finalizeTooltip: "Faltan {n} fotos por cargar para ver la vista previa",
    finalizeTooltipTextos: "Completa los textos de tu diseño para ver la vista previa: {campos}",
    finalizeGuardando: "Guardando diseño...",
    gesturesButtonTitle: "Cómo editar tu foto (drag, zoom, doble click)",
    slotEmptyInvite: "Pásame una foto",
    slotEmptyDrop: "¡Suéltala aquí! 💜",
    slotIndicator: "{sustantivo} #{n}",
    slotLabelFallback: "Espacio {n} de {total}",
    slotTocaElegir: "Toca para elegir",
    unitSeparador: "Separador {n}",
    unitPack: "Pack {n}",
    unidadGrupoAria: "{nombre} {n} de {total}",
    unitCaraA: "Cara A",
    unitCaraB: "Cara B",
    slotCaraBOpcional: "Opcional",
    doblezDesplegado: "Doblez · Desplegado: {tamano}",
    doblezNotaRotacion:
      "La Cara B se imprime girada 180° — al doblarla sobre la página se lee derecha.",
    slotTooltipCentrar: "Volver al centro y resetear zoom",
    slotTooltipEditarAmbos: "Ajustar foto y texto",
    slotTooltipEditarFoto: "Ajustar foto",
    slotTooltipQuitar: "Quitar esta foto",
    slotZoomTitle: "Zoom {pct}% — doble click resetea",
    slotSizeTitle: "Tu imán será {sizeCm} cm (ancho × alto)",
    slotQualityChip: "calidad",
    qualityErrorTitle:
      "Esta foto ({ancho}×{alto}px) se verá pixelada al imprimir a {sizeCm} cm. Recomendado: {anchoMin}×{altoMin}px o más.",
    qualityWarnTitle:
      "Esta foto está al límite de resolución para {sizeCm} cm. Puede verse OK, pero recomendamos {anchoMin}×{altoMin}px o más.",
    sizePrefix: "Tu imán será {frase}",
    sizeMedida: "Medida:",
    loadingLienzo: "Cargando lienzo...",
    loadingEstudio: "Cargando estudio...",
    loadingTitulo: "Abriendo tu Estudio…",
    loadingSubtitulo: "Estamos preparando tu lienzo para personalizar 🦝",
    bootTitulo: "Preparando tu lienzo...",
    bootSubtitulo: "Cargando tu producto y plantillas en un instante ✨",
    btnIdeas: "Ideas",
    btnCalendario: "Ver mi calendario",
    btnLibro: "Ver en un libro",
    btnEspacio: "Ver en tu espacio",
    libroTitulo: "📖 Tu separador en un libro",
    loadingLibro: "Cargando tu libro 3D…",
    sheetTitulo: "Personalizar",
    calBannerTitulo: "📅 Tu calendario",
    calBannerAno: "Año del calendario:",
    calBannerHint: "· una foto por mes (toca cada mes para elegir tu foto)",
    calFontLabel: "Tipo de letra:",
    calFontOptionFredoka: "Redondeada (Fredoka)",
    calFontOptionInter: "Moderna (Inter)",
    calFontOptionCaveat: "Manuscrita (Caveat)",
    calFontOptionBaloo2: "Bubble (Baloo 2)",
    calFontOptionNunito: "Suave (Nunito)",
    calFontOptionPatrick: "Casual (Patrick Hand)",
    calFontOptionPlayfair: "Elegante (Playfair)",
    calFontOptionDancing: "Caligráfica (Dancing)",
    calFontAria: "Tipo de letra del título del calendario",
    photoCountLabel: "¿Cuántas fotos lleva tu imán?",
    photoCountHint: "Tus fotos se conservan al cambiar el número",
    photoCountFixedHint: "Este tamaño lleva {n} fotos",
    photoCountOne: "foto",
    photoCountMany: "fotos",
    photoCountGroupAria: "Cantidad de fotos por imán",
    photoCountMinusAria: "Quitar una foto",
    photoCountPlusAria: "Agregar una foto",
    unitsCountLabel: "Unidades",
    unitsCountHint: "Las fotos por tira se eligen en la página del producto",
    unitsCountOne: "unidad",
    unitsCountMany: "unidades",
    unitsCountGroupAria: "Unidades a diseñar",
    unitsCountMinusAria: "Disminuir unidades",
    unitsCountPlusAria: "Aumentar unidades",
    magnetCon: "🧲 Con imán",
    magnetSin: "✨ Sin imán",
    magnetHint: "se elige en la página del producto",
    gesturesTitulo: "¡Tip! Cómo editar tu foto:",
    gesturesTouchMoverLead: "1 dedo arrastra",
    gesturesTouchZoomLead: "Pellizca con 2 dedos",
    gesturesTouchZoomRest: "para zoom",
    gesturesTouchCentrarLead: "Doble tap",
    gesturesMouseMoverLead: "Arrastra con el mouse",
    gesturesMouseZoomLead: "Scroll",
    gesturesMouseZoomRest: "sobre la foto para zoom in/out",
    gesturesMouseCentrarLead: "Doble click",
    gesturesRestMover: "para mover la foto",
    gesturesRestCentrar: "para volver al centro",
    onboardingPaso: "Paso {n} de {total}",
    onboarding1Titulo: "Sube tu foto",
    onboarding1Cuerpo:
      "Empieza por arrastrar fotos al panel de la izquierda. Aceptamos {formatos} del celular.",
    onboarding1CuerpoMovil:
      "Toca un {sustantivo} y súbele una foto desde tu celular. Aceptamos {formatos}.",
    onboarding2Titulo: "Asigna a cada {sustantivo}",
    onboarding2Cuerpo:
      "Toca un {sustantivo} vacío y elige cuál foto quieres, o usa el botón mágico ‘Llenar slots con mis fotos’ para repartir todo de una.",
    onboarding2CuerpoMovil:
      "Toca cada {sustantivo} para ponerle una foto. Con el botón ‘Editar’ (abajo) abres plantillas y más fotos.",
    onboarding3Titulo: "Personaliza los textos",
    onboarding3Cuerpo:
      "Si la plantilla tiene textos editables (los marcados con punto turquesa), tócalos para cambiar el contenido, color y tipografía.",
    onboardingCtaEmpezar: "¡Empezar!",
    onboardingSaltar: "Saltar",
    finalizeAria: "Vista previa de tu pedido",
    finalizeAriaBloqueado: "Vista previa no disponible todavía",
    guiaLinea: "Línea morada",
    guiaDescripcion: "= mantén texto y caras adentro para que no se corten al imprimir",
    guiaTamano: "· Tu imán físico mide {size} cm",
    calAnoAria: "Año del calendario",
    editarAria: "Editar {etiqueta}",
    editarEspacioAria: "Editar este espacio",
    altTuFoto: "Tu foto",
    sustantivoIman: "imán",
    sustantivoSeparador: "separador",
    libroAria: "Vista 3D de tu separador en un libro",
    salirAria: "Salir del estudio y volver al producto {producto}",
    gestosAria: "Ver instrucciones de gestos del editor",
    lienzoAria: "Lienzo del Estudio de Personalización",
    unidadAria: "Separador {n} de {total}",
    tarjetaDetalleAria: "Tarjeta {n} de {total} en detalle",
    tarjetaAnteriorAria: "Tarjeta anterior",
    tarjetaSiguienteAria: "Tarjeta siguiente",
    herramientasAria: "Herramientas del Estudio",
    mascotaAria: "mascote",
    ideasSr: "para tu diseño, con el asistente",
    calBtnSr: ": tus tarjetas mes en detalle, una por una",
    libroBtnSr: "en 3D: tu separador entre las páginas",
    espacioBtnSr: ": nevera, mural, repisa o regalo",
    tamanoChipAria: "Tamaño físico {size} cm. Click para ver comparación con objeto cotidiano.",
    zoomAria: "Zoom actual {pct}%",
    // Ola 22 — zoom de LIENZO (acerca toda la plantilla; distinto del zoom de foto).
    stageZoomTitle: "Zoom del lienzo {pct}%",
    stageZoomInAria: "Acercar el lienzo",
    stageZoomOutAria: "Alejar el lienzo",
    stageZoomResetAria: "Volver al tamaño original del lienzo",
    slotTamanoAria: "Tamaño físico {size}",
    slotCentrarAria: "Centrar la foto del imán {n}",
    slotEditarAria: "Editar {nombre}",
    slotQuitarAria: "Quitar foto del imán {n}",
  },
  plantillas: {
    titulo: "Plantillas",
    vacio: "Aún no hay plantillas para este producto.",
    toastAplicada: 'Plantilla "{nombre}" aplicada',
    predisenadosTitulo: "Diseños prediseñados",
    predisenadosHint: "Aplica un diseño listo al slot seleccionado (o al primero vacío).",
    toastPredisenado: 'Diseño "{nombre}" aplicado',
    toastError: "No pudimos aplicar el diseño. Intenta de nuevo.",
    toastSinSlot: "Selecciona un slot vacío primero",
    elegirAria: "Selecciona plantilla del imán",
    aplicarDisenoAria: "Aplicar el diseño {nombre} al slot",
    itemAria: "Plantilla {nombre}",
    itemSeleccionada: "(seleccionada)",
    itemTamano: "para imán {size} cm",
  },
  fotos: {
    titulo: "Mis fotos",
    toggleOcultar: "✓ Solo no usadas",
    toggleTodas: "Ver todas",
    toggleTitleOcultar: "Ocultar fotos que ya pegaste en algún imán",
    toggleTitleTodas: "Mostrar todas las fotos",
    consentimiento: "Tengo derecho a usar esta foto y autorizo imprimirla ({link}).",
    subirCta: "Subir foto",
    subirCtaPicker: "Subir foto desde tu dispositivo",
    subiendo: "Subiendo ({n})...",
    subiendoPicker: "Subiendo...",
    formatos: "JPG, PNG, WebP o HEIC",
    guiaPx:
      "{formatos} · máx {maxMb} MB por foto · para que se vea nítida al imprimir, que el lado menor tenga al menos ~{px} px (salida 300 DPI).",
    guiaGenerica:
      "{formatos} · máx {maxMb} MB por foto · para que se vea nítida al imprimir, usa la mayor resolución que tengas (salida 300 DPI).",
    errorCalidad: "La foto tiene problemas de calidad. Revisa la sugerencia.",
    errorCalidadMinima: "La foto subida no cumple los requisitos mínimos de calidad.",
    avisoMejoraAuto:
      "Mejoramos tu foto automáticamente, pero aun así quedó por debajo de lo recomendado para imprimir {size} cm. Si tienes la original en mayor resolución (no la de WhatsApp), úsala — se va a ver más nítida.",
    autofillCta: "Llenar slots con mis fotos",
    tipVacio:
      "Tip: sube tus fotos primero; el botón «Llenar slots con mis fotos» las reparte por ti en los espacios.",
    todoLleno:
      "✨ Todos los imanes tienen foto. Toca un imán para cambiarle la foto (o arrástrale otra en computador).",
    thumbUsada: "Ya está pegada en algún imán. Puedes arrastrar otra foto.",
    thumbAviso: "Click para ver detalles del problema de calidad.",
    thumbArrastrar: "Arrastra al canvas o toca un slot vacío para asignar",
    badgeMejorada: "✨ Optimizada",
    badgeMejoradaTitle:
      "La ajustamos automáticamente al tamaño de impresión. Ojo: esto suaviza la foto pero no recupera detalle — si tienes la original en mayor resolución, úsala.",
    calidadTituloFuerte: "Cuidado con esta foto",
    calidadTituloSuave: "Aviso sobre esta foto",
    calidadSubSuave: "Se puede usar igual, pero",
    calidadSubFuerte: "Recomendamos revisarla:",
    calidadMensajeFallback: "La foto tiene un detalle de calidad que vale la pena revisar.",
    calidadAccionesTitulo: "¿Qué puedes hacer?",
    calidadTip1: "Subir una foto de mayor resolución (la original, no la de WhatsApp)",
    calidadTip2: "Si la foto ya es la mejor que tienes, igual la podemos imprimir",
    calidadCerrar: "Entendido",
    pickerTitulo: "Foto para el imán {n} de {total}",
    pickerDesc: "Elige una foto ya subida o suma una nueva.",
    pickerVacio: "Todavía no subiste fotos. Empieza arriba.",
    progresoTitulo: "Progreso",
    progresoCompleto: "¡Listo! Todas las fotos están cargadas.",
    progresoVacio: "Carga fotos para empezar.",
    progresoFaltan: "Faltan {n} {fotos} para terminar.",
    subirAria: "Subir foto desde el dispositivo",
    autofillAria: "Llenar {n} slots vacíos con mis fotos",
    listaAria: "Fotos subidas",
    tusFotosAria: "Tus fotos subidas",
    fotoSubidaAlt: "Foto subida",
    usadaAria: "Foto ya usada en un imán",
    resolucionBajaAria: "Resolución baja",
    avisoCalidadAria: "Aviso de calidad",
    fotoRevisionAlt: "Foto en revisión",
  },
  texto: {
    mensajeLabel: "Tu mensaje",
    mensajeOpcional: "(opcional)",
    mensajePlaceholder: "Escribe tu mensaje",
    mensajeAyuda:
      "Si lo dejas vacío, la franja queda limpia (no se imprime nada). Para cambiar fuente o color, toca el texto en la imagen.",
    // Lucy 2026-09-08 — aviso visible de que el mensaje es PACK-LEVEL ("Mantener
    // con aviso", aprobado por el owner): se imprime igual en TODAS las fotos del
    // set, no es un mensaje por foto.
    mensajeGlobalAviso:
      "Ojo: este mensaje se imprime igual en TODAS las fotos del set, no una por una.",
    editorTitulo: "Editar texto",
    editorDesc: 'Click "Aplicar" para guardar',
    editorCerrar: "Cerrar",
    sinTexto: "Sin texto",
    campoLabel: "Texto",
    campoPlaceholder: "Escribe tu texto…",
    campoIgUsuario: "usuario",
    campoIgUbicacion: "ubicación",
    campoIgTitulo: "título",
    campoIgHashtags: "hashtags",
    tamanoLabel: "Tamaño",
    negrita: "Negrita",
    cursiva: "Cursiva",
    colorLabel: "Color",
    colorSinContrasteHint:
      "Este color casi no se va a ver sobre la tarjeta — para que se lea al imprimir, elige otro.",
    tipografiaLabel: "Tipografía",
    reset: "Volver al original",
    aplicar: "Aplicar",
    aplicando: "Aplicando…",
    estiloColorTitulo: "Color de tarjeta",
    estiloSinColor: "Sin color",
    estiloBordeTitulo: "Borde de foto",
    estiloConBorde: "Con borde",
    estiloSinBorde: "Sin borde",
    estiloColorDeshabilitadoHint:
      "Con «Sin borde» la foto cubre toda la tarjeta — el color no aplica.",
    estiloColorDeshabilitadoHintTira:
      "Con «Sin borde» las fotos cubren toda la tira — el color no aplica.",
    slotEditTitulo: "Editar {etiqueta}",
    slotEditTituloIndice: "Editar espacio {n}",
    slotEditDesc: "Ajusta la foto y el texto de este espacio",
    tabFoto: "Foto",
    tabTexto: "Texto",
    cambiarFoto: "Cambiar foto",
    // Ola 17 — foto de perfil del header del post (plantilla Polaroid Instagram).
    perfilTitulo: "Foto de perfil",
    perfilHint: "Aparece en el círculo del encabezado, junto al nombre de usuario.",
    perfilCambiar: "Cambiar foto de perfil",
    perfilQuitar: "Quitar",
    perfilPickerTitulo: "Elige tu foto de perfil",
    perfilPickerDesc: "Se recorta en círculo dentro del anillo del encabezado.",
    // Ola 22 — tooltip del avatar tappeable del chrome IG (abre el picker de perfil).
    perfilAvatarHint: "Foto de perfil — toca para cambiarla",
    slotEditListo: "Listo",
    capasVolver: "Volver a capas",
    capasElegir: "Elige un texto para editar",
    capaEditadaBadge: "editado",
    capaEditando: "Editando: {texto}",
    ajustarReset: "Centrar y resetear zoom",
    ajustarRotar: "Rotar 90°",
    // Lucy 2026-09-08 — la letra del calendario también se elige desde "Ajustar Foto"
    // (no solo en el banner): aplica a los 12 meses, igual que el selector del banner.
    calFontModalHint: "Esta letra aplica a los 12 meses de tu calendario.",
    previewHint:
      "Arrastra la foto para encuadrar · Rueda del mouse o pellizco para zoom · Doble toque para centrar",
    filtrosTitulo: "Filtros",
    filtroSinLabel: "Sin filtro",
    filtroSinDesc: "Foto original sin ajustes",
    filtroVividLabel: "Vivid",
    filtroVividDesc: "Colores vibrantes y saturados",
    filtroVintageLabel: "Vintage",
    filtroVintageDesc: "Cálido y suave, look de los 70s",
    filtroPolaroidLabel: "Polaroid",
    filtroPolaroidDesc: "Tono cálido tipo polaroid vintage",
    filtroPastelLabel: "Pastel",
    filtroPastelDesc: "Tonos suaves y soñadores",
    filtroBwLabel: "Blanco y negro",
    filtroBwDesc: "Clásico blanco y negro",
    tamanoAria: "Tamaño del texto",
    rotarAria: "Rotar la foto 90 grados",
    filtrosAria: "Filtros disponibles",
    tipografiaAria: "Tipografía {nombre}",
    estiloColorAria: "Color de tarjeta",
    estiloBordeAria: "Borde de foto",
  },
  exportar: {
    tituloPedido: "Así se verá tu pedido",
    tituloCalendario: "Así se verá tu calendario",
    tituloSeparadores: "Así se verán tus separadores",
    descCalendario: "Esta es la vista previa de las {n} páginas de tu calendario{año}.",
    descCalendarioTamano: "Cada página mide {tamano}.",
    descCalendarioRevisa: "Revísalas antes de continuar.",
    descSeparadores:
      "Esta es la vista previa de los {n} separadores que vas a recibir — cada uno desplegado con sus 2 caras (así se imprime la tira).",
    descSeparadoresTamano: "Cada separador mide {tamano} doblado.",
    descSeparadoresTamanoPlano: "Cada separador mide {tamano}.",
    descImanUno: "Esta es la vista previa del {pieza} que vas a recibir.",
    descImanes: "Esta es la vista previa de los {n} {piezas} que vas a recibir.",
    descImanTamano: "Cada {pieza} mide {tamano}.",
    descRevisaUno: "Revísalo antes de continuar.",
    descRevisaMuchos: "Revísalos antes de continuar.",
    resumenCalendario: "Calendario personalizado · {n} páginas",
    resumenSeparadorUno: "{n} separador personalizado (2 caras c/u)",
    resumenSeparadores: "{n} separadores personalizados (2 caras c/u)",
    resumenUno: "{n} {pieza} personalizad{o}",
    resumenMuchos: "{n} {piezas} personalizad{os}",
    resumenTamanoCada: "📐 {tamano} c/u",
    resumenTamano: "📐 {tamano}",
    volverEditar: "Volver a editar",
    confirmarCta: "Sí, agregar al carrito",
    confirmarGuardando: "Guardando…",
    errorCarrito: "Diseño guardado pero no pudimos agregarlo al carrito: {error}",
    errorCarritoNombre: "Guardamos tu diseño pero no pudimos agregarlo al carrito: {error}",
    errorCarritoSet: "Guardamos el diseño pero no pudimos agregarlo al carrito: {error}",
    errorSubidaSlot: "No pudimos subir la imagen del slot {n}. Reintenta.",
    errorGuardar: "No pudimos guardar tus últimos cambios. Intenta de nuevo.",
    piezaIman: "imán",
    piezaFicha: "ficha",
    piezaImanes: "imanes",
    piezaFichas: "fichas",
    copiasIdenticas: "{n} copias idénticas de tu diseño",
    copiasAjusteCarrito: "Puedes ajustar la cantidad en el carrito.",
  },
  escenas: {
    titulo: "✨ Míralo en tu espacio",
    volverDetalle: "Volver al detalle",
    chipNevera: "Nevera",
    chipPolaroid: "Polaroid",
    chipMural: "Mural",
    chipTablero: "Tablero",
    chipLibro: "Libro",
    chipRepisa: "Repisa",
    chipRegalo: "Regalo",
    armando: "Armando la escena…",
    error: "No pudimos armar esta escena en este momento.",
    errorHint: "Prueba otra escena o vuelve al editor.",
    hintTouch: "Arrastra para girar · pellizca con 2 dedos para acercar",
    hintMouse: "Arrastra para girar · rueda o pellizca para acercar",
    hintPlana: "Mantén presionada la imagen para guardarla o compartirla 💛",
    loadingNevera: "Cargando la nevera 3D…",
    loadingTablero: "Cargando tu tablero 3D…",
    loadingPolaroid: "Cargando tus polaroids 3D…",
    loadingLibro: "Cargando el libro 3D…",
    regaloEtiqueta: "Para ti",
    calTitulo: "Tarjeta {n} de {total}",
    calBtnEspacio: "Míralo en tu espacio",
    calHintTouch: "Arrastra para girar · pellizca para acercar",
    calHintMouse: "← → para cambiar de tarjeta · arrastra para girar",
    nombreTableroTitulo: "🖼️ Tu nombre en el tablero",
    setTableroTitulo: "🖼️ Tus fichas en el tablero",
    nombreBtnTablero: "Ver en un tablero 3D",
    setBtnTablero: "Ver en 3D",
    nombreTableroAria: "Vista 3D de tu nombre en un tablero magnético",
    setTableroAria: "Vista 3D de tus fichas en un tablero magnético",
    setBtnTableroAria: "Ver tus fichas en un tablero magnético 3D",
    galeriaAria: "Mira tu diseño en tu espacio",
    grupoAria: "Escenas",
  },
  nombre: {
    titulo: "Arma tu palabra ✨",
    subtitulo:
      "Escribe un nombre o palabra (MÍA, MATEO, AMOR…) y verás las fichas que vas a recibir — una por cada letra.",
    inputLabel: "Escribe el nombre o palabra",
    contadorUna: "{n} letra",
    contadorMuchas: "{n} letras",
    placeholderEs: "Ej: Mía",
    placeholderEn: "Ex: Mia",
    ayudaEs:
      "Ajusta la cantidad con − / + (de {min} a {max} letras) · incluye la Ñ · sin números ni símbolos",
    ayudaEn:
      "Ajusta la cantidad con − / + (de {min} a {max} letras) · alfabeto en inglés (sin Ñ) · sin números ni símbolos",
    pruebaLabel: "Prueba:",
    repetidas: "Se repiten fichas: {lista} (una ficha por cada letra).",
    temaVacioHint:
      "Este tema aún no tiene ilustraciones — se imprime como letra de color. Sube las ilustraciones en /admin/disenos (pestaña Fichas del abecedario) para activarlo.",
    vacioHint: "Aquí verás tu nombre en fichas 🦝",
    tocaHint: "👇 Toca una letra para darle el color que quieras",
    faltan: "Te faltan letras — mínimo {min}.",
    precioVivo: "{n} {fichas} × {precio} = {total}",
    precioHint: "{precio} por ficha · {n} letras = {total}",
    estiloTitulo: "Elige el estilo",
    estiloHint: "· el dibujo de cada ficha 🎨",
    coloresTitulo: "Elige los colores",
    coloresHint: "· toca un tema otra vez para barajar 🎲",
    bordeTitulo: "Borde de las fichas",
    bordeHint: "· mismo precio con o sin borde",
    bordeCon: "Con borde",
    bordeSin: "Sin borde",
    bordeSinColoresHint:
      "Sin borde, las fichas se imprimen sin el marco de color — por eso los colores se desactivan. Vuelve a «Con borde» para pintarlas.",
    swatchTitulo: "Color de la letra {letra}",
    menosAria: "Menos letras",
    masAria: "Más letras",
    ejemplosEs: "Mía, Mateo, Amor",
    ejemplosEn: "Mia, Noah, Love",
    swatchAria: "Pintar de {color}",
    listoSr: ": te mostramos cómo queda antes de agregarlo al carrito",
  },
  letras: {
    titulo: "Elige los colores 🎨",
    subVocalesIlustrado:
      "Las 5 vocales, cada una con su dibujito. Pinta cada ficha del color que quieras — así se imprime.",
    subVocales: "Las 5 vocales. Pinta cada ficha del color que quieras — así se imprime.",
    subFullIlustrado:
      "Las {n} letras, cada una con su dibujito. Pinta cada ficha del color que quieras — así se imprime.",
    subFull: "Las {n} letras. Pinta cada ficha del color que quieras — así se imprime.",
    temaTitulo: "Elige el tema",
    soloLetra: "Solo letra",
    idiomaTitulo: "Idioma del alfabeto",
    idiomaEs: "Español",
    idiomaEn: "English",
    tocaHint: "👇 Toca una ficha para darle el color que quieras",
    temaAria: "Tema de las fichas",
    temaHint: "· el dibujo de cada ficha 🎨",
    pintarAria: "Pintar la ficha {letra}",
    letraAlt: "Letra {letra}",
    listoSr: ": mira cómo se verá tu pedido antes de agregarlo",
    bordeTitulo: "Borde de las fichas",
    bordeHint: "· mismo precio con o sin borde",
    bordeCon: "Con borde",
    bordeSin: "Sin borde",
    bordeSinColoresHint:
      "Sin borde, las fichas se imprimen sin el marco de color — por eso los colores se desactivan. Vuelve a «Con borde» para pintarlas.",
  },
  unidades: {
    pagerAria: "Unidades de tu diseño",
    unidadDe: "{nombre} {n} de {total}",
    nombreTira: "Tira",
    nombreCalendario: "Calendario",
    nombreSeparador: "Separador",
    nombreSet: "Set",
    nombrePack: "Pack",
    nombrePieza: "Pieza",
    progresoAria: "{n} de {total} fotos listas en esta unidad",
    aplicarATodas: "Aplicar este diseño a todas",
    aplicarATodasAria: "Aplicar el diseño de esta unidad a todas las unidades",
    aplicarATodasTitle: "Copia fotos, encuadres y textos de esta unidad a las demás",
    aplicadaFeedback: "Diseño aplicado a todas las unidades",
    modalUnidades: "{n} unidades — cada una con su propio diseño",
    descTiras:
      "Esta es la vista previa de las {n} tiras que vas a recibir — cada una con {m} fotos.",
    descTiraUna: "Esta es la vista previa de la tira que vas a recibir — con {m} fotos.",
    resumenTiras: "{n} tiras personalizadas · {m} fotos c/u",
    resumenTiraUna: "{n} tira personalizada · {m} fotos",
    descCalendarios:
      "Esta es la vista previa de tus {n} calendarios{año} — cada uno con {m} páginas.",
    resumenCalendarios: "{n} calendarios personalizados · {m} páginas c/u",
  },
  ia: {
    titulo: "¿Sin ideas? Te ayudo",
    label: "¿Para qué es? (ej. “cumpleaños de mi mamá”, “aniversario”)",
    placeholder: "Cuéntame la ocasión…",
    notaPrivacidad:
      "Evita escribir datos personales (nombres, cédulas, teléfonos) — cuéntanos solo la ocasión.",
    enviar: "Dame ideas",
    cargando: "Pensando ideas…",
    fraseLabel: "Frase sugerida",
    copiar: "Copiar",
    copiada: "¡Copiada!",
    colorLabel: "Color sugerido: {color}",
    composicionLabel: "Composición",
    tipLabel: "Tip",
    pie: "Son ideas para inspirarte — tú decides qué usar en tu diseño. ✨",
    panelAria: "Asistente de ideas",
  },
  errores: {
    bootTitulo: "No pudimos abrir el Estudio",
    boot: "No pudimos abrir el Estudio. Recarga la página o escríbenos por WhatsApp.",
    preview: "No pudimos preparar la vista previa. Intenta de nuevo en un momento.",
    vista3d: "No pudimos abrir la vista 3D. Intenta de nuevo.",
    espacio: "No pudimos abrir la vista de tu espacio. Intenta de nuevo.",
    calendario: "No pudimos armar tu calendario. Intenta de nuevo.",
    generico: "Algo salió mal. Intenta de nuevo en un momento.",
  },
};

/**
 * Mapa `ruta.en.el.objeto` → key CMS (`estudio.*`). Lo usa getStudioTexts() para
 * sobreescribir los defaults con lo publicado en la DB (y para el grep de paridad).
 */
export const STUDIO_TEXT_KEYS: Record<string, string> = {
  "comun.listo": "estudio.comun.listo",
  "comun.armando": "estudio.comun.armando",
  "comun.preparando": "estudio.comun.preparando",
  "comun.agregando": "estudio.comun.agregando",
  "comun.guardando": "estudio.comun.guardando",
  "comun.volver": "estudio.comun.volver",
  "comun.anterior": "estudio.comun.anterior",
  "comun.siguiente": "estudio.comun.siguiente",
  "comun.editar": "estudio.comun.editar",
  "comun.gateTitulo": "estudio.comun.gate-titulo",
  "comun.gateCuerpo": "estudio.comun.gate-cuerpo",
  "comun.gateCta": "estudio.comun.gate-cta",
  "comun.editarSr": "estudio.comun.editar-sr",
  "comun.cerrar": "estudio.comun.cerrar",
  "comun.cerrarVista3d": "estudio.comun.cerrar-vista-3d",
  "comun.cerrarPersonalizacion": "estudio.comun.cerrar-personalizacion",
  "comun.cerrarAsistente": "estudio.comun.cerrar-asistente",
  "comun.cerrarTip": "estudio.comun.cerrar-tip",
  "comun.cerrarComparador": "estudio.comun.cerrar-comparador",
  "comun.saltarTutorial": "estudio.comun.saltar-tutorial",
  "lienzo.headerExit": "estudio.lienzo.header-exit",
  "lienzo.headerTitle": "estudio.lienzo.header-title",
  "lienzo.autosaveEditando": "estudio.lienzo.autosave-editando",
  "lienzo.autosaveGuardado": "estudio.lienzo.autosave-guardado",
  "lienzo.autosaveGuardadoS": "estudio.lienzo.autosave-guardado-s",
  "lienzo.autosaveGuardadoM": "estudio.lienzo.autosave-guardado-m",
  "lienzo.autosaveError": "estudio.lienzo.autosave-error",
  "lienzo.progressBadge": "estudio.lienzo.progress-badge",
  "lienzo.finalizeBtn": "estudio.lienzo.finalize-btn",
  "lienzo.finalizeTooltip": "estudio.lienzo.finalize-tooltip",
  "lienzo.finalizeTooltipTextos": "estudio.lienzo.finalize-tooltip-textos",
  "lienzo.finalizeGuardando": "estudio.lienzo.finalize-guardando",
  "lienzo.gesturesButtonTitle": "estudio.lienzo.gestures-button-title",
  "lienzo.slotEmptyInvite": "estudio.lienzo.slot-empty-invite",
  "lienzo.slotEmptyDrop": "estudio.lienzo.slot-empty-drop",
  "lienzo.slotIndicator": "estudio.lienzo.slot-indicator",
  "lienzo.slotLabelFallback": "estudio.lienzo.slot-label-fallback",
  "lienzo.slotTocaElegir": "estudio.lienzo.slot-toca-elegir",
  "lienzo.unitSeparador": "estudio.lienzo.unit-separador",
  "lienzo.unitPack": "estudio.lienzo.unit-pack",
  "lienzo.unidadGrupoAria": "estudio.lienzo.unidad-grupo-aria",
  "lienzo.unitCaraA": "estudio.lienzo.unit-cara-a",
  "lienzo.unitCaraB": "estudio.lienzo.unit-cara-b",
  "lienzo.slotCaraBOpcional": "estudio.lienzo.slot-cara-b-opcional",
  "lienzo.doblezDesplegado": "estudio.lienzo.doblez-desplegado",
  "lienzo.doblezNotaRotacion": "estudio.lienzo.doblez-nota-rotacion",
  "lienzo.slotTooltipCentrar": "estudio.lienzo.slot-tooltip-centrar",
  "lienzo.slotTooltipEditarAmbos": "estudio.lienzo.slot-tooltip-editar-ambos",
  "lienzo.slotTooltipEditarFoto": "estudio.lienzo.slot-tooltip-editar-foto",
  "lienzo.slotTooltipQuitar": "estudio.lienzo.slot-tooltip-quitar",
  "lienzo.slotZoomTitle": "estudio.lienzo.slot-zoom-title",
  "lienzo.slotSizeTitle": "estudio.lienzo.slot-size-title",
  "lienzo.slotQualityChip": "estudio.lienzo.slot-quality-chip",
  "lienzo.qualityErrorTitle": "estudio.lienzo.quality-error-title",
  "lienzo.qualityWarnTitle": "estudio.lienzo.quality-warn-title",
  "lienzo.sizePrefix": "estudio.lienzo.size-prefix",
  "lienzo.sizeMedida": "estudio.lienzo.size-medida",
  "lienzo.loadingLienzo": "estudio.lienzo.loading-lienzo",
  "lienzo.loadingEstudio": "estudio.lienzo.loading-estudio",
  "lienzo.loadingTitulo": "estudio.lienzo.loading-titulo",
  "lienzo.loadingSubtitulo": "estudio.lienzo.loading-subtitulo",
  "lienzo.bootTitulo": "estudio.lienzo.boot-titulo",
  "lienzo.bootSubtitulo": "estudio.lienzo.boot-subtitulo",
  "lienzo.btnIdeas": "estudio.lienzo.btn-ideas",
  "lienzo.btnCalendario": "estudio.lienzo.btn-calendario",
  "lienzo.btnLibro": "estudio.lienzo.btn-libro",
  "lienzo.btnEspacio": "estudio.lienzo.btn-espacio",
  "lienzo.libroTitulo": "estudio.lienzo.libro-titulo",
  "lienzo.loadingLibro": "estudio.lienzo.loading-libro",
  "lienzo.sheetTitulo": "estudio.lienzo.sheet-titulo",
  "lienzo.calBannerTitulo": "estudio.lienzo.cal-banner-titulo",
  "lienzo.calBannerAno": "estudio.lienzo.cal-banner-ano",
  "lienzo.calBannerHint": "estudio.lienzo.cal-banner-hint",
  "lienzo.calFontLabel": "estudio.lienzo.cal-font-label",
  "lienzo.calFontOptionFredoka": "estudio.lienzo.cal-font-option-fredoka",
  "lienzo.calFontOptionInter": "estudio.lienzo.cal-font-option-inter",
  "lienzo.calFontOptionCaveat": "estudio.lienzo.cal-font-option-caveat",
  "lienzo.calFontOptionBaloo2": "estudio.lienzo.cal-font-option-baloo2",
  "lienzo.calFontOptionNunito": "estudio.lienzo.cal-font-option-nunito",
  "lienzo.calFontOptionPatrick": "estudio.lienzo.cal-font-option-patrick",
  "lienzo.calFontOptionPlayfair": "estudio.lienzo.cal-font-option-playfair",
  "lienzo.calFontOptionDancing": "estudio.lienzo.cal-font-option-dancing",
  "lienzo.calFontAria": "estudio.lienzo.cal-font-aria",
  "lienzo.photoCountLabel": "estudio.lienzo.photo-count-label",
  "lienzo.photoCountHint": "estudio.lienzo.photo-count-hint",
  "lienzo.photoCountFixedHint": "estudio.lienzo.photo-count-fixed-hint",
  "lienzo.photoCountOne": "estudio.lienzo.photo-count-one",
  "lienzo.photoCountMany": "estudio.lienzo.photo-count-many",
  "lienzo.photoCountGroupAria": "estudio.lienzo.photo-count-group-aria",
  "lienzo.photoCountMinusAria": "estudio.lienzo.photo-count-minus-aria",
  "lienzo.photoCountPlusAria": "estudio.lienzo.photo-count-plus-aria",
  "lienzo.unitsCountLabel": "estudio.lienzo.unidades-label",
  "lienzo.unitsCountHint": "estudio.lienzo.unidades-hint",
  "lienzo.unitsCountOne": "estudio.lienzo.unidades-one",
  "lienzo.unitsCountMany": "estudio.lienzo.unidades-many",
  "lienzo.unitsCountGroupAria": "estudio.lienzo.unidades-group-aria",
  "lienzo.unitsCountMinusAria": "estudio.lienzo.unidades-minus-aria",
  "lienzo.unitsCountPlusAria": "estudio.lienzo.unidades-plus-aria",
  "lienzo.magnetCon": "estudio.lienzo.magnet-con",
  "lienzo.magnetSin": "estudio.lienzo.magnet-sin",
  "lienzo.magnetHint": "estudio.lienzo.magnet-hint",
  "lienzo.gesturesTitulo": "estudio.lienzo.gestures-titulo",
  "lienzo.gesturesTouchMoverLead": "estudio.lienzo.gestures-touch-mover-lead",
  "lienzo.gesturesTouchZoomLead": "estudio.lienzo.gestures-touch-zoom-lead",
  "lienzo.gesturesTouchZoomRest": "estudio.lienzo.gestures-touch-zoom-rest",
  "lienzo.gesturesTouchCentrarLead": "estudio.lienzo.gestures-touch-centrar-lead",
  "lienzo.gesturesMouseMoverLead": "estudio.lienzo.gestures-mouse-mover-lead",
  "lienzo.gesturesMouseZoomLead": "estudio.lienzo.gestures-mouse-zoom-lead",
  "lienzo.gesturesMouseZoomRest": "estudio.lienzo.gestures-mouse-zoom-rest",
  "lienzo.gesturesMouseCentrarLead": "estudio.lienzo.gestures-mouse-centrar-lead",
  "lienzo.gesturesRestMover": "estudio.lienzo.gestures-rest-mover",
  "lienzo.gesturesRestCentrar": "estudio.lienzo.gestures-rest-centrar",
  "lienzo.onboardingPaso": "estudio.lienzo.onboarding-paso",
  "lienzo.onboarding1Titulo": "estudio.lienzo.onboarding-1-titulo",
  "lienzo.onboarding1Cuerpo": "estudio.lienzo.onboarding-1-cuerpo",
  "lienzo.onboarding1CuerpoMovil": "estudio.lienzo.onboarding-1-cuerpo-movil",
  "lienzo.onboarding2Titulo": "estudio.lienzo.onboarding-2-titulo",
  "lienzo.onboarding2Cuerpo": "estudio.lienzo.onboarding-2-cuerpo",
  "lienzo.onboarding2CuerpoMovil": "estudio.lienzo.onboarding-2-cuerpo-movil",
  "lienzo.onboarding3Titulo": "estudio.lienzo.onboarding-3-titulo",
  "lienzo.onboarding3Cuerpo": "estudio.lienzo.onboarding-3-cuerpo",
  "lienzo.onboardingCtaEmpezar": "estudio.lienzo.onboarding-cta-empezar",
  "lienzo.onboardingSaltar": "estudio.lienzo.onboarding-saltar",
  "lienzo.finalizeAria": "estudio.lienzo.finalize-aria",
  "lienzo.finalizeAriaBloqueado": "estudio.lienzo.finalize-aria-bloqueado",
  "lienzo.guiaLinea": "estudio.lienzo.guia-linea",
  "lienzo.guiaDescripcion": "estudio.lienzo.guia-descripcion",
  "lienzo.guiaTamano": "estudio.lienzo.guia-tamano",
  "lienzo.calAnoAria": "estudio.lienzo.cal-ano-aria",
  "lienzo.editarAria": "estudio.lienzo.editar-aria",
  "lienzo.editarEspacioAria": "estudio.lienzo.editar-espacio-aria",
  "lienzo.altTuFoto": "estudio.lienzo.alt-tu-foto",
  "lienzo.sustantivoIman": "estudio.lienzo.sustantivo-iman",
  "lienzo.sustantivoSeparador": "estudio.lienzo.sustantivo-separador",
  "lienzo.libroAria": "estudio.lienzo.libro-aria",
  "lienzo.salirAria": "estudio.lienzo.salir-aria",
  "lienzo.gestosAria": "estudio.lienzo.gestos-aria",
  "lienzo.lienzoAria": "estudio.lienzo.lienzo-aria",
  "lienzo.unidadAria": "estudio.lienzo.unidad-aria",
  "lienzo.tarjetaDetalleAria": "estudio.lienzo.tarjeta-detalle-aria",
  "lienzo.tarjetaAnteriorAria": "estudio.lienzo.tarjeta-anterior-aria",
  "lienzo.tarjetaSiguienteAria": "estudio.lienzo.tarjeta-siguiente-aria",
  "lienzo.herramientasAria": "estudio.lienzo.herramientas-aria",
  "lienzo.mascotaAria": "estudio.lienzo.mascota-aria",
  "lienzo.ideasSr": "estudio.lienzo.ideas-sr",
  "lienzo.calBtnSr": "estudio.lienzo.cal-btn-sr",
  "lienzo.libroBtnSr": "estudio.lienzo.libro-btn-sr",
  "lienzo.espacioBtnSr": "estudio.lienzo.espacio-btn-sr",
  "lienzo.tamanoChipAria": "estudio.lienzo.tamano-chip-aria",
  "lienzo.zoomAria": "estudio.lienzo.zoom-aria",
  "lienzo.stageZoomTitle": "estudio.lienzo.stage-zoom-title",
  "lienzo.stageZoomInAria": "estudio.lienzo.stage-zoom-in-aria",
  "lienzo.stageZoomOutAria": "estudio.lienzo.stage-zoom-out-aria",
  "lienzo.stageZoomResetAria": "estudio.lienzo.stage-zoom-reset-aria",
  "lienzo.slotTamanoAria": "estudio.lienzo.slot-tamano-aria",
  "lienzo.slotCentrarAria": "estudio.lienzo.slot-centrar-aria",
  "lienzo.slotEditarAria": "estudio.lienzo.slot-editar-aria",
  "lienzo.slotQuitarAria": "estudio.lienzo.slot-quitar-aria",
  "plantillas.titulo": "estudio.plantillas.titulo",
  "plantillas.vacio": "estudio.plantillas.vacio",
  "plantillas.toastAplicada": "estudio.plantillas.toast-aplicada",
  "plantillas.predisenadosTitulo": "estudio.plantillas.predisenados-titulo",
  "plantillas.predisenadosHint": "estudio.plantillas.predisenados-hint",
  "plantillas.toastPredisenado": "estudio.plantillas.toast-predisenado",
  "plantillas.toastError": "estudio.plantillas.toast-error",
  "plantillas.toastSinSlot": "estudio.plantillas.toast-sin-slot",
  "plantillas.elegirAria": "estudio.plantillas.elegir-aria",
  "plantillas.aplicarDisenoAria": "estudio.plantillas.aplicar-diseno-aria",
  "plantillas.itemAria": "estudio.plantillas.item-aria",
  "plantillas.itemSeleccionada": "estudio.plantillas.item-seleccionada",
  "plantillas.itemTamano": "estudio.plantillas.item-tamano",
  "fotos.titulo": "estudio.fotos.titulo",
  "fotos.toggleOcultar": "estudio.fotos.toggle-ocultar",
  "fotos.toggleTodas": "estudio.fotos.toggle-todas",
  "fotos.toggleTitleOcultar": "estudio.fotos.toggle-title-ocultar",
  "fotos.toggleTitleTodas": "estudio.fotos.toggle-title-todas",
  "fotos.consentimiento": "estudio.fotos.consentimiento",
  "fotos.subirCta": "estudio.fotos.subir-cta",
  "fotos.subirCtaPicker": "estudio.fotos.subir-cta-picker",
  "fotos.subiendo": "estudio.fotos.subiendo",
  "fotos.subiendoPicker": "estudio.fotos.subiendo-picker",
  "fotos.formatos": "estudio.fotos.formatos",
  "fotos.guiaPx": "estudio.fotos.guia-px",
  "fotos.guiaGenerica": "estudio.fotos.guia-generica",
  "fotos.errorCalidad": "estudio.fotos.error-calidad",
  "fotos.errorCalidadMinima": "estudio.fotos.error-calidad-minima",
  "fotos.autofillCta": "estudio.fotos.autofill-cta",
  "fotos.tipVacio": "estudio.fotos.tip-vacio",
  "fotos.todoLleno": "estudio.fotos.todo-lleno",
  "fotos.thumbUsada": "estudio.fotos.thumb-usada",
  "fotos.thumbAviso": "estudio.fotos.thumb-aviso",
  "fotos.thumbArrastrar": "estudio.fotos.thumb-arrastrar",
  "fotos.badgeMejorada": "estudio.fotos.badge-mejorada",
  "fotos.badgeMejoradaTitle": "estudio.fotos.badge-mejorada-title",
  "fotos.calidadTituloFuerte": "estudio.fotos.calidad-titulo-fuerte",
  "fotos.calidadTituloSuave": "estudio.fotos.calidad-titulo-suave",
  "fotos.calidadSubSuave": "estudio.fotos.calidad-sub-suave",
  "fotos.calidadSubFuerte": "estudio.fotos.calidad-sub-fuerte",
  "fotos.calidadMensajeFallback": "estudio.fotos.calidad-mensaje-fallback",
  "fotos.calidadAccionesTitulo": "estudio.fotos.calidad-acciones-titulo",
  "fotos.calidadTip1": "estudio.fotos.calidad-tip-1",
  "fotos.calidadTip2": "estudio.fotos.calidad-tip-2",
  "fotos.calidadCerrar": "estudio.fotos.calidad-cerrar",
  "fotos.pickerTitulo": "estudio.fotos.picker-titulo",
  "fotos.pickerDesc": "estudio.fotos.picker-desc",
  "fotos.pickerVacio": "estudio.fotos.picker-vacio",
  "fotos.progresoTitulo": "estudio.fotos.progreso-titulo",
  "fotos.progresoCompleto": "estudio.fotos.progreso-completo",
  "fotos.progresoVacio": "estudio.fotos.progreso-vacio",
  "fotos.progresoFaltan": "estudio.fotos.progreso-faltan",
  "fotos.subirAria": "estudio.fotos.subir-aria",
  "fotos.autofillAria": "estudio.fotos.autofill-aria",
  "fotos.listaAria": "estudio.fotos.lista-aria",
  "fotos.tusFotosAria": "estudio.fotos.tus-fotos-aria",
  "fotos.fotoSubidaAlt": "estudio.fotos.foto-subida-alt",
  "fotos.usadaAria": "estudio.fotos.usada-aria",
  "fotos.resolucionBajaAria": "estudio.fotos.resolucion-baja-aria",
  "fotos.avisoCalidadAria": "estudio.fotos.aviso-calidad-aria",
  "fotos.avisoMejoraAuto": "estudio.fotos.aviso-mejora-auto",
  "fotos.fotoRevisionAlt": "estudio.fotos.foto-revision-alt",
  "texto.mensajeLabel": "estudio.texto.mensaje-label",
  "texto.mensajeOpcional": "estudio.texto.mensaje-opcional",
  "texto.mensajePlaceholder": "estudio.texto.mensaje-placeholder",
  "texto.mensajeAyuda": "estudio.texto.mensaje-ayuda",
  "texto.mensajeGlobalAviso": "estudio.texto.mensaje-global-aviso",
  "texto.editorTitulo": "estudio.texto.editor-titulo",
  "texto.editorDesc": "estudio.texto.editor-desc",
  "texto.editorCerrar": "estudio.texto.editor-cerrar",
  "texto.sinTexto": "estudio.texto.sin-texto",
  "texto.campoLabel": "estudio.texto.campo-label",
  "texto.campoPlaceholder": "estudio.texto.campo-placeholder",
  "texto.campoIgUsuario": "estudio.texto.campo-ig-usuario",
  "texto.campoIgUbicacion": "estudio.texto.campo-ig-ubicacion",
  "texto.campoIgTitulo": "estudio.texto.campo-ig-titulo",
  "texto.campoIgHashtags": "estudio.texto.campo-ig-hashtags",
  "texto.tamanoLabel": "estudio.texto.tamano-label",
  "texto.negrita": "estudio.texto.negrita",
  "texto.cursiva": "estudio.texto.cursiva",
  "texto.colorLabel": "estudio.texto.color-label",
  "texto.colorSinContrasteHint": "estudio.texto.color-sin-contraste-hint",
  "texto.tipografiaLabel": "estudio.texto.tipografia-label",
  "texto.reset": "estudio.texto.reset",
  "texto.aplicar": "estudio.texto.aplicar",
  "texto.aplicando": "estudio.texto.aplicando",
  "texto.estiloColorTitulo": "estudio.texto.estilo-color-titulo",
  "texto.estiloSinColor": "estudio.texto.estilo-sin-color",
  "texto.estiloBordeTitulo": "estudio.texto.estilo-borde-titulo",
  "texto.estiloConBorde": "estudio.texto.estilo-con-borde",
  "texto.estiloSinBorde": "estudio.texto.estilo-sin-borde",
  "texto.estiloColorDeshabilitadoHint": "estudio.texto.estilo-color-deshabilitado-hint",
  "texto.estiloColorDeshabilitadoHintTira": "estudio.texto.estilo-color-deshabilitado-hint-tira",
  "texto.slotEditTitulo": "estudio.texto.slot-edit-titulo",
  "texto.slotEditTituloIndice": "estudio.texto.slot-edit-titulo-indice",
  "texto.slotEditDesc": "estudio.texto.slot-edit-desc",
  "texto.tabFoto": "estudio.texto.tab-foto",
  "texto.tabTexto": "estudio.texto.tab-texto",
  "texto.cambiarFoto": "estudio.texto.cambiar-foto",
  "texto.perfilTitulo": "estudio.texto.perfil-titulo",
  "texto.perfilHint": "estudio.texto.perfil-hint",
  "texto.perfilCambiar": "estudio.texto.perfil-cambiar",
  "texto.perfilQuitar": "estudio.texto.perfil-quitar",
  "texto.perfilPickerTitulo": "estudio.texto.perfil-picker-titulo",
  "texto.perfilPickerDesc": "estudio.texto.perfil-picker-desc",
  "texto.perfilAvatarHint": "estudio.texto.perfil-avatar-hint",
  "texto.slotEditListo": "estudio.texto.slot-edit-listo",
  "texto.capasVolver": "estudio.texto.capas-volver",
  "texto.capasElegir": "estudio.texto.capas-elegir",
  "texto.capaEditadaBadge": "estudio.texto.capa-editada-badge",
  "texto.capaEditando": "estudio.texto.capa-editando",
  "texto.ajustarReset": "estudio.texto.ajustar-reset",
  "texto.ajustarRotar": "estudio.texto.ajustar-rotar",
  "texto.calFontModalHint": "estudio.texto.cal-font-modal-hint",
  "texto.previewHint": "estudio.texto.preview-hint",
  "texto.filtrosTitulo": "estudio.texto.filtros-titulo",
  "texto.filtroSinLabel": "estudio.texto.filtro-sin-label",
  "texto.filtroSinDesc": "estudio.texto.filtro-sin-desc",
  "texto.filtroVividLabel": "estudio.texto.filtro-vivid-label",
  "texto.filtroVividDesc": "estudio.texto.filtro-vivid-desc",
  "texto.filtroVintageLabel": "estudio.texto.filtro-vintage-label",
  "texto.filtroVintageDesc": "estudio.texto.filtro-vintage-desc",
  "texto.filtroPolaroidLabel": "estudio.texto.filtro-polaroid-label",
  "texto.filtroPolaroidDesc": "estudio.texto.filtro-polaroid-desc",
  "texto.filtroPastelLabel": "estudio.texto.filtro-pastel-label",
  "texto.filtroPastelDesc": "estudio.texto.filtro-pastel-desc",
  "texto.filtroBwLabel": "estudio.texto.filtro-bw-label",
  "texto.filtroBwDesc": "estudio.texto.filtro-bw-desc",
  "texto.tamanoAria": "estudio.texto.tamano-aria",
  "texto.rotarAria": "estudio.texto.rotar-aria",
  "texto.filtrosAria": "estudio.texto.filtros-aria",
  "texto.tipografiaAria": "estudio.texto.tipografia-aria",
  "texto.estiloColorAria": "estudio.texto.estilo-color-aria",
  "texto.estiloBordeAria": "estudio.texto.estilo-borde-aria",
  "exportar.tituloPedido": "estudio.exportar.titulo-pedido",
  "exportar.tituloCalendario": "estudio.exportar.titulo-calendario",
  "exportar.tituloSeparadores": "estudio.exportar.titulo-separadores",
  "exportar.descCalendario": "estudio.exportar.desc-calendario",
  "exportar.descCalendarioTamano": "estudio.exportar.desc-calendario-tamano",
  "exportar.descCalendarioRevisa": "estudio.exportar.desc-calendario-revisa",
  "exportar.descSeparadores": "estudio.exportar.desc-separadores",
  "exportar.descSeparadoresTamano": "estudio.exportar.desc-separadores-tamano",
  "exportar.descSeparadoresTamanoPlano": "estudio.exportar.desc-separadores-tamano-plano",
  "exportar.descImanUno": "estudio.exportar.desc-iman-uno",
  "exportar.descImanes": "estudio.exportar.desc-imanes",
  "exportar.descImanTamano": "estudio.exportar.desc-iman-tamano",
  "exportar.descRevisaUno": "estudio.exportar.desc-revisa-uno",
  "exportar.descRevisaMuchos": "estudio.exportar.desc-revisa-muchos",
  "exportar.resumenCalendario": "estudio.exportar.resumen-calendario",
  "exportar.resumenSeparadorUno": "estudio.exportar.resumen-separador-uno",
  "exportar.resumenSeparadores": "estudio.exportar.resumen-separadores",
  "exportar.resumenUno": "estudio.exportar.resumen-uno",
  "exportar.resumenMuchos": "estudio.exportar.resumen-muchos",
  "exportar.resumenTamanoCada": "estudio.exportar.resumen-tamano-cada",
  "exportar.resumenTamano": "estudio.exportar.resumen-tamano",
  "exportar.volverEditar": "estudio.exportar.volver-editar",
  "exportar.confirmarCta": "estudio.exportar.confirmar-cta",
  "exportar.confirmarGuardando": "estudio.exportar.confirmar-guardando",
  "exportar.errorCarrito": "estudio.exportar.error-carrito",
  "exportar.errorCarritoNombre": "estudio.exportar.error-carrito-nombre",
  "exportar.errorCarritoSet": "estudio.exportar.error-carrito-set",
  "exportar.errorSubidaSlot": "estudio.exportar.error-subida-slot",
  "exportar.errorGuardar": "estudio.exportar.error-guardar",
  "exportar.piezaIman": "estudio.exportar.pieza-iman",
  "exportar.piezaFicha": "estudio.exportar.pieza-ficha",
  "exportar.piezaImanes": "estudio.exportar.pieza-imanes",
  "exportar.piezaFichas": "estudio.exportar.pieza-fichas",
  "exportar.copiasIdenticas": "estudio.exportar.copias-identicas",
  "exportar.copiasAjusteCarrito": "estudio.exportar.copias-ajuste-carrito",
  "escenas.titulo": "estudio.escenas.titulo",
  "escenas.volverDetalle": "estudio.escenas.volver-detalle",
  "escenas.chipNevera": "estudio.escenas.chip-nevera",
  "escenas.chipPolaroid": "estudio.escenas.chip-polaroid",
  "escenas.chipMural": "estudio.escenas.chip-mural",
  "escenas.chipTablero": "estudio.escenas.chip-tablero",
  "escenas.chipLibro": "estudio.escenas.chip-libro",
  "escenas.chipRepisa": "estudio.escenas.chip-repisa",
  "escenas.chipRegalo": "estudio.escenas.chip-regalo",
  "escenas.armando": "estudio.escenas.armando",
  "escenas.error": "estudio.escenas.error",
  "escenas.errorHint": "estudio.escenas.error-hint",
  "escenas.hintTouch": "estudio.escenas.hint-touch",
  "escenas.hintMouse": "estudio.escenas.hint-mouse",
  "escenas.hintPlana": "estudio.escenas.hint-plana",
  "escenas.loadingNevera": "estudio.escenas.loading-nevera",
  "escenas.loadingTablero": "estudio.escenas.loading-tablero",
  "escenas.loadingPolaroid": "estudio.escenas.loading-polaroid",
  "escenas.loadingLibro": "estudio.escenas.loading-libro",
  "escenas.regaloEtiqueta": "estudio.escenas.regalo-etiqueta",
  "escenas.calTitulo": "estudio.escenas.cal-titulo",
  "escenas.calBtnEspacio": "estudio.escenas.cal-btn-espacio",
  "escenas.calHintTouch": "estudio.escenas.cal-hint-touch",
  "escenas.calHintMouse": "estudio.escenas.cal-hint-mouse",
  "escenas.nombreTableroTitulo": "estudio.escenas.nombre-tablero-titulo",
  "escenas.setTableroTitulo": "estudio.escenas.set-tablero-titulo",
  "escenas.nombreBtnTablero": "estudio.escenas.nombre-btn-tablero",
  "escenas.setBtnTablero": "estudio.escenas.set-btn-tablero",
  "escenas.nombreTableroAria": "estudio.escenas.nombre-tablero-aria",
  "escenas.setTableroAria": "estudio.escenas.set-tablero-aria",
  "escenas.setBtnTableroAria": "estudio.escenas.set-btn-tablero-aria",
  "escenas.galeriaAria": "estudio.escenas.galeria-aria",
  "escenas.grupoAria": "estudio.escenas.grupo-aria",
  "nombre.titulo": "estudio.nombre.titulo",
  "nombre.subtitulo": "estudio.nombre.subtitulo",
  "nombre.inputLabel": "estudio.nombre.input-label",
  "nombre.contadorUna": "estudio.nombre.contador-una",
  "nombre.contadorMuchas": "estudio.nombre.contador-muchas",
  "nombre.placeholderEs": "estudio.nombre.placeholder-es",
  "nombre.placeholderEn": "estudio.nombre.placeholder-en",
  "nombre.ayudaEs": "estudio.nombre.ayuda-es",
  "nombre.ayudaEn": "estudio.nombre.ayuda-en",
  "nombre.pruebaLabel": "estudio.nombre.prueba-label",
  "nombre.repetidas": "estudio.nombre.repetidas",
  "nombre.temaVacioHint": "estudio.nombre.tema-vacio-hint",
  "nombre.vacioHint": "estudio.nombre.vacio-hint",
  "nombre.tocaHint": "estudio.nombre.toca-hint",
  "nombre.faltan": "estudio.nombre.faltan",
  "nombre.precioVivo": "estudio.nombre.precio-vivo",
  "nombre.precioHint": "estudio.nombre.precio-hint",
  "nombre.estiloTitulo": "estudio.nombre.estilo-titulo",
  "nombre.estiloHint": "estudio.nombre.estilo-hint",
  "nombre.coloresTitulo": "estudio.nombre.colores-titulo",
  "nombre.coloresHint": "estudio.nombre.colores-hint",
  "nombre.bordeTitulo": "estudio.nombre.borde-titulo",
  "nombre.bordeHint": "estudio.nombre.borde-hint",
  "nombre.bordeCon": "estudio.nombre.borde-con",
  "nombre.bordeSin": "estudio.nombre.borde-sin",
  "nombre.bordeSinColoresHint": "estudio.nombre.borde-sin-colores-hint",
  "nombre.swatchTitulo": "estudio.nombre.swatch-titulo",
  "nombre.menosAria": "estudio.nombre.menos-aria",
  "nombre.masAria": "estudio.nombre.mas-aria",
  "nombre.ejemplosEs": "estudio.nombre.ejemplos-es",
  "nombre.ejemplosEn": "estudio.nombre.ejemplos-en",
  "nombre.swatchAria": "estudio.nombre.swatch-aria",
  "nombre.listoSr": "estudio.nombre.listo-sr",
  "letras.titulo": "estudio.letras.titulo",
  "letras.subVocalesIlustrado": "estudio.letras.sub-vocales-ilustrado",
  "letras.subVocales": "estudio.letras.sub-vocales",
  "letras.subFullIlustrado": "estudio.letras.sub-full-ilustrado",
  "letras.subFull": "estudio.letras.sub-full",
  "letras.temaTitulo": "estudio.letras.tema-titulo",
  "letras.soloLetra": "estudio.letras.solo-letra",
  "letras.idiomaTitulo": "estudio.letras.idioma-titulo",
  "letras.idiomaEs": "estudio.letras.idioma-es",
  "letras.idiomaEn": "estudio.letras.idioma-en",
  "letras.tocaHint": "estudio.letras.toca-hint",
  "letras.temaAria": "estudio.letras.tema-aria",
  "letras.temaHint": "estudio.letras.tema-hint",
  "letras.pintarAria": "estudio.letras.pintar-aria",
  "letras.letraAlt": "estudio.letras.letra-alt",
  "letras.listoSr": "estudio.letras.listo-sr",
  "letras.bordeTitulo": "estudio.letras.borde-titulo",
  "letras.bordeHint": "estudio.letras.borde-hint",
  "letras.bordeCon": "estudio.letras.borde-con",
  "letras.bordeSin": "estudio.letras.borde-sin",
  "letras.bordeSinColoresHint": "estudio.letras.borde-sin-colores-hint",
  "unidades.pagerAria": "estudio.unidades.pager-aria",
  "unidades.unidadDe": "estudio.unidades.unidad-de",
  "unidades.nombreTira": "estudio.unidades.nombre-tira",
  "unidades.nombreCalendario": "estudio.unidades.nombre-calendario",
  "unidades.nombreSeparador": "estudio.unidades.nombre-separador",
  "unidades.nombreSet": "estudio.unidades.nombre-set",
  "unidades.nombrePack": "estudio.unidades.nombre-pack",
  "unidades.nombrePieza": "estudio.unidades.nombre-pieza",
  "unidades.progresoAria": "estudio.unidades.progreso-aria",
  "unidades.aplicarATodas": "estudio.unidades.aplicar-a-todas",
  "unidades.aplicarATodasAria": "estudio.unidades.aplicar-a-todas-aria",
  "unidades.aplicarATodasTitle": "estudio.unidades.aplicar-a-todas-title",
  "unidades.aplicadaFeedback": "estudio.unidades.aplicada-feedback",
  "unidades.modalUnidades": "estudio.unidades.modal-unidades",
  "unidades.descTiras": "estudio.unidades.desc-tiras",
  "unidades.descTiraUna": "estudio.unidades.desc-tira-una",
  "unidades.resumenTiras": "estudio.unidades.resumen-tiras",
  "unidades.resumenTiraUna": "estudio.unidades.resumen-tira-una",
  "unidades.descCalendarios": "estudio.unidades.desc-calendarios",
  "unidades.resumenCalendarios": "estudio.unidades.resumen-calendarios",
  "ia.titulo": "estudio.ia.titulo",
  "ia.label": "estudio.ia.label",
  "ia.placeholder": "estudio.ia.placeholder",
  "ia.notaPrivacidad": "estudio.ia.nota-privacidad",
  "ia.enviar": "estudio.ia.enviar",
  "ia.cargando": "estudio.ia.cargando",
  "ia.fraseLabel": "estudio.ia.frase-label",
  "ia.copiar": "estudio.ia.copiar",
  "ia.copiada": "estudio.ia.copiada",
  "ia.colorLabel": "estudio.ia.color-label",
  "ia.composicionLabel": "estudio.ia.composicion-label",
  "ia.tipLabel": "estudio.ia.tip-label",
  "ia.pie": "estudio.ia.pie",
  "ia.panelAria": "estudio.ia.panel-aria",
  "errores.bootTitulo": "estudio.errores.boot-titulo",
  "errores.boot": "estudio.errores.boot",
  "errores.preview": "estudio.errores.preview",
  "errores.vista3d": "estudio.errores.vista-3d",
  "errores.espacio": "estudio.errores.espacio",
  "errores.calendario": "estudio.errores.calendario",
  "errores.generico": "estudio.errores.generico",
};

/**
 * Interpola placeholders `{nombre}` de un texto CMS con valores runtime. Placeholder sin
 * valor se deja tal cual (mejor un `{n}` visible que un crash — misma filosofía del fallback).
 */
export function fillStudioText(template: string, vars: Record<string, string | number>): string {
  let out = template;
  for (const [name, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${name}}`, String(value));
  }
  return out;
}

/**
 * Parte un texto CMS por UN placeholder para intercalar JSX (ej. el <strong> del nombre
 * de producto). Devuelve [antes, después] o null si el placeholder no está presente
 * (el caller interpola plano con fillStudioText como degradación segura).
 */
export function splitStudioText(template: string, varName: string): [string, string] | null {
  const MARK = "\u0001"; // carácter de control: no puede aparecer en texto del admin
  const parts = fillStudioText(template, { [varName]: MARK }).split(MARK);
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}
