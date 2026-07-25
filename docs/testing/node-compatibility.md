# Node.js compatibility policy

Version 1.1 supports Node.js 22 and 24 LTS:

```text
^22.0.0 || ^24.0.0
```

The minimum was raised from Node.js 20 because that line reached end of life on
24 March 2026. The project follows the Node.js recommendation that production
applications use Active LTS or Maintenance LTS releases. As of 24 July 2026,
Node.js 22 is Maintenance LTS and Node.js 24 is Active LTS.

Authoritative lifecycle references:

- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [Node.js Release Working Group schedule](https://github.com/nodejs/Release)

## Enforcement

- Every first-party `package.json` declares the same two-major range.
- Local stdio, hosted, and bundled desktop-sidecar entry points reject any
  untested major with structured configuration error `GC-CFG-003`.
- Pull-request and main CI run the complete build and deterministic test suite
  on both Node.js 22 and 24.
- Release, desktop, and container builds use Node.js 24, the Active LTS line.
- The production Docker image uses `node:24-bookworm-slim`.
- `.nvmrc` selects Node.js 24 for contributors.

Node.js 26 is Current rather than LTS on the policy date and is not claimed as
supported. It can be added after it reaches LTS and passes the same complete
matrix. Odd/EOL majors are not supported.
