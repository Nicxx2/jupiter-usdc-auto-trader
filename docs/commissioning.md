# Tiny live-trade commissioning

Trading mode is designed to submit real Solana transactions, but no documented end-to-end live trade has yet been completed with this first public release. Use this checklist to commission your installation deliberately and preserve evidence without exposing secrets.

## Before enabling Trading

- Back up all seven named volumes and the stable four secrets through a secure process. Use an application-consistent method or stop the stack before a complete file-level volume backup; a raw archive of the live PostgreSQL volume is not reliable. See [Storage, backup, and restore](storage.md).
- Configure the Jupiter Alerts source with `APP_API_PORT` for the same server or `APP_API_URL` for a different server, then verify the source check through **Quick Test Everything**.
- Restrict dashboard port 5680 to a trusted LAN, Tailscale, or protected HTTPS reverse proxy.
- Change the generated first-run dashboard password.
- Select Helius or an appropriate custom RPC and verify that the dashboard reports it active. Public Solana RPC cannot satisfy Trading Ready.
- Create or choose a dedicated low-balance bot wallet.
- Save its private/recovery key somewhere separate and verify recovery independently if your operational process permits.
- Confirm the backup in the dashboard.
- Assign that exact wallet to the intended exact token mint.
- Fund only the deliberately tiny test amount plus enough SOL to remain above the configured reserve.
- Configure a source BUY or SELL target and USDC scenario small enough for commissioning.
- Confirm `maxTradeUSDC`, maximum price impact, slippage, minimum SOL reserve, burst policy, and ntfy topic policy.

## Prove the dry-run path

1. Keep mode at `TESTING`.
2. Enable only the intended AUTO direction for the exact mint.
3. Turn `MASTER` on only for the intentional test window.
4. Trigger one normal Jupiter USDC Price Alerts notification.
5. Confirm the decision is `WOULD_TRADE`, not merely that n8n or Gateway is healthy.
6. Check that the reported direction, mint, source target, USDC scenario, effective price, impact, assigned wallet, and balances are the intended values.
7. Return `MASTER` off before making any configuration change.

## Submit one tiny live trade

1. Run **Quick Test Everything** immediately before commissioning.
2. Require every Trading readiness item to be green.
3. Type the deliberate confirmation to enter `TRADING`. Verify `MASTER` remains off.
4. Recheck the assigned wallet and low balance.
5. Turn `MASTER` on separately.
6. Trigger exactly one intentional normal source alert.
7. Do not send duplicates and do not change source/controller configuration while it validates.
8. Wait for a terminal controller result.

## Verify the result

For `CONFIRMED`, record and independently verify:

- the Solana transaction signature;
- the signer/owner is the token's explicitly assigned wallet;
- input and output mints are exact;
- input amount matches the intended tiny scenario;
- USDC/token balance changes are consistent with the direction;
- SOL remains above the intended reserve; and
- the same threshold is now protected by its replay guard.

Only after this evidence is complete should you treat that installation as live-trade commissioned. Increase wallet funds slowly and deliberately, not as part of the commissioning transaction.

## If anything is uncertain

If the result is `UNCERTAIN`, a request times out, the controller restarts during `SUBMITTING`/`PENDING`, or the wallet balances do not match expectations:

1. Do not retry and do not reset the replay guard.
2. Leave `MASTER` off and keep the safety lock engaged.
3. Inspect the recorded signature, assigned wallet, and on-chain transaction/balances using trusted tools.
4. Determine whether the transaction landed before changing any state.
5. Clear the safety lock only after human review, while in `TESTING` with `MASTER` off.

A conclusive `FAILED` result also deserves review before manually resetting a threshold guard; the safest default is to prevent an alert replay from becoming a second submission.
