import { Subscription } from '@prisma/client';

/** Una suscripción permite operar (escribir) si está en prueba vigente o activa y no vencida. */
export function isSubscriptionWritable(
  sub: Pick<Subscription, 'status' | 'trialEndsAt' | 'currentPeriodEnd'> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!sub) return false;
  switch (sub.status) {
    case 'TRIAL':
      return !sub.trialEndsAt || sub.trialEndsAt > now;
    case 'ACTIVE':
      return !sub.currentPeriodEnd || sub.currentPeriodEnd > now;
    default:
      return false;
  }
}
