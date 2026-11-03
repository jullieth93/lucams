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
     *  de confirmación, no agrega nada al carrito todavía. QA ronda 2 (owner
     *  2026-10-07): TODOS los CTAs de finalizar se llaman «Ver diseño» — el
     *  header sticky y el botón del panel comparten esta misma clave (la
     *  diferenciación «Vista previa»/«Ver diseño» de QA 1.6 se revirtió a
     *  pedido del owner; la clave `comun.verDiseno` quedó redundante y se
     *  eliminó). */
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
    /** Fase 2 · item 2.4 (2026-10-07) — banner "Continuar donde quedaste": se
     *  ofrece al entrar al Estudio cuando hay un draft previo del mismo
     *  producto guardado (marcador localStorage validado server-side). */
    continuarTitulo: string;
    continuarCuerpo: string;
    /** 2026-10-13 — línea de detalle del interstitial: QUÉ se retoma.
     *  Placeholders {producto} y {fecha} (último guardado del marcador). */
    continuarDetalle: string;
    continuarCta: string;
    continuarDescartar: string;
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
    /** Fase 1A (2026-09-27) — popover "qué falta" de «Vista previa»: lista las
     *  fotos por cargar (label de cada slot) y los textos IG por unidad. */
    finalizePopoverAria: string;
    finalizePopoverTitulo: string;
    finalizePopoverFotos: string;
    finalizePopoverTextos: string;
    finalizeGuardando: string;
    /** Paquete C (2026-10-02) — chip resumen de avisos de calidad junto a
     *  «Vista previa» (toolbar). {n} = fotos asignadas con aviso. */
    calidadChipTexto: string;
    calidadChipAria: string;
    /** Título del popover del chip (lista las fotos con aviso). */
    calidadPopoverTitulo: string;
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
    /** Paquete A (2026-10-02) — tooltip del badge «Opcional»: la regla única de
     *  la cara B vacía. Decisión owner 2026-11-03: se imprime con el PATRÓN DE
     *  MARCA «Lucams» (nunca espejo de la cara A; producción: default-back-face.ts
     *  en features/personalization). Supera la regla «en blanco» del 2026-10-07. */
    slotCaraBOpcionalTitle: string;
    /** Línea de doblez de la tira de separador (solo plegables, no noFold):
     *  "Doblez · Desplegado: {tamano}" — {tamano} = tamaño total desplegado. */
    doblezDesplegado: string;
    /** Nota junto al doblez (solo plegables, 2026-09-25): la tira se imprime con
     *  las caras cabeza a cabeza hacia el doblez — al doblarla sobre la página
     *  ambas se leen derechas. */
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
    /**
     * Lucy 2026-09-05 — packs: stepper de CANTIDAD DE UNIDADES (junto a la
     * toolbar). 2026-10-12: el N son unidades del producto (separadores,
     * imanes…), no fotos — las claves son plantillas fillStudioText:
     *   {one}/{many} = sustantivo de la unidad (lo resuelve el Estudio por
     *     producto; photoCountOne/Many son el fallback si no llega),
     *   {cuantos} = "Cuántos"/"Cuántas" y {uno} = "un"/"una" (concordancia de
     *     género, la resuelve el control — no escribirlas a mano),
     *   {n} = el número (solo photoCountFixedHint).
     */
    photoCountLabel: string;
    photoCountHint: string;
    photoCountFixedHint: string;
    /** Fallback del sustantivo cuando el producto no resuelve uno (CMS "foto/s"). */
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
    /** 2026-10-19 — «Borrar el diseño»: reset GLOBAL de los slots del canvas
     *  (fotos + overrides de texto) con modal de confirmación. La plantilla, la
     *  variante y las fotos de «Mis fotos» se conservan; es undoable (Ctrl+Z). */
    borrarDisenoCta: string;
    borrarDisenoTitulo: string;
    borrarDisenoCuerpo: string;
    borrarDisenoConfirmar: string;
    borrarDisenoCancelar: string;
    /** Ola 2 (2026-10-26) — pista de descubribilidad de la edición DIRECTA de
     *  texto en el lienzo (pill dismissible junto al canvas; persiste en
     *  localStorage al descartarla). Solo con plantilla de textos editables. */
    textoEditableHint: string;
  };
  /** Plantillas y diseños. */
  plantillas: {
    titulo: string;
    vacio: string;
    toastAplicada: string;
    predisenadosTitulo: string;
    predisenadosHint: string;
    toastPredisenado: string;
    /** Paquete A (2026-10-02) — confirmación del llenado VARIADO. {n} = cuántos diseños se aplicaron. */
    toastPredisenadoVarios: string;
    /** Paquete A — CTA del llenado variado de slots vacíos (round-robin del catálogo). */
    predisenadosLlenarCta: string;
    predisenadosLlenarAria: string;
    /** Paquete A — la cara B NO se aplicó porque su slot ya tenía contenido (nunca se pisa ni se descarta en silencio). */
    toastCaraBOcupada: string;
    /** Paquete A — badges de caras de la tarjeta de prediseñado (solo productos de 2 caras). */
    badgeDosCaras: string;
    badgeUnaCara: string;
    badgeDosCarasTitle: string;
    badgeUnaCaraTitle: string;
    toastError: string;
    toastSinSlot: string;
    /** Fix STG 2026-10-06 — no queda ningún lienzo libre para el prediseñado (nunca se pisa contenido). */
    toastSinLienzoLibre: string;
    /** Regla de caras (2026-10-12) — pregunta previa al aplicar GLOBALMENTE (sin
     *  slot específico) un diseño de 1 cara en un producto de 2 caras. Los
     *  botones de elección reusan lienzo.unitCaraA/unitCaraB. */
    caraPreguntaTitulo: string;
    /** Cuerpo de la pregunta de cara. {nombre} = nombre del diseño. */
    caraPreguntaCuerpo: string;
    caraPreguntaCancelar: string;
    /** Reemplazo explícito (2026-10-19) — ventana que lista los lienzos OCUPADOS
     *  cuando no queda ninguno libre para el prediseñado: el cliente elige cuál
     *  reemplazar (nunca se pisa contenido en silencio). Reemplaza al toast
     *  toastSinLienzoLibre como primera respuesta (queda como fallback). */
    reemplazoTitulo: string;
    /** Cuerpo del aviso de reemplazo. {nombre} = nombre del diseño. */
    reemplazoCuerpo: string;
    /** Rótulo numerado de cada lienzo ocupado en la lista. {n} = número (slotIndex+1). */
    reemplazoLienzoNombre: string;
    /** Nombre accesible del botón de cada lienzo. {n} = número (slotIndex+1). */
    reemplazoLienzoAria: string;
    reemplazoCancelar: string;
    /** 2026-10-26 (bug del separador mezclado) — variante PAR del modal de
     *  reemplazo: prediseñado de 2 caras con todo lleno → las opciones son
     *  separadores COMPLETOS y elegir uno reemplaza sus 2 caras. */
    reemplazoParTitulo: string;
    /** Cuerpo del aviso de reemplazo de par. {nombre} = nombre del diseño. */
    reemplazoParCuerpo: string;
    /** Rótulo de cada separador en la lista de reemplazo por par. {n} = unidad. */
    reemplazoParNombre: string;
    /** Nombre accesible del botón de cada separador. {n} = número de unidad. */
    reemplazoParAria: string;
    /** Toast de confirmación del reemplazo por par. {n} = número de unidad. */
    toastReemplazoPar: string;
    /** 2026-10-26 — affordance «Ver» (ícono ojo) de cada tarjeta de prediseñado:
     *  abre el preview en Dialog (la única vía en táctil; en desktop coexiste
     *  con el hover). {nombre} = nombre del diseño. */
    verDisenoAria: string;
    /** CTA del Dialog de preview del prediseñado (aplica el diseño). */
    verDisenoUsar: string;
    /** Ola 2 (2026-10-26) — bloqueo GUIADO de «Ver diseño» sin plantilla
     *  elegida (con >1): toast que acompaña el resaltado de la sección. */
    elegirParaContinuar: string;
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
    /** 2026-10-29 — biblioteca usable («Mis fotos»): el tap sobre una foto la
     *  asigna al lienzo seleccionado si está libre, si no al próximo libre. */
    asignadaToast: string;
    /** 2026-10-29 — no queda lienzo libre al tocar una foto de la biblioteca. */
    sinLienzoLibre: string;
    /** 2026-10-29 — borrado individual de una foto de la biblioteca. */
    eliminarAria: string;
    eliminarTitulo: string;
    eliminarCuerpo: string;
    eliminarConfirmar: string;
    eliminadaToast: string;
    eliminarError: string;
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
    /** Paquete C (2026-10-02) — rótulo del bloque con la recomendación ESPECÍFICA
     *  del caso (la genera el servidor según el check que falló). */
    calidadRecomendacionTitulo: string;
    /** Paquete C — texto corto del badge visible de aviso en las miniaturas
     *  (sidebar y picker; antes solo un emoji). */
    badgeRevisar: string;
    /** Chip bajo la miniatura cuando la foto ya está asignada a un slot
     *  (reemplaza el check ✓ flotante sobre la imagen). */
    badgeAgregada: string;
    calidadCerrar: string;
    /** CTA del modal de calidad en el picker: asignar la foto con warning igual. */
    calidadUsarDeTodosModos: string;
    pickerTitulo: string;
    pickerDesc: string;
    pickerVacio: string;
    /** Fase 2 UX (2026-10-13) — cierre explícito del picker (footer sticky): el
     *  cliente termina de subir/elegir y cierra sin asignar nada más. */
    pickerListo: string;
    /** Fase 2 · 2.5 (2026-10-07) — tabs del picker "Mis fotos" / "Prediseñados"
     *  (antes un solo scroll con Mis fotos sepultada bajo los prediseñados). */
    pickerTabFotos: string;
    pickerTabPredisenados: string;
    pickerTabsAria: string;
    /** Fase 2 · 2.5 — toggle que colapsa/expande la sección de diseños
     *  prediseñados de la sidebar (cerrada por defecto cuando hay muchos). */
    predisenadosToggleAria: string;
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
    /** Rediseño IG (2026-10-05) — «me gusta» ahora es requerido y aparece en el
     *  aviso de «Vista previa» bloqueado. */
    campoIgLikes: string;
    /** Fase 1B — bloque de diligenciamiento masivo de la Polaroid Instagram en el
     *  sidebar ("Datos de la publicación"): un campo por capa editable que escribe
     *  en TODAS las fotos del set (equivalente multi-campo de "Tu mensaje"). */
    igDatosTitulo: string;
    igDatosSub: string;
    igCampoUsuario: string;
    igCampoUbicacion: string;
    igCampoLikes: string;
    igCampoTitulo: string;
    igCampoHashtags: string;
    igCampoRequerido: string;
    igCampoOpcional: string;
    /** Chip/placeholder cuando las unidades difieren en esa capa (edición por foto). */
    igVariaPorFoto: string;
    igVariaPlaceholder: string;
    /** Aviso pack-level del bloque (misma caja destacada del aviso de "Tu mensaje"). */
    igGlobalAviso: string;
    /** QA ronda 2 (owner 2026-10-07, F3) — sección «Campos de Instagram» de la
     *  edición INDIVIDUAL por slot (pestaña Texto del StudioSlotEditModal): los
     *  mismos 5 campos asistidos del bloque pack-level pero escribiendo el
     *  override de ESE canvas (setSlotTextOverride). */
    igSlotCamposTitulo: string;
    igSlotCamposHint: string;
    /** Rediseño asistido (2026-10-05) — ayudas y avisos de los controles por capa. */
    igUsuarioHint: string;
    /** Owner 2026-10-12 — la ubicación es input de texto simple (sin
     *  sugerencias). 2026-10-26: el hint explica el formato «Ciudad, País»
     *  (multi-palabra por segmento; se retiró la regla de máximo 2 palabras). */
    igUbicacionHint: string;
    /** Owner 2026-10-27 — aviso inline de FORMATO de la ubicación (regla
     *  «Ciudad, País»: una coma, ambos segmentos con texto). Orientativo: se
     *  muestra tras commit/blur, nunca bloquea guardar ni finalizar. */
    igUbicacionFormato: string;
    igTituloPlaceholder: string;
    igHashtagsPlaceholder: string;
    /** Aviso al intentar agregar un 4º hashtag (tope de producto: 3). */
    igHashtagsMaxAviso: string;
    /** Nombre accesible del botón × de cada chip de hashtag. {tag} = el hashtag. */
    igHashtagsQuitarAria: string;
    /** 2026-10-19 — re-aplicado EXPLÍCITO de los datos masivos a TODOS los slots
     *  actuales (incluidos los de packs agregados después): el commit debounced
     *  del input es no-op cuando el texto no cambió, así que sin este botón no
     *  había forma de re-alcanzarlos. */
    igReaplicarCta: string;
    /** Feedback sr-only (aria-live) tras el re-aplicado masivo. */
    igReaplicarFeedback: string;
    tamanoLabel: string;
    negrita: string;
    cursiva: string;
    colorLabel: string;
    /** Ola 28 (owner 2026-09-11, 1.2.1.A) — aviso cuando el color de texto elegido
     *  casi no contrasta con la tarjeta (blanco sobre tarjeta blanca = invisible). */
    colorSinContrasteHint: string;
    /** Fase 1B — aria de la opción «Personalizado» del picker de color de texto. */
    colorPersonalizado: string;
    tipografiaLabel: string;
    reset: string;
    aplicar: string;
    /** Lucy 2026-09-08 — estado de PROCESANDO del botón «Aplicar» (spinner + disabled). */
    aplicando: string;
    estiloColorTitulo: string;
    estiloSinColor: string;
    /** Fase 1B — opción «Personalizado» de la paleta de tarjeta (input color nativo). */
    estiloColorPersonalizado: string;
    estiloBordeTitulo: string;
    estiloConBorde: string;
    estiloSinBorde: string;
    /** 2026-10-26 — slider de GROSOR del borde (productos que lo habilitan en
     *  admin, rango personalizationSchema.borderWidth). Título visible. */
    estiloGrosorTitulo: string;
    /** Nombre audible del slider de grosor. */
    estiloGrosorAria: string;
    /** Ola 24 — aviso cuando la paleta de color queda desactivada por «Sin borde». */
    estiloColorDeshabilitadoHint: string;
    /** Owner 2026-10-06 — aviso INFORMATIVO de la Instagram en «Sin borde»: la paleta
     *  queda ACTIVA y el color pinta las franjas de arriba/abajo de la foto. */
    estiloColorSinBordeHintIg: string;
    /** Ola 24 (tiras) — variante del aviso para la tira photobooth (foto a foto, sin canaletas). */
    estiloColorDeshabilitadoHintTira: string;
    /** Fase 2 UX (2026-10-13) — bottom-sheet de estilo en móvil: nombre audible
     *  del botón resumen (anuncia el estado actual). {borde}/{color}. */
    estiloResumenAria: string;
    /** Título del bottom-sheet de estilo (móvil). */
    estiloSheetTitulo: string;
    /** Botón primario que cierra el bottom-sheet de estilo. */
    estiloSheetListo: string;
    /** Nombre del color de tarjeta elegido, siempre visible (en el sheet bajo la
     *  grilla; en desktop junto al título «Color de tarjeta»). {color} = nombre. */
    estiloColorElegido: string;
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
    /** Fase 1B — encuadre (zoom/pan) de la foto de perfil IG en el editor de slot. */
    perfilEncuadreTitulo: string;
    perfilEncuadreHint: string;
    perfilZoomAria: string;
    slotEditListo: string;
    capasVolver: string;
    capasElegir: string;
    capaEditadaBadge: string;
    capaEditando: string;
    /** Fase 1B — «Aplicar a todas» por capa de texto (setTextOverrideAllSlots). */
    capaAplicarATodas: string;
    capaAplicarATodasAria: string;
    capaAplicadaFeedback: string;
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
    /** Progreso REAL del render de imprenta en background (ADR-131): polling del RenderJob. */
    preparandoArchivos: string;
    errorCarrito: string;
    errorCarritoNombre: string;
    errorCarritoSet: string;
    errorSubidaSlot: string;
    /** Falla de red/subida en el confirmar: mensaje amigable orientado a acción (nunca el error crudo del navegador). */
    errorSubidaArchivos: string;
    errorGuardar: string;
    /** La Server Action reventó con un 500/504 HTML de plataforma (timeout/OOM
     *  de la Function): copy propio en vez del "An unexpected response was
     *  received from the server" crudo de Next. */
    errorServidorLento: string;
    piezaIman: string;
    piezaFicha: string;
    piezaImanes: string;
    piezaFichas: string;
    /** Dato de copias cuando la PDP fijó N>1 (regla 2026-09-08b: sin stepper acá). */
    copiasIdenticas: string;
    /**
     * Nota bajo el dato de copias (SOLO path legacy — nombre). Hasta 2026-09-25
     * decía "Puedes ajustar la cantidad en el carrito", pero las líneas
     * personalizadas ya no tienen stepper en el carrito (modelo multi-unidad):
     * la cantidad se eligió en la PDP y cambiarla implica volver a ella.
     */
    copiasAjusteCarrito: string;
    /** Paquete C (2026-10-02) — sección "Calidad de tus fotos" de la Vista
     *  Previa: lista las fotos asignadas con aviso y exige la aceptación
     *  explícita antes de confirmar (solo aparece si hay avisos). */
    calidadSeccionTitulo: string;
    calidadSeccionIntro: string;
    /** Texto del checkbox OBLIGATORIO de aceptación (habilita el confirmar).
     *  Solo se muestra cuando hay avisos que exigen aceptación (requiresAck). */
    calidadAcepto: string;
    /** Fase 2 (2026-10-02) — nota que reemplaza al checkbox cuando TODOS los
     *  avisos son informativos (brillo suave como único problema): no hay
     *  nada que aceptar y el confirmar queda habilitado. */
    calidadNotaInformativa: string;
    /** Fase 2 · item 2.2 (2026-10-07) — arias del pager de la Vista Previa
     *  paginada por unidad (flechas anterior/siguiente y grupo de dots). */
    pagerAnteriorAria: string;
    pagerSiguienteAria: string;
    pagerDotsAria: string;
    /** PERF (2026-10-07) — indicador de carga de una página PEREZOSA del pager
     *  (la unidad se genera por demanda al navegar a ella). */
    pagerCargandoPagina: string;
    /** 2026-10-19 — arias de los controles de zoom del preview (−/%/+/reset):
     *  la alternativa accesible a los gestos (rueda/pinch/doble click). */
    zoomAlejarAria: string;
    zoomAcercarAria: string;
    zoomRestablecerAria: string;
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
    /** Fase 2.10 (owner 2026-10-07) — estado vacío de la galería: TODAS las
     *  escenas quedaron filtradas por variante SIN IMÁN (p.ej. letters, cuya
     *  única escena afirma imán). */
    vacio: string;
    vacioHint: string;
    /** Ronda 2 QA (owner 2026-10-08) — toggle de caras en la vista del libro:
     *  muestra la ACCIÓN (a qué cara se cambia al pulsar). */
    libroVerRespaldo: string;
    libroVerFrente: string;
    hintTouch: string;
    hintMouse: string;
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
    /** Fase 1B — aria de la opción «Personalizado» de la fila de swatches. */
    swatchPersonalizadoAria: string;
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
    /** Stepper de cantidad de sets en el Estudio (2026-10-12) — cambiar N sin
     *  volver a la PDP (tope MAX_LETTER_SET_UNITS). Al reducir se recortan los
     *  sets del final; al aumentar, los nuevos nacen con el tema default
     *  (misma regla del stepper de unidades del estudio de foto). */
    setsTitulo: string;
    setsHint: string;
    setsGroupAria: string;
    setsMenosAria: string;
    setsMasAria: string;
    /** Valor visible del stepper: "{n} sets" / "{n} set". */
    setsValor: string;
    setsValorUno: string;
    /** 2026-10-19 (estilo/colores/borde POR SET) — rótulo del selector de set:
     *  deja claro EN QUÉ set se está trabajando antes de sus opciones. Solo se
     *  muestra con más de un set. */
    setPagerTitulo: string;
    /** Hint junto al rótulo del selector de set. */
    setPagerHint: string;
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
    /** 2026-10-29 (owner) — calendario: la grilla de meses se puede colapsar/
     *  expandir con ayuda visual (resumen + chips de estado por mes). */
    calMesesTitulo: string;
    calMesesResumen: string;
    calMesesToggleAria: string;
    /**
     * Modal de confirmación: línea de unidades del diseño (se muestra siempre
     * que el modelo multi-unidad está activo, también con 1 unidad).
     * Placeholders: {n} = número; {sustantivo} = sustantivo de la unidad ya en
     * singular o plural según {n} ("1 separador", "3 separadores" — lo resuelve
     * el editor por producto; sin prop cae a "unidad/unidades"); {uno} =
     * "uno"/"una" según el género del sustantivo (concordancia con "cada…").
     */
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
  /** 5.1 (2026-10-22) — checklist persistente «Tu diseño»: pasos derivados de
   *  las features del producto/sesión (fotos, prediseñados, mensaje, datos de
   *  la publicación IG). Lo montan el sidebar (sección al tope) y el FAB
   *  «Editar» en móvil (badge con el conteo de pasos pendientes). */
  checklist: {
    titulo: string;
    /** Paso de plantillas (5.1, 2026-10-22): solo con >1 plantilla; pendiente
     *  hasta que el cliente elija una (ninguna viene seleccionada por defecto). */
    pasoPlantillas: string;
    pasoFotos: string;
    /** Detalle del paso de fotos: {n} listas de {total}. */
    pasoFotosDetalle: string;
    pasoPredisenados: string;
    pasoMensaje: string;
    pasoPublicacion: string;
    /** Tag de los pasos informativos que no bloquean («Opcional»). */
    opcional: string;
    /** Estado accesible de un paso (aria-label compone label + estado). */
    completo: string;
    pendiente: string;
    /** Nombre audible del badge de pendientes sobre el FAB «Editar» ({n} = pasos). */
    badgePendientes: string;
  };
  /**
   * Fase 2 · item 2.8 (2026-10-07) — tour de onboarding POR TIPO DE PRODUCTO:
   * features del lienzo específico que StudioOnboarding suma tras los 3 pasos
   * genéricos (config en lib/studio-tour.ts). Título + texto por feature.
   */
  tour: {
    /** Polaroid Instagram: foto de perfil editable en el avatar (pista del
     *  item 2.7 incluida acá a solicitud del plan), textos del post y marco. */
    igPerfilTitulo: string;
    igPerfilTexto: string;
    igTextosTitulo: string;
    igTextosTexto: string;
    igMarcoTitulo: string;
    igMarcoTexto: string;
    /** Calendario: sets/unidades y año + tipo de letra. */
    calSetsTitulo: string;
    calSetsTexto: string;
    calAnoTitulo: string;
    calAnoTexto: string;
    /** Separadores: caras A/B y la regla del respaldo EN BLANCO (owner 2026-10-07). */
    sepCarasTitulo: string;
    sepCarasTexto: string;
    sepRespaldoTitulo: string;
    sepRespaldoTexto: string;
    /** Tiras photobooth: tira continua y unidades. */
    tiraContinuaTitulo: string;
    tiraContinuaTexto: string;
    tiraUnidadesTitulo: string;
    tiraUnidadesTexto: string;
    /** Productos con marco de color (Cuadrados y similares). */
    cuadMarcoTitulo: string;
    cuadMarcoTexto: string;
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
    /** Separadores planos: la foto debe cubrir toda el área de impresión. */
    fotoSinCobertura: string;
    vista3d: string;
    espacio: string;
    calendario: string;
    generico: string;
    /**
     * 2026-10-12 — recover (?designId=): avisa que N fotos del diseño ya no
     * existen en el servidor (sus slots quedaron vacíos para re-subir). {n}
     * es el conteo. Antes fallaba en silencio (placeholder lila eterno).
     */
    assetsFaltantes: string;
    /**
     * 2026-10-20 — recover FALLIDO de «Continuar donde quedaste» (resume=1):
     * el borrador del marcador fue purgado, es de otro owner o ya no es DRAFT.
     * Antes el marcador se limpiaba en silencio y el Estudio arrancaba vacío
     * sin explicación; ahora se avisa y se arranca uno nuevo.
     */
    borradorPerdido: string;
  };
};

export const DEFAULT_STUDIO_TEXTS: StudioTexts = {
  comun: {
    listo: "Ver diseño",
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
    // Fase 2 · item 2.4 (2026-10-07) — banner del draft recuperable.
    continuarTitulo: "Continuar donde quedaste",
    continuarCuerpo:
      "Encontramos un diseño tuyo de este producto sin terminar. ¿Retomamos donde lo dejaste?",
    continuarDetalle: "{producto} · último cambio: {fecha}",
    continuarCta: "Sí, continuar",
    continuarDescartar: "Descartar y empezar de nuevo",
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
    // QA ronda 2 (owner 2026-10-07): TODOS los CTAs de finalizar se llaman «Ver diseño»
    // (antes «Vista previa» — mismo rótulo que comun.listo en nombre/letras).
    finalizeBtn: "Ver diseño",
    finalizeTooltip: "Faltan {n} fotos por cargar para ver la vista previa",
    finalizeTooltipTextos: "Completa los textos de tu diseño para ver la vista previa: {campos}",
    finalizePopoverAria: "Qué falta para ver la vista previa",
    finalizePopoverTitulo: "Para ver tu vista previa te falta:",
    finalizePopoverFotos: "Fotos por cargar:",
    finalizePopoverTextos: "Textos por completar:",
    finalizeGuardando: "Guardando diseño...",
    // Paquete C (2026-10-02) — chip resumen de avisos de calidad junto a «Vista previa».
    calidadChipTexto: "{n} por revisar",
    calidadChipAria: "{n} fotos tienen avisos de calidad. Click para ver cuáles son.",
    calidadPopoverTitulo: "Fotos con avisos de calidad",
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
    slotCaraBOpcionalTitle: "Si no diseñas el respaldo, lo imprimimos con la marca de agua de Lucams.",
    doblezDesplegado: "Doblez · Desplegado: {tamano}",
    doblezNotaRotacion:
      "La tira se imprime con las caras cabeza a cabeza hacia el doblez — al doblarla sobre la página ambas se leen derechas.",
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
    calBannerHint: "Una foto por mes: toca cada mes para elegir la tuya",
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
    photoCountLabel: "¿{cuantos} {many} quieres?",
    photoCountHint: "Tus fotos se conservan al cambiar el número",
    photoCountFixedHint: "Este tamaño lleva {n} {many}",
    photoCountOne: "foto",
    photoCountMany: "fotos",
    photoCountGroupAria: "Cantidad de {many}",
    photoCountMinusAria: "Quitar {uno} {one}",
    photoCountPlusAria: "Agregar {uno} {one}",
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
    finalizeAria: "Ver diseño de tu pedido",
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
    // 2026-10-19 — borrado GLOBAL del diseño (antes solo existía por slot).
    borrarDisenoCta: "Borrar el diseño",
    borrarDisenoTitulo: "¿Borrar todo el diseño?",
    borrarDisenoCuerpo:
      "Se quitan las fotos y los textos de todos los espacios. Tus fotos subidas se conservan en «Mis fotos» y la plantilla no cambia. Si te arrepientes, puedes deshacerlo con Ctrl+Z.",
    borrarDisenoConfirmar: "Sí, borrar todo",
    borrarDisenoCancelar: "Cancelar",
    // Ola 2 (2026-10-26) — descubribilidad de la edición directa de texto.
    textoEditableHint: "Tip: toca un texto sobre el diseño para editarlo ✏️",
  },
  plantillas: {
    titulo: "Plantillas",
    vacio: "Aún no hay plantillas para este producto.",
    toastAplicada: 'Plantilla "{nombre}" aplicada',
    predisenadosTitulo: "Diseños prediseñados",
    predisenadosHint:
      "Elige un diseño y decide dónde aplicarlo. Si todo está lleno, tú escoges cuál reemplazar.",
    toastPredisenado: 'Diseño "{nombre}" aplicado',
    toastPredisenadoVarios: "{n} diseños aplicados",
    predisenadosLlenarCta: "Llenar con diseños variados",
    predisenadosLlenarAria: "Llenar los espacios vacíos con diseños prediseñados distintos",
    toastCaraBOcupada:
      "El respaldo no se aplicó porque ese espacio ya tiene un diseño (no pisamos tu contenido).",
    badgeDosCaras: "2 caras",
    badgeUnaCara: "1 cara",
    badgeDosCarasTitle: "Este diseño trae frente y respaldo.",
    badgeUnaCaraTitle: "Este diseño trae solo el frente: el respaldo queda en blanco.",
    toastError: "No pudimos aplicar el diseño. Intenta de nuevo.",
    toastSinSlot: "Selecciona un slot vacío primero",
    toastSinLienzoLibre:
      "Todos los lienzos ya tienen un diseño. Si quieres cambiar uno, bórralo primero.",
    caraPreguntaTitulo: "¿En qué cara quieres aplicarlo?",
    caraPreguntaCuerpo:
      "«{nombre}» es un diseño de 1 cara: elige si va en el frente (cara A) o en el respaldo (cara B).",
    caraPreguntaCancelar: "Cancelar",
    reemplazoTitulo: "¿Cuál lienzo quieres reemplazar?",
    reemplazoCuerpo:
      "Todos los lienzos ya tienen un diseño y «{nombre}» no encuentra espacio libre. Elige cuál quieres cambiar: su diseño anterior se reemplaza por el nuevo.",
    reemplazoLienzoNombre: "Lienzo {n}",
    reemplazoLienzoAria: "Reemplazar el diseño del lienzo {n}",
    reemplazoCancelar: "Cancelar",
    // 2026-10-26 — reemplazo por PAR (prediseñado de 2 caras, todo lleno).
    reemplazoParTitulo: "¿Cuál separador quieres reemplazar?",
    reemplazoParCuerpo:
      "«{nombre}» trae frente y respaldo, y todos tus separadores ya tienen diseño. Elige cuál cambiar: se reemplazan sus 2 caras.",
    reemplazoParNombre: "Separador {n}",
    reemplazoParAria: "Reemplazar las 2 caras del separador {n}",
    toastReemplazoPar: "Se reemplazó el separador {n} (ambas caras)",
    // 2026-10-26 — preview «Ver» del prediseñado (táctil y desktop).
    verDisenoAria: "Ver el diseño {nombre} en grande",
    verDisenoUsar: "Usar este diseño",
    // Ola 2 (2026-10-26) — bloqueo guiado sin plantilla elegida.
    elegirParaContinuar: "Elige tu plantilla para continuar — toca una de las opciones ✨",
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
    thumbArrastrar:
      "Tócala para ponerla en el próximo lienzo vacío, o arrástrala al lienzo que quieras",
    asignadaToast: "Lista: quedó en el lienzo {n}.",
    sinLienzoLibre:
      "Todos los lienzos están llenos. Arrastra la foto al lienzo que quieras reemplazar.",
    eliminarAria: "Eliminar esta foto de Mis fotos",
    eliminarTitulo: "¿Eliminar esta foto?",
    eliminarCuerpo:
      "Se quita de «Mis fotos» y de cualquier lienzo donde la estés usando. Esta acción no se puede deshacer (puedes volver a subirla).",
    eliminarConfirmar: "Sí, eliminar",
    eliminadaToast: "Foto eliminada de Mis fotos.",
    eliminarError: "No pudimos eliminar la foto. Intenta de nuevo.",
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
    // Paquete C (2026-10-02) — recomendación específica del caso (contenido principal
    // del modal de calidad) + badge visible en miniaturas (antes solo un emoji).
    calidadRecomendacionTitulo: "Nuestra recomendación para esta foto",
    badgeRevisar: "Revisar",
    badgeAgregada: "✓ Agregada",
    calidadCerrar: "Entendido",
    calidadUsarDeTodosModos: "Usar de todos modos",
    pickerTitulo: "Foto para el imán {n} de {total}",
    pickerDesc: "Elige una foto ya subida o suma una nueva.",
    pickerVacio: "Todavía no subiste fotos. Empieza arriba.",
    pickerListo: "Listo",
    // Fase 2 · 2.5 (2026-10-07) — tabs del picker + toggle de la sidebar.
    pickerTabFotos: "Mis fotos",
    pickerTabPredisenados: "Prediseñados",
    pickerTabsAria: "Elige el origen de la foto",
    predisenadosToggleAria: "Mostrar u ocultar los diseños prediseñados",
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
    // 2026-10-19 — ya no hay «Aplicar» dentro del formulario: el «Listo» del
    // footer APLICA y CIERRA (decisión del owner, un solo botón).
    editorDesc: "Los cambios se guardan con «Listo»",
    editorCerrar: "Cerrar",
    sinTexto: "Sin texto",
    campoLabel: "Texto",
    campoPlaceholder: "Escribe tu texto…",
    campoIgUsuario: "usuario",
    campoIgUbicacion: "ubicación",
    campoIgTitulo: "título",
    campoIgHashtags: "hashtags",
    campoIgLikes: "me gusta",
    // Fase 1B — diligenciamiento masivo de los textos IG desde el sidebar (owner:
    // la Clásica tiene "Tu mensaje" para todo el set y la Instagram no tenía
    // equivalente). Un campo por capa; cada uno escribe en TODAS las fotos.
    igDatosTitulo: "Datos de la publicación",
    igDatosSub: "(para todas las fotos)",
    igCampoUsuario: "@usuario",
    igCampoUbicacion: "Ubicación",
    igCampoLikes: "«Me gusta»",
    igCampoTitulo: "Título",
    igCampoHashtags: "Hashtags",
    igCampoRequerido: "(obligatorio)",
    igCampoOpcional: "(opcional — si lo dejas vacío, no se imprime)",
    igVariaPorFoto: "Varía por foto",
    igVariaPlaceholder: "Varía por foto — escribe para unificar",
    igGlobalAviso:
      "Estos datos se aplican a TODAS las fotos del set. Para personalizar una en particular, toca la foto.",
    // QA ronda 2 (F3, 2026-10-07) — edición individual: los mismos campos IG
    // pero solo para ESTE canvas (pestaña Texto del editor de slot).
    igSlotCamposTitulo: "Campos de Instagram",
    igSlotCamposHint:
      "Estos datos son SOLO de esta foto. Para editar los de todas a la vez, usa «Datos de la publicación» en el panel.",
    // Rediseño asistido (owner 2026-10-05) — ayudas/avisos de los controles por
    // capa: "@" y "me gusta" son fijos, título con contador y hashtags por chips
    // (máx 3). Owner 2026-10-12: la ubicación es texto simple (sin sugerencias);
    // 2026-10-26: formato «Ciudad, País» multi-palabra (sin máximo de 2 palabras).
    igUsuarioHint: "Sin espacios · letras, números, punto y guion bajo",
    // 2026-10-26 — Ciudad, País con espacios y varias palabras por segmento
    // (antes: máximo 2 palabras — rompía "Santa Marta" / "Korea del Sur").
    igUbicacionHint: "Ciudad y país separados por coma — ej: Santa Marta, Colombia",
    // 2026-10-27 — aviso inline cuando el texto no cumple «Ciudad, País».
    igUbicacionFormato: "Escribe ciudad y país separados por una coma — ej: Santa Marta, Colombia",
    igTituloPlaceholder: "Ej: Nuestro paseo de domingo",
    igHashtagsPlaceholder: "Escribe un hashtag y presiona Enter",
    igHashtagsMaxAviso: "Máximo 3 hashtags — quita uno para agregar otro",
    igHashtagsQuitarAria: "Quitar hashtag {tag}",
    // 2026-10-19 — re-aplicado explícito a todos los slots actuales (packs
    // agregados después de llenar los campos).
    igReaplicarCta: "Aplicar estos datos a todas las fotos",
    igReaplicarFeedback: "Datos aplicados a todas las fotos del set",
    tamanoLabel: "Tamaño",
    negrita: "Negrita",
    cursiva: "Cursiva",
    colorLabel: "Color",
    colorSinContrasteHint:
      "Este color casi no se va a ver sobre la tarjeta — para que se lea al imprimir, elige otro.",
    colorPersonalizado: "Elegir un color personalizado",
    tipografiaLabel: "Tipografía",
    reset: "Volver al original",
    aplicar: "Aplicar",
    aplicando: "Aplicando…",
    estiloColorTitulo: "Color de tarjeta",
    estiloSinColor: "Sin color",
    estiloColorPersonalizado: "Personalizado",
    estiloBordeTitulo: "Borde de foto",
    estiloConBorde: "Con borde",
    estiloSinBorde: "Sin borde",
    estiloGrosorTitulo: "Grosor del borde",
    estiloGrosorAria: "Grosor del borde",
    estiloColorDeshabilitadoHint:
      "Con «Sin borde» la foto cubre toda la tarjeta — el color no aplica.",
    estiloColorSinBordeHintIg:
      "Con «Sin borde» el color pinta las franjas de arriba y abajo de la foto.",
    estiloColorDeshabilitadoHintTira:
      "Con «Sin borde» las fotos cubren toda la tira — el color no aplica.",
    // Fase 2 UX (2026-10-13) — bottom-sheet de estilo en móvil + nombre del
    // color elegido siempre visible (refuerzo del indicador de selección).
    estiloResumenAria: "Estilo actual: {borde}, color {color}. Toca para cambiarlo.",
    estiloSheetTitulo: "Estilo de tu tarjeta",
    estiloSheetListo: "Listo",
    estiloColorElegido: "Elegido: {color}",
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
    perfilEncuadreTitulo: "Encuadre de la foto de perfil",
    perfilEncuadreHint: "Arrastra la foto para centrarla · doble clic para resetear",
    perfilZoomAria: "Zoom de la foto de perfil",
    slotEditListo: "Listo",
    capasVolver: "Volver a capas",
    capasElegir: "Elige un texto para editar",
    capaEditadaBadge: "editado",
    capaEditando: "Editando: {texto}",
    capaAplicarATodas: "Aplicar a todas",
    capaAplicarATodasAria: "Aplicar «{texto}» a todas las unidades",
    capaAplicadaFeedback: "Texto aplicado a todas las unidades",
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
    preparandoArchivos: "Preparando archivos de impresión… {hechas} de {total}",
    errorCarrito: "Diseño guardado pero no pudimos agregarlo al carrito: {error}",
    errorCarritoNombre: "Guardamos tu diseño pero no pudimos agregarlo al carrito: {error}",
    errorCarritoSet: "Guardamos el diseño pero no pudimos agregarlo al carrito: {error}",
    errorSubidaSlot: "No pudimos subir la imagen del slot {n}. Reintenta.",
    errorSubidaArchivos: "No pudimos subir tus archivos. Revisa tu conexión e inténtalo de nuevo.",
    errorGuardar: "No pudimos guardar tus últimos cambios. Intenta de nuevo.",
    errorServidorLento:
      "Estamos tardando más de lo normal preparando tu diseño. Espera un momento e inténtalo de nuevo.",
    piezaIman: "imán",
    piezaFicha: "ficha",
    piezaImanes: "imanes",
    piezaFichas: "fichas",
    copiasIdenticas: "{n} copias idénticas de tu diseño",
    copiasAjusteCarrito: "La cantidad la elegiste en la página del producto.",
    // Paquete C (2026-10-02) — aceptación explícita de calidad en la Vista Previa:
    // solo se muestra cuando el diseño usa fotos con avisos; el checkbox es
    // obligatorio para habilitar el botón de confirmar.
    // Fase 2 — los avisos de brillo SUAVE (único problema de la foto) son
    // informativos: no exigen checkbox; se muestra la nota en su lugar.
    calidadSeccionTitulo: "Calidad de tus fotos",
    calidadSeccionIntro: "Estas fotos tienen avisos de calidad. Así como están, así se imprimirán.",
    calidadAcepto:
      "Entiendo que estas fotos pueden imprimirse con menor calidad y acepto el resultado.",
    calidadNotaInformativa:
      "Estos avisos son solo informativos — si el look es el que buscabas, puedes continuar sin marcar nada.",
    // Fase 2 · item 2.2 (2026-10-07) — pager de la Vista Previa por unidad.
    pagerAnteriorAria: "Unidad anterior",
    pagerSiguienteAria: "Unidad siguiente",
    pagerDotsAria: "Unidades de la vista previa",
    // PERF — página perezosa del pager: se genera al navegar a la unidad.
    pagerCargandoPagina: "Armando la vista de esta unidad…",
    // 2026-10-19 — zoom del preview (rueda/pinch/doble click + estos botones).
    zoomAlejarAria: "Alejar la vista previa",
    zoomAcercarAria: "Acercar la vista previa",
    zoomRestablecerAria: "Restablecer el zoom de la vista previa",
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
    // Fase 2.10 (owner 2026-10-07) — galería sin escenas: la variante es SIN
    // IMÁN y todas las escenas del producto afirman imán (p.ej. el tablero
    // memo de las fichas de letras).
    vacio: "Esta variante es sin imán y estas escenas muestran el producto adherido con imán.",
    vacioHint: "Cierra esta ventana para seguir con tu diseño.",
    // Ronda 2 QA (owner 2026-10-08) — toggle de caras del libro 3D (acción al pulsar).
    libroVerRespaldo: "Ver respaldo",
    libroVerFrente: "Ver frente",
    hintTouch: "Arrastra para girar · pellizca con 2 dedos para acercar",
    hintMouse: "Arrastra para girar · rueda o pellizca para acercar",
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
    swatchPersonalizadoAria: "Elegir un color personalizado para la letra",
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
    setsTitulo: "¿Cuántos sets quieres?",
    setsHint: "· cada uno lleva sus propios colores",
    setsGroupAria: "Cantidad de sets",
    setsMenosAria: "Quitar un set",
    setsMasAria: "Agregar un set",
    setsValor: "{n} sets",
    setsValorUno: "{n} set",
    setPagerTitulo: "¿Qué set quieres diseñar?",
    setPagerHint: "· cada set lleva su propio estilo, colores y borde",
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
    calMesesTitulo: "Tus meses",
    calMesesResumen: "{filled} de {total} meses con foto",
    calMesesToggleAria: "Mostrar u ocultar los meses del calendario",
    modalUnidades: "{n} {sustantivo} — cada {uno} con su propio diseño",
    descTiras:
      "Esta es la vista previa de las {n} tiras que vas a recibir — cada una con {m} fotos.",
    descTiraUna: "Esta es la vista previa de la tira que vas a recibir — con {m} fotos.",
    resumenTiras: "{n} tiras personalizadas · {m} fotos c/u",
    resumenTiraUna: "{n} tira personalizada · {m} fotos",
    descCalendarios:
      "Esta es la vista previa de tus {n} calendarios{año} — cada uno con {m} páginas.",
    resumenCalendarios: "{n} calendarios personalizados · {m} páginas c/u",
  },
  checklist: {
    titulo: "Tu diseño",
    pasoPlantillas: "Elige tu plantilla",
    pasoFotos: "Sube tus fotos",
    pasoFotosDetalle: "{n} de {total} listas",
    pasoPredisenados: "Elige diseños prediseñados",
    pasoMensaje: "Escribe tu mensaje",
    pasoPublicacion: "Completa los datos de la publicación",
    opcional: "Opcional",
    completo: "Listo",
    pendiente: "Pendiente",
    badgePendientes: "Te faltan {n} pasos de tu diseño",
  },
  tour: {
    igPerfilTitulo: "Tu foto de perfil",
    igPerfilTexto:
      "Toca el avatar circular del post para subir tu foto de perfil — puedes cambiarla y encuadrarla cuando quieras.",
    igTextosTitulo: "Los textos del post",
    igTextosTexto:
      "Usuario, ubicación, título y hashtags: toca cada texto sobre la tarjeta para escribirlo. Los necesitas todos para ver tu vista previa.",
    igMarcoTitulo: "El marco de la tarjeta",
    igMarcoTexto:
      "Desde el panel puedes cambiar el color del marco — incluso dejar la foto sin borde, a todo color.",
    calSetsTitulo: "Un set por calendario",
    calSetsTexto:
      "Cada calendario son 12 tarjetas, una por mes. Si llevas varios, cada set se diseña en su propia sección.",
    calAnoTitulo: "Año y tipo de letra",
    calAnoTexto:
      "En la barra de arriba eliges el año de tu calendario y la letra del título de cada mes.",
    sepCarasTitulo: "Cara A y cara B",
    sepCarasTexto:
      "Cada separador se imprime por las 2 caras — diseña las dos dentro de su tarjeta.",
    sepRespaldoTitulo: "Respaldo en blanco",
    sepRespaldoTexto:
      "¿No quieres diseñar la cara B? No pasa nada: el respaldo se imprime en blanco.",
    tiraContinuaTitulo: "Una tira continua",
    tiraContinuaTexto:
      "Las fotos de cada tira van apiladas sin separación, como la tira de una cabina de fotos.",
    tiraUnidadesTitulo: "Cada tira, su sección",
    tiraUnidadesTexto:
      "Con varias tiras, cada una se diseña por separado — y «Aplicar este diseño a todas» las iguala en un toque.",
    cuadMarcoTitulo: "Marco y color de la tarjeta",
    cuadMarcoTexto:
      "Elige el color del marco en el panel — la foto queda inserta como en una polaroid.",
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
    fotoSinCobertura: "Ajusta la foto para que cubra todo el separador, sin franjas blancas.",
    vista3d: "No pudimos abrir la vista 3D. Intenta de nuevo.",
    espacio: "No pudimos abrir la vista de tu espacio. Intenta de nuevo.",
    calendario: "No pudimos armar tu calendario. Intenta de nuevo.",
    generico: "Algo salió mal. Intenta de nuevo en un momento.",
    assetsFaltantes:
      "No encontramos {n} de las fotos de tu diseño en el servidor. Esos espacios quedaron vacíos — vuelve a subirlas.",
    borradorPerdido:
      "No pudimos recuperar tu borrador: expiró o ya no existe. Empezamos uno nuevo.",
  },
};

/**
 * Interpola placeholders `{nombre}` de un texto del Estudio con valores runtime. Placeholder sin
 * valor se deja tal cual (mejor un `{n}` visible que un crash).
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
