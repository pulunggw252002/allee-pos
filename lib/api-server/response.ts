import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export function handle(fn: () => Promise<Response>) {
  return fn().catch((e) => {
    if (e instanceof ApiError) return err(e.status, e.message);
    if (e instanceof ZodError) {
      const msg = e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
      return err(400, msg);
    }
    console.error("[api] unhandled error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return err(500, message);
  });
}
