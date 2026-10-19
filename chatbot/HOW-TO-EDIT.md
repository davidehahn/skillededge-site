# How to edit the /chatbot page (no coding needed)

Everything on **skillededge.io/chatbot**, including every answer the demo chatbot gives, comes from one file:

**`chatbot/content.json`**

You never need to touch `index.html`, `chatbot.js` or `chatbot.css`.

## Edit on GitHub (from any browser)

1. Go to https://github.com/davidehahn/skillededge-site/blob/main/chatbot/content.json
2. Click the pencil icon (**Edit this file**).
3. Change the text you want (see below). Only change the words **inside the quotes**.
4. Click **Commit changes…** → write a short note (e.g. "Update FAQ") → **Commit changes**.
5. Vercel republishes the site automatically in about a minute.
   (Until this page is merged into `main`, edit it on the `chatbot-page` branch instead. Those changes show on the preview link, not the live site.)

If you make a typo that breaks the file, the page shows a "didn't load correctly" message. Open the file's **History**, click the previous version, and copy it back, or ask Grok Bot to fix it.

## Common edits

| What you want to change | Where in content.json |
| --- | --- |
| Add the Loom video | `settings.loomUrl`: paste the Loom share link, e.g. `"https://www.loom.com/share/abc123..."`. Leave it `""` to show the "Video coming soon" card. |
| Turn on checkout | `settings.stripePaymentLink`: paste the Stripe Payment Link, e.g. `"https://buy.stripe.com/..."`. Leave it `""` and the button says "Checkout opening soon" and points to the free-demo form. |
| Contact email | `settings.contactEmail` (used by the free-demo form and footer). |
| Prices shown on the page | `page.pricing` (`setupFee`, `monthlyFee`, `summary`, `points`). **Also update the "How much does it cost?" answer in `bot.salesFaq`** so the bot matches. |
| Page headings and copy | `page.hero`, `page.problem`, `page.steps`, `page.included`, `page.safety`, `page.freeDemo` … |
| FAQ / demo bot answers | `bot.salesFaq` (questions about the service) |
| The fictional sample HVAC shop | `bot.sampleShop` and `bot.sampleShopFaq` |
| Emergency safety message | `bot.emergency.message` (`{phone}` gets filled with the sample shop's number) |

## Adding a new FAQ question

Copy an existing block inside `bot.salesFaq`, paste it after it, and change the text:

```json
{
  "q": "Do you work outside Virginia?",
  "keywords": ["outside virginia", "maryland", "dc", "other states"],
  "a": "Your answer here.",
  "showOnPage": true
},
```

- `q` is the question shown in the FAQ section.
- `a` is the answer (used both in the FAQ list and by the chatbot).
- `keywords` are words or short phrases a visitor might type. The bot picks the FAQ whose keywords best match the question. Add a few ways people might ask it.
- `showOnPage`: `true` shows it in the FAQ list; `false` means the chatbot knows it but it isn't listed.
- Optional `cta`: `["checkout"]` and/or `["demo"]` adds buttons under the bot's answer.
- **Commas:** a comma goes between blocks, and not after the last one in the list.

## Rules the bot follows (built in, in this order)

1. Over the length limit or message limit → polite notice (`settings.maxMessageLength`, `settings.maxMessagesPerVisit`).
2. Emergency words (gas smell, CO, sparks, smoke, fire, flooding…) → the fixed emergency message, before anything else.
3. "How do I fix / why is my … not working" → refuses diagnosis and repair advice.
4. Best FAQ match → that approved answer.
5. No good match (off-topic, e.g. "capital of France") → never guesses, offers the free demo / contact or a callback.

The demo runs entirely in the visitor's browser. It sends nothing anywhere, so it has no AI cost and needs no keys. `settings.aiMode.enabled` is a future switch and does nothing today.

## Honesty rules for edits

Don't add invented stats, testimonials, client results, "guaranteed leads" or "never wrong" claims. Keep the sample shop clearly fictional.
