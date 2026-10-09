import { NextRequest } from "next/server";
import { getRedirectUrl, getRewrittenUrl, isRewrite, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { config, maintenanceOn, proxy } from "./proxy";

function req(url: string, cookie = "better-auth.session_token=abc") {
  const u = new URL(url);
  return new NextRequest(url, { headers: { host: u.host, cookie } });
}

describe("proxy host routing", () => {
  it("sends the app host to the app tree", () => {
    const res = proxy(req("https://app.41prompts.ai/settings"));
    expect(isRewrite(res)).toBe(true);
    expect(new URL(getRewrittenUrl(res)!).pathname).toBe("/app/settings");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("sends the root of each host to its tree root", () => {
    expect(new URL(getRewrittenUrl(proxy(req("https://app.41prompts.ai/")))!).pathname).toBe("/app");
    expect(new URL(getRewrittenUrl(proxy(req("https://41prompts.ai/")))!).pathname).toBe("/site");
  });

  it("sends every other host, including previews, to the site tree", () => {
    for (const url of ["https://41prompts.ai/terms", "https://www.41prompts.ai/terms", "https://41p-git-x.vercel.app/terms"]) {
      expect(new URL(getRewrittenUrl(proxy(req(url)))!).pathname).toBe("/site/terms");
    }
  });

  it("keeps the internal trees unreachable from the wrong host", () => {
    expect(new URL(getRewrittenUrl(proxy(req("https://41prompts.ai/app/settings")))!).pathname).toBe("/site/app/settings");
    expect(new URL(getRewrittenUrl(proxy(req("https://app.41prompts.ai/site")))!).pathname).toBe("/app/site");
  });

  it("keeps the query string", () => {
    expect(getRewrittenUrl(proxy(req("https://app.41prompts.ai/sign-in?next=%2Fp%2Fx")))).toContain("?next=%2Fp%2Fx");
  });

  it("skips api, framework, analytics and asset paths", () => {
    for (const url of ["/api/health", "/api/auth/callback/google", "/_next/static/x.js", "/ingest/e", "/monitoring", "/assets/cursors/cursor-arrow.svg", "/favicon.svg"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig, url }), url).toBe(false);
    }
    for (const url of ["/", "/settings", "/p/support-reply", "/robots.txt", "/sign-in"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig, url }), url).toBe(true);
    }
  });

  it("shows the maintenance page on every host while maintenance is on", () => {
    process.env.MAINTENANCE_MODE = "1";
    try {
      for (const url of ["https://41prompts.ai/", "https://app.41prompts.ai/settings", "https://41prompts.ai/terms"]) {
        expect(new URL(getRewrittenUrl(proxy(req(url)))!).pathname).toBe("/maintenance");
      }
    } finally {
      delete process.env.MAINTENANCE_MODE;
    }
  });
});

describe("proxy sign-in gate", () => {
  it("redirects app pages without a session cookie to sign-in, keeping the path", () => {
    const res = proxy(req("https://app.41prompts.ai/p/support-reply?v=3", ""));
    expect(getRedirectUrl(res)).toBe("https://app.41prompts.ai/sign-in?next=%2Fp%2Fsupport-reply%3Fv%3D3");
    expect(getRedirectUrl(proxy(req("https://app.41prompts.ai/", "")))).toBe("https://app.41prompts.ai/sign-in");
  });

  it("lets public app pages and the site through without a cookie", () => {
    for (const url of ["https://app.41prompts.ai/sign-in", "https://app.41prompts.ai/sign-in/verify?token=x", "https://app.41prompts.ai/goodbye", "https://41prompts.ai/terms"]) {
      expect(isRewrite(proxy(req(url, ""))), url).toBe(true);
    }
  });

  it("accepts the secure cookie name used in production", () => {
    expect(isRewrite(proxy(req("https://app.41prompts.ai/settings", "__Secure-better-auth.session_token=abc")))).toBe(true);
  });
});

describe("maintenanceOn", () => {
  it("defaults on in Vercel production only, and the variable overrides it", () => {
    expect(maintenanceOn({ VERCEL_ENV: "production" })).toBe(true);
    expect(maintenanceOn({ VERCEL_ENV: "preview" })).toBe(false);
    expect(maintenanceOn({})).toBe(false);
    expect(maintenanceOn({ VERCEL_ENV: "production", MAINTENANCE_MODE: "0" })).toBe(false);
    expect(maintenanceOn({ MAINTENANCE_MODE: "1" })).toBe(true);
  });
});

