# 2026-06-15 Structured Output Handoff

## Change

- Added `--output` / `--output-file` support for `ai-link run` and `ai-link workflow run`.
- Output files contain the same structured JSON payload as `--json`.
- Existing output files are not overwritten unless `--force` is provided.
- Fresh clone verification now checks workflow JSON output writing.

## Why

Codex skills should not need to parse human-readable terminal text when chaining AI Link results into local implementation work. A JSON output file gives skills and scripts a stable handoff artifact while Codex still controls edits, validation and Git closeout.

## Boundary

- Output paths are restricted to `runtime/tmp/*.json`, which is ignored by Git.
- The output may contain provider or workflow content, so it should not be committed unless explicitly reviewed and redacted.
- `--json` remains available for stdout consumers.
