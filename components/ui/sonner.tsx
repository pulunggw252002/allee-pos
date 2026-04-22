"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster(props: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      toastOptions={{
        classNames: {
          toast: "rounded-lg border bg-background text-foreground shadow",
        },
      }}
      {...props}
    />
  );
}
