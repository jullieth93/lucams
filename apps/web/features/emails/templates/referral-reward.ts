/*
 * Template: recompensa del programa de referidos v1.
 *
 * Se envía a AMBAS partes cuando el referido paga su primer pedido:
 *  - referee (el que vino con código): "tu compra desbloqueó tu regalo".
 *  - referrer (el que compartió): "tu código funcionó, aquí está tu regalo".
 * Cupón personal de un solo uso — el código ES el premio; va grande y claro.
 */

import { renderEmailLayout, escapeHtml, ctaButton, getSiteUrl } from "../layout";

export type ReferralRewardData = {
  role: "referee" | "referrer";
  couponCode: string;
  percent: number;
  validDays: number;
  orderNumber: string;
  firstName: string | null;
  /** Nombre de la otra persona (el amigo que compartió o el que vino). */
  friendName: string | null;
};

export async function referralRewardEmail(data: ReferralRewardData) {
  const siteUrl = await getSiteUrl();
  const name = escapeHtml(data.firstName ?? "");
  const friend = escapeHtml(data.friendName ?? "tu amigo(a)");
  const isReferee = data.role === "referee";

  const heading = isReferee ? "🎁 Tu compra desbloqueó un regalo" : "🎉 ¡Tu código funcionó!";
  const intro = isReferee
    ? `Gracias por tu pedido ${escapeHtml(data.orderNumber)}. Como llegaste con el código de ${friend}, te ganaste <strong>${data.percent}% OFF</strong> en tu próxima compra.`
    : `${name ? `${name}, ` : ""}${friend} hizo su primera compra con tu código de referido. Como agradecimiento, te ganaste <strong>${data.percent}% OFF</strong> en tu próxima compra.`;

  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:20px;">${heading}</h1>
<p style="font-size:14px;line-height:1.6;color:#3D2E5C;">${intro}</p>
<div style="background:#FFF8F0;border:2px dashed #7C6AAD;border-radius:12px;text-align:center;padding:18px;margin:18px 0;">
  <p style="margin:0 0 4px 0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#7C6AAD;">Tu cupón (${data.percent}% OFF)</p>
  <p style="margin:0;font-size:26px;font-weight:800;letter-spacing:2px;color:#3D2E5C;">${escapeHtml(data.couponCode)}</p>
  <p style="margin:6px 0 0 0;font-size:12px;color:#3D2E5C;opacity:0.7;">1 uso · válido por ${data.validDays} días · lo aplicas en el checkout</p>
</div>
${ctaButton(`${siteUrl}/productos`, "Ver la tienda →")}
<p style="font-size:13px;color:#3D2E5C;opacity:0.75;">Comparte la magia: cada amigo que compre con tu código te da otro cupón.</p>
`;

  const text = `${heading}

${isReferee ? `Gracias por tu pedido ${data.orderNumber}. Como llegaste con el código de ${data.friendName ?? "tu amigo(a)"}, te ganaste ${data.percent}% OFF en tu próxima compra.` : `${data.friendName ?? "Tu amigo(a)"} hizo su primera compra con tu código de referido. Te ganaste ${data.percent}% OFF en tu próxima compra.`}

Tu cupón (${data.percent}% OFF): ${data.couponCode}
1 uso · válido por ${data.validDays} días · lo aplicas en el checkout.

Ver la tienda: ${siteUrl}/productos`;

  const subject = isReferee
    ? `🎁 Tu cupón de ${data.percent}% OFF está listo`
    : `🎉 Tu código de referido te dio un cupón (${data.percent}% OFF)`;

  return {
    subject,
    html: await renderEmailLayout({
      preview: `${data.percent}% OFF para tu próxima compra · ${data.couponCode}`,
      bodyHtml,
    }),
    text,
  };
}
