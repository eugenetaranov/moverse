import { nextBoxCode } from "./api";

// Box-code counterpart to reservation.ts. In "assign" mode a box code is
// printed / written BEFORE save, so it can't be minted at save time. Seed a
// local counter from the server max and hand out BOX-#### monotonically.
// Single-device, so a plain counter is safe; abandoned reservations leave
// harmless gaps. Kept separate from the item counter so the two numbering
// spaces don't interleave.
let counter: number | null = null;

function parse(code: string): number {
  const m = /^BOX-(\d+)$/.exec(code.trim());
  return m ? parseInt(m[1], 10) : 0;
}

const format = (n: number) => `BOX-${String(n).padStart(4, "0")}`;

// Seed from the backend's current max (nextBoxCode returns max+1). Best-effort;
// falls back to 0 so the first reservation still yields a code.
export async function seedBoxReservation(): Promise<void> {
  try {
    counter = parse(await nextBoxCode()) - 1; // nextBoxCode = max+1 → counter = max
  } catch {
    if (counter === null) counter = 0;
  }
}

// The next box code to assign. Seeds lazily if not already seeded.
export async function reserveBoxCode(): Promise<string> {
  if (counter === null) await seedBoxReservation();
  counter = (counter ?? 0) + 1;
  return format(counter);
}
