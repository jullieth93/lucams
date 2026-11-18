/*
 * `/propuesta/[token]` — Portal privado B2B / Eventos (`ADR-210`).
 *
 * Seguridad:
 *   - Token opaco CSPRNG de 256 bits (64 hex chars); en DB solo vive `tokenHash` SHA-256.
 *   - `robots: { index: false, follow: false }` + `proxy.ts` `Cache-Control: private, no-store`
 *     + `Referrer-Policy: no-referrer`.
 *   - Jamás expone costos BOM internos (`unitCostSnapshotCents`).
 *   - Datos bancarios / llave Bre-B (`getDirectPaymentConfig()`) solo bajan si
 *     `proposal.allowDirectTransfer && directConfig.enabled`.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LucamsLogo } from "@/components/lucams-logo";
import { SITE_NAME } from "@/lib/site";
import { formatDateLongCO, formatDateTimeCO } from "@/lib/datetime";
import { getDirectPaymentConfig } from "@/lib/direct-payment-config";
import { buildWhatsAppUrl } from "@/lib/wa";
import { BILLING_DOCUMENT_ENABLED } from "@/features/checkout/billing-document";
import { getPublicProposalByToken } from "@/features/opportunities/proposals-service";
import {
  ProposalPortalClient,
  type PublicDirectPaymentView,
  type PublicProposalPortalData,
} from "./proposal-portal-client";

export const metadata: Metadata = {
  title: `Propuesta comercial · ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const cleanToken = token.trim();
  if (!/^[a-f0-9]{64}$/i.test(cleanToken)) {
    notFound();
  }

  const proposal = await getPublicProposalByToken(cleanToken);
  if (!proposal) {
    notFound();
  }

  const directConfig = getDirectPaymentConfig();
  const directPayment: PublicDirectPaymentView | null =
    proposal.allowDirectTransfer && directConfig.enabled
      ? {
          hasBreb: directConfig.hasBreb,
          hasBankAccount: directConfig.hasBankAccount,
          brebKey: directConfig.brebKey,
          brebHolder: directConfig.brebHolder,
          bankName: directConfig.bankName,
          accountType: directConfig.accountType,
          accountNumber: directConfig.accountNumber,
          holderDoc: directConfig.holderDoc,
          instructions: directConfig.instructions,
          maxBrebCopCents: directConfig.maxBrebCopCents,
        }
      : null;

  const waSupportUrl = await buildWhatsAppUrl({
    kind: "support",
    subject: `Propuesta ${proposal.number}`,
  });

  const billingDocCopy = BILLING_DOCUMENT_ENABLED
    ? "Factura electrónica de venta DIAN o soporte contable según datos tributarios registrados."
    : "Cuenta de cobro y RUT (régimen no responsable de IVA) para causación contable.";

  const portalData: PublicProposalPortalData = {
    id: proposal.id,
    number: proposal.number,
    version: proposal.version,
    status: proposal.status,
    validUntilIso: proposal.validUntil.toISOString(),
    validUntilLabel: formatDateLongCO(proposal.validUntil),
    isExpired: proposal.isExpired,
    proofMode: proposal.proofMode,
    hasProofAsset: proposal.hasProofAsset,
    proofApprovedLabel: proposal.proofApprovedAt
      ? formatDateTimeCO(proposal.proofApprovedAt)
      : null,
    artworkMode: proposal.artworkMode,
    packagingType: proposal.packagingType,
    clientNotes: proposal.clientNotes,
    termsNotes: proposal.termsNotes,
    estimatedProductionDays: proposal.estimatedProductionDays,
    shippingMode: proposal.shippingMode,
    shippingCarrier: proposal.shippingCarrier,
    shippingService: proposal.shippingService,
    packageCount: proposal.packageCount,
    departmentCode: proposal.departmentCode,
    departmentName: proposal.departmentName,
    cityCode: proposal.cityCode,
    cityName: proposal.cityName,
    subtotalCents: proposal.subtotalCents,
    discountCents: proposal.discountCents,
    shippingCents: proposal.shippingCents,
    totalCents: proposal.totalCents,
    allowDirectTransfer: proposal.allowDirectTransfer,
    opportunity: proposal.opportunity,
    items: proposal.items,
    order: proposal.order
      ? {
          id: proposal.order.id,
          number: proposal.order.number,
          status: proposal.order.status,
          total: proposal.order.total,
          paymentMethod: proposal.order.paymentMethod,
          directPaymentMethod: proposal.order.directPaymentMethod,
          directPaymentReference: proposal.order.directPaymentReference,
          directPaymentReportedLabel: proposal.order.directPaymentReportedAt
            ? formatDateTimeCO(proposal.order.directPaymentReportedAt)
            : null,
          directPaymentConfirmedLabel: proposal.order.directPaymentConfirmedAt
            ? formatDateTimeCO(proposal.order.directPaymentConfirmedAt)
            : null,
        }
      : null,
  };

  return (
    <div className="bg-brand-cream/30 min-h-screen">
      <header className="border-brand-purple/10 border-b bg-white print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <LucamsLogo className="h-8 w-auto" />
          </Link>
          <a
            href={waSupportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-purple hover:text-brand-purple-dark text-sm font-medium underline-offset-4 hover:underline"
          >
            ¿Dudas con tu propuesta? Escríbenos
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <ProposalPortalClient
          rawToken={cleanToken}
          proposal={portalData}
          directPayment={directPayment}
          billingDocCopy={billingDocCopy}
          waSupportUrl={waSupportUrl}
        />
      </main>
    </div>
  );
}
