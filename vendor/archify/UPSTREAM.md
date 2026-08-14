# Archify upstream

This directory vendors the architecture renderer, validator, template, and CLI
needed by AIDLC's Architecture Overview. It is sourced from
[`tt-a1i/archify`](https://github.com/tt-a1i/archify), version `2.14.0`, under
the MIT License included in `LICENSE`.

Only the files needed to validate and deliver `architecture` diagrams are kept
here. The AIDLC adapter supplies the JSON input; the bundled renderer never
inspects a user's repository on its own.
