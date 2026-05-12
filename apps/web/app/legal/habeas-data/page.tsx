import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hábeas Data",
};

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">Hábeas Data</h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <p className="mt-6">
        Como titular de datos personales, conforme a la <strong>Ley 1581 de 2012</strong> tienes los
        siguientes derechos sobre la información que Lucams_shop ha recolectado de ti:
      </p>
      <h2>Tus derechos</h2>
      <ul>
        <li>
          <strong>Acceso:</strong> conocer qué datos tuyos tenemos.
        </li>
        <li>
          <strong>Rectificación:</strong> corregir datos inexactos o desactualizados.
        </li>
        <li>
          <strong>Actualización:</strong> agregar información faltante.
        </li>
        <li>
          <strong>Supresión:</strong> eliminar datos cuando no haya base legal para conservarlos.
        </li>
        <li>
          <strong>Revocación de la autorización:</strong> retirar tu consentimiento en cualquier
          momento (newsletter, marketing, etc.).
        </li>
        <li>
          <strong>Reclamo ante la SIC:</strong> si consideras que vulneramos tus derechos puedes
          presentar queja ante la Superintendencia de Industria y Comercio.
        </li>
      </ul>
      <h2>Cómo ejercer tus derechos</h2>
      <p>
        Escríbenos a <a href="mailto:hola@lucamsshop.co">hola@lucamsshop.co</a> indicando:
      </p>
      <ol>
        <li>Tu nombre completo y documento de identidad</li>
        <li>Email con el que te registraste</li>
        <li>El derecho que deseas ejercer</li>
        <li>Una breve descripción de tu solicitud</li>
      </ol>
      <p>
        Tenemos hasta <strong>10 días hábiles</strong> para responder consultas y{" "}
        <strong>15 días hábiles</strong> para reclamos. Si necesitamos más tiempo te avisaremos.
      </p>
      <h2>Reclamo ante la SIC</h2>
      <p>
        Si no estás conforme con nuestra respuesta puedes acudir a la Superintendencia de Industria
        y Comercio:{" "}
        <a href="https://www.sic.gov.co" target="_blank" rel="noopener noreferrer">
          sic.gov.co
        </a>
      </p>
    </>
  );
}
