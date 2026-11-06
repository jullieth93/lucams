"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { MfaReauthModal } from "@/components/admin/mfa-reauth";
import type { LifecycleActionResult } from "./actions";

export function useLifecycleSensitiveAction() {
  const [pending, startTransition] = useTransition();
  const [requiresReauth, setRequiresReauth] = useState(false);
  const actionRef = useRef<(() => Promise<LifecycleActionResult>) | null>(null);
  const resultRef = useRef<(result: LifecycleActionResult) => void>(() => {});

  const execute = useCallback(
    (
      action: () => Promise<LifecycleActionResult>,
      onResult: (result: LifecycleActionResult) => void,
    ) => {
      actionRef.current = action;
      resultRef.current = onResult;
      startTransition(async () => {
        const result = await action();
        if (result.reauthRequired) {
          setRequiresReauth(true);
          return;
        }
        onResult(result);
      });
    },
    [],
  );

  const retry = useCallback(() => {
    setRequiresReauth(false);
    if (actionRef.current) execute(actionRef.current, resultRef.current);
  }, [execute]);
  const cancel = useCallback(() => setRequiresReauth(false), []);

  return {
    pending,
    execute,
    reauthModal: requiresReauth ? <MfaReauthModal onVerified={retry} onCancel={cancel} /> : null,
  };
}
