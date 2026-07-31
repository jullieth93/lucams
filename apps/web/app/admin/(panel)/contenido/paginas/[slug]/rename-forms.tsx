/*
 * Formularios de renombrado de página/sección (roadmap C4) — editor de página.
 *
 * Componentes SERVER (sin JS de cliente): el despliegue se hace con
 * <details>/<summary> nativo. Guardan vía updateCmsPageAction /
 * updateCmsSectionAction (redirect con ?renamed=1 o ?error=…).
 */

import { Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCmsPageAction, updateCmsSectionAction } from "../../actions";

const inputCls = "border-brand-purple/20 focus-visible:ring-brand-purple/30";

/** Renombrar la página (título + descripción que se ven en el admin). */
export function PageRenameForm({
  pageId,
  title,
  description,
  redirectTo,
}: {
  pageId: string;
  title: string;
  description: string | null;
  redirectTo: string;
}) {
  return (
    <details className="border-brand-purple/10 group rounded-xl border bg-white shadow-sm">
      <summary className="text-brand-purple-dark hover:bg-brand-purple/5 flex cursor-pointer items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors">
        <Pencil className="text-brand-muted h-4 w-4" />
        Nombre y descripción de la página
      </summary>
      <form
        action={updateCmsPageAction}
        className="border-brand-purple/10 grid grid-cols-1 gap-3 border-t px-5 py-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
      >
        <input type="hidden" name="id" value={pageId} />
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <div className="space-y-1.5">
          <Label htmlFor="page-title" className="text-brand-purple-dark font-semibold">
            Nombre
          </Label>
          <Input
            id="page-title"
            name="title"
            defaultValue={title}
            required
            minLength={2}
            maxLength={120}
            className={inputCls}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="page-description" className="text-brand-purple-dark font-semibold">
            Descripción <span className="text-brand-muted font-normal">(opcional)</span>
          </Label>
          <Input
            id="page-description"
            name="description"
            defaultValue={description ?? ""}
            maxLength={500}
            className={inputCls}
          />
        </div>
        <Button type="submit" className="bg-gradient-brand text-white hover:brightness-110">
          <Save className="mr-1.5 h-4 w-4" />
          Guardar
        </Button>
      </form>
    </details>
  );
}

/** Renombrar una sección (lápiz junto a su título en el editor de página). */
export function SectionRenameForm({
  sectionId,
  title,
  description,
  redirectTo,
}: {
  sectionId: string;
  title: string;
  description: string | null;
  redirectTo: string;
}) {
  return (
    <details className="group relative inline-block">
      <summary
        className="text-brand-muted hover:text-brand-purple hover:bg-brand-purple/10 -mr-1 cursor-pointer list-none rounded-md p-1 transition-colors [&::-webkit-details-marker]:hidden"
        title={`Renombrar la sección «${title}»`}
        aria-label={`Renombrar la sección ${title}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </summary>
      <form
        action={updateCmsSectionAction}
        className="border-brand-purple/15 absolute left-0 z-20 mt-1 grid w-72 gap-2 rounded-xl border bg-white p-3 shadow-lg"
      >
        <input type="hidden" name="id" value={sectionId} />
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <div className="space-y-1">
          <Label
            htmlFor={`sec-title-${sectionId}`}
            className="text-brand-purple-dark text-xs font-semibold"
          >
            Nombre de la sección
          </Label>
          <Input
            id={`sec-title-${sectionId}`}
            name="title"
            defaultValue={title}
            required
            minLength={2}
            maxLength={120}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <Label
            htmlFor={`sec-desc-${sectionId}`}
            className="text-brand-purple-dark text-xs font-semibold"
          >
            Descripción <span className="text-brand-muted font-normal">(opcional)</span>
          </Label>
          <Input
            id={`sec-desc-${sectionId}`}
            name="description"
            defaultValue={description ?? ""}
            maxLength={500}
            className={inputCls}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          className="bg-gradient-brand text-white hover:brightness-110"
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          Guardar
        </Button>
      </form>
    </details>
  );
}
