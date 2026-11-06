import { ctaButton, escapeHtml, renderEmailLayout } from "../layout";

export type LifecycleMessageData = {
  subject: string;
  heading: string;
  preheader: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  recipientName?: string | null;
  productNames?: string[];
  unsubscribeUrl?: string;
};

export async function lifecycleMessageEmail(data: LifecycleMessageData) {
  const recipientName = data.recipientName?.trim().split(/\s+/)[0] || "hola";
  const bodyWithName = data.body.replaceAll("{nombre}", recipientName);
  const paragraphs = bodyWithName
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const products =
    data.productNames && data.productNames.length > 0
      ? ` También pensamos en: ${data.productNames.join(", ")}.`
      : "";
  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:22px;color:#3D2E5C;">${escapeHtml(data.heading)}</h1>
${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n")}
${products ? `<p>${escapeHtml(products)}</p>` : ""}
${ctaButton(data.ctaUrl, `${data.ctaLabel} →`)}
`;

  const text = `${data.heading}

${bodyWithName}${products}

${data.ctaLabel}: ${data.ctaUrl}

${data.unsubscribeUrl ? `Cancelar suscripción: ${data.unsubscribeUrl}` : ""}`;

  return {
    subject: data.subject,
    html: await renderEmailLayout({
      preview: data.preheader,
      unsubscribeUrl: data.unsubscribeUrl,
      bodyHtml,
    }),
    text,
  };
}
