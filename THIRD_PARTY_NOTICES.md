# Third-party software notices

CASTRA WebMCP Challenge Edition is licensed under Apache License 2.0. That
license applies to the original work in this repository; it does not replace
the licenses of third-party packages installed by npm.

## Resolved direct packages

| Package | Version | Role | License |
| --- | --- | --- | --- |
| `react` | `19.2.8` | runtime | MIT |
| `react-dom` | `19.2.8` | runtime | MIT |
| `@types/react` | `19.2.18` | development | MIT |
| `@types/react-dom` | `19.2.4` | development | MIT |
| `@vitejs/plugin-react` | `6.0.5` | development | MIT |
| `typescript` | `6.0.3` | development | Apache-2.0 |
| `vite` | `8.2.1` | development | MIT |

## Complete locked inventory

`THIRD_PARTY-LICENSE-INVENTORY.json` enumerates all 47 packages in the exact
lockfile, including transitive and platform-optional packages, their resolved
versions, SPDX-style license metadata, installed-platform verification state,
and hashes of installed top-level license or notice files.

The locked license distribution is:

| License | Packages |
| --- | ---: |
| MIT | 31 |
| Apache-2.0 | 2 |
| MPL-2.0 | 12 |
| ISC | 1 |
| BSD-3-Clause | 1 |

Verification used `npm ci --ignore-scripts --offline` on Windows. Twenty-three
packages were installed for that platform; every installed package's
`package.json` license matched the lockfile. Twenty-two exposed a top-level
license text that was hashed in the inventory. The installed
`@rolldown/binding-win32-x64-msvc` package declared MIT in both the lockfile and
its package metadata but did not contain a separate top-level license file.

The remaining 24 entries are optional platform packages not installed on the
Windows verification host. Their exact resolved versions and license metadata
are recorded from `package-lock.json`; their package texts were not represented
as locally verified. They are not copied into this source candidate, and npm
selects the relevant optional package for another platform.

No dependency source or `node_modules` tree is included in the release
candidate. Recipients obtain dependencies from their normal npm sources under
the licenses declared by those projects.
