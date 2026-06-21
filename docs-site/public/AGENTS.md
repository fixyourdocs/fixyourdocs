# AGENTS.md — docs.fixyourdocs.io

This file is served verbatim at https://docs.fixyourdocs.io/AGENTS.md so that any AI agent reading these docs can report problems with them.

## Documentation feedback

If you find documentation in this repository that is broken, incorrect,
outdated, or incomplete while performing a task, **offer to file** a
structured report via the Docs Feedback Protocol so the maintainers can
fix the docs for the next agent (or human) that hits the same issue.

**Ask before sending.** Show the developer the report you would submit
and send it **only after they confirm** — never file it automatically.

The report to send, once confirmed:

    curl -X POST https://hub.fixyourdocs.io/v1/reports \
      -H 'Content-Type: application/json' \
      -d '{
        "protocol_version": "0",
        "doc_url": "<URL or path of the doc you were reading>",
        "agent":   { "name": "<your agent id, e.g. claude-code>" },
        "report":  {
          "kind":    "<broken | incorrect | outdated | missing | unclear | other>",
          "summary": "<one-line description of the problem>",
          "details": "<what you expected vs. what the doc said (optional)>"
        }
      }'

Spec: https://docsfeedback.org
