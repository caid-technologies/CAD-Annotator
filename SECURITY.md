# Security Policy

## Supported Versions

Only the latest release on `main` is actively maintained and receives security fixes.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report security issues by emailing the maintainers directly. You can find contact details in the repository's GitHub profile or by opening a [GitHub Security Advisory](https://github.com/caid-technologies/cad-annotator/security/advisories/new) (private disclosure).

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Any suggested mitigations if you have them

You can expect an acknowledgement within **72 hours** and a resolution timeline within **14 days** for critical issues.

## Security Considerations for Self-Hosted Deployments

When running this project yourself, keep the following in mind:

- **Never commit your `.env` file.** It contains your OpenAI API key and database credentials.
- **Set `CORS_ORIGIN`** to your exact frontend URL in production. Leaving it unset allows all origins.
- **Change the default database credentials** (`POSTGRES_USER`, `POSTGRES_PASSWORD`) before deploying. The values in `.env.example` are placeholders only.
- **Use a secrets manager** (AWS Secrets Manager, HashiCorp Vault, etc.) rather than plain environment variables for production deployments.
- **Keep dependencies up to date.** Run `pnpm audit --prod` regularly to check for known vulnerabilities.
- **Restrict network access** to the PostgreSQL port (5432). It should not be publicly reachable.
