import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Garantías",
};

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">Garantías</h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <h2>Garantía legal (Ley 1480 art. 11)</h2>
      <p>
        Todos los productos Lucams_shop tienen garantía legal de 1 año desde la fecha de entrega
        para defectos de fabricación, materiales o funcionamiento.
      </p>
      <h2>Qué cubre</h2>
      <ul>
        <li>Imanes que se desprenden del soporte sin uso normal</li>
        <li>Impresión que se borra o decolora rápidamente sin exposición solar directa</li>
        <li>Productos entregados rotos por mal embalaje</li>
      </ul>
      <h2>Qué NO cubre</h2>
      <ul>
        <li>Daños por mal uso, golpes o exposición prolongada al sol/agua</li>
        <li>Desgaste natural del adhesivo en superficies no magnéticas</li>
      </ul>
      <h2>Cómo ejercerla</h2>
      <p>
        Escribe a <a href="mailto:hola@lucamsshop.co">hola@lucamsshop.co</a> con tu número de pedido
        y fotos del defecto. Respondemos en 2 días hábiles. Reparación, reposición o devolución
        según corresponda dentro de los 30 días siguientes a la verificación.
      </p>
    </>
  );
}
