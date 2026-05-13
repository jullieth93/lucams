/*
 * Admin > Contenido — Landing page.
 *
 * Redirige por default al tab "Bloques". Las dos secciones (Bloques y
 * Configuración) viven en /admin/contenido/bloques y
 * /admin/contenido/configuracion para tener URLs estables y compartibles.
 */

import { redirect } from "next/navigation";

export default function ContenidoLandingPage() {
  redirect("/admin/contenido/bloques");
}
