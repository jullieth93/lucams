import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listTransactionsByReference } from "./wompi";

const ENV = {
  WOMPI_ENV: "sandbox",
  WOMPI_PUBLIC_KEY: "pub_test_fixed",
  WOMPI_PRIVATE_KEY: "prv_test_fixed",
  WOMPI_EVENTS_SECRET: "test_events_fixed",
  WOMPI_INTEGRITY_SECRET: "test_integrity_fixed",
};
const ORIGINAL_ENV = Object.fromEntries(Object.keys(ENV).map((key) => [key, process.env[key]]));

function transaction(reference: string, id: string) {
  return {
    id,
    reference,
    status: "DECLINED",
    amount_in_cents: 10_000,
    currency: "COP",
    customer_email: null,
    payment_method_type: "CARD",
    created_at: "2026-10-17T12:00:00Z",
    finalized_at: "2026-10-17T12:01:00Z",
    status_message: null,
  };
}

beforeEach(() => {
  Object.assign(process.env, ENV);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("listTransactionsByReference", () => {
  it("conserva todas las transacciones de la referencia, no solo la primera", async () => {
    const fetchMock = vi.fn(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: [transaction("REF-1", "tx-a"), transaction("REF-1", "tx-b")],
          }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listTransactionsByReference("REF-1");

    expect(result.map((tx) => tx.id)).toEqual(["tx-a", "tx-b"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sandbox.wompi.co/v1/transactions?reference=REF-1",
      expect.objectContaining({
        headers: { Authorization: "Bearer prv_test_fixed" },
        cache: "no-store",
      }),
    );
  });

  it("acepta una colección vacía comprobada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 })),
      ),
    );

    await expect(listTransactionsByReference("REF-EMPTY")).resolves.toEqual([]);
  });

  it("rechaza una transacción de otra referencia o incompleta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(JSON.stringify({ data: [transaction("OTHER", "tx-a")] }), {
            status: 200,
          }),
        ),
      ),
    );

    await expect(listTransactionsByReference("REF-1")).rejects.toThrow(
      /otra referencia|incompleta/,
    );
  });

  it("falla cerrado si la colección está paginada y sería incompleta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ data: [transaction("REF-1", "tx-a")], meta: { total_pages: 2 } }),
            { status: 200 },
          ),
        ),
      ),
    );

    await expect(listTransactionsByReference("REF-1")).rejects.toThrow(/paginada incompleta/);
  });
});
