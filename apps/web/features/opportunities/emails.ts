/*
 * Correos transaccionales + notificación in-app al nacer una oportunidad B2B / Eventos.
 *
 * Se ejecuta fire-and-forget con `after()` desde `submitB2bInquiryAction`:
 *  1. Confirmación al cliente con su radicado `OP-XXXXXX` (`renderB2bInquiryReceivedEmail`).
 *  2. Aviso interno a `ALERT_EMAIL` con `Reply-To` al cliente y link `wa.me` directo
 *     (`renderB2bInquiryAdminNotificationEmail`).
 *  3. Registro duradero en el centro de notificaciones admin (`notify`).
 *
 * Un fallo de correo jamás rompe ni retrasa la creación de la oportunidad.
 */

import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { getSettingValue } from "@/lib/cms";
import { notify } from "@/features/notifications/service";
import {
  renderB2bInquiryAdminNotificationEmail,
  renderB2bInquiryReceivedEmail,
} from "@/features/emails/registry";
import { isOpportunityEventType, OPPORTUNITY_EVENT_LABELS } from "./schemas";

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export async function sendB2bInquiryEmails(opportunityId: string): Promise<void> {
  try {
    const opp = await prisma.opportunity.findFirst({
      where: { id: opportunityId, deletedAt: null },
      include: {
        contact: {
          select: {
            displayName: true,
            primaryEmail: true,
            primaryPhoneE164: true,
          },
        },
        organization: {
          select: {
            name: true,
            taxIdNumber: true,
          },
        },
      },
    });
    if (!opp) return;

    const contactName =
      opp.contactName || opp.contact.displayName || opp.contactEmail || "Contacto B2B";
    const contactEmail = opp.contactEmail ?? opp.contact.primaryEmail ?? "";
    const contactWhatsapp = opp.contactWhatsapp ?? opp.contact.primaryPhoneE164 ?? "";
    const eventLabel = isOpportunityEventType(opp.eventType)
      ? OPPORTUNITY_EVENT_LABELS[opp.eventType]
      : OPPORTUNITY_EVENT_LABELS.OTHER;
    const expectedUnits = opp.expectedUnits ?? 0;
    const city = opp.city ?? "Colombia";
    const eventDateLabel = opp.eventDate ? dateFmt.format(opp.eventDate) : null;
    const notes = opp.notes ?? "Sin detalle adicional.";

    const alertEmail = await getSettingValue("ALERT_EMAIL", "hola@lucamsshop.com");

    const [clientTpl, adminTpl] = await Promise.all([
      contactEmail
        ? renderB2bInquiryReceivedEmail({
            opportunityNumber: opp.number,
            contactName,
            organizationName: opp.organization?.name ?? null,
            eventLabel,
            expectedUnits,
            city,
            department: opp.department,
            eventDateLabel,
            notes,
          })
        : Promise.resolve(null),
      renderB2bInquiryAdminNotificationEmail({
        opportunityId: opp.id,
        opportunityNumber: opp.number,
        contactName,
        contactEmail: contactEmail || alertEmail,
        contactWhatsapp: contactWhatsapp || "—",
        organizationName: opp.organization?.name ?? null,
        nit: opp.organization?.taxIdNumber ?? null,
        eventLabel,
        expectedUnits,
        city,
        department: opp.department,
        eventDateLabel,
        notes,
      }),
    ]);

    const emailJobs: Array<Promise<unknown>> = [
      sendEmail({
        to: alertEmail,
        subject: adminTpl.subject,
        html: adminTpl.html,
        text: adminTpl.text,
        replyTo: contactEmail || adminTpl.replyTo,
        idempotencyKey: `opportunity:admin-notification:${opp.id}`,
        tags: [
          { name: "type", value: "b2b_inquiry_admin" },
          { name: "opportunity_number", value: opp.number },
        ],
      }).then((res) => {
        logger.info({
          event: "b2b.email.admin_notification.sent",
          number: opp.number,
          to: alertEmail,
          result: res.sent ? "ok" : `skip:${res.reason}`,
        });
      }),
    ];

    if (clientTpl && contactEmail) {
      emailJobs.push(
        sendEmail({
          to: contactEmail,
          subject: clientTpl.subject,
          html: clientTpl.html,
          text: clientTpl.text,
          idempotencyKey: `opportunity:client-received:${opp.id}`,
          tags: [
            { name: "type", value: "b2b_inquiry_received" },
            { name: "opportunity_number", value: opp.number },
          ],
        }).then((res) => {
          logger.info({
            event: "b2b.email.client_received.sent",
            number: opp.number,
            result: res.sent ? "ok" : `skip:${res.reason}`,
          });
        }),
      );
    }

    await Promise.allSettled(emailJobs);

    const whoLabel = opp.organization?.name || contactName;
    await notify({
      type: "QUOTE",
      severity: expectedUnits >= 100 ? "warning" : "info",
      title: `Nueva oportunidad ${opp.number} — ${whoLabel} (${expectedUnits} uds.)`,
      detail: `${eventLabel} · ${city}${contactWhatsapp ? ` · WhatsApp: ${contactWhatsapp}` : ""}`,
      actionUrl: `/admin/oportunidades/${opp.id}`,
      actionLabel: "Ver oportunidad",
      dedupKey: `opportunity:${opp.id}`,
    });
  } catch (err) {
    logger.error({
      event: "b2b.email.dispatch_failed",
      opportunityId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
