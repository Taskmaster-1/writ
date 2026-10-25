# 4. One workspace per install (for now)

**Status:** accepted

Everyone who can sign in to a Writ install administers the same agents, upstreams and rules. The
first account created becomes the owner; after that, sign-up is closed unless `ALLOW_SIGNUP=true`.

**Why:** the first users self-host Writ for one team. Multi-tenancy adds a tenant id to every
query and every test, which is cheap to add later and expensive to carry before it is needed.

**Consequences:** every table that holds workspace data is written so that adding a
`workspace_id` column later is a migration, not a redesign.
