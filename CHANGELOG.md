# Changelog

## 0.1.2 - 2026-07-10

- Migrated Pi extension imports and peer dependencies to the `@earendil-works` package scope.
- Fixed the canonical-path test fixture for macOS temporary directories that resolve through `/private/var`.

## 0.1.1 - 2026-07-09

- Make deny-rule matching case-insensitive on Windows and macOS while preserving original path casing in denial messages.
- Match both lexical and canonical destinations so symlinks, junctions, and new paths below redirected ancestors cannot bypass deny rules.
- Add cross-platform path-matching behavior tests and document conservative macOS path handling.
- Add macOS CI coverage for tests and package validation.
