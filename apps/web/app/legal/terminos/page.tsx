import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
};

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
        Términos y Condiciones
      </h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <p className="mt-6">
        Al usar lucamsshop.co aceptas estos Términos y Condiciones de uso y compra. Los productos
        vendidos están sujetos a la legislación colombiana, en particular la{" "}
        <strong>Ley 1480 de 2011</strong> (Estatuto del Consumidor).
      </p>
      <h2>Precios y pagos</h2>
      <p>
        Todos los precios en pesos colombianos (COP) incluyen IVA cuando aplique. Aceptamos los
        siguientes medios de pago:
      </p>
      <ul>
        <li>Tarjetas crédito/débito y PSE vía Wompi</li>
        <li>Pago contraentrega con Coordinadora (donde aplique)</li>
      </ul>
      <h2>Derecho de retracto</h2>
      <p>
        Según el <strong>artículo 47 de la Ley 1480</strong>, tienes derecho a retractarte dentro de
        los <strong>5 días hábiles</strong> siguientes a la entrega, sin necesidad de justificar tu
        decisión, salvo en productos personalizados conforme a tus especificaciones. Ver{" "}
        <Link href="/legal/devoluciones">Devoluciones y Retracto</Link>.
      </p>
      <h2>Garantía legal</h2>
      <p>
        Conforme al <strong>artículo 11 de la Ley 1480</strong>, ofrecemos garantía legal de un año
        contado desde la fecha de entrega para defectos de fabricación o calidad. Ver{" "}
        <Link href="/legal/garantias">Garantías</Link>.
      </p>
      <h2>Privacidad</h2>
      <p>
        Tu información se trata conforme a la <strong>Ley 1581 de 2012</strong>. Detalles en{" "}
        <Link href="/legal/privacidad">Aviso de Privacidad</Link>.
      </p>
      <p className="text-sm">Documento en revisión legal — versión final próximamente.</p>
    </>
  );
}
