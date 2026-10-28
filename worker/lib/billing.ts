/**
 * Partner plan billing: order lifecycle + idempotent fulfillment.
 *
 * Every settlement path (browser poll, webhook, cron) calls settleOrder().
 * Access is granted only when Mayar GET /transactions/{id} returns "paid".
 */
import { getTransaction, MayarApiError, type MayarConfig } from "./mayar";
import { now } from "./util";

export type PaidPlan = "gold" | "platinum";
export const PAID_PLANS: readonly PaidPlan[] = ["gold", "platinum"];

/** Server-owned prices (IDR / 30 days). Client never sends an amount. */
export const PLAN_PRICES: Record<PaidPlan, number> = { gold: 19_000, platinum: 34_000 };
export const PLAN_LABEL: Record<PaidPlan, string> = { gold: "Gold", platinum: "Platinum" };
export const PLAN_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
export const ORDER_TTL_MS = 60 * 60 * 1000;

const LEASE_MS = 60_000;
/** Minimum gap between Mayar reads for one order (API budget: 50 req/min). */
const PROVIDER_READ_GAP_MS = 15_000;

export type OrderRow = {
  id: string;
  user_id: number;
  plan: PaidPlan;
  amount: number;
  status: "creating" | "pending" | "paid" | "expired" | "failed";
  mayar_invoice_id: string | null;
  mayar_transaction_id: string | null;
  payment_link: string | null;
  qr_string: string | null;
  expires_at: number | null;
  last_checked_at: number | null;
};

export type SettleResult = OrderRow["status"];

export function planAmount(plan: PaidPlan, testAmount?: string): number {
  const override = Number(testAmount);
  return Number.isInteger(override) && override > 0 ? override : PLAN_PRICES[plan];
}

/**
 * Check one order against Mayar and fulfill it exactly once.
 * Safe to call concurrently from multiple paths.
 */
export async function settleOrder(db: D1Database, config: MayarConfig, orderId: string, force = false): Promise<SettleResult> {
  const order = await db.prepare(`SELECT * FROM payment_orders WHERE id = ?1`).bind(orderId).first<OrderRow>();
  if (!order) return "failed";
  if (order.status !== "pending" || !order.mayar_transaction_id) return order.status;

  const ts = now();
  if (!force && order.last_checked_at && ts - order.last_checked_at < PROVIDER_READ_GAP_MS) return order.status;

  // Atomic claim: only one worker may talk to Mayar for this order at a time.
  const claim = await db
    .prepare(
      `UPDATE payment_orders SET locked_until = ?1, attempt_count = attempt_count + 1, last_checked_at = ?2, updated_at = ?2
       WHERE id = ?3 AND status = 'pending' AND (locked_until IS NULL OR locked_until < ?2)`,
    )
    .bind(ts + LEASE_MS, ts, orderId)
    .run();
  if (claim.meta.changes !== 1) return order.status;

  try {
    const transaction = await getTransaction(config, order.mayar_transaction_id);
    const status = String(transaction.status ?? "").toLowerCase();

    if (status === "paid") {
      if (Number(transaction.amount) !== order.amount) {
        await release(db, orderId, `amount_mismatch:${transaction.amount}`);
        console.error("mayar amount mismatch", { orderId });
        return "pending";
      }
      await fulfill(db, order, ts);
      return "paid";
    }

    if (status === "expired" || (order.expires_at !== null && ts > order.expires_at + 5 * 60_000)) {
      await db
        .prepare(`UPDATE payment_orders SET status = 'expired', locked_until = NULL, updated_at = ?1 WHERE id = ?2 AND status = 'pending'`)
        .bind(ts, orderId)
        .run();
      return "expired";
    }

    await release(db, orderId, null);
    return "pending";
  } catch (error) {
    const message = error instanceof MayarApiError ? `mayar_${error.statusCode}` : "settle_error";
    await release(db, orderId, message);
    console.error("settle order failed", { orderId, message });
    return "pending";
  }
}

async function release(db: D1Database, orderId: string, lastError: string | null): Promise<void> {
  await db
    .prepare(`UPDATE payment_orders SET locked_until = NULL, last_error = ?1, updated_at = ?2 WHERE id = ?3`)
    .bind(lastError, now(), orderId)
    .run();
}

/**
 * Idempotent fulfillment in one D1 batch (transaction):
 *  - order pending -> paid (guarded), then
 *  - extend the user's plan only if this exact call flipped the order.
 * Plan rule: new expiry = max(current expiry, now) + 30 days. Buying Gold
 * while Platinum is active keeps Platinum and still extends the period.
 */
async function fulfill(db: D1Database, order: OrderRow, ts: number): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE payment_orders SET status = 'paid', completed_at = ?1, locked_until = NULL, last_error = NULL, updated_at = ?1
         WHERE id = ?2 AND status = 'pending'`,
      )
      .bind(ts, order.id),
    db
      .prepare(
        `UPDATE users SET
           plan = CASE WHEN plan = 'platinum' AND COALESCE(plan_expires_at, 0) > ?1 AND ?2 = 'gold' THEN 'platinum' ELSE ?2 END,
           plan_expires_at = MAX(COALESCE(plan_expires_at, 0), ?1) + ?3,
           updated_at = ?1
         WHERE id = ?4
           AND EXISTS (SELECT 1 FROM payment_orders WHERE id = ?5 AND status = 'paid' AND completed_at = ?1)`,
      )
      .bind(ts, order.plan, PLAN_PERIOD_MS, order.user_id, order.id),
  ]);
}

/** Reconcile pending orders (cron + webhook fallback). Bounded for the API budget. */
export async function settlePendingOrders(db: D1Database, config: MayarConfig, limit = 15): Promise<number> {
  const ts = now();
  const rows = await db
    .prepare(
      `SELECT id FROM payment_orders
       WHERE status = 'pending' AND created_at > ?1
       ORDER BY COALESCE(last_checked_at, 0) ASC LIMIT ?2`,
    )
    .bind(ts - 2 * ORDER_TTL_MS, limit)
    .all<{ id: string }>();

  // Orders older than 2× TTL never got paid: close them without a provider call.
  await db
    .prepare(`UPDATE payment_orders SET status = 'expired', updated_at = ?1 WHERE status IN ('pending', 'creating') AND created_at <= ?2`)
    .bind(ts, ts - 2 * ORDER_TTL_MS)
    .run();

  let settled = 0;
  for (const row of rows.results) {
    if ((await settleOrder(db, config, row.id)) === "paid") settled++;
  }
  return settled;
}

export type ActivePlan = { plan: "free" | PaidPlan; expiresAt: number | null };

export async function activePlan(db: D1Database, userId: number): Promise<ActivePlan> {
  const row = await db
    .prepare(`SELECT plan, plan_expires_at FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ plan: string | null; plan_expires_at: number | null }>();
  const plan = row?.plan;
  if (row?.plan_expires_at && row.plan_expires_at > now() && (plan === "gold" || plan === "platinum")) {
    return { plan, expiresAt: row.plan_expires_at };
  }
  return { plan: "free", expiresAt: null };
}

/** Constant-time string comparison for the webhook token. */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
