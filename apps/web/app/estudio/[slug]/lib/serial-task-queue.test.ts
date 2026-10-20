import { describe, expect, it } from "vitest";
import { createSerialTaskQueue } from "./serial-task-queue";

describe("createSerialTaskQueue", () => {
  it("ejecuta una tarea a la vez y conserva el orden", async () => {
    const queue = createSerialTaskQueue();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.run(async () => {
      events.push("start:a");
      await firstGate;
      events.push("end:a");
      return "a";
    });
    const second = queue.run(async () => {
      events.push("start:b");
      return "b";
    });

    await Promise.resolve();
    expect(events).toEqual(["start:a"]);
    releaseFirst?.();
    await expect(first).resolves.toBe("a");
    await expect(second).resolves.toBe("b");
    expect(events).toEqual(["start:a", "end:a", "start:b"]);
  });

  it("un fallo no envenena la cola siguiente", async () => {
    const queue = createSerialTaskQueue();
    const failed = queue.run(async () => {
      throw new Error("fallo transitorio");
    });
    const next = queue.run(async () => "recuperado");

    await expect(failed).rejects.toThrow("fallo transitorio");
    await expect(next).resolves.toBe("recuperado");
  });

  it("la tarea lee el estado vigente cuando le toca ejecutarse, no cuando se encola", async () => {
    const queue = createSerialTaskQueue();
    let value = "a";
    let releaseFirst: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = queue.run(() => gate);
    const second = queue.run(async () => value);

    value = "b";
    releaseFirst?.();
    await first;
    await expect(second).resolves.toBe("b");
  });
});
