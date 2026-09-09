// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

// Corpus prompts that exercise the character level: line endings, invisible characters, scripts
// that are not Latin, and the degenerate inputs. Anything invisible is written as an escape, so
// the fixture cannot be silently "fixed" by an editor that strips a BOM or normalises newlines.

import type { SegmentFixture } from "../types.js";
import { cr, crlf, lf } from "./text.js";

export const ENCODING_FIXTURES: readonly SegmentFixture[] = [
  {
    name: "crlf-line-endings",
    describes:
      "Every line ends CRLF, as a prompt pasted from a Windows editor does. Must segment exactly like the same prompt with LF; the prototype's /\\n{2,}/ could not see the paragraph breaks at all.",
    text: crlf(
      "You are a meeting-notes summariser.",
      "",
      "Rules:",
      "1. One bullet per decision.",
      "2. Name the owner of every action.",
      "3. Never invent an owner. Write \"unassigned\" instead.",
      "",
      "Return markdown with no preamble.",
      ""
    )
  },
  {
    name: "lone-cr-line-endings",
    describes: "Lone carriage returns as line endings — the case nobody plans for, and the one that silently makes a whole prompt one paragraph.",
    text: cr("You classify bug reports.", "", "Severity 1 means data loss.", "Severity 2 means a broken workflow.", "")
  },
  {
    name: "tab-indented",
    describes: "Tabs for indentation, inside a list and inside a fence. Tab-nested items stay with their parent item; a tab-indented line is not a fence.",
    text: lf(
      "Checklist before you answer:",
      "",
      "-\tRead the whole thread.",
      "\t-\tIncluding the quoted replies.",
      "-\tCheck the account tier.",
      "\t-\tFree accounts get the short answer.",
      "\t-\tPaid accounts get the full walkthrough.",
      "",
      "Then answer in under 120 words.",
      ""
    )
  },
  {
    name: "emoji-and-combining",
    describes:
      "Astral emoji (surrogate pairs), a ZWJ family sequence, and precomposed against decomposed accents. Offsets are UTF-16 code units, and no boundary may fall inside a pair.",
    text: lf(
      "You are a release-notes bot. 🚀",
      "",
      "Prefix each section with its marker:",
      "- Added ✨",
      "- Fixed 🐛",
      "- Removed 🗑️",
      "",
      "Sign off from the whole team 👩‍👩‍👧‍👦 and mention Beyonc\u00E9 and Beyonce\u0301 the same way.",
      ""
    )
  },
  {
    name: "right-to-left",
    describes: "Arabic and Hebrew text mixed with Latin. Segmentation is by code unit and by punctuation, and must not care which direction the script runs.",
    text: lf(
      "أنت مساعد دعم فني. تحدث بالعربية الفصحى.",
      "",
      "القواعد:",
      "1. أجب دائماً بصيغة JSON فقط.",
      "2. لا تذكر أنك نموذج ذكاء اصطناعي.",
      "",
      "אתה גם עונה בעברית כשצריך. תשובות קצרות בלבד.",
      "",
      "Never mix two languages inside one answer.",
      ""
    )
  },
  {
    name: "byte-order-mark",
    describes:
      "A prompt that begins with U+FEFF. The BOM is ECMAScript whitespace, so it stays in the gap before the first segment rather than at the head of the first segment's text.",
    text: `\uFEFF${lf(
      "You are a CSV cleaning assistant.",
      "",
      "Strip the byte-order mark from any file you are given before parsing it.",
      "Never strip it from the file the user keeps.",
      ""
    )}`
  },
  {
    name: "nearly-empty",
    describes: "A one-word prompt with no punctuation and no trailing newline. The smallest input that still produces a segment.",
    text: "Summarise"
  },
  {
    name: "whitespace-only",
    describes: "Spaces, tabs, newlines, a non-breaking space and a BOM, and nothing else. Produces no segments at all, and still reconstructs exactly.",
    text: " \t\n\n  \r\n\u00A0\uFEFF \t "
  },
  {
    name: "no-trailing-newline",
    describes: "Ends mid-sentence with no line terminator, the way a textarea's value usually arrives.",
    text: lf(
      "You answer questions about our API.",
      "",
      "If you do not know an endpoint, say so and link the reference. Never guess a path or a parameter name",
      "and never invent a status code"
    )
  }
];
