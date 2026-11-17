# Domain Docs

Layout: single-context. All packages share the root `GLOSSARY.md`
and `docs/adr/`.

## Before exploring

- Read the root `GLOSSARY.md`.
- Read ADRs under `docs/adr/` relevant to the area being explored.

If these files do not exist, proceed silently. Domain modeling
creates them lazily when terms or decisions are resolved.

## Vocabulary

Use the glossary's terms in issue titles, proposals, hypotheses
and test names. Respect explicitly avoided synonyms.

If a needed concept is missing, reconsider whether the project
uses it; note a genuine gap for domain modeling.

## ADR conflicts

Surface contradictions with existing ADRs explicitly, for example:

> Contradicts ADR-0007, but worth reopening because…
