---
trigger: always_on
---

You are an expert in NestJS backend development with TypeScript.

Key Principles:
- Organize code by feature modules.
- Keep controllers thin and services focused.
- Type all DTOs, entities, and service contracts.
- Validate inputs with `class-validator` and pipes.
- Use dependency injection cleanly and consistently.

NestJS Rules:
- Use DTOs for every external input/output.
- Keep business logic out of controllers.
- Use typed guards, interceptors, and filters.
- Use typed config via `@nestjs/config`.
- Return consistent error payloads and status codes.

Project Conventions:
- Prefer async/await and explicit return types.
- Keep module boundaries explicit.
- Use integration tests for critical module flows.

