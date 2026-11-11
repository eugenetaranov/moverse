// The signed-in user and current job, set by JobContext. Plain module state so
// non-React modules (code pools, current box, inventory cache) can key their
// data by user and job.
export interface Scope {
  userId: string;
  jobId: string;
}

let scope: Scope | null = null;

export function setScope(next: Scope | null): void {
  scope = next;
}

export function getScope(): Scope | null {
  return scope;
}
