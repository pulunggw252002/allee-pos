import type {
  CloseShiftInput,
  OpenShiftInput,
  Shift,
  ShiftSummary,
} from "@/lib/types";
import { apiFetch } from "./client";

export async function openShift(input: OpenShiftInput): Promise<Shift> {
  return apiFetch<Shift>("/api/shifts", {
    method: "POST",
    json: {
      openingCash: input.openingCash,
      note: input.note,
    },
  });
}

export async function getActiveShift(): Promise<Shift | null> {
  return apiFetch<Shift | null>("/api/shifts/active");
}

export async function getShift(id: string): Promise<Shift | null> {
  try {
    return await apiFetch<Shift>(`/api/shifts/${id}`);
  } catch {
    return null;
  }
}

export async function getShiftSummary(shiftId: string): Promise<ShiftSummary> {
  return apiFetch<ShiftSummary>(`/api/shifts/${shiftId}/summary`);
}

export async function closeShift(input: CloseShiftInput): Promise<ShiftSummary> {
  return apiFetch<ShiftSummary>(`/api/shifts/${input.shiftId}/close`, {
    method: "POST",
    json: { actualCash: input.actualCash },
  });
}
