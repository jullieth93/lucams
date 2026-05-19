"use client";

/*
 * <Slider> — wrapper de Radix Slider con tokens brand.
 *
 * Bug fix 2026-05-18: el shadcn boilerplate usaba `data-horizontal:*`
 * y `data-vertical:*` que NUNCA matcheaban con Radix v1+ (que setea
 * `data-orientation="horizontal"`). Resultado: track con height 0px,
 * thumbs invisibles. Fix: `data-[orientation=horizontal]:*` correcto.
 */

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50",
        "data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "bg-brand-purple/15 relative grow overflow-hidden rounded-full",
          "data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:w-full",
          "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2",
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "bg-brand-purple absolute select-none",
            "data-[orientation=horizontal]:h-full",
            "data-[orientation=vertical]:w-full",
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className={cn(
            "border-brand-purple ring-brand-purple/30 relative block size-5 shrink-0 cursor-grab rounded-full border-2 bg-white shadow-md transition-[color,box-shadow,transform] select-none",
            "hover:scale-110 hover:ring-4",
            "focus-visible:ring-4 focus-visible:outline-hidden",
            "active:cursor-grabbing active:ring-4",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
