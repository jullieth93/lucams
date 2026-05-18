/*
 * Error boundary global — root.
 *
 * Cubre errores que rompen el root layout (lo cual hace inaccesible
 * incluso app/error.tsx). Reemplaza el documento HTML completo. Por eso
 * incluye <html> y <body> manualmente.
 *
 * Mantenemos estilos inline para que funcione incluso si globals.css
 * falló al cargar.
 */

"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.5rem",
          textAlign: "center",
          background: "#FFF8F0",
          color: "#3D2E5C",
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
        }}
      >
        <div style={{ fontSize: "4rem", lineHeight: 1 }}>🙊</div>
        <h1
          style={{
            margin: "1rem 0 0.5rem",
            fontSize: "1.75rem",
            fontWeight: 700,
          }}
        >
          Algo se rompió de raíz
        </h1>
        <p style={{ margin: 0, maxWidth: 480, opacity: 0.75 }}>
          Ya quedó registrado. Refresca la página o vuelve al inicio.
        </p>
        {error.digest && (
          <p
            style={{
              marginTop: "0.5rem",
              fontFamily: "monospace",
              fontSize: "0.75rem",
              opacity: 0.5,
            }}
          >
            Ref: {error.digest}
          </p>
        )}
        <div
          style={{
            marginTop: "2rem",
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "9999px",
              background: "#7C6AAD",
              color: "white",
              fontWeight: 600,
              border: 0,
              cursor: "pointer",
            }}
          >
            Refrescar
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "9999px",
              background: "white",
              color: "#3D2E5C",
              fontWeight: 600,
              textDecoration: "none",
              border: "1px solid rgba(124,106,173,0.3)",
            }}
          >
            Volver al inicio
          </a>
        </div>
      </body>
    </html>
  );
}
