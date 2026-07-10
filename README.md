# Pi Safety Rails

Pi package containing safety-focused extensions for shell execution and tool-result hygiene.

## Included extensions

- `tool-output-redactor`
- `path-permissions`

## Purpose

This package provides practical safety rails for Pi:

- redact token-like secrets from tool outputs before they reach the model/session
- block sensitive filesystem paths through deny-only path permissions

## Tool output redaction

- Redacts token-like secrets from tool outputs before they are shown to the model/session.
- Applies to text content and nested string fields in tool result details.

## Path permissions

- Deny-only path blocking for file-oriented tools.
- Current v1 target tools:
  - `read`
  - `write`
  - `edit`
  - `grep`
  - `find`
  - `ls`
- Configuration files:
  - user-global: `~/.pi/agent/path-permissions.json`
  - project-local overlay: `.pi/path-permissions.json`
- The first version intentionally ignores allow rules and only honors `deny`.

Example config with Windows and macOS paths:

```json
{
  "permission": {
    "external_directory": {
      "C:/Windows/**": "deny",
      "/Users/yourname/Library/Keychains/**": "deny"
    },
    "edit": {
      "C:/Windows/**": "deny",
      "/Users/yourname/.ssh/**": "deny"
    }
  }
}
```

Replace `yourname` with the macOS account name. A trailing `/**` denies both the named directory and its descendants, without matching sibling prefixes.

Deny matching is case-insensitive on Windows and macOS, while denial messages retain the path's original display casing. macOS matching deliberately fails closed: it remains case-insensitive even on a case-sensitive APFS volume, so a differently cased path can be conservatively denied there. Linux matching remains case-sensitive.

Rules are evaluated against both the supplied path and its canonical filesystem destination. Existing symlinks and Windows junctions therefore cannot redirect access into a denied directory; for new files, the nearest existing ancestor is canonicalized before matching.

A copy also ships in this package as `path-permissions.example.json`.

## Install

Recommended as a global package.

From GitHub:

```bash
pi install git:git@github.com:aefreedman/pi-safety-rails.git
```

Local development install:

```bash
pi install <path-to-pi-safety-rails>
```

## License

MIT. See `LICENSE`.
