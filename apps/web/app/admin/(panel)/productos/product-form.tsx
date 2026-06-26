"use client";

/*
 * Form compartido para crear y editar productos.
 *
 * ADM-P0-001 (Lucy 2026-06-26) — Reorganizado en 5 tabs para reducir
 * sobrecarga visual. Lucy reportó que la pantalla edición se sentía
 * sobrecargada: 28 inputs en 7 cards apiladas verticalmente con
 * ~1300px de altura. Ahora la mayoría de las ediciones (cambiar
 * precio, toggle visible, subir imagen) caben en el tab "Resumen"
 * sin scroll significativo.
 *
 * Tabs:
 *   - Resumen (default): nombre, categoría, precio, descripción corta,
 *     flags visibilidad
 *   - Texto y bot: descripción larga + contenido AI
 *   - Logística: peso, dims, días producción/envío, garantía, qty
 *   - SEO: títulos y descripciones para Google
 *   - Avanzado: slug, sku, costo, recargo premade
 *
 * Implementación: AdminTabBar usa searchParam ?tab= y togglea visibilidad
 * de panels SIN desmontarlos (preserva FormData bajo useActionState).
 *
 * Conversión de precio: el user tipea PESOS (ej. 15000), el form envía
 * CENTAVOS (1500000) — multiplicación inline + visualización con thousand
 * separator para legibilidad.
 */

import Link from "next/link";
import { useActionState, useState } from "react";
import type { createProductAction, ProductActionState, updateProductAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminTabBar, AdminTabPanel, useAdminActiveTab } from "@/components/admin/admin-tabs";

type Category = { id: string; name: string; slug: string; isSub?: boolean };

const TABS = [
  { value: "resumen", label: "Resumen" },
  { value: "texto", label: "Texto y bot" },
  { value: "logistica", label: "Logística" },
  { value: "seo", label: "SEO" },
  { value: "avanzado", label: "Avanzado" },
] as const;

const TAB_VALUES = TABS.map((t) => t.value);

type Props = {
  categories: Category[];
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

export function ProductForm({ categories, initialProduct, action, submitLabel }: Props) {
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

  const activeTab = useAdminActiveTab("tab", "resumen", TAB_VALUES);

  // Si algún tab tiene field errors después de submit, mostrar dot rojo en su tab.
  const errorsByTab = computeErrorTabs(state?.fieldErrors);
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

      <AdminTabBar tabs={tabsWithBadges} param="tab" defaultTab="resumen" />

      {/* ─────── TAB: RESUMEN (default — 80% de las ediciones) ─────── */}
      <AdminTabPanel value="resumen" active={activeTab}>
        <SectionCard
          title="Identidad"
          description="Lo que el cliente ve primero."
        >
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
            label="Descripción corta"
            hint="Resumen que se ve en la página del producto, justo debajo del nombre."
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

        <SectionCard title="Precio">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PriceField
              id="basePrice"
              label="Precio venta"
              required
              defaultPesos={initialProduct ? initialProduct.basePrice / 100 : null}
              error={state?.fieldErrors?.basePrice?.[0]}
              pending={pending}
            />
            <PriceField
              id="compareAtPrice"
              label="Precio antes (promo)"
              hint="Opcional. Se muestra tachado para mostrar descuento."
              defaultPesos={
                initialProduct?.compareAtPrice ? initialProduct.compareAtPrice / 100 : null
              }
              error={state?.fieldErrors?.compareAtPrice?.[0]}
              pending={pending}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Visibilidad"
          description="Quién ve este producto en la tienda."
        >
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

      {/* ─────── TAB: TEXTO Y BOT ─────── */}
      <AdminTabPanel value="texto" active={activeTab}>
        <SectionCard
          title="Descripción larga (markdown)"
          description="Contexto extenso del producto. El bot lo usa para responder consultas por WhatsApp."
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
      </AdminTabPanel>

      {/* ─────── TAB: LOGÍSTICA ─────── */}
      <AdminTabPanel value="logistica" active={activeTab}>
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
                defaultValue={initialProduct?.productionDays ?? 3}
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
                defaultValue={initialProduct?.shippingDaysMin ?? 2}
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
                defaultValue={initialProduct?.shippingDaysMax ?? 5}
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
              <p className="mt-1 text-xs text-brand-purple-dark/55">50 – 50.000 g</p>
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
          <p className="text-xs text-brand-purple-dark/65">
            💡 Estos son los datos del <strong>paquete final</strong>, no del producto suelto. Si una
            variante (Set 12 vs Set 6) tiene peso o dimensiones distintos, configúralos desde
            Variantes con un valor específico.
          </p>
        </SectionCard>
      </AdminTabPanel>

      {/* ─────── TAB: SEO ─────── */}
      <AdminTabPanel value="seo" active={activeTab}>
        <SectionCard
          title="Cómo se ve en Google"
          description="Si dejas los campos vacíos, usamos el nombre y la descripción corta."
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
            label="Código interno (SKU)"
            hint="Para tu inventario interno. Mayúsculas, números y guiones."
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
              hint="0 = sin recargo. Si usás diseños bajo licencia (ej. Disney), 10-15%."
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
      <div
        className="border-brand-purple/15 sticky bottom-0 z-20 -mx-4 -mb-4 mt-6 flex items-center justify-between gap-3 border-t bg-white/95 px-4 py-3 backdrop-blur sm:-mx-0 sm:-mb-0 sm:rounded-b-xl sm:px-5"
      >
        <Link
          href="/admin/productos"
          className="text-sm font-medium text-brand-purple-dark/65 hover:text-brand-purple-dark"
        >
          ← Cancelar
        </Link>
        <Button
          type="submit"
          size="lg"
          className="bg-brand-purple font-semibold text-white shadow-sm hover:bg-brand-purple-dark disabled:opacity-60"
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
    <section className="space-y-4 rounded-xl border border-brand-purple/15 bg-white p-5">
      <header className="space-y-1">
        <h2 className="text-base font-semibold text-brand-purple-dark">{title}</h2>
        {description && <p className="text-xs text-brand-purple-dark/65">{description}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
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
      {hint && !error && <p className="text-xs text-brand-purple-dark/55">{hint}</p>}
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
        <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-brand-purple-dark/55">$</span>
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
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent p-2 text-sm text-brand-purple-dark/80 hover:bg-brand-purple/5">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 h-5 w-5 rounded border-brand-purple/25 text-brand-purple-dark focus:ring-brand-purple/50"
      />
      <span className="flex-1">
        <span className="block font-medium text-brand-purple-dark">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-brand-purple-dark/55">{hint}</span>}
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
function computeErrorTabs(fieldErrors?: Record<string, string[] | undefined>): Set<string> {
  const out = new Set<string>();
  if (!fieldErrors) return out;
  const mapping: Record<string, string> = {
    name: "resumen",
    description: "resumen",
    categoryId: "resumen",
    basePrice: "resumen",
    compareAtPrice: "resumen",
    isActive: "resumen",
    isFeatured: "resumen",
    isPersonalizable: "resumen",
    richDescription: "texto",
    whyChooseThis: "texto",
    idealFor: "texto",
    warrantyMonths: "logistica",
    productionDays: "logistica",
    shippingDaysMin: "logistica",
    shippingDaysMax: "logistica",
    minimumQuantity: "logistica",
    maximumQuantity: "logistica",
    weightGrams: "logistica",
    widthCm: "logistica",
    heightCm: "logistica",
    depthCm: "logistica",
    seoTitle: "seo",
    seoDescription: "seo",
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
