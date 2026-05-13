import { describe, expect, it } from "vitest";
import { SUPPORT_SUBJECTS, SUBJECT_LABELS, SupportTicketSchema } from "./schemas";

describe("SupportTicketSchema", () => {
  const validInput = {
    name: "Lucía Rodríguez",
    email: "lucia@example.com",
    subject: "CONSULTA_PRODUCTO" as const,
    message: "Hola, me gustaría saber más sobre los fotoimanes.",
  };

  it("accepts a fully valid payload", () => {
    expect(SupportTicketSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects email malformado", () => {
    const r = SupportTicketSchema.safeParse({ ...validInput, email: "not-an-email" });
    expect(r.success).toBe(false);
  });

  it("rejects nombre muy corto", () => {
    const r = SupportTicketSchema.safeParse({ ...validInput, name: "A" });
    expect(r.success).toBe(false);
  });

  it("rejects mensaje vacío", () => {
    const r = SupportTicketSchema.safeParse({ ...validInput, message: "" });
    expect(r.success).toBe(false);
  });

  it("rejects mensaje demasiado corto (<10 chars)", () => {
    const r = SupportTicketSchema.safeParse({ ...validInput, message: "Hola" });
    expect(r.success).toBe(false);
  });

  it("rejects subject fuera del enum", () => {
    const r = SupportTicketSchema.safeParse({ ...validInput, subject: "OTHER_INVALID" });
    expect(r.success).toBe(false);
  });

  it("accepts cada subject del enum", () => {
    for (const s of SUPPORT_SUBJECTS) {
      const r = SupportTicketSchema.safeParse({ ...validInput, subject: s });
      expect(r.success, `subject=${s}`).toBe(true);
    }
  });

  it("SUBJECT_LABELS cubre todos los SUPPORT_SUBJECTS", () => {
    for (const s of SUPPORT_SUBJECTS) {
      expect(SUBJECT_LABELS[s]).toBeTruthy();
    }
  });
});
