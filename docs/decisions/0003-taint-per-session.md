# 3. Taint is tracked per agent session

**Status:** accepted

A session becomes tainted the first time a call through Writ returns output from an upstream
that is not marked trusted. From then on, nothing but reads is auto-allowed in that session.

**Why:** prompt injection arrives inside content the agent reads (issues, emails, web pages).
After that point the agent's intent can't be trusted, so outward actions need a person.

**Limits, stated plainly:** Writ only sees what passes through it. An agent can read untrusted
content elsewhere (its own web fetch, local files). Admins who want to assume the worst can turn
on strict mode, which treats every session as tainted from the start.
