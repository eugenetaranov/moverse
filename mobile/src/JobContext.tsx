// The signed-in user's tenant state (platform-foundation D10): the /me result,
// the current org + job (persisted per user), and the auth lifecycle.
//
// Everything that talks to the API reads the current job from here (via
// apiClient's job header and scope.ts). Sign-out wipes every cache, pool and
// preference keyed to the user.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { onAuthFailed, request, setApiJob } from "./apiClient";
import { clearCodePools } from "./codes";
import { clearAllInventoryCaches } from "./inventory";
import { chromeFor, resolveCurrent, type Chrome, type Current, type Me, type MeJob, type MeOrg } from "./jobPrefs";
import { setScope } from "./scope";
import { signOutSupabase, supabase } from "./session";
import { userKey, wipeUserState } from "./userState";

export type Intent = { intent: "personal" } | { intent: "company"; orgName: string };

type Status = "loading" | "signedOut" | "ready" | "error";

interface JobCtxValue {
  status: Status;
  error: string;
  me: Me | null;
  org: MeOrg | null;
  job: MeJob | null;
  chrome: Chrome | null;
  /** An invite token from a deep link or the join scanner, awaiting consumption. */
  pendingInvite: string | null;
  setPendingInvite(token: string | null): void;
  /** Auth screens call this BEFORE verifying, so the right workspace is created. */
  setSignupIntent(intent: Intent | null): void;
  selectJob(jobId: string): Promise<void>;
  selectOrg(orgId: string): Promise<void>;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}

const Ctx = createContext<JobCtxValue | null>(null);

export function useJob(): JobCtxValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useJob outside JobProvider");
  return v;
}

/** Invite token from moverse://j/<t> or https://<host>/j/<t>. */
export function inviteTokenFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = /(?:^moverse:\/\/|\/)j\/([A-Za-z0-9_-]{16,})\/?(?:[?#].*)?$/.exec(url.trim());
  return m ? m[1] : null;
}

export function JobProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [cur, setCur] = useState<Current>({ orgId: null, jobId: null });
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const intentRef = useRef<Intent | null>(null);
  const userRef = useRef<string | null>(null);

  const apply = useCallback(async (m: Me, next: Current) => {
    setMe(m);
    setCur(next);
    setApiJob(next.jobId);
    setScope(next.jobId ? { userId: m.user.id, jobId: next.jobId } : null);
    try {
      await AsyncStorage.setItem(userKey(m.user.id, "current"), JSON.stringify(next));
    } catch {
      // best effort
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const intent = intentRef.current;
      if (intent) {
        await request("/account/provision", {
          job: false,
          body: intent.intent === "company" ? intent : { intent: "personal" },
        });
        intentRef.current = null;
      }
      const m = await request<Me>("/me", { job: false });
      let saved: Current | null = null;
      try {
        const raw = await AsyncStorage.getItem(userKey(m.user.id, "current"));
        saved = raw ? (JSON.parse(raw) as Current) : null;
      } catch {
        saved = null;
      }
      userRef.current = m.user.id;
      await apply(m, resolveCurrent(m, saved));
      setStatus("ready");
      setError("");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setStatus("error");
    }
  }, [apply]);

  const clearLocal = useCallback(async () => {
    const uid = userRef.current;
    userRef.current = null;
    setApiJob(null);
    setScope(null);
    clearAllInventoryCaches();
    clearCodePools();
    if (uid) await wipeUserState(uid);
    setMe(null);
    setCur({ orgId: null, jobId: null });
  }, []);

  const signOut = useCallback(async () => {
    await clearLocal();
    await signOutSupabase();
    setStatus("signedOut");
  }, [clearLocal]);

  // Auth lifecycle: load tenant state on sign-in, wipe on sign-out.
  useEffect(() => {
    onAuthFailed(() => void signOut());
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        void clearLocal().then(() => setStatus("signedOut"));
      } else if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        if (session.user.id !== userRef.current) {
          setStatus("loading");
          // Defer out of the auth callback (supabase-js holds a lock during it).
          setTimeout(() => void load(), 0);
        }
      }
    });
    return () => data.subscription.unsubscribe();
  }, [load, clearLocal, signOut]);

  // Invite deep links, from a cold start or while running.
  const url = Linking.useURL();
  useEffect(() => {
    const token = inviteTokenFromUrl(url);
    if (token) setPendingInvite(token);
  }, [url]);

  const selectJob = useCallback(
    async (jobId: string) => {
      if (!me) return;
      const job = me.jobs.find((j) => j.id === jobId);
      if (job) await apply(me, { orgId: job.orgId, jobId: job.id });
    },
    [me, apply],
  );

  const selectOrg = useCallback(
    async (orgId: string) => {
      if (me) await apply(me, resolveCurrent(me, { orgId, jobId: null }));
    },
    [me, apply],
  );

  const value = useMemo<JobCtxValue>(() => {
    const org = me?.orgs.find((o) => o.id === cur.orgId) ?? null;
    const job = me?.jobs.find((j) => j.id === cur.jobId) ?? null;
    return {
      status,
      error,
      me,
      org,
      job,
      chrome: me ? chromeFor(me, cur) : null,
      pendingInvite,
      setPendingInvite,
      setSignupIntent: (i) => {
        intentRef.current = i;
      },
      selectJob,
      selectOrg,
      refresh: load,
      signOut,
    };
  }, [status, error, me, cur, pendingInvite, selectJob, selectOrg, load, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
