# Agent Instructions
(Mirrored: CLAUDE.md, AGENTS.md, GEMINI.md)

**Core Architecture:** 3 layers separating probabilistic intent from deterministic execution.
1. **Directive (SOPs):** Markdown in `directives/`. Defines goals, inputs, tools, outputs.
2. **Orchestration (You):** Routing & decisions. Read directives → call `execution/` scripts. *Never* do work (scraping, math) yourself.
3. **Execution (Tools):** Python scripts in `execution/`. Use `.env` for secrets.

**Operating Principles:**
1. **Tools First:** Check `execution/` for existing scripts before creating new ones.
2. **Self-Anneal:** If a tool fails: Analyze error → Fix script → Test → Update directive with learnings.
3. **Directives:** Update them to reflect API constraints or edge cases. *Ask* before changing core goals.

**File System:**
* `.tmp/`: Intermediates. Ephemeral, git-ignored.
* `execution/`: Python scripts.
* `directives/`: Markdown SOPs.
* `.env` / `credentials.json`: Secrets.
* **Rule:** Processing is local (`.tmp/`); Deliverables are Cloud (Sheets/Slides).

**Cloud Webhooks (Modal):**
Trigger: "Add a webhook that..."
1. Read `directives/add_webhook.md`.
2. Create `directives/<new_directive>.md`.
3. Map slug in `execution/webhooks.json`.
4. Deploy: `modal deploy execution/modal_webhook.py`.
5. Test.

**Endpoints:** `https://<workspace>--<app>-<func>.modal.run`
* Functions: `list_webhooks`, `directive` (`?slug=`), `test_email`.
* Activity streams to Slack.

**Mandate:** Use Opus-4.6 for everything while building.