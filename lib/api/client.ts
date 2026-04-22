/**
 * Fetch wrapper ke backend API routes.
 *
 * Semua fungsi di lib/api/* memakai helper `apiFetch` ini supaya error handling,
 * cookie credentials, dan base URL cuma didefinisikan sekali.
 */

type JsonBody = Record<string, unknown> | unknown[] | null;

interface ApiFetchInit extends Omit<RequestInit, "body"> {
  json?: JsonBody;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: ApiFetchInit["query"]): string {
  const base = path.startsWith("/") ? path : `/${path}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { json, query, headers, ...rest } = init;
  const res = await fetch(buildUrl(path, query), {
    ...rest,
    credentials: "include",
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : (rest as RequestInit).body,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message =
      (isJson && payload && typeof payload === "object" && "error" in (payload as object)
        ? (payload as { error?: string }).error
        : null) ?? `Request gagal (${res.status})`;
    throw new Error(message);
  }

  return payload as T;
}
