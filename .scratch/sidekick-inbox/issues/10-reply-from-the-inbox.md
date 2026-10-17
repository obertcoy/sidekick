# 10: Reply from the inbox

**What to build:** Answering a question no longer means quoting it by hand. Clicking a NEEDS YOU row (or Enter on it) opens its detail, so the whole question and its explanation are on the pane, and puts a tag for it in the prompt box with `$.prompt.fill`: `08 Payment retries: `, on a new line after anything already typed. The developer types the answer after the tag. Each further row clicked adds its own tag on its own line, so several questions can be answered in one message; a row already tagged is not added twice. Going Back without typing after a tag removes that tag. When the message is sent, a `prompt.submit` hook attaches each tagged question, with its explanation, as hidden context, so Claude knows which answer belongs to which question. The item still closes the usual way: when the next turn's summary sees it answered (ticket 05). `▸` on the row opens the detail without touching the prompt.

Owner decisions (2026-10-17): row click both opens the detail and fills the prompt; tags add up rather than replace; hidden context, not a visible quote; closing waits for the summary.

**Blocked by:** 04: An item opens in a detail view; 05: Items move on by themselves

**Status:** done

- [x] A click or Enter on a NEEDS YOU row opens its detail and adds its tag to the prompt; the draft already typed is kept
- [x] A second row adds a second tag on its own line; the same row twice adds one
- [x] Back with nothing typed after the tag removes that tag; with text typed after it, the tag stays
- [x] `▸` opens the detail and leaves the prompt alone
- [x] On send, every tagged question in the message is attached as hidden context, and only those
- [x] Under a dialog or headless (`isFilled: false`) the detail still opens and nothing breaks
- [x] Covered by whole-mod tests that click rows, read the prompt draft and submit

## As built (2026-10-17)

- The pure part is in `hooks/inbox.ts`: `tagOf` (the ticket as the inbox shows it plus `: `, e.g. `02 Payment: `; an item of no ticket uses its short line), `hasTag`, `tagAddition` (the tag after a newline, none when the draft is empty or already ends with one), `withoutEmptyTag` and `contextOf` (the hidden text: the tag, the question, its explanation).
- A NEEDS YOU row's title is now a Button (`reply-ask-<id>`; the `▸` stays `open-ask-<id>` and touches nothing in the prompt). A press opens the detail, then reads the draft with `$.prompt.read` and adds the tag with `$.prompt.fill({ mode: 'append' })`, so what is typed is kept. A draft that already holds the tag (as the start of a line) is not tagged again; a fill that comes back `isFilled: false` (dialog, headless) leaves only the detail open and tags nothing.
- Back (and Mark reviewed) on a question removes its tag line when nothing is typed after it, by a `replace` fill of the draft without that line; with text after the tag it stays.
- A `prompt.submit` hook attaches, as `context`, the text of each question remembered as tagged whose tag still starts a line of the message sent, after any context already there; a tag deleted by hand attaches nothing. The remembered tags are cleared at every send. Closing the item stays with the next summary (ticket 05).
- Two questions that share a ticket get the same tag (`02 Payment: `); both attach if it is in the message. Not separated, since tags follow the owner's `08 Payment retries: ` shape.
- The old tests that found a NEEDS YOU title as a `Text` find a `Button` now. `tests/world.ts` gained a prompt box (`draft`, `isPromptHeld`, `submitted`).
- Covered by `tests/inbox-reply.test.ts`.
