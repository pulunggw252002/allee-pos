import { PosHeader } from "@/components/pos/pos-header";
import { ShiftGuard } from "@/components/pos/shift-guard";
import { SyncOutboxBanner } from "@/components/pos/sync-outbox-banner";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShiftGuard>
      <div className="flex min-h-screen flex-col bg-background">
        <PosHeader />
        <SyncOutboxBanner />
        <main className="flex-1">{children}</main>
      </div>
    </ShiftGuard>
  );
}
