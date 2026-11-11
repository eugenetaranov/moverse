// The app's one fetch wrapper (platform-foundation D6), kept free of React
// Native imports so it can be unit-tested in Node (apiCore.test.ts):
//   * Authorization: Bearer <session JWT>, X-Moverse-Job: <current job>
//   * on 401: refresh the session and retry once; a second 401 signs out
//   * non-2xx -> ApiError with the server's { error } code

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public body: Record<string, unknown> = {},
  ) {
    super(`${code} (${status})`);
  }
}

/** True for network failures (offline), as opposed to an HTTP error. */
export function isNetworkError(e: unknown): boolean {
  return !(e instanceof ApiError);
}

export interface ApiDeps {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  refresh: () => Promise<string | null>;
  onAuthFailed: () => void | Promise<void>;
  getJobId: () => string | null;
  fetchFn?: typeof fetch;
}

export interface RequestOpts {
  method?: "GET" | "POST";
  body?: unknown;
  query?: Record<string, string | undefined>;
  /** true (default): send the current job; false: none; string: this job. */
  job?: boolean | string;
}

export function createApi(deps: ApiDeps) {
  const doFetch = deps.fetchFn ?? fetch;

  async function send(path: string, opts: RequestOpts, token: string | null): Promise<Response> {
    const url = new URL(deps.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    const job = opts.job === undefined || opts.job === true ? deps.getJobId() : opts.job || null;
    if (job) headers["x-moverse-job"] = job;
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    return doFetch(url.toString(), { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
  }

  return async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    let res = await send(path, opts, await deps.getToken());
    if (res.status === 401) {
      const fresh = await deps.refresh();
      if (fresh) res = await send(path, opts, fresh);
      if (res.status === 401) {
        await deps.onAuthFailed();
        throw new ApiError(401, "unauthenticated");
      }
    }
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      // Non-JSON error page (proxy, 502): fall through with the status.
    }
    if (!res.ok) throw new ApiError(res.status, String(data.error ?? `http_${res.status}`), data);
    return data as T;
  };
}
