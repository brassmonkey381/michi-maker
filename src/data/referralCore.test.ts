/**
 * MIC-069: the invite code, the free print codes and the invite page's numbers. The server is the
 * authority on all of them; these keep the client from sending junk to checkout or showing a wrong
 * count or status.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeReferralCode,
  parseReferralSummary,
  printCodeReasonText,
  printCodeStatusText,
  referralCounts,
  type PrintCode,
} from './referralCore.ts';

test('an invite code is lower-cased and must look like one the server makes', () => {
  assert.equal(normalizeReferralCode(' AB12cd34 '), 'ab12cd34');
  assert.equal(normalizeReferralCode('abc'), null);
  assert.equal(normalizeReferralCode('ab12cd34/../x'), null);
  assert.equal(normalizeReferralCode(undefined), null);
  assert.equal(normalizeReferralCode(['ab12cd34']), 'ab12cd34'); // a repeated ?param stringifies to one
});

test('the summary keeps known statuses, states and reasons, and drops anything else', () => {
  const s = parseReferralSummary({
    code: 'ab12cd34',
    invites: [{ status: 'trialled', created_at: '2026-11-25T00:00:00Z' }, { status: 'nonsense' }, null],
    print_codes: [
      { code: '7K3QPX', reason: 'friend_trial', state: 'ready', granted_at: 'g', expires_at: null, redeemed_at: null },
      { code: null, reason: 'friend_paid', state: 'making', granted_at: 'g' },
      { code: 'bad code', reason: 'friend_paid', state: 'ready', granted_at: 'g' },
      { code: 'ABCDEF', reason: 'free_money', state: 'ready', granted_at: 'g' },
      { code: 'ABCDEF', reason: 'holiday_gift', state: 'gone', granted_at: 'g' },
    ],
    invited_status: 'paid',
  });
  assert.equal(s.code, 'ab12cd34');
  assert.deepEqual(s.invites, [{ status: 'trialled', createdAt: '2026-11-25T00:00:00Z' }]);
  assert.equal(s.printCodes.length, 3);
  assert.equal(s.printCodes[0].code, '7K3QPX');
  assert.equal(s.printCodes[1].state, 'making');
  assert.equal(s.printCodes[2].code, null, 'a malformed code is never shown as copyable');
  assert.equal(s.invitedStatus, 'paid');
  assert.deepEqual(parseReferralSummary(null), { code: null, invites: [], printCodes: [], invitedStatus: null });
});

test('counts: a paid or refunded friend still started the trial; ready includes codes being made', () => {
  const at = '2026-11-25T00:00:00Z';
  const code = (state: PrintCode['state']): PrintCode => ({ code: 'ABCDEF', reason: 'friend_trial', state, grantedAt: at, expiresAt: null, redeemedAt: null });
  assert.deepEqual(
    referralCounts({
      invites: [
        { status: 'pending', createdAt: at },
        { status: 'trialled', createdAt: at },
        { status: 'paid', createdAt: at },
        { status: 'voided', createdAt: at },
      ],
      printCodes: [code('ready'), code('making'), code('redeemed'), code('expired'), code('voided')],
    }),
    { trialled: 3, paid: 1, ready: 2 },
  );
});

test('each code says plainly where it stands, and when it expires or never does', () => {
  const fmt = (iso: string) => iso.slice(0, 10);
  const base: PrintCode = { code: 'ABCDEF', reason: 'holiday_gift', state: 'ready', grantedAt: 'g', expiresAt: null, redeemedAt: null };
  assert.equal(printCodeStatusText(base, fmt), 'Not used yet · never expires');
  assert.equal(printCodeStatusText({ ...base, expiresAt: '2027-01-31T08:00:00Z' }, fmt), 'Not used yet · expires 2027-01-31');
  assert.equal(printCodeStatusText({ ...base, state: 'redeemed', redeemedAt: '2026-12-02T00:00:00Z' }, fmt), 'Used 2026-12-02');
  assert.equal(printCodeStatusText({ ...base, state: 'voided' }, fmt), 'Removed after a refund');
  assert.match(printCodeReasonText('friend_trial'), /friend/);
});
