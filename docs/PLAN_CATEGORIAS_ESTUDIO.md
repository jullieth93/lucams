# Plan de trabajo — Fotoimanes · Calendarios · Separadores (Estudio fit-for-purpose)

> Continúa [ESTUDIO_STRATEGY.md](ESTUDIO_STRATEGY.md) (research) y ADR-057. Aplica el **patrón ya
> validado con el abecedario** a las 3 categorías restantes. Todo $0, sobre Konva, sin licencias.

## El patrón que ya funciona (replicable)

Del cierre del abecedario extraemos la receta que repetimos en cada categoría:

1. **La ficha configura, el editor personaliza.** Opciones físicas (forma, tamaño, cantidad, imantado) viven
   en la ficha (VariantSelector); lo creativo vive en el Estudio.
2. **Superficie fit-for-purpose por tipo** (enrutador `resolvePersonalizationSurface`): cada producto abre la
   experiencia correcta, no el editor genérico.
3. **WYSIWYG** — lo que se ve en pantalla es el físico real (forma, sangrado, marco). Toda opción visual = un
   cambio físico producible.
4. **Diseños prediseñados = biblioteca** (como los "estilos" del abecedario / las plantillas): un eje de
   personalización más, elegible en el Estudio. "Default"/subir-lo-mío siempre disponible.
5. **Ruta del dinero gateada por la VARIANTE** (server-side), no por metadata del cliente. Precio calculado en
   vivo en editor y carrito con el mismo cómputo → sin desajuste ni subcobro.
6. **Verificación:** tsc + lint + build + tests de integración de la ruta del dinero + **revisión adversarial**
   (workflow multi-agente) antes de dar por cerrada cada categoría.

## Estado actual (verificado en BD dev, 2026-07-12)

| Categoría       | Productos activos                         | kind                   | Estado                                                                  |
| --------------- | ----------------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| **Fotoimanes**  | 4 (Circular, Corazón, Cuadrado, Polaroid) | `PHOTO_PACK`           | Editor de foto **funciona** (línea base). Falta pulido + render server. |
| **Calendarios** | 1 (Foto-Mes)                              | `CALENDAR_PHOTO_MONTH` | **Se aplana a pack de 12 fotos** — sin UX de calendario. Gap grande.    |
| **Separadores** | 2, **ambos inactivos**                    | `PHOTO_PACK` + `NONE`  | No vendible hoy. Hay que unificar según la visión de Lucy.              |

## Gap transversal #1 (del research): render de producción en el servidor

Hoy el PNG 300 DPI de impresión se genera en el **celular del cliente** (`finalizeDesign` solo valida y sube).
Un pedido de 12 imanes en un móvil viejo puede degradarse/fallar en silencio → devolución. Afecta a **las 3
categorías** (todas suben fotos). El arreglo ($0, no toca Konva): **rasterizar en el servidor** (node-canvas o
SVG→resvg + sharp para fijar DPI). Es la pieza de calidad/confiabilidad de mayor impacto y la fundación donde
luego se enchufa el color de imprenta (CMYK) si aparece una imprenta local.

---

## Fase A — Fundación transversal (beneficia a las 3)

- **A1. Render de producción server-side** (Gap #1). El cliente sigue viendo su preview; el archivo de
  impresión deja de depender de su dispositivo. Reusa el `finalizeDesign` actual como punto de enganche.
- **A2. Endurecer la ruta foto (dinero + imágenes)** con el mismo test de integración + revisión adversarial
  que usamos en el abecedario (ya se certificó el flujo de imágenes por variante; falta el gate de dinero foto).

## Fase B — Separadores magnéticos (activar + visión de Lucy) · _quick win, hoy no vendible_

**Visión (Lucy 2026-07-12):** separadores de libros (para marcar la página al leer). Un producto con **2 formas
(cuadrado / rectangular)**, **diseños prediseñados** disponibles, y personalización donde el cliente **sube su
imagen según la cantidad deseada**.

- **B1. Unificar en UN producto** (hoy hay 2 inactivos: uno PHOTO_PACK + uno NONE prediseñado). Variantes por
  **forma** (cuadrado/rectangular) × tamaño, precio por unidad × cantidad (mismo modelo "por ficha" del nombre,
  ya probado).
- **B2. Ficha:** selector de forma + **cantidad** (cuántos separadores) → precio en vivo. CTA → Estudio.
- **B3. Estudio (superficie foto):** dos caminos, ambos dentro del Estudio (consistencia):
  - **Diseños prediseñados** — biblioteca de diseños de separador (reusa el patrón "estilos/plantillas"): el
    cliente elige uno por unidad.
  - **Subir mi imagen** — N slots según la cantidad; WYSIWYG con **overlay de forma** (cuadrado/rectangular) +
    validación de resolución que ya existe.
- **B4. Activar** el producto + fotos de catálogo (ACCIÓN HUMANA) + revisión adversarial.

## Fase C — Fotoimanes (pulir fit-for-purpose) · _flagship, ya funciona_

- **C1. WYSIWYG por forma** (círculo/corazón/cuadrado/polaroid) — el overlay de realismo ya existe; certificar
  cada forma + sangrado.
- **C2. Polaroid con texto** (`allowText`) — editor de la franja de texto inferior.
- **C3. Cantidad / pack** — UX de "cuántos imanes" coherente con el modelo por unidad.
- **C4. (Opcional) Biblioteca de diseños prediseñados** de fotoimán (mismo patrón que Separadores).
- Gate de dinero + revisión adversarial (parte en Fase A2).

## Fase D — Calendarios magnéticos (editor a medida) · _mayor esfuerzo, estacional_

- **D1. Nueva superficie "calendar"** en el enrutador (hoy cae a foto).
- **D2. Editor de calendario:** **12 slots etiquetados Ene…Dic** (uno por mes) + **selector de año**
  (auto-avanza al siguiente, decisión C del research) + **preview WYSIWYG** de la grilla del calendario, no 12
  fotos sueltas. Salida = **1 pieza compuesta** (decisión J: confirmar 1 pieza, ajusta producción).
- **D3.** Gate de dinero + revisión adversarial.

---

## Orden recomendado y por qué

1. **Fase A1 (render server)** — fundación de calidad que las 3 necesitan; desbloquea escalar productos foto
   con confianza.
2. **Fase B (Separadores)** — quick win: visión clara de Lucy + hoy **no es vendible** → activarlo = ingreso
   nuevo con esfuerzo medio (reusa foto + variantes + biblioteca).
3. **Fase C (Fotoimanes)** — pulido del flagship (ya funciona; sube calidad percibida).
4. **Fase D (Calendarios)** — mayor esfuerzo + estacional (fin de año) → último.

> Alternativa: si las **ventas reales de IG** dicen que Fotoimanes o Calendarios manda, se reordena. El research
> recomienda priorizar por ventas, no por conteo de productos.

## Decisiones pendientes de Lucy

- **Prioridad/orden** de arranque (recomiendo A1 → B; o directamente B si prefieres ingreso rápido).
- **Separadores:** ¿precio **por unidad** (× cantidad, como el nombre) o packs fijos (6/12)? ¿tamaños por forma?
- **Fotoimanes:** ¿sumamos biblioteca de diseños prediseñados o solo "sube tu foto"?
- **Calendarios:** confirmar **1 pieza compuesta** (un imán calendario) vs 12 imanes; ¿arranca en 2027?

**Acción humana (transversal):** fotos de catálogo por producto/variante · diseños prediseñados (separadores,
fotoimán) si se opta por biblioteca.
