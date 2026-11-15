# LifeSims MINI v1.1 — verification matrix (2026-11-15)

Status: **test specification only**. This document does not certify Android runtime behavior.

## Verified by repository source inspection
- Main preview file: `mini-v1-1-preview.html`; read on 2026-11-15.
- Browser localStorage is used for state; diary is a date-keyed object.
- CSV export includes `totalCalories`, `source`, and diary fields.
- CSV escaping quotes values and prefixes cells beginning with whitespace followed by =, +, @, or - with an apostrophe.

## Required manual Android acceptance tests (not yet run)
1. Back up existing progress in the old version before opening the updated version; do not delete old installation.
2. Create task, habit and skill; reload; verify persisted values.
3. Mark a task done, undo, mark done again; verify XP does not accumulate incorrectly.
4. Record sleep, steps and **total daily calories** for two days, leave a third day blank; verify 7-day averages exclude missing values.
5. Record mood, physical condition, medication, food and cycle; reload and inspect history.
6. Export CSV; inspect headers, UTF-8 Cyrillic and quoting in spreadsheet software.
7. Enter diary text beginning with `=1+1` and `  @SUM(1,2)`; confirm spreadsheet does not execute it.
8. Export JSON backup; restore it in a separate browser profile; compare all records.
9. Try malformed JSON and unexpected field types on import; verify no existing data is lost.
10. Test narrow-screen mobile layout, offline use and Android Add to Home Screen behavior.
11. Verify no automatic Oura, Health Connect, Google Calendar or ZenMoney claims are shown before an authenticated, tested connection exists.

## Release gates
- Browser runtime tests and real-device Android checks are outstanding.
- Native Android APK and full 3D scene are not validated.
- Third-party integrations are not validated.
- Do not replace a user's working copy until JSON backup/restore round-trip passes.
