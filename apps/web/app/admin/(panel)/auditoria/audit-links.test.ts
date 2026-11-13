import { describe, expect, it } from "vitest";
import { resolveAuditEntityHref } from "./audit-links";

const resolve = resolveAuditEntityHref;

describe("resolveAuditEntityHref", () => {
  it.each([
    ["CmsField", "field-1", "cms.field.save", "/admin/contenido/campos/field-1"],
    ["CmsField", "batch", "cms.field.publish_batch", "/admin/contenido"],
    ["CmsField", "cms-cache", "cms.cache.purge", "/admin/contenido"],
    ["CmsField", "deleted-field", "cms.field.archive", "/admin/contenido"],
    ["Product", "product-1", "product.update", "/admin/productos/product-1"],
    ["Product", "product-1,product-2", "product.bulk", "/admin/productos"],
    ["Product", "deleted-product", "product.purge", "/admin/productos"],
    ["Category", "deleted-category", "category.archive", "/admin/categorias"],
    ["Category", "category-1", "category.update", "/admin/categorias/category-1"],
  ])(
    "resuelve %s/%s sin apuntar a recursos retirados",
    (entityType, entityId, action, expected) => {
      expect(resolve(entityType, entityId, null, action)).toBe(expected);
    },
  );

  it("resuelve ocasiones vigentes y archivadas con los nombres de acción reales y legacy", () => {
    expect(resolve("OcasionTag", "occasion-1", null, "ocasion.update")).toBe(
      "/admin/ocasiones/occasion-1",
    );
    expect(resolve("OcasionTag", "occasion-1", null, "ocasion.delete")).toBe("/admin/ocasiones");
    expect(resolve("Occasion", "occasion-1", null, "occasion.delete")).toBe("/admin/ocasiones");
    expect(resolve("ProductOcasionTag", "product:occasion", null, "ocasion.link_product")).toBe(
      "/admin/ocasiones",
    );
  });

  it.each([
    ["Task", { orderId: "order-cuid" }, "/admin/pedidos/order-cuid"],
    ["Task", { orderNumber: "LCM-2026-0042" }, "/admin/pedidos/LCM-2026-0042"],
    ["ContactActivity", { orderId: "order with spaces" }, "/admin/pedidos/order%20with%20spaces"],
    ["Task", { contactId: "contact-1", orderId: "order-1" }, "/admin/clientes/contact-1"],
  ])("resuelve %s por sus relaciones forenses disponibles", (entityType, metadata, expected) => {
    expect(resolve(entityType, "activity-1", metadata, "crm.update")).toBe(expected);
  });

  it.each([
    ["aveonline", "/admin/integraciones/aveonline"],
    ["lucams-shipping", "/admin/envios"],
    ["resend", "/admin/integraciones"],
  ])("conecta Integration/%s con su módulo vigente", (entityId, expected) => {
    expect(resolve("Integration", entityId, null, "shipping.carrier.save")).toBe(expected);
  });

  it.each([
    ["DesignGalleryImage", "gallery-1", null, "galleryImage.archive", "/admin/disenos"],
    ["LetterTileSet", "set-1", null, "letterTile.upsert", "/admin/disenos?tab=fichas"],
    [
      "ProductMaterial",
      "recipe-1",
      { productId: "product-1" },
      "product.material.add",
      "/admin/productos/product-1",
    ],
    ["ProductMaterial", "recipe-1", null, "product.material.remove", "/admin/materiales"],
    ["CmsMedia", "media-1", null, "cms.media.delete", "/admin/contenido/mediateca"],
    ["CmsSection", "section-1", null, "cms.section.update", "/admin/contenido"],
    ["CmsEditMode", "lucams_cms_edit", null, "cms.edit_mode.enable", "/admin/contenido"],
    [
      "EmailTemplateOverride",
      "order-confirmation:subject",
      null,
      "email_template.override_save",
      "/admin/email-templates/order-confirmation",
    ],
    [
      "EmailTemplateOverride",
      ":subject",
      null,
      "email_template.override_save",
      "/admin/email-templates",
    ],
  ])("mapea la entidad real %s", (entityType, entityId, metadata, action, expected) => {
    expect(resolve(entityType, entityId, metadata, action)).toBe(expected);
  });

  it("codifica identificadores para conservar enlaces internos", () => {
    expect(resolve("Product", "id/with?query", null, "product.update")).toBe(
      "/admin/productos/id%2Fwith%3Fquery",
    );
  });

  it("rechaza entidades desconocidas, ids vacíos y relaciones ausentes", () => {
    expect(resolve("UnknownEntity", "id-1", null, "unknown.action")).toBeNull();
    expect(resolve("Product", "", null, "product.update")).toBeNull();
    expect(resolve("Task", "task-1", [], "crm.update")).toBeNull();
    expect(resolve("Task", "task-1", { orderId: "   " }, "crm.update")).toBeNull();
  });
});
