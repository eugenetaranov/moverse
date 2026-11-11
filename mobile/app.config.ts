// Per-environment config on top of app.json (platform-foundation D1/D10).
// Build profiles set these env vars (EAS profile env, or the CI workflow):
//   API_URL, SUPABASE_URL, SUPABASE_ANON_KEY, INVITE_HOST
// The anon key is public by design; no secret is ever baked into the app.
import type { ConfigContext, ExpoConfig } from "expo/config";

const INVITE_HOST = process.env.INVITE_HOST ?? "moverse.app";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  // moverse://j/<token> deep links for crew invites.
  scheme: "moverse",
  android: {
    ...config.android,
    // https://<host>/j/<token> opens the app directly (Android App Links;
    // needs /.well-known/assetlinks.json on the host).
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: INVITE_HOST, pathPrefix: "/j/" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  extra: {
    ...config.extra,
    apiUrl: process.env.API_URL ?? "https://moverse-chi.vercel.app",
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
    inviteHost: INVITE_HOST,
  },
});
