/*
 * Loading UI del panel admin — se muestra mientras el RSC de la página destino
 * responde (todas las páginas admin son force-dynamic). Esqueleto genérico de
 * marca (header + tarjetas + filas) con barrido shimmer (globals.css
 * `.admin-skeleton`); el shell (sidebar/topbar) ya está montado, así que solo
 * se esqueletiza el área de contenido.
 */

export default function AdminPanelLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="min-h-[calc(100vh-3.5rem)]">
      <div className="mx-auto max-w-7xl">
        {/* Header: icono + título + subtítulo */}
        <div className="border-brand-purple/10 border-b bg-white/60">
          <div className="flex items-center gap-3 px-4 py-5 sm:px-6 sm:py-6">
            <div className="admin-skeleton h-11 w-11 rounded-xl" />
            <div className="space-y-2">
              <div className="admin-skeleton h-6 w-44 rounded-md" />
              <div className="admin-skeleton h-3.5 w-64 max-w-[60vw] rounded-md" />
            </div>
          </div>
        </div>
        {/* Cuerpo: fila de KPIs + panel tipo tabla */}
        <div className="space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm"
              >
                <div className="admin-skeleton h-3 w-20 rounded" />
                <div className="admin-skeleton mt-3 h-8 w-16 rounded-md" />
                <div className="admin-skeleton mt-2.5 h-3 w-24 rounded" />
              </div>
            ))}
          </div>
          <div className="border-brand-purple/10 rounded-xl border bg-white p-5 shadow-sm">
            <div className="admin-skeleton h-4 w-40 rounded" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="admin-skeleton h-9 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
