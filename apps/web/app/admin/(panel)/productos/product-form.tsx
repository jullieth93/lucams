"use client";

/*
 * Form compartido para crear y editar productos.
 *
 * Lucy 2026-06-27 — Reducido de 5 a 3 pestañas para bajar la sobrecarga, y el
 * precio salió del producto: vive en cada OPCIÓN (ProductVariant). El producto
 * es la "familia"; lo que tiene precio/código/stock son sus opciones.
 *
 * Pestañas:
 *   - Lo básico (default): nombre, categoría, descripción corta, visibilidad.
 *     Al CREAR pide un precio inicial; al EDITAR muestra "desde $X" (solo lectura).
 *   - Detalles (opcional): texto largo + bot AI + logística (tiempos, peso, dims)
 *     + SEO. Todo lo "se configura una vez".
 *   - Avanzado: dirección web (slug), código de familia (sku), precio base por
 *     defecto (solo edición, respaldo), costos internos, recargo premium.
 *
 * Implementación: AdminTabBar usa searchParam ?tab= y togglea visibilidad de
 * panels SIN desmontarlos (preserva FormData bajo useActionState).
 *
 * Conversión de precio: el user tipea PESOS (ej. 15000), el form envía CENTAVOS
 * (1500000) — multiplicación inline + visualización con separador de miles.
 */

import Link from "next/link";
import { useActionState, useState } from "react";
import type { createProductAction, ProductActionState, updateProductAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminTabBar, AdminTabPanel, useAdminActiveTab } from "@/components/admin/admin-tabs";
import { formatCOP } from "@/lib/format";

type Category = { id: string; name: string; slug: string; isSub?: boolean };

const TABS = [
  { value: "basico", label: "Lo básico" },
  { value: "detalles", label: "Detalles" },
  { value: "avanzado", label: "Avanzado" },
] as const;

const TAB_VALUES = TABS.map((t) => t.value);

type Props = {
  categories: Category[];
  /**
   * Precio "desde" (centavos) = el más barato entre las opciones, para mostrar
   * SOLO LECTURA en modo edición. El precio real se gestiona en cada opción.
   */
  priceFrom?: number | null;
  initialProduct?: {
    id: string;
    name: string;
    slug: string;
    description: string;
    basePrice: number;
    compareAtPrice: number | null;
    cost: number | null;
    sku: string;
    categoryId: string;
    isPersonalizable: boolean;
    isActive: boolean;
    isFeatured: boolean;
    seoTitle: string | null;
    seoDescription: string | null;
    richDescription?: string | null;
    whyChooseThis?: string | null;
    idealFor?: unknown;
    warrantyMonths?: number;
    productionDays?: number;
    shippingDaysMin?: number;
    shippingDaysMax?: number;
    minimumQuantity?: number;
    maximumQuantity?: number | null;
    premadeSurcharge?: number;
    weightGrams?: number | null;
    widthCm?: number | null;
    heightCm?: number | null;
    depthCm?: number | null;
  };
  action: typeof createProductAction | typeof updateProductAction;
  submitLabel: string;
};

export function ProductForm({ categories, priceFrom, initialProduct, action, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<ProductActionState | null, FormData>(
    action,
    null,
  );

  const isEdit = Boolean(initialProduct);
  const [name, setName] = useState(initialProduct?.name ?? "");
  const [slug, setSlug] = useState(initialProduct?.slug ?? "");

  const [slugTouched, setSlugTouched] = useState(false);
  const onNameChange = (v: string) => {
    setName(v);
    if (!isEdit && !slugTouched) {
      setSlug(slugify(v));
    }
  };

  const activeTab = useAdminActiveTab("tab", "basico", TAB_VALUES);

  // Si algún tab tiene field errors después de submit, mostrar dot rojo en su tab.
  const errorsByTab = computeErrorTabs(state?.fieldErrors, isEdit);
  const tabsWithBadges = TABS.map((t) => ({
    ...t,
    badge: errorsByTab.has(t.value) ? (
      <span
        className="inline-block h-2 w-2 rounded-full bg-red-500"
        aria-label="Esta sección tiene errores"
      />
    ) : undefined,
  }));

  return (
    <form action={formAction} className="space-y-5">
      {initialProduct && <input type="hidden" name="id" value={initialProduct.id} />}

      <AdminTabBar tabs={tabsWithBadges} param="tab" defaultTab="basico" />

      {/* ─────── TAB: LO BÁSICO (lo esencial — 90% de las ediciones) ─────── */}
      <AdminTabPanel value="basico" active={activeTab}>
        <SectionCard title="Identidad" description="Lo que el cliente ve primero.">
          <Field id="name" label="Nombre del producto" error={state?.fieldErrors?.name?.[0]}>
            <Input
              id="name"
              name="name"
              required
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Imán de foto personalizado A4"
              disabled={pending}
            />
          </Field>

          <Field id="categoryId" label="Categoría" error={state?.fieldErrors?.categoryId?.[0]}>
            <select
              id="categoryId"
              name="categoryId"
              required
              defaultValue={initialProduct?.categoryId ?? ""}
              disabled={pending}
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-10 w-full rounded-lg border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>
                Selecciona una categoría…
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isSub ? `— ${c.name}` : c.name}
                </option>
              ))}
            </select>
            {categories.length === 0 && (
              <p className="mt-1 text-xs text-amber-700">
                Aún no hay categorías. Crea una primero desde el menú Categorías.
              </p>
            )}
          </Field>

          <Field
            id="description"
            label="Descripción"
            hint="Es la que ve el cliente en la página del producto. También se usa para Google."
            error={state?.fieldErrors?.description?.[0]}
          >
            <Textarea
              id="description"
              name="description"
              required
              rows={4}
              defaultValue={initialProduct?.description ?? ""}
              placeholder="Imán personalizado con tu foto favorita. Impresión alta resolución, acabado mate, ideal para nevera o casillero."
              disabled={pending}
            />
          </Field>
        </SectionCard>

        {/*
         * Precio (Lucy 2026-06-27) — el precio vive en cada OPCIÓN, no en el
         * producto. Al CREAR pedimos un precio inicial (la primera opción).
         * Al EDITAR mostramos "desde $X" solo lectura + link a Opciones.
         */}
        {isEdit ? (
          <SectionCard title="Precio">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-brand-purple-dark text-sm font-semibold">
                  {priceFrom != null ? `Desde ${formatCOP(priceFrom)}` : "Sin precio aún"}
                </p>
                <p className="text-brand-muted mt-0.5 text-xs">
                  El precio se define en cada opción (cada una puede costar distinto).
                </p>
              </div>
              {initialProduct && (
                <a
                  href={`/admin/productos/${initialProduct.id}?section=opciones`}
                  className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border bg-white px-3 text-xs font-semibold"
                >
                  Gestionar opciones y precios →
                </a>
              )}
            </div>
          </SectionCard>
        ) : (
          <SectionCard
            title="Precio inicial"
            description="El precio de la primera opción del producto. Después puedes agregar más opciones con sus propios precios."
          >
            <div className="sm:max-w-xs">
              <PriceField
                id="basePrice"
                label="Precio"
                required
                defaultPesos={null}
                error={state?.fieldErrors?.basePrice?.[0]}
                pending={pending}
              />
            </div>
          </SectionCard>
        )}

        <SectionCard title="Visibilidad" description="Quién ve este producto en la tienda.">
          <Checkbox
            name="isActive"
            label="🟢 Visible en la tienda"
            hint="Cuando está apagado, el producto sigue acá pero deja de mostrarse al cliente."
            defaultChecked={initialProduct?.isActive ?? true}
            disabled={pending}
          />
          <Checkbox
            name="isFeatured"
            label="⭐ Destacado en home"
            hint="Aparece en la sección de destacados del home y primero en listings."
            defaultChecked={initialProduct?.isFeatured ?? false}
            disabled={pending}
          />
          <Checkbox
            name="isPersonalizable"
            label="🎨 Personalizable"
            hint="Activa el estudio de personalización en vivo en la página del producto."
            defaultChecked={initialProduct?.isPersonalizable ?? false}
            disabled={pending}
          />
        </SectionCard>
      </AdminTabPanel>

      {/* ─────── TAB: DETALLES (logística visible + textos/SEO colapsados) ─────── */}
      <AdminTabPanel value="detalles" active={activeTab}>
        {/*
         * Lucy 2026-06-27 — los textos del bot + descripción larga + SEO se
         * colapsan: son OPCIONALES y no estorban. Lo que el cliente ve es la
         * "Descripción" de Lo básico; el SEO de Google ya funciona automático.
         */}
        <CollapsibleDetails summary="📝 Textos extra (opcional — para el bot de WhatsApp, que llega más adelante)">
          <p className="text-brand-muted mb-3 text-xs">
            No hacen falta para vender. Estos textos alimentarán al bot de WhatsApp cuando exista
            (Fase 5). Por ahora puedes dejarlos vacíos.
          </p>
          <SectionCard
            title="Descripción larga (opcional)"
            description="Contexto extenso. Solo lo usará el bot; el cliente ve la Descripción de Lo básico."
          >
            <Field
              id="richDescription"
              label="Descripción rica (300-800 palabras)"
              hint="Para quién, cómo se usa, qué tiene de especial. Soporta markdown."
            >
              <Textarea
                id="richDescription"
                name="richDescription"
                rows={8}
                maxLength={5000}
                defaultValue={initialProduct?.richDescription ?? ""}
                placeholder="ej. Los Fotoimanes Polaroid Lucams están pensados para esos recuerdos chiquitos pero significativos…"
                disabled={pending}
              />
            </Field>
          </SectionCard>

          <SectionCard
            title="Para el bot de WhatsApp"
            description="El bot usa estos textos cuando un cliente pregunta por este producto."
          >
            <Field
              id="whyChooseThis"
              label="¿Por qué elegir este producto?"
              hint="Una línea por bullet. El bot los enumera al recomendar."
            >
              <Textarea
                id="whyChooseThis"
                name="whyChooseThis"
                rows={4}
                maxLength={2000}
                defaultValue={initialProduct?.whyChooseThis ?? ""}
                placeholder={
                  "ej.\n- Acabado mate premium que no se decolora\n- 3mm de grosor, resistente\n- Hecho a mano en Bogotá"
                }
                disabled={pending}
              />
            </Field>

            <Field
              id="idealFor"
              label="Escenarios ideales"
              hint="Un escenario por línea. El bot matchea consultas con estos textos."
            >
              <Textarea
                id="idealFor"
                name="idealFor"
                rows={4}
                defaultValue={
                  Array.isArray(initialProduct?.idealFor)
                    ? (initialProduct?.idealFor as string[]).join("\n")
                    : ""
                }
                placeholder={
                  "ej.\nregalo aniversario novia\ndecoración cuarto adolescente\nrecordatorio cumpleaños infantil"
                }
                disabled={pending}
              />
            </Field>
          </SectionCard>
        </CollapsibleDetails>

        <SectionCard
          title="Tiempos y garantía"
          description="Lo que el cliente ve sobre cuánto demora y qué incluye."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field id="warrantyMonths" label="Garantía (meses)" hint="Ley 1480 mínimo 12.">
              <Input
                id="warrantyMonths"
                name="warrantyMonths"
                type="number"
                min={0}
                max={120}
                defaultValue={initialProduct?.warrantyMonths ?? 12}
                disabled={pending}
              />
            </Field>
            <Field id="productionDays" label="Producción (días)">
              <Input
                id="productionDays"
                name="productionDays"
                type="number"
                min={1}
                max={60}
                defaultValue={initialProduct?.productionDays ?? 2}
                disabled={pending}
              />
            </Field>
            <Field id="shippingDaysMin" label="Envío mínimo (días)">
              <Input
                id="shippingDaysMin"
                name="shippingDaysMin"
                type="number"
                min={0}
                max={30}
                defaultValue={initialProduct?.shippingDaysMin ?? 1}
                disabled={pending}
              />
            </Field>
            <Field id="shippingDaysMax" label="Envío máximo (días)">
              <Input
                id="shippingDaysMax"
                name="shippingDaysMax"
                type="number"
                min={0}
                max={60}
                defaultValue={initialProduct?.shippingDaysMax ?? 1}
                disabled={pending}
              />
            </Field>
            <Field id="minimumQuantity" label="Cantidad mínima por orden">
              <Input
                id="minimumQuantity"
                name="minimumQuantity"
                type="number"
                min={1}
                defaultValue={initialProduct?.minimumQuantity ?? 1}
                disabled={pending}
              />
            </Field>
            <Field id="maximumQuantity" label="Cantidad máxima por orden">
              <Input
                id="maximumQuantity"
                name="maximumQuantity"
                type="number"
                min={1}
                defaultValue={initialProduct?.maximumQuantity ?? ""}
                placeholder="Sin tope"
                disabled={pending}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard
          title="📦 Empaque para el envío"
          description="Aveonline necesita peso y dimensiones del paquete final para cotizar. Sin esto, la cotización falla."
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="weightGrams">Peso (gramos)</Label>
              <Input
                id="weightGrams"
                name="weightGrams"
                type="number"
                min={50}
                max={50000}
                step={1}
                defaultValue={initialProduct?.weightGrams ?? ""}
                placeholder="500"
              />
              <p className="text-brand-muted mt-1 text-xs">50 – 50.000 g</p>
            </div>
            <div>
              <Label htmlFor="widthCm">Ancho (cm)</Label>
              <Input
                id="widthCm"
                name="widthCm"
                type="number"
                min={1}
                max={100}
                step={1}
                defaultValue={initialProduct?.widthCm ?? ""}
                placeholder="10"
              />
            </div>
            <div>
              <Label htmlFor="heightCm">Alto (cm)</Label>
              <Input
                id="heightCm"
                name="heightCm"
                type="number"
                min={1}
                max={100}
                step={1}
                defaultValue={initialProduct?.heightCm ?? ""}
                placeholder="10"
              />
            </div>
            <div>
              <Label htmlFor="depthCm">Largo (cm)</Label>
              <Input
                id="depthCm"
                name="depthCm"
                type="number"
                min={1}
                max={100}
                step={1}
                defaultValue={initialProduct?.depthCm ?? ""}
                placeholder="10"
              />
            </div>
          </div>
          <p className="text-brand-muted text-xs">
            💡 Estos son los datos del <strong>paquete final</strong>, no del producto suelto. Si
            una variante (Set 12 vs Set 6) tiene peso o dimensiones distintos, configúralos desde
            Variantes con un valor específico.
          </p>
        </SectionCard>
        <CollapsibleDetails summary="🔎 Cómo se ve en Google (opcional — ya funciona solo)">
          <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            ✅ Tu producto <strong>ya aparece bien en Google</strong> automáticamente, usando su
            nombre y descripción. Solo toca esto si quieres personalizar el texto exacto que se ve
            en los resultados de búsqueda.
          </p>
          <SectionCard
            title="Personalizar el texto de Google"
            description="Si dejas los campos vacíos, usamos el nombre y la descripción del producto."
          >
            <Field
              id="seoTitle"
              label="Título para Google"
              hint="Lo que aparece como link azul en los resultados. Máx 70 caracteres."
              error={state?.fieldErrors?.seoTitle?.[0]}
            >
              <Input
                id="seoTitle"
                name="seoTitle"
                maxLength={70}
                defaultValue={initialProduct?.seoTitle ?? ""}
                placeholder="Imán de foto personalizado — Lucams_shop"
                disabled={pending}
              />
            </Field>
            <Field
              id="seoDescription"
              label="Descripción para Google"
              hint="Texto debajo del link en los resultados. Máx 160 caracteres."
              error={state?.fieldErrors?.seoDescription?.[0]}
            >
              <Textarea
                id="seoDescription"
                name="seoDescription"
                rows={3}
                maxLength={160}
                defaultValue={initialProduct?.seoDescription ?? ""}
                placeholder="Descripción para resultados de Google."
                disabled={pending}
              />
            </Field>
          </SectionCard>
        </CollapsibleDetails>
      </AdminTabPanel>

      {/* ─────── TAB: AVANZADO (setup ocasional) ─────── */}
      <AdminTabPanel value="avanzado" active={activeTab}>
        <SectionCard
          title="Identificadores internos"
          description="Estos campos se definen cuando creas el producto. Cámbialos solo si sabes qué haces."
        >
          <Field
            id="slug"
            label="Dirección web (slug)"
            hint="Aparece en la URL del producto. Solo minúsculas, números y guiones."
            error={state?.fieldErrors?.slug?.[0]}
          >
            <Input
              id="slug"
              name="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              placeholder="iman-foto-personalizado-a4"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              disabled={pending}
            />
          </Field>

          <Field
            id="sku"
            label="Código de familia (interno)"
            hint="Código del producto en general. Cada opción tiene además su propio código. Mayúsculas, números y guiones."
            error={state?.fieldErrors?.sku?.[0]}
          >
            <Input
              id="sku"
              name="sku"
              required
              defaultValue={initialProduct?.sku ?? ""}
              placeholder="IMAN-FOTO-A4"
              className="font-mono uppercase"
              disabled={pending}
            />
          </Field>
        </SectionCard>

        {/*
         * D4 + D1 (Lucy 2026-06-27): el precio base se auto-deriva (input oculto
         * para no pisarlo al guardar), y el "precio tachado / promoción" se movió
         * a CADA OPCIÓN (junto a su precio) — antes vivía acá a nivel producto y
         * el descuento podía salir mal en la tienda. Conservamos compareAtPrice
         * del producto con un input oculto (vestigial) para no pisarlo.
         */}
        {isEdit && (
          <SectionCard
            title="Precios"
            description="El precio normal y el precio tachado (promoción) se ponen en cada opción, en la pestaña Opciones."
          >
            <input type="hidden" name="basePrice" value={initialProduct?.basePrice ?? 0} />
            <input
              type="hidden"
              name="compareAtPrice"
              value={initialProduct?.compareAtPrice ?? ""}
            />
            <p className="text-brand-muted text-sm">
              💡 El precio (y su promoción) vive en cada <strong>opción</strong>. Ve a la pestaña{" "}
              <strong>Opciones</strong> para ajustarlos. El precio base del producto se calcula
              solo, a partir de la opción más barata.
            </p>
          </SectionCard>
        )}

        <SectionCard
          title="Costos internos"
          description="Esta información no se muestra al cliente. Sirve para tus reportes y para el bot de cotizaciones."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PriceField
              id="cost"
              label="Costo interno"
              hint="Cuánto te cuesta producir uno."
              defaultPesos={initialProduct?.cost ? initialProduct.cost / 100 : null}
              error={state?.fieldErrors?.cost?.[0]}
              pending={pending}
            />
            <Field
              id="premadeSurcharge"
              label="Recargo plantillas premium (%)"
              hint="0 = sin recargo. Si usas diseños bajo licencia (ej. Disney), 10-15%."
            >
              <Input
                id="premadeSurcharge"
                name="premadeSurcharge"
                type="number"
                min={0}
                max={100}
                defaultValue={initialProduct?.premadeSurcharge ?? 0}
                disabled={pending}
              />
            </Field>
          </div>
        </SectionCard>
      </AdminTabPanel>

      {/* Error global (no atado a campo) */}
      {state?.error && !state.fieldErrors && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      {/*
       * ADM-P0-003 — Sticky bottom bar.
       * Pegada al borde inferior del viewport SIEMPRE que haya scroll en el form.
       * Mobile-first: ocupa todo el ancho y tiene padding generoso para tap.
       * Desktop: contenido alineado a la derecha con cancelar a la izquierda.
       *
       * Patrón inspirado en /admin/contenido/bloques/[id] que el audit identificó
       * como "el modelo a seguir" del admin. z-20 para quedar encima del tab bar
       * pero por debajo de modales (z-50).
       */}
      <div className="border-brand-purple/15 sticky bottom-0 z-20 -mx-4 mt-6 -mb-4 flex items-center justify-between gap-3 border-t bg-white/95 px-4 py-3 backdrop-blur sm:-mx-0 sm:-mb-0 sm:rounded-b-xl sm:px-5">
        <Link
          href="/admin/productos"
          className="text-brand-muted hover:text-brand-purple-dark text-sm font-medium"
        >
          ← Cancelar
        </Link>
        <Button
          type="submit"
          size="lg"
          className="bg-brand-purple hover:bg-brand-purple-dark font-semibold text-white shadow-sm disabled:opacity-60"
          disabled={pending}
        >
          {pending ? (
            <>
              <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Guardando…
            </>
          ) : (
            <>💾 {submitLabel}</>
          )}
        </Button>
      </div>
    </form>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-brand-purple/15 space-y-4 rounded-xl border bg-white p-5">
      <header className="space-y-1">
        <h2 className="text-brand-purple-dark text-base font-semibold">{title}</h2>
        {description && <p className="text-brand-muted text-xs">{description}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/**
 * Sección colapsable (native <details>) para campos OPCIONALES que no estorban
 * la vista por defecto. Lucy 2026-06-27: esconde bot/SEO/descripción larga.
 * Los campos siguen en el form (se envían), solo arrancan plegados.
 */
function CollapsibleDetails({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="border-brand-purple/15 group rounded-xl border bg-white">
      <summary className="text-brand-purple-dark hover:bg-brand-purple/5 flex cursor-pointer list-none items-center justify-between rounded-xl px-5 py-3.5 text-sm font-semibold select-none">
        <span>{summary}</span>
        <span className="text-brand-muted text-xs transition-transform group-open:rotate-90">
          ▶
        </span>
      </summary>
      <div className="space-y-4 px-5 pt-1 pb-5">{children}</div>
    </details>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-brand-purple-dark/80">
        {label}
      </Label>
      {children}
      {hint && !error && <p className="text-brand-muted text-xs">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function PriceField({
  id,
  label,
  hint,
  required,
  defaultPesos,
  error,
  pending,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  defaultPesos: number | null;
  error?: string;
  pending: boolean;
}) {
  const [pesos, setPesos] = useState<string>(defaultPesos !== null ? String(defaultPesos) : "");
  const centavos = pesos === "" ? "" : String(Math.round(Number(pesos) * 100));
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <span className="text-brand-muted absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">
          $
        </span>
        <Input
          id={`${id}__display`}
          type="number"
          min={0}
          step={1}
          required={required}
          value={pesos}
          onChange={(e) => setPesos(e.target.value)}
          placeholder="0"
          className="pl-6 tabular-nums"
          disabled={pending}
        />
        <input type="hidden" name={id} value={centavos} />
      </div>
    </Field>
  );
}

function Checkbox({
  name,
  label,
  hint,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="text-brand-purple-dark/80 hover:bg-brand-purple/5 flex cursor-pointer items-start gap-3 rounded-lg border border-transparent p-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="border-brand-purple/25 text-brand-purple-dark focus:ring-brand-purple/50 mt-0.5 h-5 w-5 rounded"
      />
      <span className="flex-1">
        <span className="text-brand-purple-dark block font-medium">{label}</span>
        {hint && <span className="text-brand-muted mt-0.5 block text-xs">{hint}</span>}
      </span>
    </label>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Mapea fieldErrors → set de tabs que contienen al menos 1 error.
 * Permite mostrar dot rojo en el tab para que Lucy sepa dónde mirar
 * después de un submit fallido.
 */
function computeErrorTabs(
  fieldErrors: Record<string, string[] | undefined> | undefined,
  isEdit: boolean,
): Set<string> {
  const out = new Set<string>();
  if (!fieldErrors) return out;
  // basePrice/compareAtPrice viven en "básico" al crear y en "avanzado" al editar.
  const priceTab = isEdit ? "avanzado" : "basico";
  const mapping: Record<string, string> = {
    name: "basico",
    description: "basico",
    categoryId: "basico",
    basePrice: priceTab,
    compareAtPrice: priceTab,
    isActive: "basico",
    isFeatured: "basico",
    isPersonalizable: "basico",
    richDescription: "detalles",
    whyChooseThis: "detalles",
    idealFor: "detalles",
    warrantyMonths: "detalles",
    productionDays: "detalles",
    shippingDaysMin: "detalles",
    shippingDaysMax: "detalles",
    minimumQuantity: "detalles",
    maximumQuantity: "detalles",
    weightGrams: "detalles",
    widthCm: "detalles",
    heightCm: "detalles",
    depthCm: "detalles",
    seoTitle: "detalles",
    seoDescription: "detalles",
    slug: "avanzado",
    sku: "avanzado",
    cost: "avanzado",
    premadeSurcharge: "avanzado",
  };
  for (const [field, errors] of Object.entries(fieldErrors)) {
    if (errors && errors.length > 0 && mapping[field]) {
      out.add(mapping[field]);
    }
  }
  return out;
}
