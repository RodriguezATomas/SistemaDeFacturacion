import { isSubscriptionWritable } from './subscription';

describe('isSubscriptionWritable', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const future = new Date('2026-07-01T00:00:00Z');
  const past = new Date('2026-05-01T00:00:00Z');

  it('rechaza ausencia de suscripción', () => {
    expect(isSubscriptionWritable(null, now)).toBe(false);
  });

  it('acepta prueba vigente y rechaza prueba vencida', () => {
    expect(isSubscriptionWritable({ status: 'TRIAL', trialEndsAt: future, currentPeriodEnd: null }, now)).toBe(true);
    expect(isSubscriptionWritable({ status: 'TRIAL', trialEndsAt: past, currentPeriodEnd: null }, now)).toBe(false);
  });

  it('acepta activa sin vencimiento o con período vigente', () => {
    expect(isSubscriptionWritable({ status: 'ACTIVE', trialEndsAt: null, currentPeriodEnd: null }, now)).toBe(true);
    expect(isSubscriptionWritable({ status: 'ACTIVE', trialEndsAt: null, currentPeriodEnd: future }, now)).toBe(true);
    expect(isSubscriptionWritable({ status: 'ACTIVE', trialEndsAt: null, currentPeriodEnd: past }, now)).toBe(false);
  });

  it('rechaza morosa y cancelada', () => {
    expect(isSubscriptionWritable({ status: 'PAST_DUE', trialEndsAt: null, currentPeriodEnd: future }, now)).toBe(false);
    expect(isSubscriptionWritable({ status: 'CANCELED', trialEndsAt: null, currentPeriodEnd: future }, now)).toBe(false);
  });
});
