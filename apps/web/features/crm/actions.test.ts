import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "FINANCE_ANALYST" as string,
  taskFindUnique: vi.fn(),
  createCrmTask: vi.fn(),
  createContactActivity: vi.fn(),
  updateCrmTaskStatus: vi.fn(),
  recordAdminAction: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { task: { findUnique: mocks.taskFindUnique } } }));
vi.mock("@/lib/admin-rbac-guard", () => ({
  requireAdminAction: vi.fn(async () => ({
    admin: { id: "adm_self", role: mocks.role },
  })),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: mocks.recordAdminAction }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("./service", () => ({
  createCrmTask: mocks.createCrmTask,
  createContactActivity: mocks.createContactActivity,
  updateCrmTaskStatus: mocks.updateCrmTaskStatus,
  CrmValidationError: class CrmValidationError extends Error {},
}));

import { createCrmTaskAction, updateCrmTaskStatusAction } from "./actions";

function taskFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "task_1",
    ownerAdminId: "adm_other",
    createdByAdminId: "adm_other",
    contactId: "contact_1",
    orderId: null,
    supportTicketId: null,
    opportunityId: null,
    ...overrides,
  };
}

function statusForm() {
  const form = new FormData();
  form.set("taskId", "task_1");
  form.set("status", "DONE");
  return form;
}

function createForm(ownerAdminId: string) {
  const form = new FormData();
  form.set("title", "Revisar pedido asignado");
  form.set("orderId", "order_1");
  form.set("ownerAdminId", ownerAdminId);
  return form;
}

describe("CRM actions — alcance horizontal de tareas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "FINANCE_ANALYST";
    mocks.createCrmTask.mockImplementation(async (input) => ({
      id: "task_new",
      priority: "NORMAL",
      ownerAdminId: input.ownerAdminId,
      contactId: input.contactId,
      orderId: input.orderId,
      supportTicketId: input.supportTicketId,
      opportunityId: input.opportunityId,
    }));
    mocks.updateCrmTaskStatus.mockImplementation(async ({ status }) => ({
      ...taskFixture(),
      status,
    }));
  });

  it("FINANCE_ANALYST no crea tareas de pedidos para otro responsable, pero sí para sí mismo", async () => {
    const denied = await createCrmTaskAction(null, createForm("adm_other"));
    expect(denied?.error).toContain("asignadas a ti");
    expect(mocks.createCrmTask).not.toHaveBeenCalled();

    const allowed = await createCrmTaskAction(null, createForm("adm_self"));
    expect(allowed?.success).toBeTruthy();
    expect(mocks.createCrmTask).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order_1", ownerAdminId: "adm_self" }),
    );
  });

  it("una tarea de pedido ajena exige orders:transition o support:manage", async () => {
    mocks.taskFindUnique.mockResolvedValue(taskFixture({ orderId: "order_1" }));
    const denied = await updateCrmTaskStatusAction(null, statusForm());
    expect(denied?.error).toContain("tarea del pedido");
    expect(mocks.updateCrmTaskStatus).not.toHaveBeenCalled();

    mocks.role = "CUSTOMER_SUPPORT";
    const allowed = await updateCrmTaskStatusAction(null, statusForm());
    expect(allowed?.success).toBeTruthy();
    expect(mocks.updateCrmTaskStatus).toHaveBeenCalledWith({ taskId: "task_1", status: "DONE" });
  });

  it("el dueño o creador sí puede cerrar su tarea de pedido aunque no tenga capacidad operativa", async () => {
    mocks.taskFindUnique.mockResolvedValue(
      taskFixture({ orderId: "order_1", createdByAdminId: "adm_self" }),
    );

    const result = await updateCrmTaskStatusAction(null, statusForm());

    expect(result?.success).toBeTruthy();
    expect(mocks.updateCrmTaskStatus).toHaveBeenCalledOnce();
  });

  it("contacts:read_360 no permite cerrar una tarea privada asignada a otro admin", async () => {
    mocks.role = "CUSTOMER_SUPPORT";
    mocks.taskFindUnique.mockResolvedValue(taskFixture());

    const result = await updateCrmTaskStatusAction(null, statusForm());

    expect(result?.error).toContain("tarea privada");
    expect(mocks.updateCrmTaskStatus).not.toHaveBeenCalled();
  });

  it("un supervisor sí puede cerrar una tarea privada de otro responsable", async () => {
    mocks.role = "OPERATIONS_MANAGER";
    mocks.taskFindUnique.mockResolvedValue(taskFixture());

    const result = await updateCrmTaskStatusAction(null, statusForm());

    expect(result?.success).toBeTruthy();
    expect(mocks.updateCrmTaskStatus).toHaveBeenCalledOnce();
  });

  it("crear una tarea privada no permite cerrarla después de asignarla a otro admin", async () => {
    mocks.role = "CUSTOMER_SUPPORT";
    mocks.taskFindUnique.mockResolvedValue(taskFixture({ createdByAdminId: "adm_self" }));

    const result = await updateCrmTaskStatusAction(null, statusForm());

    expect(result?.error).toContain("tarea privada");
    expect(mocks.updateCrmTaskStatus).not.toHaveBeenCalled();
  });

  it("una tarea de oportunidad exige opportunities:manage incluso si el actor la creó", async () => {
    mocks.taskFindUnique.mockResolvedValue(
      taskFixture({ opportunityId: "opp_1", createdByAdminId: "adm_self" }),
    );

    const result = await updateCrmTaskStatusAction(null, statusForm());

    expect(result?.error).toContain("oportunidades");
    expect(mocks.updateCrmTaskStatus).not.toHaveBeenCalled();
  });
});
