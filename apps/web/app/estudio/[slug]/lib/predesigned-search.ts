export function normalizePredesignedQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim()
    .replace(/\s+/g, " ");
}

export function filterPredesignedByName<T extends { name: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const normalized = normalizePredesignedQuery(query);
  if (!normalized) return [...items];
  const terms = normalized.split(" ");
  return items.filter((item) => {
    const name = normalizePredesignedQuery(item.name);
    return terms.every((term) => name.includes(term));
  });
}

export function assistedDesignRequestHref(productSlug: string, query: string): string {
  const params = new URLSearchParams({
    asunto: "PERSONALIZACION",
    producto: productSlug,
  });
  const cleaned = query.trim().slice(0, 200);
  if (cleaned) params.set("busqueda", cleaned);
  return `/contacto?${params.toString()}`;
}
