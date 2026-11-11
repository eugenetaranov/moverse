// Pure job-context rules (platform-foundation D10), unit-tested in Node:
// which org/job is current, and what chrome the app shows for it.

export type Role = "owner" | "admin" | "crew";

export interface MeOrg {
  id: string;
  name: string;
  kind: "company" | "personal";
  role: Role;
  plan: string;
}

export interface MeJob {
  id: string;
  orgId: string;
  name: string;
  clientName: string | null;
  status: "active" | "archived";
}

export interface Me {
  user: { id: string; email: string | null; isAnonymous: boolean; displayName: string };
  orgs: MeOrg[];
  jobs: MeJob[];
  defaults: { orgId: string | null; jobId: string | null };
}

export interface Current {
  orgId: string | null;
  jobId: string | null;
}

/** Last-used job if it's still accessible and active, else the server default. */
export function resolveCurrent(me: Me, saved: Current | null): Current {
  const job = saved?.jobId ? me.jobs.find((j) => j.id === saved.jobId && j.status === "active") : undefined;
  if (job) return { orgId: job.orgId, jobId: job.id };
  if (saved?.orgId && me.orgs.some((o) => o.id === saved.orgId)) {
    const inOrg = me.jobs.find((j) => j.orgId === saved.orgId && j.status === "active");
    return { orgId: saved.orgId, jobId: inOrg?.id ?? null };
  }
  return { orgId: me.defaults.orgId, jobId: me.defaults.jobId };
}

export interface Chrome {
  /** Show the job name in the header (hidden for a personal user's one move). */
  showJob: boolean;
  /** Tapping the header opens the job switcher. */
  canSwitchJob: boolean;
  /** The switcher also lists other orgs. */
  canSwitchOrg: boolean;
  /** Owner/admin of a company with no active job: prompt "Create your first job". */
  needsFirstJob: boolean;
  /** Crew with no assigned job: nothing to work on until an admin assigns one. */
  noJobAssigned: boolean;
  role: Role | null;
}

export function chromeFor(me: Me, cur: Current): Chrome {
  const org = me.orgs.find((o) => o.id === cur.orgId) ?? null;
  const role = org?.role ?? null;
  const activeInOrg = me.jobs.filter((j) => j.orgId === cur.orgId && j.status === "active");
  const multiOrg = me.orgs.length > 1;
  const personalSingle = org?.kind === "personal" && activeInOrg.length <= 1 && !multiOrg;
  return {
    showJob: !!cur.jobId && !personalSingle,
    canSwitchJob: !personalSingle && (activeInOrg.length > 1 || multiOrg || role !== "crew"),
    canSwitchOrg: multiOrg,
    needsFirstJob: !cur.jobId && org?.kind === "company" && (role === "owner" || role === "admin"),
    noJobAssigned: !cur.jobId && role === "crew",
    role,
  };
}
