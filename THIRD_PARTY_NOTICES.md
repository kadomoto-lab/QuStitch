# Third-party notices

The original QuStitch source is released under the MIT License (see
[LICENSE](LICENSE)). Third-party components remain under their respective
licenses.

## XQsim

`backend/xqsim/` contains a trimmed, lightly modified copy of
[XQsim](https://github.com/SNU-HPCS/XQsim), the cross-technology quantum control
processor simulator developed by the HPCS Lab at Seoul National University.

- License: MIT, Copyright (c) 2023 SNU-HPCS (see [backend/LICENSE](backend/LICENSE))
- Modifications made for QuStitch are listed in [backend/UPSTREAM.md](backend/UPSTREAM.md)
- Publication: I. Byun et al., "XQsim: Modeling Cross-Technology Control Processors
  for 10+K Qubit Quantum Computers," ISCA 2022

## gridsynth / newsynth

XQsim invokes `gridsynth`, from the
[newsynth](https://www.mathstat.dal.ca/~selinger/newsynth/) package by Neil J.
Ross and Peter Selinger, for approximate Clifford+T synthesis.

- Version: 0.3.0.4
- License: GNU General Public License, version 3 or later
- Copyright: Copyright (c) 2012-2018 Peter Selinger and Neil J. Ross
- Corresponding source: [newsynth-0.3.0.4 source package](https://hackage.haskell.org/package/newsynth-0.3.0.4)
- License text: [GNU GPL version 3](https://www.gnu.org/licenses/gpl-3.0.txt)
- Official Linux x86-64 binary SHA-256:
  `8633f62b36ac91b2d4805bfce852dc7f8491bf93836ce9ec9d06982d1b373515`

The GPL-licensed executable is not present in the current source tree. The
backend Docker build downloads the official Linux x86-64 binary and verifies
its SHA-256 digest before installing it. Anyone redistributing a built image
must also satisfy the GPL's source and license requirements.

## Frontend dependencies

The web application depends on open-source npm packages, most notably React,
Vite, Tailwind CSS and Lucide. Their licenses are recorded in
`frontend/package.json` and in the packages themselves under `node_modules/`.

## Backend dependencies

The Python backend depends on the packages pinned in `backend/requirements.txt`
(Qiskit, pytket, Ray, NumPy, FastAPI and others), each under its own license.
