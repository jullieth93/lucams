export function resolveAuditEntityHref(
  entityType: string,
  entityId: string,
  metadata: unknown,
  action: string,
): string | null {
  if (!entityId) return null;
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;

  switch (entityType) {
    case "Order": {
      if (entityId === "mes" || entityId === "7d" || entityId === "30d" || entityId === "90d") {
        return `/admin/finanzas?periodo=${encodeURIComponent(entityId)}`;
      }
      const orderNum =
        typeof meta?.orderNumber === "string" && meta.orderNumber.trim()
          ? meta.orderNumber.trim()
          : entityId;
      return `/admin/pedidos/${encodeURIComponent(orderNum)}`;
    }
    case "Product":
      return entityId.includes(",") || action === "product.purge"
        ? "/admin/productos"
        : `/admin/productos/${encodeURIComponent(entityId)}`;
    case "ProductVariant":
      return "/admin/inventario";
    case "Category":
      return action === "category.archive"
        ? "/admin/categorias"
        : `/admin/categorias/${encodeURIComponent(entityId)}`;
    case "Occasion":
    case "OcasionTag":
      return action === "occasion.delete" || action === "ocasion.delete"
        ? "/admin/ocasiones"
        : `/admin/ocasiones/${encodeURIComponent(entityId)}`;
    case "ProductOcasionTag":
      return "/admin/ocasiones";
    case "Contact":
    case "Customer":
      return `/admin/clientes/${encodeURIComponent(entityId)}`;
    case "IdentityMergeCandidate": {
      if (typeof meta?.survivorContactId === "string" && meta.survivorContactId) {
        return `/admin/clientes/${encodeURIComponent(meta.survivorContactId)}`;
      }
      if (meta?.reopened === true) {
        return "/admin/clientes/duplicados?status=PENDING";
      }
      return "/admin/clientes/duplicados?status=ALL";
    }
    case "ContactActivity":
    case "Task": {
      if (typeof meta?.opportunityId === "string" && meta.opportunityId) {
        return `/admin/oportunidades/${encodeURIComponent(meta.opportunityId)}`;
      }
      if (typeof meta?.contactId === "string" && meta.contactId) {
        return `/admin/clientes/${encodeURIComponent(meta.contactId)}`;
      }
      if (typeof meta?.supportTicketId === "string" && meta.supportTicketId) {
        return `/admin/soporte/${encodeURIComponent(meta.supportTicketId)}`;
      }
      const orderRef =
        typeof meta?.orderNumber === "string" && meta.orderNumber.trim()
          ? meta.orderNumber.trim()
          : typeof meta?.orderId === "string" && meta.orderId.trim()
            ? meta.orderId.trim()
            : null;
      return orderRef ? `/admin/pedidos/${encodeURIComponent(orderRef)}` : null;
    }
    case "Opportunity":
      return `/admin/oportunidades/${encodeURIComponent(entityId)}`;
    case "Coupon":
      return `/admin/cupones/${encodeURIComponent(entityId)}`;
    case "SupportTicket":
      return `/admin/soporte/${encodeURIComponent(entityId)}`;
    case "WarrantyClaim":
      return `/admin/garantias?status=all&q=${encodeURIComponent(entityId)}`;
    case "RetractRequest":
      return `/admin/retractos?status=all&q=${encodeURIComponent(entityId)}`;
    case "Review":
      return entityId === "bulk" || entityId.includes(",")
        ? "/admin/resenas?status=all"
        : `/admin/resenas?status=all&q=${encodeURIComponent(entityId)}`;
    case "Design": {
      if (typeof meta?.orderNumber === "string" && meta.orderNumber.trim()) {
        return `/admin/pedidos/${encodeURIComponent(meta.orderNumber.trim())}`;
      }
      return "/admin/moderacion?vista=historial";
    }
    case "DesignGalleryImage":
      return "/admin/disenos";
    case "LetterTileSet":
      return "/admin/disenos?tab=fichas";
    case "PersonalizationTemplate":
      return "/admin/plantillas";
    case "Cart":
    case "AbandonedCart":
      return entityId.includes(",")
        ? "/admin/carritos"
        : `/admin/carritos/${encodeURIComponent(entityId)}`;
    case "LifecycleJourney":
      return `/admin/lifecycle/${encodeURIComponent(entityId)}`;
    case "LifecycleEnrollment":
    case "LifecycleMessage":
      if (typeof meta?.journeyId === "string" && meta.journeyId.trim()) {
        return `/admin/lifecycle/${encodeURIComponent(meta.journeyId.trim())}`;
      }
      return "/admin/lifecycle";
    case "EmailTemplate":
      return `/admin/email-templates/${encodeURIComponent(entityId)}`;
    case "EmailTemplateOverride": {
      const templateId = entityId.split(":")[0]?.trim();
      return templateId
        ? `/admin/email-templates/${encodeURIComponent(templateId)}`
        : "/admin/email-templates";
    }
    case "CmsBlock":
      return `/admin/contenido/bloques/${encodeURIComponent(entityId)}`;
    case "CmsField":
      return entityId === "batch" || entityId === "cms-cache" || action === "cms.field.archive"
        ? "/admin/contenido"
        : `/admin/contenido/campos/${encodeURIComponent(entityId)}`;
    case "CmsPage":
    case "CmsSection":
    case "CmsEditMode":
      return "/admin/contenido";
    case "CmsMedia":
      return "/admin/contenido/mediateca";
    case "AdminUser":
      return "/admin/usuarios";
    case "Material":
      return "/admin/materiales";
    case "ProductMaterial":
      return typeof meta?.productId === "string" && meta.productId.trim()
        ? `/admin/productos/${encodeURIComponent(meta.productId.trim())}`
        : "/admin/materiales";
    case "UrlRedirect":
    case "Redirect":
      return "/admin/redirects";
    case "Notification":
      return "/admin/notificaciones?vista=all";
    case "ErrorReport":
      return "/admin/observability";
    case "AdminHelpFeedback":
    case "AdminHelpProgress":
      return entityId === "*"
        ? "/admin/ayuda"
        : `/admin/ayuda?guia=${encodeURIComponent(entityId)}`;
    case "CodBlocklist":
    case "BlockedIdentity":
      return "/admin/finanzas/bloqueos";
    case "Consent":
      if (entityId.startsWith("CRM_SEGMENT:")) {
        const seg = entityId.slice("CRM_SEGMENT:".length).trim();
        return seg
          ? `/admin/marketing/segmentos?segment=${encodeURIComponent(seg)}`
          : "/admin/marketing/segmentos";
      }
      return "/admin/marketing/suscriptores";
    case "Integration":
      if (entityId === "aveonline") return "/admin/integraciones/aveonline";
      if (entityId === "lucams-shipping") return "/admin/envios";
      return "/admin/integraciones";
    case "ShippingZone":
    case "CarrierConfig":
      return "/admin/envios";
    case "WholesaleTier":
      return "/admin/mayorista";
    case "SystemSetting":
      if (entityId === "lifecycle") {
        return "/admin/lifecycle";
      }
      return "/admin/contenido/paginas/global";
    case "Setting":
      if (entityId === "loyalty" || entityId === "referrals") {
        return "/admin/fidelizacion";
      }
      if (entityId === "cart-recovery") {
        return "/admin/carritos/configuracion";
      }
      return "/admin/contenido/paginas/global";
    default:
      return null;
  }
}
