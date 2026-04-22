"use client";

import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumpadProps {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  allowClear?: boolean;
  className?: string;
}

export function Numpad({
  value,
  onChange,
  maxLength = 12,
  allowClear = true,
  className,
}: NumpadProps) {
  const push = (ch: string) => {
    if (value.length >= maxLength) return;
    if (ch === "0" && value === "0") return;
    if (value === "0") {
      onChange(ch);
      return;
    }
    onChange(value + ch);
  };

  const backspace = () => {
    if (value.length <= 1) onChange("0");
    else onChange(value.slice(0, -1));
  };

  const clear = () => onChange("0");

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {keys.map((k) => (
        <Button
          key={k}
          type="button"
          variant="secondary"
          size="xl"
          className="h-16 text-2xl font-semibold tabular"
          onClick={() => push(k)}
        >
          {k}
        </Button>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="xl"
        className="h-16 text-base font-semibold"
        onClick={clear}
        disabled={!allowClear}
      >
        C
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="xl"
        className="h-16 text-2xl font-semibold tabular"
        onClick={() => push("0")}
      >
        0
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="xl"
        className="h-16"
        onClick={backspace}
      >
        <Delete className="h-6 w-6" />
      </Button>
    </div>
  );
}

export function parseNumpadValue(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}
