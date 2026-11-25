# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through the repository's **Security → Report a vulnerability** form
(GitHub private vulnerability reporting), or contact the maintainers directly.

Include what you can of:

- the affected endpoint, file or dependency,
- steps to reproduce or a proof of concept,
- the impact you expect (data exposure, privilege escalation, denial of service, …),
- the `X-Request-Id` of an affected request, if you have one.

You should get an acknowledgement within 3 working days. Please give us reasonable time to
ship a fix before disclosing publicly.

## Supported versions

Security fixes land on `main`. Deploy from the latest release.

## How this codebase is secured

The security model, the built-in protections and the hardening checklist are documented in
[docs/15-security.md](docs/15-security.md).
