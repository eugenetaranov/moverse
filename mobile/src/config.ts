// Point this at the deployed Vercel backend (api/describe + api/save, exposed at
// /describe and /save via vercel.json rewrites). Confirm the exact production
// domain in the Vercel dashboard — usually https://<project>.vercel.app.
export const WORKER_URL = "https://moverse-chi.vercel.app";

// Must match the APP_SECRET env var set on the Vercel project.
export const APP_SECRET = "xEhK96UNonU4en3929gSk3JDKcfmXKhr_UtyMWZy25U";

// Label prefixes used to tell item scans apart from box scans.
export const ITEM_PREFIX = "ITM-";
export const BOX_PREFIX = "BOX-";
