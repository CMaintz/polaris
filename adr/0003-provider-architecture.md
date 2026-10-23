# ADR 0003 - Provider-Based Architecture

Status: Accepted

## Decision

External integrations are represented through provider interfaces.

This applies to:

- AI/LLM providers
- LinkedIn/social providers
- external intelligence sources
- potentially storage or notification providers

## Rationale

Provider independence prevents the core product from becoming coupled to one vendor and makes testing easier.
