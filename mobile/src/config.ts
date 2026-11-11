// Runtime config, injected per build profile through app.config.ts `extra`.
// Only public values live here: the API URL, the Supabase URL and its anon key.
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  inviteHost?: string;
};

export const API_URL = (extra.apiUrl ?? "").replace(/\/$/, "");
export const SUPABASE_URL = extra.supabaseUrl ?? "";
export const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? "";
export const INVITE_HOST = extra.inviteHost ?? "moverse.app";

// Label prefixes used to tell item scans apart from box scans.
export const ITEM_PREFIX = "ITM-";
export const BOX_PREFIX = "BOX-";
