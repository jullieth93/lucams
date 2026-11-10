import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  NEW_PRODUCTS,
  NEW_PRODUCT_GALLERY,
  buildNewProductTemplates,
  gallerySvg,
  productCoverSvg,
  templatePreviewSvg,
  templateSvg,
} from "./lib/new-products.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const templatesDir = join(root, "apps/web/public/templates");
const productsDir = join(root, "apps/web/public/products");

async function writeAsset(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

for (const item of NEW_PRODUCT_GALLERY) {
  await writeAsset(join(templatesDir, `${item.fileBase}.svg`), gallerySvg(item));
}

for (const template of buildNewProductTemplates({})) {
  const previewName = template.previewUrl.split("/").pop();
  await writeAsset(join(templatesDir, previewName), templatePreviewSvg(template));
  for (const layer of template.canvasData.layers) {
    if (layer.type !== "asset") continue;
    const assetName = layer.src.split("/").pop();
    await writeAsset(join(templatesDir, assetName), templateSvg(template));
  }
}

for (const product of NEW_PRODUCTS) {
  const svg = productCoverSvg(product.slug);
  const base = product.slug.replace(/-personalizada$/, "").replace(/-magneticos$/, "-magneticos");
  const svgPath = join(productsDir, `${base}.svg`);
  const webpPath = join(productsDir, `${base}.webp`);
  await writeAsset(svgPath, svg);
  await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(webpPath);
}

console.log(
  `Activos generados: ${NEW_PRODUCT_GALLERY.length} prediseñados, ${buildNewProductTemplates({}).length} plantillas y ${NEW_PRODUCTS.length} portadas.`,
);
