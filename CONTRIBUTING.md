# Contributing to CAD Annotator

Thank you for your interest in contributing to CAD Annotator! This guide will help you get set up and submit changes that meet the project's standards.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Environment Setup](#development-environment-setup)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Commit Message Conventions](#commit-message-conventions)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Getting Help](#getting-help)

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** ≥ 24
- **pnpm** ≥ 9
- **Git**

## Development Environment Setup

1. **Fork and clone the repository:**

   ```bash
   git clone https://github.com/caid-technologies/cad-annotator.git
   cd cad-annotator
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

   Open `.env` and fill in the required values. At minimum, set your `AI_INTEGRATIONS_OPENAI_API_KEY`. See the [README](README.md) for a full list of environment variables.

4. **Verify your setup:**

   ```bash
   pnpm run typecheck
   ```

## Development Workflow

### Running dev servers

Start the API server and frontend in separate terminals:

```bash
# Terminal 1: API server
pnpm --filter @workspace/api-server run dev

# Terminal 2: Frontend
pnpm --filter @workspace/cad-annotator run dev
```

### Building

Build all artifacts for production:

```bash
pnpm run build
```

This runs type checking across all packages, then builds each artifact.

### Running with Docker

```bash
cp .env.example .env
# Edit .env with your configuration
docker compose up
```

## Code Style Guidelines

- **TypeScript strict mode** is enabled across all packages. Do not use `any` unless absolutely necessary, and add a comment explaining why.
- **Prettier** is used for code formatting. Check formatting with:

  ```bash
  pnpm exec prettier --check .
  ```

  Fix formatting issues with:

  ```bash
  pnpm exec prettier --write .
  ```

- Use **inline comments** for non-obvious logic. Code should be self-documenting where possible, but complex business rules or workarounds deserve an explanation.
- Follow existing patterns in the codebase. When in doubt, look at how similar code is structured in the same package.

## Commit Message Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/). Each commit message should be structured as:

```
type(scope): description
```

### Valid examples

```
feat(api): add batch annotation endpoint
fix(frontend): correct bounding box offset on zoomed images
docs(readme): update Docker setup instructions
test(compliance): add edge case tests for GD&T validation
chore(deps): bump vitest to 3.x
refactor(pipeline): extract retry logic into shared utility
```

### Invalid examples

```
fixed stuff                     # no type, vague description
feat: Add New Feature           # don't capitalize the description
FEAT(api): add endpoint         # type must be lowercase
feat(api) add endpoint          # missing colon after scope
```

### Common types

| Type       | When to use                                           |
| ---------- | ----------------------------------------------------- |
| `feat`     | A new feature                                         |
| `fix`      | A bug fix                                             |
| `docs`     | Documentation changes only                            |
| `test`     | Adding or updating tests                              |
| `chore`    | Maintenance tasks (deps, CI, tooling)                 |
| `refactor` | Code changes that neither fix a bug nor add a feature |

## Pull Request Process

### Branch naming

Create a branch from `main` using one of these prefixes:

- `feat/` — for new features (e.g., `feat/batch-annotations`)
- `fix/` — for bug fixes (e.g., `fix/bounding-box-offset`)
- `docs/` — for documentation changes (e.g., `docs/api-examples`)

### Submitting a PR

1. **Branch from `main`** and make your changes.
2. **Ensure all checks pass** locally before pushing:
   ```bash
   pnpm run typecheck
   pnpm -r --if-present run test
   pnpm exec prettier --check .
   ```
3. **Push your branch** and open a pull request against `main`.
4. **Fill out the PR template** completely — describe what changed, what you tested, and check all applicable items in the checklist.

### Review expectations

- At least **one maintainer approval** is required before merging.
- Maintainers may request changes. Please address feedback promptly or discuss if you disagree.
- All CI checks must pass.

### Merge strategy

Pull requests are merged using **squash merge** to keep the commit history clean. The PR title becomes the commit message, so make sure it follows the [commit message conventions](#commit-message-conventions).

## Testing Requirements

This project uses [Vitest](https://vitest.dev/) for testing.

### Running tests

Run tests for a specific package:

```bash
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/cad-annotator run test
```

Run tests across the entire workspace:

```bash
pnpm -r --if-present run test
```

### Expectations

- **New features should include tests.** If you're adding a new function, endpoint, or component, write tests that cover the expected behavior and important edge cases.
- **Bug fixes should include a regression test.** Add a test that would have caught the bug before your fix.
- Tests should be co-located with source files using the `.test.ts` suffix (e.g., `compliance-engine.test.ts` alongside `compliance-engine.ts`).

## Getting Help

If you have questions or need guidance:

- Open a [GitHub Discussion](https://github.com/caid-technologies/cad-annotator/discussions) for general questions.
- Check existing [issues](https://github.com/caid-technologies/cad-annotator/issues) to see if your question has been addressed.
- Review the [README](README.md) for project setup and architecture details.
