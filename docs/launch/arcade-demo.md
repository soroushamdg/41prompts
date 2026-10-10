# Arcade demo for the Product Hunt launch

A click-through of the Free plan, about 60 seconds and 13 steps, recorded with the Arcade Chrome extension and pasted into the launch form's "Link to the demo" field.

## 1. Before you record (10 minutes)

1. **Add a model.** Settings → Your models → Add model. A hosted provider shows a real cost after the run; Ollama or LM Studio shows $0. Do this before recording so no key ever appears on screen.
2. **Make the finished prompt.** New prompt → paste the text in section 2 → name it `support-reply` → Create prompt. In the editor, split it into four bloks and set their types so they read:
   - **Context:** You are a support agent for Northwind Outfitters, an outdoor gear shop. Customers write in about orders, returns and sizing.
   - **Constraint:** Reply in under 80 words. Greet the customer as {{customer_name}}.
   - **Example:** Customer: My boots arrived in the wrong size. Agent: Sorry about that, Sam. I've started an exchange for a size 10, and a prepaid label is in your inbox.
   - **Expects:** Never promises a refund. Links the returns page whenever returns come up.
3. **Give it some history.** In the constraint blok, change "80 words" to "120 words", wait for "Saved", then "100 words", then back to "80 words". That leaves several versions in History to name and restore. Fill the variable `customer_name` with **Sam**.
4. **Set up Chrome.** A clean profile with no other extensions, one tab, bookmarks bar hidden, window about 1440×900, zoom 100%. Open the library at app.41prompts.ai.

## 2. Text to paste in step 2

```
You are a support agent for Northwind Outfitters, an outdoor gear shop. Customers write in about orders, returns and sizing. Reply in under 80 words. Greet the customer as {{customer_name}}.
```

## 3. Recording script

Start Arcade on the library, then do one click per row. The caption goes on that step's hotspot.

| # | Do this | Hotspot caption |
|---|---|---|
| 1 | Click **New prompt** | Every prompt lives in your private library. Start a new one. |
| 2 | Paste the text into **Your prompt**, name it `support-reply-draft` | Paste the prompt you already use. Markdown and {{variables}} stay exactly as you wrote them. |
| 3 | Click **Create prompt** (with "Variables found: customer_name" visible) | Variables are found while you paste. |
| 4 | Put the cursor before "Reply in under 80 words", click **Split here** | On Free your paste starts as one blok. Put the cursor where a new idea starts and split it. |
| 5 | Click the new blok's type label, pick **Constraint** | Give each part a type: context, constraint, example or expects. |
| 6 | In the left rail, open **support-reply** | Here's the same prompt with all four bloks. |
| 7 | Click inside the **Expects** blok | Expects bloks describe a good answer. They never reach the prompt you ship. |
| 8 | Click **Filled** in the compiled panel | The compiled prompt rebuilds as you edit. Switch to Filled to see your variables in place. |
| 9 | Click **Copy prompt** | One click copies it. Markdown and JSON are one more click away. |
| 10 | Open **History**, click **Name this version**, type `works on Claude`, **Save name** | Every save is a version. Name the one that works. |
| 11 | Click **Restore** on an older version | Restore any version. It comes back as a new one, so nothing is overwritten. |
| 12 | Open **Run**, pick your model, type "My boots arrived in the wrong size." in **Test message** | Run it on your own model: 20+ providers, any OpenAI-compatible endpoint, or a local model. |
| 13 | Click **Run once** and let the reply stream | The reply streams in with tokens, time and cost. The provider bills you directly. |

## 4. In the Arcade editor

- **Title:** 41prompts in 60 seconds
- **Description:** Paste a prompt, split it into typed bloks, copy it, version it and run it on your own model. Free, unlimited, no card.
- **Intro chapter:** "Your prompt is a wall of text. Let's give it parts you can name." Button: **Show me**.
- **Outro chapter:** "Free, unlimited, no card." Button: **Start free** → `https://app.41prompts.ai/sign-in`. Second button: **See 41prompts.ai** → `https://41prompts.ai`.
- **Theme:** hotspot and button colour `#9CC3FF` with text `#0A1830`, or chalk `#E9F1FF` on ground `#0A1830` to match the site.
- **Zoom:** turn on pan and zoom for steps 4, 5, 8 and 9, where the controls are small.
- **Clean up:** delete stray clicks, and check that no key, email address or other prompt shows anywhere. Blur anything that does.
- **Publish,** copy the share link and paste it into Product Hunt's "Link to the demo".
