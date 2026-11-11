// App-side code pools for the current user + job (replaces reservation.ts and
// boxReservation.ts; same function names so Pack's flow is unchanged).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { request } from "./apiClient";
import { CodePool, type CodeKind } from "./codePool";
import { getScope } from "./scope";
import { userKey } from "./userState";

const pools = new Map<string, CodePool>();

function pool(kind: CodeKind): CodePool {
  const scope = getScope();
  if (!scope) throw new Error("No job selected");
  const key = userKey(scope.userId, `pool.${scope.jobId}.${kind}`);
  let p = pools.get(key);
  if (!p) {
    const jobId = scope.jobId;
    p = new CodePool(kind, key, {
      storage: { get: (k) => AsyncStorage.getItem(k), set: (k, v) => AsyncStorage.setItem(k, v) },
      reserve: (k, count) =>
        request<{ first: number; last: number }>("/codes/reserve", { body: { kind: k, count }, job: jobId }),
    });
    pools.set(key, p);
  }
  return p;
}

export function clearCodePools(): void {
  pools.clear();
}

export async function seedReservation(): Promise<void> {
  if (getScope()) await pool("item").warm();
}

export async function seedBoxReservation(): Promise<void> {
  if (getScope()) await pool("box").warm();
}

export function reserveCode(): Promise<string> {
  return pool("item").take();
}

export function releaseCode(code: string): void {
  if (getScope()) void pool("item").release(code);
}

export function reserveBoxCode(): Promise<string> {
  return pool("box").take();
}
