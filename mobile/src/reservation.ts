import { nextCode } from "./api";

// In "assign" mode the code is printed / written on the object BEFORE save, so
// it can't be minted at save time. Seed a local counter from the server max and
// hand out ITM-#### monotonically. Single-device, so a plain counter is safe;
// abandoned reservations just leave harmless gaps in the sequence.
let counter: number | null = null;

function parse(code: string): number {
  const m = /^ITM-(\d+)$/.exec(code.trim());
  return m ? parseInt(m[1], 10) : 0;
}

const format = (n: number) => `ITM-${String(n).padStart(4, "0")}`;

// Seed from the backend's current max (nextCode returns max+1). Best-effort;
// falls back to 0 so the first reservation still yields a code.
export async function seedReservation(): Promise<void> {
  try {
    counter = parse(await nextCode()) - 1; // nextCode = max+1 → counter = max
  } catch {
    if (counter === null) counter = 0;
  }
}

// The next code to assign. Seeds lazily if not already seeded.
export async function reserveCode(): Promise<string> {
  if (counter === null) await seedReservation();
  counter = (counter ?? 0) + 1;
  return format(counter);
}
