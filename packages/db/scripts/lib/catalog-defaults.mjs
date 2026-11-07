export function shouldSeedDefaultPhysicalSpecs(product) {
  if (product.personalizationSchema?.experience) return false;
  const specs = product.physicalSpecs;
  return (
    specs == null ||
    (typeof specs === "object" && !Array.isArray(specs) && Object.keys(specs).length === 0)
  );
}
