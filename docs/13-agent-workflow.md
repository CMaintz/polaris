# Coding Agent Workflow

## Goal

Make the repository easy for Codex/Claude Code or another coding agent to continue without reconstructing the product from conversation history.

## Agent startup procedure

```text
Read PROJECT.md
Read AGENTS.md
Read relevant docs
Read ADRs
Inspect repository
Identify current implementation state
Select one vertical slice
Implement
Test
Document
```

## Task format

Every substantial task should identify:

- objective
- user value
- affected domain
- acceptance criteria
- technical constraints
- tests
- documentation impact

## Preferred implementation strategy

Build vertical slices.

Example:

```text
LinkedIn import
  -> normalized post
  -> database
  -> API
  -> content explorer
  -> metric display
  -> test
```

This is preferable to implementing a giant "analytics subsystem" without a user-visible path.

## Agent autonomy

Agents may choose implementation details when the documentation leaves them open.

Agents must stop and update/ask about decisions when:

- an open decision becomes unavoidable
- two accepted requirements conflict
- implementation would materially change product behaviour
- a provider limitation invalidates a product assumption

## Definition of done

A feature is done when:

- code exists
- tests exist
- relevant UI exists where applicable
- errors are handled
- documentation is updated
- no secrets are committed
- quality gates pass
