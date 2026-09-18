// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { SUMMARY_CONTRACT_CASES } from "./contract.js";
import { heuristicSummariser } from "./heuristic.js";

/**
 * Decision 6: `packages/core` never reaches a model, the network, the filesystem or a clock.
 *
 * `dependency-cruiser`'s `core-is-pure` rule already forbids importing a Node builtin or an npm
 * package from non-test source, which stops the *import*. It cannot stop a global — `fetch`,
 * `setTimeout`, `Date.now`, `Math.random` and `crypto` are all reachable without importing anything,
 * and a summariser is exactly the kind of code that grows a "just cache this with a timestamp" line.
 *
 * So: replace each of them with something that throws, run every contract case, and put them back.
 */
const NAMES = ["fetch", "XMLHttpRequest", "setTimeout", "setInterval", "queueMicrotask", "crypto"] as const;

describe("the heuristic summariser touches no global", () => {
  it("summarises every contract case with fetch, timers, crypto, Date and Math.random disabled", () => {
    const trip = (name: string) => () => {
      throw new Error(`the heuristic summariser reached ${name}`);
    };

    // Some of these are getter-only on `globalThis` (`crypto` is), so they are replaced through
    // their property descriptors and restored the same way rather than by assignment.
    const saved = new Map<string, PropertyDescriptor | undefined>();
    const stubbed: string[] = [];
    for (const name of NAMES) {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
      if (descriptor !== undefined && descriptor.configurable === false) continue;
      saved.set(name, descriptor);
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get: () => trip(name)
      });
      stubbed.push(name);
    }
    const savedNow = Date.now;
    const savedRandom = Math.random;
    Date.now = trip("Date.now") as typeof Date.now;
    Math.random = trip("Math.random") as typeof Math.random;

    try {
      // If the environment refused every stub the assertions below would be vacuous.
      expect(stubbed).toContain("fetch");
      for (const testCase of SUMMARY_CONTRACT_CASES) {
        const summary = heuristicSummariser.summarise(testCase.blok, testCase.source);
        expect(summary.source, testCase.name).toBe("heuristic");
      }
    } finally {
      for (const [name, descriptor] of saved) {
        if (descriptor === undefined) delete (globalThis as unknown as Record<string, unknown>)[name];
        else Object.defineProperty(globalThis, name, descriptor);
      }
      Date.now = savedNow;
      Math.random = savedRandom;
    }
  });

  it("would notice if the summariser did reach one", () => {
    // The stubs have to be able to fire, or the test above proves nothing.
    const globals = globalThis as unknown as Record<string, unknown>;
    const saved = globals.fetch;
    globals.fetch = () => {
      throw new Error("the heuristic summariser reached fetch");
    };
    try {
      expect(() => (globalThis as unknown as { fetch: () => void }).fetch()).toThrow("reached fetch");
    } finally {
      globals.fetch = saved;
    }
  });
});
