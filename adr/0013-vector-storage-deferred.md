# ADR 0013 - Vector Storage: Deferred

Status: Proposed (assumed by the implementing agent on 2026-10-23; awaiting product review)

Resolves: OD-008 (for now)

## Decision

The first release has no embeddings and no vector store. Natural-language questions are
answered from structured analytics chosen by intent; docs/03 section 9 makes semantic retrieval
optional. The `AiProvider` port has no `embed()` yet. It will be added with the first feature
that needs it.

## Revisit when

Users need to search their own post text by meaning, or external trend content is ingested
(roadmap phase 5). On PostgreSQL, pgvector is the first candidate.
