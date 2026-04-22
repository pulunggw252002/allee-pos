import { PosHeader } from "@/components/pos/pos-header";
import { ShiftGuard } from "@/components/pos/shift-guard";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShiftGuard>
      <div className="flex min-h-screen flex-col bg-background">
        <PosHeader />
        <main className="flex-1">{children}</main>
      </div>
    </ShiftGuard>
  );
}
