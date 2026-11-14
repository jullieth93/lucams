import { describe, expect, it } from "vitest";
import {
  maskContactSummaryForActor,
  maskCopAmountsInText,
  maskDocumentNumber,
  maskEmail,
  maskEmailsInText,
  maskOrderForActor,
  maskOrderOperationalTextForActor,
  maskPersonName,
  maskPhone,
  maskShippingAddressSnapshot,
  maskTaxDocument,
} from "./pii-mask";

describe("S17 — Enmascaramiento server-side determinista de PII", () => {
  it("maskEmail oculta tanto local-part como el nombre de dominio (evita filtrar apellidos en dominios propios)", () => {
    const masked = maskEmail("maria.lopez@familia-lopez.co");
    expect(masked).toBe("m***z@f***z.co");
    expect(masked).not.toContain("maria");
    expect(masked).not.toContain("lopez");
    expect(maskEmail("")).toBe("—");
    expect(maskEmail(null)).toBe("—");
  });

  it("maskEmailsInText enmascara todos los correos embebidos en descripciones libres", () => {
    const raw =
      "Referidos: bienvenida para maria.lopez@familia-lopez.co (código de carlos.perez@empresa.com.co)";
    const masked = maskEmailsInText(raw);
    expect(masked).not.toContain("maria.lopez");
    expect(masked).not.toContain("familia-lopez");
    expect(masked).not.toContain("carlos.perez");
    expect(masked).not.toContain("empresa");
    expect(masked).toContain("Referidos: bienvenida para");
    expect(maskEmailsInText(null)).toBe("");
  });

  it("maskPhone conserva únicamente los últimos 2 dígitos", () => {
    expect(maskPhone("+57 310 456 7890")).toBe("*** *** **90");
    expect(maskPhone("3001234567")).toBe("*** *** **67");
    expect(maskPhone("")).toBe("—");
  });

  it("maskDocumentNumber y maskTaxDocument ocultan el documento salvo los últimos 2 caracteres", () => {
    expect(maskDocumentNumber("1020304050")).toBe("******50");
    expect(maskTaxDocument("CC", "1020304050")).toBe("CC ******50");
    expect(maskTaxDocument("NIT", "900123456-7")).toBe("NIT ******-7");
  });

  it("maskPersonName conserva el primer nombre y la inicial del último apellido", () => {
    expect(maskPersonName("María Camila López Pérez")).toBe("María P.");
    expect(maskPersonName("Valentina")).toBe("Valentina");
    expect(maskPersonName(null)).toBe("—");
  });

  it("maskShippingAddressSnapshot protege calle, apto, barrio, zip, notas y documento pero preserva ciudad/departamento", () => {
    const out = maskShippingAddressSnapshot({
      fullName: "Camila Restrepo",
      email: "camila@restrepo.co",
      phone: "3159876543",
      documentType: "CC",
      documentNumber: "1032456789",
      addressLine1: "Calle 85 # 14-32 Apto 502",
      addressLine2: "Torre B",
      neighborhood: "Chicó Norte",
      zip: "110221",
      city: "Bogotá",
      department: "Bogotá D.C.",
      notes: "Dejar en portería con código 4921",
    });

    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("Restrepo");
    expect(serialized).not.toContain("restrepo");
    expect(serialized).not.toContain("3159876543");
    expect(serialized).not.toContain("1032456789");
    expect(serialized).not.toContain("Calle 85");
    expect(serialized).not.toContain("502");
    expect(serialized).not.toContain("Torre B");
    expect(serialized).not.toContain("Chicó");
    expect(serialized).not.toContain("110221");
    expect(serialized).not.toContain("4921");
    expect(out.city).toBe("Bogotá");
    expect(out.department).toBe("Bogotá D.C.");
  });

  it("maskOrderForActor elimina el 100 % de PII del árbol serializable para PRINT_WORKSHOP y lo preserva para CUSTOMER_SUPPORT / SUPERADMIN", () => {
    const rawOrder = {
      id: "ord_sec_1",
      number: "LCM-2026-8888",
      status: "PAID",
      email: "valentina.duque@duquecorp.com.co",
      phone: "+573118889900",
      shippingAddressKey: "antioquia|medellin|carrera43a1050|050021",
      notes: "Portería edificio Boreal apto 1204",
      labelPath: "shipping-labels/ord_sec_1.pdf",
      labelUrl: "https://aveonline.test/labels/secret-address.pdf",
      trackingUrl: "https://aveonline.test/track/secret-address",
      billingDocumentType: "CC",
      billingDocumentNumber: "1037654321",
      billingName: "Valentina Duque Gómez",
      recipientName: "Santiago Mejía Duque",
      recipientPhone: "+573007776655",
      giftMessage: "Feliz aniversario amor, por muchos años más",
      shippingAddress: {
        fullName: "Valentina Duque Gómez",
        email: "valentina.duque@duquecorp.com.co",
        phone: "3118889900",
        documentType: "CC",
        documentNumber: "1037654321",
        addressLine1: "Carrera 43A # 10-50 Apto 1204",
        addressLine2: "Edificio Boreal",
        neighborhood: "El Poblado",
        zip: "050021",
        city: "Medellín",
        department: "Antioquia",
        notes: "Timbre 1204",
      },
      customer: {
        id: "cust_1",
        email: "valentina.duque@duquecorp.com.co",
        firstName: "Valentina",
        lastName: "Duque Gómez",
      },
    };

    const workshopPayload = JSON.stringify(maskOrderForActor(rawOrder, "PRINT_WORKSHOP"));
    for (const secret of [
      "valentina.duque",
      "duquecorp",
      "3118889900",
      "3007776655",
      "1037654321",
      "Duque",
      "Mejía",
      "Carrera 43A",
      "carrera43a1050",
      "1204",
      "Boreal",
      "Poblado",
      "050021",
      "shipping-labels/ord_sec_1.pdf",
      "secret-address",
    ]) {
      expect(workshopPayload).not.toContain(secret);
    }
    // El taller SÍ conserva el mensaje impreso de la tarjeta de regalo y el número de pedido:
    expect(workshopPayload).toContain("Feliz aniversario amor, por muchos años más");
    expect(workshopPayload).toContain("LCM-2026-8888");
    expect(workshopPayload).toContain("Medellín");

    // FULFILLMENT conserva labelPath/labelUrl para pegar la guía, pero sigue con PII enmascarada en pantalla:
    const fulfillmentOrder = maskOrderForActor(rawOrder, "FULFILLMENT");
    expect(fulfillmentOrder.labelPath).toBe("shipping-labels/ord_sec_1.pdf");
    expect(fulfillmentOrder.email).not.toContain("valentina.duque");

    // CUSTOMER_SUPPORT y SUPERADMIN poseen orders:read_pii -> referencia intacta
    expect(maskOrderForActor(rawOrder, "CUSTOMER_SUPPORT")).toBe(rawOrder);
    expect(maskOrderForActor(rawOrder, "SUPERADMIN")).toBe(rawOrder);
  });

  it("maskContactSummaryForActor protege resumen de Contact cuando el rol carece de contacts:read_pii", () => {
    const contact = {
      displayName: "Laura Sofía Morales",
      primaryEmail: "laura@morales.co",
      primaryPhoneE164: "+573201112233",
      documentNumber: "1015998877",
    };
    const masked = maskContactSummaryForActor(contact, "PRINT_WORKSHOP");
    expect(JSON.stringify(masked)).not.toContain("Morales");
    expect(JSON.stringify(masked)).not.toContain("morales");
    expect(JSON.stringify(masked)).not.toContain("3201112233");
    expect(JSON.stringify(masked)).not.toContain("1015998877");

    expect(maskContactSummaryForActor(contact, "CUSTOMER_SUPPORT")).toBe(contact);
  });

  it("Bloque 5 — maskOrderForActor aplica confidencialidad comercial COP diferenciada entre PRINT_WORKSHOP, FULFILLMENT y FINANCE_ANALYST", () => {
    const baseCommercialOrder = {
      id: "ord_com_1",
      number: "LCM-2026-9001",
      status: "PAID",
      paymentMethod: "COD" as "COD" | "WOMPI",
      email: "cliente@correo.co",
      phone: "3001234567",
      shippingAddress: { city: "Bogotá", department: "Bogotá D.C." },
      subtotal: 120_000,
      discount: 20_000,
      loyaltyDiscount: 5_000,
      loyaltyPointsRedeemed: 50,
      shipping: 14_000,
      tax: 0,
      total: 109_000,
      refundAmount: 109_000,
      couponId: "cp_secret",
      coupon: { id: "cp_secret", code: "VIP20" },
      codReconciliation: { id: "rem_1", remittanceCode: "REM-2026-01" },
      wompiTransactionId: "wompi_tx_99",
      wompiReference: "wompi_ref_99",
      wompiAttempts: [{ id: "att_1", amountInCents: 10_900_000 }],
      items: [
        {
          id: "it_1",
          unitPrice: 60_000,
          qty: 2,
          retractRequest: { id: "ret_1", status: "REQUESTED", refundAmount: 60_000 },
        },
      ],
    };

    // 1. PRINT_WORKSHOP: 0 centavos COP incluso cuando el pedido es COD
    const workshopMasked = maskOrderForActor(baseCommercialOrder, "PRINT_WORKSHOP");
    expect(workshopMasked.subtotal).toBe(0);
    expect(workshopMasked.discount).toBe(0);
    expect(workshopMasked.loyaltyDiscount).toBe(0);
    expect(workshopMasked.shipping).toBe(0);
    expect(workshopMasked.total).toBe(0);
    expect(workshopMasked.refundAmount).toBeNull();
    expect(workshopMasked.couponId).toBeNull();
    expect(workshopMasked.coupon).toBeNull();
    expect(workshopMasked.codReconciliation).toBeNull();
    expect(workshopMasked.wompiTransactionId).toBeNull();
    expect(workshopMasked.wompiAttempts).toEqual([]);
    expect(workshopMasked.items[0]!.unitPrice).toBe(0);
    expect(workshopMasked.items[0]!.retractRequest?.refundAmount).toBe(0);

    // 2. FULFILLMENT con COD: conserva ÚNICAMENTE `total` (monto a recaudar), redacta desglose y cupones
    const fulfillmentCod = maskOrderForActor(baseCommercialOrder, "FULFILLMENT");
    expect(fulfillmentCod.total).toBe(109_000);
    expect(fulfillmentCod.subtotal).toBe(0);
    expect(fulfillmentCod.discount).toBe(0);
    expect(fulfillmentCod.coupon).toBeNull();
    expect(fulfillmentCod.items[0]!.unitPrice).toBe(0);

    // 3. FULFILLMENT con WOMPI (pagado en línea): también redacta `total` a 0
    const fulfillmentWompi = maskOrderForActor(
      { ...baseCommercialOrder, paymentMethod: "WOMPI" as const },
      "FULFILLMENT",
    );
    expect(fulfillmentWompi.total).toBe(0);
    expect(fulfillmentWompi.wompiTransactionId).toBeNull();
    expect(fulfillmentWompi.wompiAttempts).toEqual([]);

    // 4. FINANCE_ANALYST: PII enmascarada pero 100 % del desglose comercial intacto
    const financeMasked = maskOrderForActor(baseCommercialOrder, "FINANCE_ANALYST");
    expect(financeMasked.email).not.toContain("cliente");
    expect(financeMasked.subtotal).toBe(120_000);
    expect(financeMasked.discount).toBe(20_000);
    expect(financeMasked.total).toBe(109_000);
    expect(financeMasked.coupon?.code).toBe("VIP20");
    expect(financeMasked.items[0]!.unitPrice).toBe(60_000);
  });
});

describe("Bloque C1 — aislamiento estricto 0-PII y COP", () => {
  it("maskShippingAddressSnapshot usa una proyección cerrada sin documentType, localidades ni claves desconocidas", () => {
    const out = maskShippingAddressSnapshot({
      fullName: "Camila Restrepo",
      documentType: "CC",
      documentNumber: "1032456789",
      addressLine1: "Calle 85 # 14-32",
      localityName: "Chapinero",
      localityId: "LOC-SECRET",
      internalRoutingKey: "secret",
      city: "Bogotá",
      department: "Bogotá D.C.",
    });

    expect(out).toEqual({
      fullName: "Camila R.",
      documentNumber: "******89",
      addressLine1: "Dirección protegida (ver guía oficial de despacho)",
      city: "Bogotá",
      department: "Bogotá D.C.",
    });
    expect(JSON.stringify(out)).not.toContain("Chapinero");
    expect(JSON.stringify(out)).not.toContain("LOC-SECRET");
    expect(JSON.stringify(out)).not.toContain("internalRoutingKey");
  });

  it("FINANCE_ANALYST no recibe mensajes de regalo, previews ni canvas, pero conserva montos contables", () => {
    const order = {
      email: "comprador@familia.co",
      phone: "3001234567",
      shippingAddress: { city: "Bogotá", department: "Cundinamarca" },
      giftMessage: "Feliz cumpleaños, con todo mi amor",
      reconciliationReason: "Contactar a comprador@familia.co por un cobro de $ 120.000",
      reconciliationNote: "Se devolvieron 120.000 COP a comprador@familia.co",
      items: [
        {
          unitPrice: 120_000,
          designAssetUrl: "/api/design-preview/design-secret/preview.png",
          customDesign: { objects: [{ src: "customer-photo.jpg" }] },
          design: {
            previewUrl: "/api/design-preview/design-secret/preview.png",
            canvasData: { objects: [{ src: "customer-photo.jpg" }] },
          },
          metadata: {
            designSnapshot: { previewUrl: "/api/design-preview/design-secret/preview.png" },
          },
        },
      ],
    };

    const masked = maskOrderForActor(order, "FINANCE_ANALYST");
    const serialized = JSON.stringify(masked);
    expect(masked.giftMessage).toBeNull();
    expect(masked.items[0]!.unitPrice).toBe(120_000);
    expect(masked.items[0]!.designAssetUrl).toBeNull();
    expect(masked.items[0]!.customDesign).toBeNull();
    expect(masked.items[0]!.design.previewUrl).toBeNull();
    expect(masked.items[0]!.design.canvasData).toBeNull();
    expect(masked.items[0]!.metadata.designSnapshot.previewUrl).toBeNull();
    expect(masked.reconciliationReason).toContain("$ 120.000");
    expect(masked.reconciliationReason).not.toContain("comprador@familia.co");
    expect(serialized).not.toContain("design-secret");
    expect(serialized).not.toContain("customer-photo");
    expect(serialized).not.toContain("Feliz cumpleaños");
  });

  it("PRINT_WORKSHOP y FULFILLMENT no reciben facturación ni notas de reconciliación", () => {
    const order = {
      email: "cliente@correo.co",
      phone: "3001234567",
      shippingAddress: {},
      billingDocumentType: "CC",
      billingDocumentNumber: "1032456789",
      billingName: "Camila Restrepo",
      reconciliationReason: "Cobro duplicado por $ 90.000",
      reconciliationNote: "Reembolso de 90.000 COP",
    };

    const workshop = maskOrderForActor(order, "PRINT_WORKSHOP");
    expect(workshop.billingDocumentType).toBeNull();
    expect(workshop.billingDocumentNumber).toBeNull();
    expect(workshop.billingName).toBeNull();
    expect(workshop.reconciliationReason).toBeNull();
    expect(workshop.reconciliationNote).toBeNull();

    const fulfillment = maskOrderForActor(order, "FULFILLMENT");
    expect(fulfillment.reconciliationReason).toBeNull();
    expect(fulfillment.reconciliationNote).toBeNull();
  });

  it("maskOrderOperationalTextForActor redacta correos y montos sin borrar números operativos", () => {
    const raw = "Pedido LCM-2026-0001: cobrar $ 120.000 a cliente@correo.co; 12 unidades";
    const workshop = maskOrderOperationalTextForActor(raw, "PRINT_WORKSHOP");
    expect(workshop).not.toContain("120.000");
    expect(workshop).not.toContain("cliente@correo.co");
    expect(workshop).toContain("LCM-2026-0001");
    expect(workshop).toContain("12 unidades");
    expect(workshop).toContain("[monto COP protegido]");

    const finance = maskOrderOperationalTextForActor(raw, "FINANCE_ANALYST");
    expect(finance).toContain("$ 120.000");
    expect(finance).not.toContain("cliente@correo.co");
    expect(maskCopAmountsInText("Guía 123456789, 12 unidades")).toBe("Guía 123456789, 12 unidades");
  });
});
