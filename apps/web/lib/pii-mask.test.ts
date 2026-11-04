import { describe, expect, it } from "vitest";
import {
  maskContactSummaryForActor,
  maskDocumentNumber,
  maskEmail,
  maskOrderForActor,
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
});
