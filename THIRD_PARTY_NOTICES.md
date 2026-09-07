# Third-party notices

QuStitch is released under the MIT License (see [LICENSE](LICENSE)). It bundles
and builds upon the following third-party software.

## XQsim

`backend/xqsim/` contains a trimmed, lightly modified copy of
[XQsim](https://github.com/SNU-HPCS/XQsim), the cross-technology quantum control
processor simulator developed by the HPCS Lab at Seoul National University.

- License: MIT, Copyright (c) 2023 SNU-HPCS (see [backend/LICENSE](backend/LICENSE))
- Modifications made for QuStitch are listed in [backend/UPSTREAM.md](backend/UPSTREAM.md)
- Publication: I. Byun et al., "XQsim: Modeling Cross-Technology Control Processors
  for 10+K Qubit Quantum Computers," ISCA 2022

`backend/xqsim/compiler/gridsynth` is a prebuilt Linux x86-64 binary of
[gridsynth](https://www.mathstat.dal.ca/~selinger/newsynth/) (Ross and Selinger),
distributed with upstream XQsim.

## Frontend dependencies

The web application depends on open-source npm packages, most notably React,
Vite, Tailwind CSS and Lucide. Their licenses are recorded in
`frontend/package.json` and in the packages themselves under `node_modules/`.

## Backend dependencies

The Python backend depends on the packages pinned in `backend/requirements.txt`
(Qiskit, pytket, Ray, NumPy, FastAPI and others), each under its own license.
