import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notifications: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/admin-rbac-guard", () => ({
  requireCapability: vi.fn(async () => ({
    admin: { id: "adm_ops", role: "OPERATIONS_MANAGER" },
  })),
}));
vi.mock("@/features/notifications/service", () => ({
  listNotifications: vi.fn(async () => mocks.notifications),
  getNotificationPulseAndSummary: vi.fn(async () => ({
    unreadCount: mocks.notifications.length,
    priorityUnreadCount: 0,
    windowTotal: mocks.notifications.length,
    commercialWindowCount: 0,
    byType: { ORDER: 0, QUOTE: 0, ALERT: 0, CRON: 0, SYSTEM: 0 },
    buckets: [],
  })),
}));
vi.mock("@/components/admin-page", () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    AdminPage: Passthrough,
    AdminPageHeader: () => null,
    AdminPageBody: Passthrough,
    AdminButton: Passthrough,
    AdminCard: Passthrough,
    AdminComboBarLineChart: () => null,
    AdminSegmentedBar: () => null,
    AdminEmpty: () => null,
  };
});
vi.mock("@/components/admin/count-up", () => ({
  CountUp: ({ value }: { value: number }) => value,
}));
vi.mock("./actions", () => ({
  markReadAction: vi.fn(async () => {}),
  markAllReadAction: vi.fn(async () => {}),
}));

import AdminNotificacionesPage from "./page";

function notification(id: string, actionUrl: string, actionLabel: string) {
  return {
    id,
    type: "ORDER",
    severity: "info",
    title: `Aviso ${id}`,
    detail: "Detalle operativo",
    actionUrl,
    actionLabel,
    readAt: null,
    createdAt: new Date("2026-11-12T12:00:00Z"),
  };
}

describe("AdminNotificacionesPage — enlaces de acción seguros", () => {
  beforeEach(() => {
    mocks.notifications = [
      notification("safe-admin", "/admin/pedidos/LCM-2026-0001", "Abrir pedido seguro"),
      notification("safe-public", "/pedido/token-seguro", "Abrir seguimiento seguro"),
      notification("denied-admin", "/admin/metricas", "Abrir métricas denegadas"),
      notification("external", "https://evil.example/robo", "Abrir externo"),
      notification("protocol-relative", "//evil.example/robo", "Abrir protocolo externo"),
      notification("backslash", "/\\evil.example/robo", "Abrir barra invertida"),
    ];
  });

  it("solo serializa enlaces internos seguros y accesibles para el rol", async () => {
    const page = await AdminNotificacionesPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Abrir pedido seguro");
    expect(html).toContain('href="/admin/pedidos/LCM-2026-0001"');
    expect(html).toContain("Abrir seguimiento seguro");
    expect(html).toContain('href="/pedido/token-seguro"');
    expect(html).not.toContain("Abrir métricas denegadas");
    expect(html).not.toContain("Abrir externo");
    expect(html).not.toContain("Abrir protocolo externo");
    expect(html).not.toContain("Abrir barra invertida");
    expect(html).not.toContain("evil.example");
  });
});
