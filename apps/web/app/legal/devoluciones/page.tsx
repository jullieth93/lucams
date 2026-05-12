import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Devoluciones y Retracto",
};

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
        Devoluciones y Retracto
      </h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <h2>Derecho de retracto (Ley 1480 art. 47)</h2>
      <p>
        Tienes 5 días hábiles desde la entrega para retractarte sin justificación, EXCEPTO en
        productos personalizados conforme a tus especificaciones (foto-imanes, recuerdos
        personalizados, calendarios con tus fotos, planners con foto, etc.).
      </p>
      <h2>Cómo retractarte</h2>
      <ol>
        <li>
          Escríbenos a <a href="mailto:hola@lucamsshop.co">hola@lucamsshop.co</a> o por WhatsApp
          dentro de los 5 días hábiles.
        </li>
        <li>El producto debe regresar en su empaque original sin uso.</li>
        <li>Coordinaremos el envío de devolución (asume el consumidor según Ley 1480).</li>
        <li>
          Reembolso al medio de pago original dentro de los 30 días siguientes a la recepción del
          producto.
        </li>
      </ol>
      <h2>Garantía legal</h2>
      <p>
        Para defectos de fabricación, ver <Link href="/legal/garantias">Garantías</Link>.
      </p>
    </>
  );
}
