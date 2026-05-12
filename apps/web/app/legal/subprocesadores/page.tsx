import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subprocesadores",
};

const SUBPROCESSORS = [
  {
    name: "Supabase",
    country: "US / EU",
    purpose: "Base de datos PostgreSQL, autenticación, almacenamiento de archivos",
    dpa: "https://supabase.com/legal/dpa",
  },
  {
    name: "Vercel",
    country: "US",
    purpose: "Hosting, despliegue y CDN del sitio web",
    dpa: "https://vercel.com/legal/dpa",
  },
  {
    name: "Resend",
    country: "US",
    purpose: "Envío de emails transaccionales y newsletter",
    dpa: "https://resend.com/legal/dpa",
  },
  {
    name: "Wompi",
    country: "Colombia",
    purpose: "Procesamiento de pagos (tarjetas y PSE)",
    dpa: "https://wompi.com/legal",
  },
  {
    name: "Venndelo / Coordinadora",
    country: "Colombia",
    purpose: "Logística de envíos a 1.100+ destinos",
    dpa: "https://venndelo.com/legal",
  },
  {
    name: "Cloudflare",
    country: "US",
    purpose: "Anti-bot Turnstile y protección DDoS",
    dpa: "https://www.cloudflare.com/cloudflare-customer-dpa/",
  },
  {
    name: "Anthropic (Claude API)",
    country: "US",
    purpose: "Asistente IA para personalización de productos (futuro)",
    dpa: "https://www.anthropic.com/legal/dpa",
  },
];

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">Subprocesadores</h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <p className="mt-6">
        Lucams_shop usa los siguientes proveedores que pueden tratar datos personales en nuestro
        nombre. Mantenemos un Acuerdo de Procesamiento de Datos (DPA) firmado con cada uno, y
        exigimos garantías de seguridad adecuadas.
      </p>
      <table className="border-brand-purple/10 mt-4 w-full border-collapse border text-sm">
        <thead className="bg-brand-purple/5">
          <tr>
            <th className="border-brand-purple/10 border p-2 text-left">Proveedor</th>
            <th className="border-brand-purple/10 border p-2 text-left">País</th>
            <th className="border-brand-purple/10 border p-2 text-left">Propósito</th>
            <th className="border-brand-purple/10 border p-2 text-left">DPA</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}>
              <td className="border-brand-purple/10 border p-2 font-semibold">{s.name}</td>
              <td className="border-brand-purple/10 border p-2">{s.country}</td>
              <td className="border-brand-purple/10 border p-2">{s.purpose}</td>
              <td className="border-brand-purple/10 border p-2">
                <a
                  href={s.dpa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-purple hover:underline"
                >
                  Ver
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-sm">
        Notificaremos por email a clientes registrados cualquier cambio sustancial en este listado
        con al menos 30 días de anticipación.
      </p>
    </>
  );
}
