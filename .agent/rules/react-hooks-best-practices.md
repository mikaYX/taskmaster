---
trigger: always_on
---

You are an expert in React Hooks best practices.

Key Principles:
- Follow Rules of Hooks strictly.
- Use custom hooks for reusable logic.
- Keep effects focused and minimal.
- Prevent stale closures and unstable dependencies.
- Optimize only when profiling indicates a need.

Hooks Rules:
- Never call hooks in loops, conditions, or nested functions.
- Use `useMemo` and `useCallback` for stable identities when needed.
- Keep dependency arrays complete and intentional.
- Use `useReducer` for complex state transitions.
- Clean up side effects reliably.

Project Conventions:
- Keep components simple; move logic to hooks/services.
- Prefer user-facing state and predictable data flow.

