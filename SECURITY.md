# Security policy

## Scope

sanitype scrubs sensitive data before it leaves a process. Bugs that cause
sensitive data to pass through unexpectedly are treated as security issues,
for example:

- A built-in `high` confidence detector missing an input it documents as supported.
- A field rule not being applied to a path it should match.
- A raw sensitive value appearing in the report, in an error message or in a log line produced by the library.
- Any code path that performs network I/O or reads data it was not given.

False positives, and misses by the `heuristic` detectors (`person_name`,
`physical_address`), are quality issues rather than security issues. Please
report them as regular bug reports with an example.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Email
**hola@ramonchancay.me** with:

- A description of the issue and its impact.
- A minimal reproduction (input, configuration, observed output).
- The sanitype version and Node.js version.

You will receive an acknowledgement within 72 hours. Fixes are released as
patch versions and credited in the changelog unless you prefer otherwise.

## Supported versions

Only the latest minor release receives security fixes.

## What sanitype does not do

sanitype is one control among many. It does not encrypt data at rest, it
does not make an application compliant with any regulation by itself, and it
does not detect every possible form of personal data. Review the
[Limitations](./README.md#limitations) section before relying on it.
