"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { payWompiAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      size="lg"
      className="bg-gradient-brand w-full text-white hover:brightness-110 sm:w-auto"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirigiendo a Wompi…
        </>
      ) : (
        <>
          <Lock className="mr-2 h-4 w-4" />
          Pagar con Wompi
        </>
      )}
    </Button>
  );
}

export function PayWompiForm() {
  return (
    <form action={payWompiAction}>
      <SubmitButton />
    </form>
  );
}
