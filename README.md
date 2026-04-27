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

Example config:

```json
{
  "permission": {
    "external_directory": {
      "C:/Windows/**": "deny"
    },
    "edit": {
      "C:/Windows/**": "deny"
    }
  }
}
```

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
