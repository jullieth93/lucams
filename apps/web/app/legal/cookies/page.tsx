import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Cookies",
};

export default function Page() {
  return (
    <>
      <h1 className="font-display text-brand-purple-dark text-3xl sm:text-4xl">
        Política de Cookies
      </h1>
      <p className="text-brand-purple-dark/60 mt-2 text-sm">
        Última actualización: 2026-05-12 · Versión v1
      </p>
      <p className="mt-6">
        Usamos cookies para que el sitio funcione (autenticación, carrito) y para mejorar tu
        experiencia. Detallamos cada cookie y su propósito en cumplimiento de la{" "}
        <strong>Ley 1581 de 2012</strong>.
      </p>
      <h2>Cookies que usamos actualmente</h2>
      <table className="border-brand-purple/10 mt-4 w-full border-collapse border text-sm">
        <thead className="bg-brand-purple/5">
          <tr>
            <th className="border-brand-purple/10 border p-2 text-left">Nombre</th>
            <th className="border-brand-purple/10 border p-2 text-left">Propósito</th>
            <th className="border-brand-purple/10 border p-2 text-left">Retención</th>
            <th className="border-brand-purple/10 border p-2 text-left">Tercero</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border-brand-purple/10 border p-2 font-mono text-xs">sb-*-auth-token</td>
            <td className="border-brand-purple/10 border p-2">Sesión de usuario (Supabase Auth)</td>
            <td className="border-brand-purple/10 border p-2">7 días</td>
            <td className="border-brand-purple/10 border p-2">Supabase</td>
          </tr>
          <tr>
            <td className="border-brand-purple/10 border p-2 font-mono text-xs">cart_session</td>
            <td className="border-brand-purple/10 border p-2">
              Identifica tu carrito de compras antes y después del login
            </td>
            <td className="border-brand-purple/10 border p-2">30 días</td>
            <td className="border-brand-purple/10 border p-2">Lucams_shop</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-4 text-sm">
        Banner de consentimiento con granularidad (Necesarias / Funcionales / Analíticas /
        Marketing) próximamente — sub-bloque E del roadmap.
      </p>
    </>
  );
}
