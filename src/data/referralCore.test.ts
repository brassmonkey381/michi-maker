/**
 * MIC-069: the invite code and the invite page's numbers. The server is the authority on both;
 * these keep the client from sending junk to checkout or showing a wrong count.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeReferralCode, parseReferralSummary, referralCounts } from './referralCore.ts';

test('an invite code is lower-cased and must look like one the server makes', () => {
  assert.equal(normalizeReferralCode(' AB12cd34 '), 'ab12cd34');
  assert.equal(normalizeReferralCode('abc'), null);
  assert.equal(normalizeReferralCode('ab12cd34/../x'), null);
  assert.equal(normalizeReferralCode(undefined), null);
  assert.equal(normalizeReferralCode(['ab12cd34']), 'ab12cd34'); // a repeated ?param stringifies to one
});

test('the summary keeps known statuses only and reads missing fields as zero', () => {
  const s = parseReferralSummary({
    code: 'ab12cd34',
    invites: [
      { status: 'trialled', created_at: '2026-11-25T00:00:00Z' },
      { status: 'nonsense', created_at: 'x' },
      null,
    ],
    credits_left: 2,
    invited_status: 'paid',
  });
  assert.equal(s.code, 'ab12cd34');
  assert.deepEqual(s.invites, [{ status: 'trialled', createdAt: '2026-11-25T00:00:00Z' }]);
  assert.equal(s.creditsLeft, 2);
  assert.equal(s.creditsUsed, 0);
  assert.equal(s.invitedStatus, 'paid');
  assert.deepEqual(parseReferralSummary(null), { code: null, invites: [], creditsLeft: 0, creditsUsed: 0, invitedStatus: null });
});

test('a paid or refunded friend still counts as having started the trial; only paid counts as paid', () => {
  const at = '2026-11-25T00:00:00Z';
  assert.deepEqual(
    referralCounts([
      { status: 'pending', createdAt: at },
      { status: 'trialled', createdAt: at },
      { status: 'paid', createdAt: at },
      { status: 'voided', createdAt: at },
    ]),
    { trialled: 3, paid: 1 },
  );
});
