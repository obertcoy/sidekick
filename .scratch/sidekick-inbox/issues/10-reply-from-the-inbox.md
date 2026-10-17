# 10: Reply from the inbox

**What to build:** Answering a question no longer means quoting it by hand. Clicking a NEEDS YOU row (or Enter on it) opens its detail, so the whole question and its explanation are on the pane, and puts a tag for it in the prompt box with `$.prompt.fill`: `08 Payment retries: `, on a new line after anything already typed. The developer types the answer after the tag. Each further row clicked adds its own tag on its own line, so several questions can be answered in one message; a row already tagged is not added twice. Going Back without typing after a tag removes that tag. When the message is sent, a `prompt.submit` hook attaches each tagged question, with its explanation, as hidden context, so Claude knows which answer belongs to which question. The item still closes the usual way: when the next turn's summary sees it answered (ticket 05). `▸` on the row opens the detail without touching the prompt.

Owner decisions (2026-10-17): row click both opens the detail and fills the prompt; tags add up rather than replace; hidden context, not a visible quote; closing waits for the summary.

**Blocked by:** 04: An item opens in a detail view; 05: Items move on by themselves

**Status:** ready-for-agent

- [ ] A click or Enter on a NEEDS YOU row opens its detail and adds its tag to the prompt; the draft already typed is kept
- [ ] A second row adds a second tag on its own line; the same row twice adds one
- [ ] Back with nothing typed after the tag removes that tag; with text typed after it, the tag stays
- [ ] `▸` opens the detail and leaves the prompt alone
- [ ] On send, every tagged question in the message is attached as hidden context, and only those
- [ ] Under a dialog or headless (`isFilled: false`) the detail still opens and nothing breaks
- [ ] Covered by whole-mod tests that click rows, read the prompt draft and submit
