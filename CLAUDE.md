@AGENTS.md

BEFORE ANYTHING: Read HANDOFF.md and CLAUDE.md in full. Do not start work until you've
confirmed what the last session did, what's in progress, and what conventions exist.
If your planned change conflicts with anything in those docs, stop and flag it first.

CODE STANDARDS (non-negotiable):
- Search the codebase for existing functions/components/utils before writing new ones.
  Reuse or extend — never duplicate logic that already exists.
- Keep functions small and single-purpose. If a function does two things, split it.
- No dead code, no commented-out blocks, no unused imports or variables left behind.
- Prefer clarity over cleverness. Descriptive names, no abbreviations that need decoding.
- Clean up all resources: unsubscribe listeners/subscriptions in useEffect cleanup,
  abort in-flight fetches on unmount (AbortController), clear intervals/timeouts,
  close Supabase realtime channels when components unmount.
- Avoid unnecessary re-renders: stable dependencies, memoize only where it measurably
  helps, don't create new objects/arrays inline in props or deps.
- No N+1 queries — batch Supabase calls, select only needed columns, use RPCs where
  one already exists rather than reimplementing logic client-side.
- Handle errors explicitly. No silent catches, no swallowed promises.

AFTER CHANGES: Update HANDOFF.md with what you changed, why, and anything left
unfinished. Run typecheck/lint before declaring done.