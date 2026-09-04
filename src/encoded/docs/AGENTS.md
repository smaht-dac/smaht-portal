# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Submission workbook conventions

- `src/encoded/commands/write_submission_spreadsheets.py` is the authoritative generator for submission
  workbooks. It flattens plain nested object properties with dot notation such as `options.filetype`;
  arrays of objects keep the existing `property#0.field` convention. Regression coverage lives in
  `src/encoded/tests/test_write_submission_spreadsheets.py`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
