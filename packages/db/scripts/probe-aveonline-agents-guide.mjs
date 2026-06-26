// Probe específico Lucams Shop: agents + generarGuia2 (con bloquegenerarguia=0 — NO factura).
// Verifica que el agente recién creado aparece y que se puede generar una guía simulada.
// NO imprime credenciales — solo nombres + IDs + status de respuestas.

const usuario = process.env.AVEONLINE_USUARIO;
const clave = process.env.AVEONLINE_CLAVE;
if (!usuario || !clave) {
  console.error("Falta AVEONLINE_USUARIO o AVEONLINE_CLAVE en env");
  process.exit(1);
}

const report = { auth: {}, agents: {}, guia: {} };

// 1) Auth
const r1 = await fetch("https://app.aveonline.co/api/comunes/v1.0/autenticarusuario.php", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tipo: "auth", usuario, clave }),
});
const auth = await r1.json();
report.auth = {
  status: r1.status,
  ok: auth.status === "ok",
  hasToken: !!auth.token,
  nombre: auth.cuentas?.[0]?.usuarios?.[0]?.nombre,
  idempresa: auth.cuentas?.[0]?.usuarios?.[0]?.id,
};
const token = auth.token;
const idempresa = auth.cuentas?.[0]?.usuarios?.[0]?.id;

if (!token || !idempresa) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

// 2) Listar agentes habilitados — endpoint correcto según aveonline.ts:120
const r2 = await fetch("https://app.aveonline.co/api/comunes/v1.0/agentes.php", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    tipo: "listarAgentesPorEmpresaAuth",
    token,
    idempresa,
  }),
});
const agText = await r2.text();
report.agents = {
  status: r2.status,
  sample: agText.slice(0, 800),
};
try {
  const j = JSON.parse(agText);
  report.agents.count = j?.agentes?.length ?? 0;
  report.agents.list = (j?.agentes ?? []).map((a) => ({
    id: a.id,
    nombre: a.nombre,
    documento: a.documento,
    ciudad: a.ciudad,
    direccion: a.direccion,
    telefono: a.telefono,
  }));
} catch (e) {
  report.agents.parseError = e.message;
}

// 3) Generar guía SIMULADA con Coordinadora — replica EXACTAMENTE el body
//    de createShipment() en apps/web/features/shipping/aveonline.ts:560-615
//    para validar que la cuenta Lucams Shop emite guía OK con su agente real.
const agente = report.agents.list?.[0];
if (agente && token && idempresa) {
  // Lee SiteSettings PICKUP_* + BUSINESS_NIT desde DB
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const settings = await prisma.siteSetting.findMany({
    where: {
      key: {
        in: [
          "BUSINESS_NIT",
          "PICKUP_CITY",
          "PICKUP_DEPARTMENT",
          "PICKUP_ADDRESS",
          "PICKUP_PHONE",
          "PICKUP_CONTACT_NAME",
        ],
      },
    },
  });
  const get = (k) => settings.find((s) => s.key === k)?.value ?? "";
  await prisma.$disconnect();

  const fmtCity = (c, d) =>
    `${c
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s*D\.?\s*C\.?\s*/gi, "")
      .trim()
      .toUpperCase()}(${d
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toUpperCase()})`;

  const body = {
    tipo: "generarGuia2",
    token,
    idempresa,
    codigo: usuario,
    dsclavex: clave,
    origen: fmtCity(get("PICKUP_CITY") || "Bogotá", get("PICKUP_DEPARTMENT") || "Cundinamarca"),
    dsdirre: get("PICKUP_ADDRESS"),
    dsbarrioo: "",
    dsnitre: get("BUSINESS_NIT"),
    dsnombre: get("PICKUP_CONTACT_NAME"),
    dstelre: get("PICKUP_PHONE"),
    dscelularre: get("PICKUP_PHONE"),
    dscorreopre: "hola@lucamsshop.co",
    destino: fmtCity("Medellín", "Antioquia"),
    dsdir: "Cra 50 # 30-20",
    dsbarrio: "",
    IdTipoEntrega: "1",
    dsnit: "1234567890",
    dsnombrecompleto: "Cliente Probe Lucams",
    dstel: "3001234567",
    dscelular: "3001234567",
    dscorreop: "probe@lucamsshop.co",
    idtransportador: "1009", // Coordinadora
    idagente: String(agente.id), // ← Agente Lucams Shop recién creado
    unidades: 1,
    productos: [
      {
        alto: 10,
        ancho: 15,
        largo: 3,
        peso: 0.5,
        unidades: 1,
        nombre: "set-6 fotoimanes probe",
        valorDeclarado: 35000,
      },
    ],
    dscontenido: "set-fotoimanes-probe",
    dscom: "",
    idasumecosto: 1,
    contraentrega: 0,
    valorrecaudo: 0,
    bloquegenerarguia: "0", // ← NO FACTURA
    relacion_envios: "1",
    enviarcorreos: "0", // probe: NO enviar correos
    cartaporte: "0",
    valorMinimo: 1,
    dsvalor_pedido: "35000",
    dsreferencia: "PROBE-" + Date.now(),
    plugin: "lucamsshop-probe-guia",
  };

  const r3 = await fetch(
    "https://app.aveonline.co/api/nal/v1.0/generarGuiaTransporteNacional.php",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const guideText = await r3.text();
  report.guia = {
    status: r3.status,
    sample: guideText.slice(0, 1500),
    agenteUsado: { id: agente.id, nombre: agente.nombre },
    pickupSettings: {
      city: !!get("PICKUP_CITY"),
      dept: !!get("PICKUP_DEPARTMENT"),
      addr: !!get("PICKUP_ADDRESS"),
      phone: !!get("PICKUP_PHONE"),
      contact: !!get("PICKUP_CONTACT_NAME"),
      nit: !!get("BUSINESS_NIT"),
    },
  };
  try {
    const g = JSON.parse(guideText);
    const guia = g?.resultado?.guia ?? g;
    report.guia.ok = g.status === "ok" || guia?.numguia != null;
    report.guia.numguia = guia?.numguia ?? null;
    report.guia.pdfUrl = guia?.rutaguia ?? null;
    report.guia.errorMsg = g.message ?? g.error ?? guia?.mensaje ?? null;
  } catch (e) {
    report.guia.parseError = e.message;
  }
}

console.log(JSON.stringify(report, null, 2));
