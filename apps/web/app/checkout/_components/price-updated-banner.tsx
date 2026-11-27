import { AlertCircle } from "lucide-react";

type Props = {
  message: string;
};

export function PriceUpdatedBanner({ message }: Props) {
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
      <div>
        <h3 className="text-sm font-semibold text-amber-900">
          Actualizamos los precios de tu carrito
        </h3>
        <p className="mt-1 text-xs text-amber-800">{message}</p>
      </div>
    </div>
  );
}
