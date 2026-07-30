"use client";

/*
 * <ConsentText> — consentimiento de derechos de imagen (Ley 1581) del Estudio.
 *
 * Roadmap B1: el texto viene del CMS (estudio.fotos.consentimiento) con el
 * placeholder {link}; acá se interpola como enlace real a /legal/privacidad.
 * Si el texto editado ya no trae {link}, se muestra plano (sin enlace roto).
 * Compartido por la sidebar ("Mis fotos") y la ventana de elegir foto.
 */

const LINK_TEXT = "Ley 1581";
const LINK_HREF = "/legal/privacidad";

export function ConsentText({ template }: { template: string }) {
  const parts = template.split("{link}");
  if (parts.length < 2) return <>{template}</>;
  return (
    <>
      {parts[0]}
      <a href={LINK_HREF} target="_blank" rel="noopener noreferrer" className="underline">
        {LINK_TEXT}
      </a>
      {parts.slice(1).join("{link}")}
    </>
  );
}
