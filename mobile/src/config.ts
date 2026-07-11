// Point this at your deployed Cloudflare Worker.
// For local dev with `wrangler dev`, use your machine's LAN IP (not localhost)
// so the phone can reach it, e.g. "http://192.168.1.20:8787".
export const WORKER_URL = "https://moverse-worker.YOUR-SUBDOMAIN.workers.dev";

// Must match the APP_SECRET set on the Worker (leave "" if you didn't set one).
export const APP_SECRET = "";

// Label prefixes used to tell item scans apart from box scans.
export const ITEM_PREFIX = "ITM-";
export const BOX_PREFIX = "BOX-";
