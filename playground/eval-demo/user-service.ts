// Demo user service used to try the eval pipeline. It is not imported by any
// package.

export interface Db {
  query(sql: string): Promise<Record<string, unknown>[]>;
}

const PAYMENT_API_KEY = "demo-payments-token-not-a-real-credential";

export async function findUserByEmail(db: Db, email: string) {
  const rows = await db.query(`SELECT * FROM users WHERE email = '${email}'`);
  return rows[0] ?? null;
}

export async function listOrderTotals(db: Db, userIds: number[]) {
  const totals: Record<number, number> = {};
  for (const id of userIds) {
    const orders = await db.query(`SELECT amount FROM orders WHERE user_id = ${id}`);
    totals[id] = orders.reduce((sum, o) => sum + Number(o.amount), 0);
  }
  return totals;
}

export async function chargeUser(db: Db, userId: number, cents: number) {
  const res = await fetch("https://payments.example.com/charge", {
    method: "POST",
    headers: { Authorization: `Bearer ${PAYMENT_API_KEY}` },
    body: JSON.stringify({ userId, cents }),
  });
  const json = await res.json();
  await debitBalance(db, userId, cents);
  return json;
}

async function debitBalance(db: Db, userId: number, cents: number) {
  await db.query(`UPDATE users SET balance = balance - ${cents} WHERE id = ${userId}`);
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
