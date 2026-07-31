# Session: GSC recovery next scheduled monitor status

Date: 2026-07-31

## Summary

Improved `gsc:recover:next` so it checks the local Windows scheduled task before telling an operator what to do next.

When GSC read-only credentials are usable and the `AI Link GSC Readonly Monitor` task is already installed with a healthy last run, the command now reports `wait_for_scheduled_monitor` and points the operator to refresh the downstream ParentingGame Chinese SEO status after the next scheduled monitor run. It no longer tells the operator to reinstall the scheduled task in that state.

## Changed Files

- `tools/show-gsc-recovery-next.js`
  - Reads the scheduled monitor task status in a redacted way.
  - Adds `scheduledMonitor` to JSON output.
  - Uses `wait_for_scheduled_monitor` when the monitor is healthy.
  - Shows last run result and next run time in the Markdown report.
- `docs/user-guide.md`
  - Documents that `gsc:recover:next` can recognize an already healthy scheduled monitor and should not prompt repeated task installation.

## Validation

- `node --check tools/show-gsc-recovery-next.js`
- `npm.cmd run gsc:recover:next -- --json`
- `npm.cmd run check`
- `npm.cmd run security:scan`
- Diff sensitive scan: no OAuth token, authorization code, callback URL, client secret, Cookie, access token, refresh token, or private key matches.

## Current Verified State

- GSC credential health: `usable_last_check`
- Scheduled monitor state: `Ready`
- Last scheduled monitor result: `0`
- Next scheduled monitor run: `2026-08-01 13:00:00`
- Operator action code: `wait_for_scheduled_monitor`

## Follow-Up

After the next scheduled run, refresh the ParentingGame SEO status with:

```powershell
cd D:\codex_workplace\parentingGame\docs\02-brainstorming\prenatal-voice-overseas-validation
npm.cmd run seo:daily:zh
```
