import { describe, expect, it } from "vitest";
import { redactDeep, redactString, scrubEvent } from "./scrub";

describe("scrub", () => {
  it("redacts every provider's key shape", () => {
    const s = "a sk-ant-api03-AbCdEfGhIjKlMnOp b sk-proj-AbCdEfGhIjKlMnOpQrSt c AIzaSyA1234567890abcdefghijklmnopqrstu d sk_live_abcdefghijkl";
    const out = redactString(s);
    expect(out).not.toMatch(/sk-ant-|sk-proj-|AIza|sk_live_/);
    expect(out.match(/\[redacted\]/g)).toHaveLength(4);
  });

  it("drops secret-named fields at any depth", () => {
    expect(redactDeep({ a: { apiKey: "x", requestBodyValues: { messages: [] }, ok: 1 } })).toEqual({
      a: { apiKey: "[redacted]", requestBodyValues: "[redacted]", ok: 1 },
    });
  });

  it("drops request bodies, cookies and keys in URLs", () => {
    const e = scrubEvent({
      request: { data: "{\"key\":\"sk-proj-AbCdEfGhIjKlMnOpQrSt\"}", cookies: "s=1", url: "https://x.test/v1/models?key=AIzaSecret", headers: { authorization: "Bearer x", "user-agent": "ua" } },
      exception: { values: [{ value: "401 for sk-proj-AbCdEfGhIjKlMnOpQrSt" }] },
    });
    expect(e.request?.data).toBeUndefined();
    expect(e.request?.cookies).toBeUndefined();
    expect(e.request?.url).toBe("https://x.test/v1/models?key=[redacted]");
    expect(e.request?.headers).toEqual({ authorization: "[redacted]", "user-agent": "ua" });
    expect(e.exception?.values?.[0]?.value).toBe("401 for [redacted]");
  });
});
