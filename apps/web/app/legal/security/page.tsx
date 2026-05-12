import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seguridad",
};

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">Seguridad</h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <h2>Divulgación responsable</h2>
      <p>
        Si encontraste una vulnerabilidad de seguridad en Lucams_shop, te agradecemos reportarla
        antes de divulgarla públicamente. Escríbenos a{" "}
        <a href="mailto:security@lucamsshop.co">security@lucamsshop.co</a> con:
      </p>
      <ul>
        <li>Descripción del problema</li>
        <li>Pasos para reproducir</li>
        <li>Impacto potencial</li>
        <li>Tu contacto para coordinar</li>
      </ul>
      <p>Nos comprometemos a:</p>
      <ul>
        <li>Confirmar recepción en máximo 3 días hábiles</li>
        <li>Mantener tu identidad confidencial si lo prefieres</li>
        <li>Acreditarte públicamente al cerrar el reporte (si lo deseas)</li>
        <li>NO emprender acciones legales contra investigadores que actúen de buena fe</li>
      </ul>
      <h2>Alcance</h2>
      <p>
        En scope: lucamsshop.co y sus subdominios. Fuera de scope: vulnerabilidades sociales
        (phishing a empleados), DoS volumétricos, problemas en proveedores de terceros (reportarlos
        a su programa).
      </p>
      <h2>security.txt</h2>
      <p>
        Archivo machine-readable disponible en{" "}
        <a href="/.well-known/security.txt" target="_blank">
          /.well-known/security.txt
        </a>
        .
      </p>
    </>
  );
}
