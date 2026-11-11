// apiCore wired to the real session and the current job (JobContext sets it).
import { API_URL } from "./config";
import { createApi } from "./apiCore";
import { accessToken, refreshToken } from "./session";

export { ApiError, isNetworkError } from "./apiCore";

let currentJobId: string | null = null;
let authFailed: () => void = () => {};

export function setApiJob(jobId: string | null): void {
  currentJobId = jobId;
}

export function getApiJob(): string | null {
  return currentJobId;
}

/** JobContext registers sign-out here so a dead session returns to Welcome. */
export function onAuthFailed(fn: () => void): void {
  authFailed = fn;
}

export const request = createApi({
  baseUrl: API_URL,
  getToken: accessToken,
  refresh: refreshToken,
  onAuthFailed: () => authFailed(),
  getJobId: () => currentJobId,
});
