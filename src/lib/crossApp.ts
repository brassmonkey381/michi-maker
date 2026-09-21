/**
 * Whether this build names, links or sells TCGScan, the sister app.
 *
 * OFF UNTIL TCGScan's iPhone APP PASSES APP REVIEW (owner, 2026-09-20). The two products are kept
 * apart in public while that review runs: no pairing card, no rail link, no two-app bundle, no
 * "partner app" footnote, and What's New shows michi-maker's own changes. tcgscan-app carries the
 * same flag (lib/store-policy). Build with EXPO_PUBLIC_CROSS_APP=1 to bring it all back.
 *
 * What it does NOT hide: the shared account and ledger (invisible), the privacy policy's account
 * of where email comes from (it has to stay true), and the rebuild flow a member with scanned
 * binders already sees.
 *
 * Build-time: the bundler inlines the flag, so a deployed site never flips on its own.
 */
export const SHOW_CROSS_APP = process.env.EXPO_PUBLIC_CROSS_APP === '1';
