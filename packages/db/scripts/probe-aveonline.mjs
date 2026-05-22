// Prueba interna: SiteSettings PICKUP_* + Aveonline auth + cotización demo.
// NO imprime credenciales — solo presencia + tamaños + respuestas.
import { PrismaClient } from "@prisma/client";
// Env vars deben venir del shell (set -a && source .env.local && node ...).
// El script NO lee .env.local directamente — solo usa process.env y NO imprime valores secretos.

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

const report = { sitesettings: {}, aveonline: {}, dims: {} };

// 1) SiteSettings PICKUP_*
try {
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
    select: { key: true, value: true, category: true },
  });
  for (const s of settings)
    report.sitesettings[s.key] = {
      present: !!s.value,
      len: s.value?.length ?? 0,
      category: s.category,
    };
  const missing = [
    "BUSINESS_NIT",
    "PICKUP_CITY",
    "PICKUP_DEPARTMENT",
    "PICKUP_ADDRESS",
    "PICKUP_PHONE",
    "PICKUP_CONTACT_NAME",
  ].filter((k) => !report.sitesettings[k]);
  report.sitesettings._missing = missing;
} catch (e) {
  report.sitesettings._error = e.message;
}

// 2) Aveonline auth
try {
  const usuario = process.env.AVEONLINE_USUARIO;
  const clave = process.env.AVEONLINE_CLAVE;
  report.aveonline.usuario_present = !!usuario;
  report.aveonline.clave_present = !!clave;
  if (usuario && clave) {
    // Endpoint REAL del código (apps/web/features/shipping/aveonline.ts:51)
    const r = await fetch("https://app.aveonline.co/api/comunes/v1.0/autenticarusuario.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "auth", usuario, clave }),
    });
    const text = await r.text();
    report.aveonline.status = r.status;
    report.aveonline.contentType = r.headers.get("content-type");
    report.aveonline.responseSample = text.slice(0, 400);
    let json;
    try {
      json = JSON.parse(text);
    } catch {}
    if (json) {
      report.aveonline.parsed = {
        status: json.status,
        ok: json.status === "ok" || json.token !== undefined,
        hasToken: !!json.token,
        msg: json.msg ?? json.mensaje ?? null,
      };
    }
  }
} catch (e) {
  report.aveonline._error = e.message;
}

// 2x) Listar transportadoras habilitadas para la idempresa actual
try {
  if (report.aveonline.parsed?.hasToken) {
    const tokenMatch = report.aveonline.responseSample.match(/"token":"([^"]+)"/);
    const idMatch = report.aveonline.responseSample.match(/"id":(\d+)/);
    const token = tokenMatch?.[1];
    const idempresa = idMatch ? Number(idMatch[1]) : null;
    if (token && idempresa) {
      const r = await fetch("https://app.aveonline.co/api/box/v1.0/transportadora.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "listarTransportadorasPorEmpresa", token, id: idempresa }),
      });
      const text = await r.text();
      report.aveonline.transportadoras = {
        status: r.status,
        sample: text.slice(0, 1200),
      };
      try {
        const j = JSON.parse(text);
        report.aveonline.transportadoras.count = j?.transportadoras?.length ?? null;
        report.aveonline.transportadoras.list =
          j?.transportadoras?.map((t) => ({ id: t.id, text: t.text })) ?? null;
      } catch {}
    }
  }
} catch (e) {
  report.aveonline.transportadoras_error = e.message;
}

// 2y) Cotización con cotizarDoble (la recomendada — cotiza todas las habilitadas)
try {
  if (report.aveonline.parsed?.hasToken) {
    const tokenMatch = report.aveonline.responseSample.match(/"token":"([^"]+)"/);
    const idMatch = report.aveonline.responseSample.match(/"id":(\d+)/);
    const token = tokenMatch?.[1];
    const idempresa = idMatch ? Number(idMatch[1]) : null;
    if (token && idempresa) {
      const r = await fetch(
        "https://app.aveonline.co/api/nal/v1.0/generarGuiaTransporteNacional.php",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "cotizarDoble",
            token,
            idempresa,
            origen: "BOGOTA(CUNDINAMARCA)",
            destino: "MEDELLIN(ANTIOQUIA)",
            productos: [
              {
                alto: 10,
                ancho: 15,
                largo: 3,
                peso: 0.5,
                unidades: 1,
                nombre: "set-6",
                valorDeclarado: 35000,
              },
            ],
            contraentrega: 0,
            contraentregaPayment: 0,
            valorrecaudo: 0,
            valorMinimo: 0,
            idasumecosto: 0,
            plugin: "lucamsshop-probe",
          }),
        },
      );
      const text = await r.text();
      report.aveonline.cotizarDoble = {
        status: r.status,
        sample: text.slice(0, 1800),
      };
      try {
        const j = JSON.parse(text);
        const errs = (j?.cotizaciones ?? []).filter((c) => c.numbererror !== "-0-");
        const oks = (j?.cotizaciones ?? []).filter((c) => c.numbererror === "-0-");
        report.aveonline.cotizarDoble.totalCount = j?.cotizaciones?.length ?? 0;
        report.aveonline.cotizarDoble.okCount = oks.length;
        report.aveonline.cotizarDoble.errCount = errs.length;
        report.aveonline.cotizarDoble.oks = oks.map((c) => ({
          carrier: c.nombreTransportadora,
          total: c.total,
          dias: c.diasentrega,
        }));
        report.aveonline.cotizarDoble.errs = errs.map((c) => ({
          carrier: c.nombreTransportadora,
          code: c.numbererror,
          msg: c.dataerror?.slice(0, 120),
        }));
      } catch {}
    }
  }
} catch (e) {
  report.aveonline.cotizarDoble_error = e.message;
}

// 2b) Aveonline quote real — Bogotá → Medellín, 1 set de 6 fotoimanes
try {
  if (report.aveonline.parsed?.hasToken) {
    const tokenMatch = report.aveonline.responseSample.match(/"token":"([^"]+)"/);
    const idMatch = report.aveonline.responseSample.match(/"id":(\d+)/);
    const token = tokenMatch?.[1];
    const idempresa = idMatch ? Number(idMatch[1]) : null;
    if (token && idempresa) {
      const r = await fetch(
        "https://app.aveonline.co/api/nal/v1.0/generarGuiaTransporteNacional.php",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "cotizar2",
            token,
            idempresa,
            origen: "Bogotá",
            destino: "Medellín",
            productos: [
              {
                alto: 10,
                ancho: 15,
                largo: 3,
                peso: 0.18,
                unidades: 1,
                nombre: "set-6",
                valorDeclarado: 35000,
              },
            ],
            contraentrega: 0,
            idasumecosto: 0,
            plugin: "apiave",
          }),
        },
      );
      const text = await r.text();
      report.aveonline.quote = {
        status: r.status,
        contentType: r.headers.get("content-type"),
        sample: text.slice(0, 600),
      };
      try {
        report.aveonline.quote.parsed = JSON.parse(text);
      } catch {}
    }
  }
} catch (e) {
  report.aveonline.quote_error = e.message;
}

// 2z) Simular el provider POST-AJUSTE (cotizarDoble + filtro numbererror) con dims REALES
try {
  if (report.aveonline.parsed?.hasToken) {
    const tokenMatch = report.aveonline.responseSample.match(/"token":"([^"]+)"/);
    const idMatch = report.aveonline.responseSample.match(/"id":(\d+)/);
    const token = tokenMatch?.[1];
    const idempresa = idMatch ? Number(idMatch[1]) : null;
    // Simula 1 set de 6 fotoimanes Polaroid (30g * 6 = 180g, 15x10x3cm, valorDeclarado $35.000)
    const declared = Math.max(10000, 35000);
    const productos = [
      {
        alto: 10,
        ancho: 15,
        largo: 3,
        peso: 0.5,
        unidades: 1,
        nombre: "set-6",
        valorDeclarado: declared,
      },
    ];
    const formatCity = (city, dept) =>
      `${city
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\bD\.?\s*C\.?\b/gi, "")
        .trim()
        .toUpperCase()}(${dept.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase()})`;
    const r = await fetch(
      "https://app.aveonline.co/api/nal/v1.0/generarGuiaTransporteNacional.php",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "cotizarDoble",
          access: "",
          token,
          idempresa,
          origen: formatCity("Bogotá", "Cundinamarca"),
          destino: formatCity("Medellín", "Antioquia"),
          productos,
          contraentrega: 0,
          contraentregaPayment: 0,
          valorrecaudo: 0,
          valorMinimo: 0,
          idasumecosto: 0,
          plugin: "lucamsshop",
        }),
      },
    );
    const j = await r.json();
    const all = j?.cotizaciones ?? [];
    const ok = all.filter((c) => c.numbererror === "-0-");
    const failed = all.filter((c) => c.numbererror !== "-0-");
    report.providerSimulation = {
      status: r.status,
      okCount: ok.length,
      failedCount: failed.length,
      shippingQuotes: ok.map((c) => ({
        carrier: (c.nombreTransportadora ?? "").toLowerCase().replace(/\s+/g, "-"),
        carrierName: c.nombreTransportadora,
        fleteCop: Math.round((c.total ?? 0) * 100),
        deliveryDays: Number(c.diasentrega) || 0,
        quoteId: c.codTransportadora,
      })),
      failedSamples: failed
        .slice(0, 3)
        .map((c) => ({ carrier: c.nombreTransportadora, code: c.numbererror })),
    };
  }
} catch (e) {
  report.providerSimulation_error = e.message;
}

// 3) Variant dims check — primer producto con personalizationKind PHOTO_PACK
try {
  const variants = await prisma.productVariant.findMany({
    where: { product: { deletedAt: null } },
    take: 5,
    include: {
      product: { select: { slug: true, physicalSpecs: true, personalizationKind: true } },
    },
  });
  report.dims.sample = variants.map((v) => ({
    slug: v.product.slug,
    kind: v.product.personalizationKind,
    variantId: v.id,
    productSpecs: v.product.physicalSpecs,
    variantAttrs: v.attributes,
  }));
} catch (e) {
  report.dims._error = e.message;
}

console.log(JSON.stringify(report, null, 2));
await prisma.$disconnect();
