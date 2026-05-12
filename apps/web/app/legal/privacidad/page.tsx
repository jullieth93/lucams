import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Aviso de Privacidad",
  description:
    "Política de tratamiento de datos personales Lucams_shop · Ley 1581 de 2012 (Colombia).",
};

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
        Aviso de Privacidad
      </h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <p className="mt-6 text-base">
        En Lucams_shop nos tomamos en serio la protección de tus datos personales en cumplimiento de
        la <strong>Ley 1581 de 2012</strong> y el <strong>Decreto 1377 de 2013</strong> de Colombia.
      </p>
      <p>
        Este es el aviso de privacidad versión 1. Estamos puliendo el documento final con asesoría
        legal para reflejar de forma precisa el responsable, las finalidades, los derechos del
        titular y los mecanismos de contacto.
      </p>
      <p>
        Mientras tanto, si tienes preguntas sobre cómo tratamos tus datos o quieres ejercer tus
        derechos como titular (acceso, rectificación, supresión, revocación), escríbenos a{" "}
        <a href="mailto:hola@lucamsshop.co">hola@lucamsshop.co</a>.
      </p>
      <h2>Responsable del tratamiento</h2>
      <p>
        <strong>Lucams_shop</strong>, con domicilio en Bogotá, Colombia.
      </p>
      <h2>Subprocesadores</h2>
      <p>
        Lista de terceros que tratan datos en nuestro nombre disponible en{" "}
        <Link href="/legal/subprocesadores">/legal/subprocesadores</Link>.
      </p>
      <h2>Más información</h2>
      <ul>
        <li>
          <Link href="/legal/cookies">Política de Cookies</Link>
        </li>
        <li>
          <Link href="/legal/habeas-data">Hábeas Data — ejercicio de derechos</Link>
        </li>
        <li>
          <Link href="/legal/terminos">Términos y Condiciones</Link>
        </li>
      </ul>
    </>
  );
}
