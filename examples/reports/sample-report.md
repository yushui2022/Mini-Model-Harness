# Mini Model Harness Sample Report

Run: sample

Type: eval

Model: qwen2.5:3b-instruct-q4

Runtime: Ollama

## Summary

- Task profile: JSON extraction
- Passed: 27/30
- Pass rate: 90%
- Failure hotspot: JSON_PARSE_ERROR
- P95 latency: not captured in this sample

## Verdict

Usable for low-risk extraction with fallback.

Not recommended for high-risk routing until invalid JSON and enum failures are reduced.

## Notes

This file is a static example. Real reports can be exported from the Eval, Runs, or Reports
screens after running local evaluations.
