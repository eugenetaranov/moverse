// Supabase auth for the app (platform-foundation D2). supabase-js is used ONLY
// for auth; all data goes through the API (apiClient.ts).
//
// Sessions persist with the "LargeSecureStore" pattern: SecureStore holds a
// random AES key (its ~2 KB limit is too small for a session), and the session
// itself is AES-CTR encrypted in AsyncStorage. Auto-refresh runs only while the
// app is in the foreground.
import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import aesjs from "aes-js";
import { createClient, type Session } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const keyBytes = Crypto.getRandomBytes(32);
    const ctr = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
    const encrypted = ctr.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(keyBytes));
    return aesjs.utils.hex.fromBytes(encrypted);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const hexKey = await SecureStore.getItemAsync(key);
    if (!hexKey) return null;
    const ctr = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(hexKey), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(ctr.decrypt(aesjs.utils.hex.toBytes(value)));
  }

  // SecureStore keys allow only [A-Za-z0-9._-].
  private skey(key: string): string {
    return key.replace(/[^A-Za-z0-9._-]/g, "_");
  }

  async getItem(key: string): Promise<string | null> {
    const enc = await AsyncStorage.getItem(key);
    if (!enc) return null;
    return this.decrypt(this.skey(key), enc);
  }

  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, await this.encrypt(this.skey(key), value));
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(this.skey(key));
  }
}

export const supabase = createClient(SUPABASE_URL || "http://localhost", SUPABASE_ANON_KEY || "missing", {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export async function currentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function accessToken(): Promise<string | null> {
  return (await currentSession())?.access_token ?? null;
}

/** Force a refresh (apiClient calls this once after a 401). */
export async function refreshToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

/* ---------------- sign-in methods ---------------- */

export async function sendEmailCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error(error.message);
}

export async function verifyEmailCode(email: string, code: string): Promise<Session> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: "email",
  });
  if (error || !data.session) throw new Error(error?.message ?? "Invalid code");
  return data.session;
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error || !data.session) throw new Error(error?.message ?? "Sign-in failed");
  return data.session;
}

/** Crew join without email: only ever called as part of consuming an invite. */
export async function signInAnonymously(displayName: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInAnonymously({ options: { data: { display_name: displayName } } });
  if (error || !data.session) throw new Error(error?.message ?? "Couldn't join");
  return data.session;
}

/** Add an email to an anonymous crew account (same user id; OTP-verified). */
export async function addEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
  if (error) throw new Error(error.message);
}

export async function confirmEmailChange(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: "email_change",
  });
  if (error) throw new Error(error.message);
}

export async function setPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function signOutSupabase(): Promise<void> {
  await supabase.auth.signOut({ scope: "local" });
}
