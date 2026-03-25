// Copyright (c) 2025 Laurin Weger, Par le Peuple, NextGraph.org developers
// All rights reserved.
// Licensed under the Apache License, Version 2.0
// <LICENSE-APACHE2 or http://www.apache.org/licenses/LICENSE-2.0>
// or the MIT license <LICENSE-MIT or http://opensource.org/licenses/MIT>,
// at your option. All files in the project carrying such
// notice may not be copied, modified, or distributed except
// according to those terms.
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  addWithId,
  deepSignal,
  getDeepSignalRootId,
  getDeepSignalVersion,
  getRaw,
  isDeepSignal,
  setSetEntrySyntheticId,
  subscribeDeepMutations,
} from '../deepSignal';
import { createIteratorWithHelpers } from '../iteratorHelpers';
import type { DeepPatch } from '../types';
import { watch } from '../watch';

// ─── watch – registerCleanup / runCleanup ────────────────────────────────────

describe('watch – registerCleanup', () => {
  it('cleanup fn is called when stopListening is invoked', () => {
    const st = deepSignal({ a: 1 });
    const { registerCleanup, stopListening } = watch(st, () => {});
    let called = false;
    registerCleanup(() => {
      called = true;
    });
    stopListening();
    expect(called).toBe(true);
  });

  it('cleanup fn is called before each subsequent delivery', async () => {
    const st = deepSignal({ a: 1 });
    const log: string[] = [];
    const { registerCleanup } = watch(st, () => {
      log.push('callback');
    });
    registerCleanup(() => log.push('cleanup'));

    st.a = 2;
    await Promise.resolve();
    expect(log).toEqual(['cleanup', 'callback']);
  });

  it('cleanup fn registered inside callback is called before next delivery', async () => {
    const st = deepSignal({ a: 1 });
    const log: string[] = [];
    const { registerCleanup } = watch(
      st,
      () => {
        log.push('callback');
      },
      { immediate: true },
    );
    registerCleanup(() => log.push('cleanup'));

    st.a = 2;
    await Promise.resolve();
    expect(log).toEqual(['callback', 'cleanup', 'callback']);
  });

  it('cleanup is invoked when once-watcher fires via stopListening', async () => {
    const st = deepSignal({ a: 1 });
    let cleaned = false;
    const { registerCleanup } = watch(st, () => {}, { immediate: true });

    registerCleanup(() => {
      cleaned = true;
    });
    // after immediate call the cleanup is registered; trigger once more
    st.a = 2;
    await Promise.resolve();
    expect(cleaned).toBe(true);
  });
});

// ─── deepSignal – no-listener patch scheduling (lines 315–317) ──────────────

describe('deepSignal – microtask skipped when listener removed synchronously', () => {
  it('does not invoke callback if stopListening is called before microtask', async () => {
    const st = deepSignal({ a: 1 });
    let called = false;
    const { stopListening } = watch(st, () => {
      called = true;
    });
    st.a = 2; // schedules microtask
    stopListening(); // removes the listener before microtask fires
    await Promise.resolve();
    expect(called).toBe(false);
  });
});
// ─── watch – branch coverage for stopListening / deliver / once ──────────────

describe('watch – edge-case branch coverage', () => {
  it('calling stopListening twice is idempotent (covers !active branch)', () => {
    const st = deepSignal({ a: 1 });
    const { stopListening } = watch(st, () => {});
    stopListening();
    // Second call should be a no-op without throwing
    expect(() => stopListening()).not.toThrow();
  });

  it('mutation after stopListening produces no callback (covers !active in deliver)', async () => {
    const st = deepSignal({ a: 1 });
    let calls = 0;
    const { stopListening } = watch(st, () => {
      calls++;
    });
    stopListening();
    st.a = 2;
    await Promise.resolve();
    expect(calls).toBe(0);
  });

  it('once: false watcher fires multiple times (covers once false-branch)', async () => {
    const st = deepSignal({ a: 1 });
    let calls = 0;
    const { stopListening } = watch(st, () => {
      calls++;
    });
    st.a = 2;
    await Promise.resolve();
    st.a = 3;
    await Promise.resolve();
    expect(calls).toBe(2);
    stopListening();
  });

  it('triggerInstantly option delivers patches synchronously', async () => {
    const st = deepSignal({ a: 1 });
    const patches: DeepPatch[] = [];
    const { stopListening } = watch(
      st,
      ({ patches: p }) => patches.push(...p),
      { triggerInstantly: true },
    );
    st.a = 2;
    // With triggerInstantly, the callback fires before the microtask
    expect(patches.length).toBeGreaterThan(0);
    stopListening();
  });
});
// ─── deepSignal – buildPath with numeric segment (lines 254–256) ─────────────

describe('deepSignal – buildPath with numeric array index after splice', () => {
  it('emits correct patch path after splice re-indexes elements (number index in meta)', async () => {
    const st = deepSignal({
      arr: [{ x: 1 }, { x: 2 }, { x: 3 }] as any[],
    });
    const patches: DeepPatch[] = [];
    const { stopListening } = watch(st, ({ patches: p }) =>
      patches.push(...p),
    );

    // Access elements so their proxies are cached
    // oxlint-disable-next-line no-unused-expressions
    st.arr[0].x;
    // oxlint-disable-next-line no-unused-expressions
    st.arr[1].x;
    // oxlint-disable-next-line no-unused-expressions
    st.arr[2].x;

    // splice shifts elements → refreshNumericIndexSignals uses numeric idx
    st.arr.splice(0, 1);
    await Promise.resolve();
    patches.length = 0; // clear splice patches

    // arr[0] is now old arr[1]; its meta.key was updated to NUMBER 0
    st.arr[0].x = 99;
    await Promise.resolve();

    // Path contains numeric 0 (not string '0') when triggered via numeric meta.key
    const paths = patches.map(p => p.path);
    expect(paths.some(path => path.includes(0))).toBe(true);
    stopListening();
  });
});

// ─── deepSignal – snapshotLiteral returns undefined (lines 601–602) ──────────

describe('deepSignal – setting existing prop to undefined produces no patch', () => {
  it('no patch emitted when an existing property is set to undefined', async () => {
    const st = deepSignal<{ a?: number }>({ a: 1 });
    const patches: DeepPatch[] = [];
    const { stopListening } = watch(st, ({ patches: p }) =>
      patches.push(...p),
    );
    st.a = undefined as any;
    await Promise.resolve();
    expect(patches.length).toBe(0);
    stopListening();
  });
});

// ─── deepSignal – initializeObjectTree Array / Set branches (lines 380–395) ──

describe('deepSignal – initializeObjectTree with array and Set (no listener)', () => {
  it('handles an array value assigned without an active listener', () => {
    const st = deepSignal(
      { data: null as any },
      {
        syntheticIdPropertyName: 'id',
        propGenerator: ({ object }) => ({ syntheticId: object.id }),
      },
    );
    // No listener → initializeObjectTreeIfNoListeners → initializeObjectTree (array branch)
    st.data = [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ];
    expect(st.data[0].name).toBe('Alice');
    expect(st.data[1].name).toBe('Bob');
  });

  it('handles a Set value assigned without an active listener', () => {
    const st = deepSignal(
      { data: null as any },
      {
        syntheticIdPropertyName: 'id',
        propGenerator: ({ object }) => ({ syntheticId: object.id }),
      },
    );
    // No listener → initializeObjectTreeIfNoListeners → initializeObjectTree (Set branch)
    st.data = new Set([{ id: 'setItem', name: 'Charlie' }]);
    expect(st.data.size).toBe(1);
  });
});

// ─── deepSignal – array push assigns tmp @id when syntheticIdPropertyName ≠ '@id' ──

describe('deepSignal – tmp @id assigned for array objects with custom syntheticIdPropertyName', () => {
  it('assigns a tmp-prefixed @id to objects pushed into arrays', async () => {
    const st = deepSignal(
      { arr: [] as any[] },
      { syntheticIdPropertyName: 'myId' },
    );
    const patches: DeepPatch[] = [];
    const { stopListening } = watch(st, ({ patches: p }) =>
      patches.push(...p),
    );
    const obj = { value: 1 };
    st.arr.push(obj);
    await Promise.resolve();
    // The raw object should have been given a tmp @id by the scheduler
    expect((obj as any)['@id']).toMatch(/^tmp-/);
    stopListening();
  });
});

// ─── deepSignal – Set.getById / getBy (lines 1030–1037) ──────────────────────

describe('deepSignal – Set.getById and getBy', () => {
  it('getById returns a proxied entry for a known id', () => {
    const st = deepSignal(
      { s: new Set<any>() },
      {
        syntheticIdPropertyName: 'id',
        propGenerator: ({ object }) => ({ syntheticId: object.id }),
      },
    );
    addWithId(st.s as any, { id: 'item1', value: 42 }, 'item1');

    const found = (st.s as any).getById('item1');
    expect(found).toBeDefined();
    expect(found.value).toBe(42);
  });

  it('getById returns undefined for an unknown id', () => {
    const st = deepSignal({ s: new Set<any>() });
    expect((st.s as any).getById('nonexistent')).toBeUndefined();
  });

  it('getBy delegates to getById using graphIri|subjectIri composite key', () => {
    const st = deepSignal(
      { s: new Set<any>() },
      {
        syntheticIdPropertyName: '@id',
        propGenerator: ({ object, inSet }) =>
          inSet
            ? { syntheticId: `${object['@graph']}|${object['@id']}` }
            : { syntheticId: object['@id'] },
      },
    );
    const obj = { '@graph': 'g1', '@id': 's1', value: 99 };
    addWithId(st.s as any, obj, 'g1|s1');

    const found = (st.s as any).getBy('g1', 's1');
    expect(found).toBeDefined();
    expect(found.value).toBe(99);
  });
});

// ─── deepSignal – Set.forEach with 3-argument callback (lines 1197–1211) ─────

describe('deepSignal – Set.forEach with Set-like 3-argument callback', () => {
  it('calls callback with (value, value, set) when callback.length >= 3', () => {
    const st = deepSignal({ s: new Set<any>([{ id: 'a', v: 1 }]) });
    const received: { value: any; value2: any; set: any }[] = [];

    st.s.forEach(function (value: any, value2: any, setArg: any) {
      received.push({ value, value2, set: setArg });
    });

    expect(received).toHaveLength(1);
    expect(received[0].value.v).toBe(1);
    // Custom forEach (3-arg path): value and value2 are the same proxy
    expect(received[0].value2).toBe(received[0].value);
    expect(isDeepSignal(received[0].set)).toBe(true);
  });
});

// ─── deepSignal – Set iterator helpers (map/filter etc.) (lines 1177–1193) ───

describe('deepSignal – Set iterator helpers (map/filter/toArray)', () => {
  it('map() projects each entry', () => {
    const st = deepSignal({ s: new Set<any>([{ id: 'x', v: 10 }]) });
    const result = (st.s as any).map((e: any) => e.v).toArray();
    expect(result).toEqual([10]);
  });

  it('filter() selects matching entries', () => {
    const st = deepSignal({
      s: new Set<any>([
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
      ]),
    });
    const result = (st.s as any).filter((e: any) => e.v > 1).toArray();
    expect(result.length).toBe(1);
    expect(result[0].v).toBe(2);
  });

  it('throws TypeError when helper key is not available', () => {
    const orig = (globalThis as any).Iterator;
    try {
      // Disable native iterator helpers so `createIteratorWithHelpers` returns `base`
      // which doesn't have native helpers like .map / .filter
      (globalThis as any).Iterator = undefined;
      const st = deepSignal({ s: new Set<any>([{ id: 'y', v: 5 }]) });
      expect(() => (st.s as any).map((e: any) => e.v)).toThrow(TypeError);
    } finally {
      (globalThis as any).Iterator = orig;
    }
  });
});

// ─── deepSignal – deepSignal(existingDeepSignal, opts) (lines 1255–1267) ─────

describe('deepSignal – re-wrapping an existing deepSignal', () => {
  it('returns the same proxy and merges subscriberFactories', () => {
    const st = deepSignal({ a: 1 });
    const onGetCalls: any[] = [];
    const onSetCalls: any[] = [];
    const factory = () => ({
      onGet: () => onGetCalls.push(true),
      onSet: (v: any) => onSetCalls.push(v),
    });

    const st2 = deepSignal(st, {
      subscriberFactories: new Set([factory]),
    });

    expect(st2).toBe(st);
    // oxlint-disable-next-line no-unused-expressions
    st.a; // triggers onGet
    expect(onGetCalls.length).toBeGreaterThan(0);
    st.a = 2; // triggers onSet
    expect(onSetCalls.length).toBeGreaterThan(0);
  });

  it('merges replaceProxiesInBranchOnChange flag', () => {
    const st = deepSignal({ nested: { x: 1 } });
    const st2 = deepSignal(st, { replaceProxiesInBranchOnChange: true });
    expect(st2).toBe(st);
    // Verify the option is now true by triggering a mutation (no crash)
    st.nested.x = 2;
    expect(st.nested.x).toBe(2);
  });
});

// ─── deepSignal – getRaw (lines 1382–1383) ───────────────────────────────────

describe('deepSignal – getRaw', () => {
  it('returns the raw object from a deepSignal proxy', () => {
    const raw = { a: 1 };
    const st = deepSignal(raw);
    expect(getRaw(st)).toBe(raw);
  });

  it('returns the value as-is when it is already a plain object', () => {
    const plain = { a: 1 };
    expect(getRaw(plain)).toBe(plain);
  });
});

// ─── iteratorHelpers – base.return() with sourceIterator ────────────────────

describe('iteratorHelpers – createIteratorWithHelpers', () => {
  it('base.return() calls sourceIterator.return() when no native Iterator.from', () => {
    const orig = (globalThis as any).Iterator;
    let returnCalled = false;
    try {
      (globalThis as any).Iterator = undefined;

      const source: Iterator<number, unknown, undefined> = {
        next: () => ({ value: 1, done: false as const }),
        return(_v?: any) {
          returnCalled = true;
          return { value: undefined as any, done: true as const };
        },
      };

      const iter = createIteratorWithHelpers(
        () => source.next() as IteratorResult<number, undefined>,
        source as Iterator<unknown, unknown, undefined>,
      );

      iter.return?.();
      expect(returnCalled).toBe(true);
    } finally {
      (globalThis as any).Iterator = orig;
    }
  });

  it('returns base directly when native Iterator.from is unavailable', () => {
    const orig = (globalThis as any).Iterator;
    try {
      (globalThis as any).Iterator = undefined;
      let val = 0;
      const iter = createIteratorWithHelpers(() =>
        val < 2
          ? ({ value: ++val, done: false } as IteratorResult<
              number,
              undefined
            >)
          : ({ value: undefined, done: true } as IteratorResult<
              number,
              undefined
            >),
      );
      expect(iter.next().value).toBe(1);
      expect(iter.next().value).toBe(2);
      expect(iter.next().done).toBe(true);
    } finally {
      (globalThis as any).Iterator = orig;
    }
  });

  it('Symbol.iterator returns itself', () => {
    const orig = (globalThis as any).Iterator;
    try {
      (globalThis as any).Iterator = undefined;
      const iter = createIteratorWithHelpers(
        () =>
          ({ value: 1, done: false }) as IteratorResult<number, undefined>,
      );
      expect(iter[Symbol.iterator]()).toBe(iter);
    } finally {
      (globalThis as any).Iterator = orig;
    }
  });
});

// ─── deepSignal – getDeepSignalVersion with non-deepSignal (branch 1334–1335) ──

describe('deepSignal – getDeepSignalVersion edge cases', () => {
  it('returns undefined for a non-deepSignal plain object (covers !rootId branch)', () => {
    expect(getDeepSignalVersion({})).toBeUndefined();
  });

  it('returns a version number for a valid deepSignal root symbol', () => {
    const st = deepSignal({ a: 1 });
    const rootId = getDeepSignalRootId(st);
    expect(typeof getDeepSignalVersion(rootId!)).toBe('number');
  });
});

// ─── deepSignal – setSetEntrySyntheticId plain-object fallback (branch 1354) ─

describe('deepSignal – setSetEntrySyntheticId with plain object', () => {
  it('applies the synthetic id to a plain object (covers ?? obj fallback)', async () => {
    const plain = { value: 42 };
    // plain is NOT a deepSignal proxy (no RAW_KEY), so forcedSyntheticIds uses `plain`
    setSetEntrySyntheticId(plain, 'myId');

    const st = deepSignal({ s: new Set<any>() });
    const patches: DeepPatch[] = [];
    const { stopListening } = watch(st, ({ patches: p }) =>
      patches.push(...p),
    );
    st.s.add(plain);
    await Promise.resolve();

    const paths = patches.map(p => p.path.join('.'));
    expect(paths.some(p => p.includes('myId'))).toBe(true);
    stopListening();
  });

  it('setSetEntrySyntheticId with a deepSignal proxy covers RAW_KEY ?? branch', async () => {
    const inner = deepSignal({ name: 'proxyEntry' });
    setSetEntrySyntheticId(inner as any, 'proxyId');

    const st = deepSignal({ s: new Set<any>() });
    const patches: DeepPatch[] = [];
    const { stopListening } = watch(st, ({ patches: p }) =>
      patches.push(...p),
    );
    st.s.add(inner);
    await Promise.resolve();

    const paths = patches.map(p => p.path.join('.'));
    expect(paths.some(p => p.includes('proxyId'))).toBe(true);
    stopListening();
  });
});

// ─── deepSignal – subscribeDeepMutations with proxy (branch 1304) ─────────────

describe('deepSignal – subscribeDeepMutations accepts a proxy object', () => {
  it('subscribes and receives patches when called with a deepSignal proxy', async () => {
    const { subscribeDeepMutations } = await import('../deepSignal');
    const st = deepSignal({ a: 1 });
    const batches: any[] = [];
    const unsub = subscribeDeepMutations(st as any, (batch: any) =>
      batches.push(batch),
    );
    st.a = 2;
    await Promise.resolve();
    expect(batches.length).toBeGreaterThan(0);
    unsub();
  });
});

// ─── deepSignal – branches in initializeObjectTree with mixed arrays/sets ─────

describe('deepSignal – initializeObjectTree branches with mixed entries', () => {
  it('skips non-object entries in array (covers entry && typeof === object FALSE)', () => {
    const st = deepSignal(
      { data: null as any },
      {
        syntheticIdPropertyName: 'id',
        propGenerator: ({ object }) => ({
          syntheticId: (object as any).id,
        }),
      },
    );
    // Mix of objects and primitives - primitive entries skip the recursive call
    st.data = [{ id: 'obj1', v: 1 }, null, 42, { id: 'obj2', v: 2 }];
    expect(st.data[0].v).toBe(1);
    expect(st.data[1]).toBeNull();
    expect(st.data[2]).toBe(42);
  });

  it('skips non-object entries in Set (covers entry && typeof === object FALSE in Set branch)', () => {
    const st = deepSignal(
      { data: null as any },
      {
        syntheticIdPropertyName: 'id',
        propGenerator: ({ object }) => ({
          syntheticId: (object as any).id,
        }),
      },
    );
    // Mix of objects and primitives in a Set
    st.data = new Set<any>([{ id: 'setObj', v: 1 }, 42, 'hello']);
    expect(st.data.size).toBe(3);
  });
});

// ─── deepSignal – Symbol.iterator on object proxy (branch 827) ───────────────

describe('deepSignal – Symbol.iterator / symbol-key branches', () => {
  it('iterating over a deepSignal array with for-of triggers Symbol.iterator (branch 827 true)', () => {
    const st = deepSignal([1, 2, 3]);
    const collected: number[] = [];
    for (const item of st) {
      collected.push(item as number);
    }
    expect(collected).toEqual([1, 2, 3]);
  });

  it('symbol key WITH description covers segment.description branch in buildPath', async () => {
    const sym = Symbol('namedKey');
    const st = deepSignal<any>({ [sym]: { v: 1 } });
    const patches: DeepPatch[] = [];
    const { stopListening } = watch(st, ({ patches: p }) =>
      patches.push(...p),
    );
    st[sym].v = 99;
    await Promise.resolve();
    // segment.description = 'namedKey' IS defined → covers the ?? left-branch
    const matchingPath = patches.find(p => p.path.includes('namedKey'));
    expect(matchingPath).toBeDefined();
    stopListening();
  });
});

// ─── deepSignal – emitPatchesForNew with function value (L616 + L301) ────────

describe('deepSignal – emitPatchesForNew with function-typed NEW property', () => {
  it('adding a brand-new function property emits no patch (snapshotLiteral→undefined→return[]→!patches.length)', async () => {
    // Key must NOT pre-exist so hadKey=false → emitPatchesForNew is called
    const st = deepSignal<any>({ a: 1 });
    const patches: DeepPatch[] = [];
    const { stopListening } = watch(st, ({ patches: p }) =>
      patches.push(...p),
    );
    // New key: hadKey=false → !hadKey||typeof===object → TRUE → emitPatchesForNew(fn,...)
    // fn is not an object → snapshotLiteral→undefined → L616: return []
    // result=[], Array.isArray([])→patches=[] → L301: !patches.length return
    (st as any).newFn = () => 42;
    await Promise.resolve();
    expect(
      patches.filter(p => String(p.path).includes('newFn')).length,
    ).toBe(0);
    stopListening();
  });
});

// ─── deepSignal – buildPath Symbol without description (L248 ?? fallback) ────

describe('deepSignal – buildPath with indescribable symbol key', () => {
  it('falls back to symbol.toString() when description is undefined (L248 right-side ??)', async () => {
    const sym = Symbol(); // no description → sym.description = undefined
    const st = deepSignal<any>({ [sym]: 'initial' });
    const patches: DeepPatch[] = [];
    const { stopListening } = watch(st, ({ patches: p }) =>
      patches.push(...p),
    );
    // Mutation triggers objectHandlers.set → buildPath(meta, sym) → format(sym)
    // → sym.description is undefined → ?? takes the right side (toString) → L248 covered
    st[sym] = 'updated';
    await Promise.resolve();
    expect(patches.length).toBeGreaterThan(0);
    stopListening();
  });
});

// ─── deepSignal – getDeepSignalVersion with symbol root (branch 1306–1309) ───

describe('deepSignal – getDeepSignalVersion with symbol root directly', () => {
  it('accepts a root symbol and returns its version', () => {
    const st = deepSignal({ a: 1 });
    const rootSym = getDeepSignalRootId(st)!;
    const ver = getDeepSignalVersion(rootSym);
    expect(typeof ver).toBe('number');
  });
});

// ─── deepSignal – META_KEY access on object proxy (L827) ─────────────────────

describe('deepSignal – __meta__ access on object proxy', () => {
  it('returns the proxy meta when accessing __meta__ key (L827 true branch)', () => {
    const st = deepSignal({ a: 1 });
    // objectHandlers.get: key === META_KEY → returns rawToMeta.get(target)
    const meta = (st as any)['__meta__'];
    expect(meta).toBeDefined();
    expect(typeof meta.root).toBe('symbol');
  });
});

// ─── deepSignal – META_KEY access on Set proxy (L996) ────────────────────────

describe('deepSignal – __meta__ access on Set proxy', () => {
  it('returns the set meta when accessing __meta__ key (L996 true branch)', () => {
    const st = deepSignal({ s: new Set<number>([1, 2]) });
    // setHandlers.get: key === META_KEY → returns meta
    const meta = (st.s as any)['__meta__'];
    expect(meta).toBeDefined();
    expect(typeof meta.root).toBe('symbol');
  });
});

// ─── deepSignal – deleteProperty for well-known symbol (L932/L933) ───────────

describe('deepSignal – delete well-known symbol from object proxy', () => {
  it('delegates deletion of a well-known symbol directly to Reflect (L932+L933)', () => {
    const st = deepSignal<any>({ a: 1 });
    // Symbol.iterator is in wellKnownSymbols → !isReactiveSymbol → TRUE branch
    // → Reflect.deleteProperty called directly
    expect(() => {
      delete (st as any)[Symbol.iterator];
    }).not.toThrow();
  });
});

// ─── deepSignal – .first() on empty Set (L1005) ──────────────────────────────

describe('deepSignal – Set.first() on empty Set', () => {
  it('returns undefined when the Set is empty (L1005 iterator.done true branch)', () => {
    const st = deepSignal({ s: new Set<any>() });
    // setHandlers.get 'first' → iterator.done = true → L1005: return undefined
    const result = (st.s as any).first();
    expect(result).toBeUndefined();
  });
});

// ─── deepSignal – subscribeDeepMutations with non-deepSignal (L1306) ─────────

describe('deepSignal – subscribeDeepMutations throws for non-deepSignal', () => {
  it('throws when passed a plain object (L1306 !rootId throw)', () => {
    // getDeepSignalRootId({}) = undefined → !rootId = true → throw
    expect(() => subscribeDeepMutations({} as any, () => {})).toThrow(
      'subscribeDeepMutations() expects a deepSignal root',
    );
  });
});

// ─── deepSignal – setSetEntrySyntheticId with null/primitive (L1354) ─────────

describe('deepSignal – setSetEntrySyntheticId with null input', () => {
  it('returns early when obj is null (L1354 !obj true branch)', () => {
    // !null = true → early return, no error
    expect(() => setSetEntrySyntheticId(null as any, 'id')).not.toThrow();
  });

  it('returns early when obj is a primitive (L1354 typeof !== object branch)', () => {
    expect(() => setSetEntrySyntheticId(42 as any, 'id')).not.toThrow();
  });
});

// ─── deepSignal – initializeObjectTreeIfNoListeners with null value (L416) ───

describe('deepSignal – initializeObjectTreeIfNoListeners skips null value', () => {
  it('returns early when rawValue is null (L416 !value true branch)', () => {
    const st = deepSignal(
      { data: { x: 1 } as any },
      {
        syntheticIdPropertyName: 'id',
        propGenerator: ({ object }) => ({
          syntheticId: (object as any).id,
        }),
      },
    );
    // No listener → initializeObjectTreeIfNoListeners is called
    // typeof null === 'object' satisfies the call-site guard, but !null = true inside → L416
    (st as any).data = null;
    expect((st as any).data).toBeNull();
  });
});

// ─── deepSignal – initializeObjectTree skips class instances (L395) ──────────

describe('deepSignal – initializeObjectTree skips non-plain-object (L395)', () => {
  it('returns early for class instances (constructor !== Object branch)', () => {
    class MyItem {
      id = 'cls1';
      value = 99;
    }
    const st = deepSignal(
      { data: null as any },
      {
        syntheticIdPropertyName: 'id',
        propGenerator: ({ object }) => ({
          syntheticId: (object as any).id,
        }),
      },
    );
    // No listener → initializeObjectTree is called with MyItem instance
    // value.constructor !== Object → L395: return early
    st.data = new MyItem();
    expect(st.data.value).toBe(99);
  });
});

// ─── deepSignal – re-wrap with undefined subscriberFactories (L1257) ─────────

describe('deepSignal – re-wrapping when subscriberFactories was undefined', () => {
  it('uses [] fallback when meta.options.subscriberFactories is undefined (L1257 ?? right)', () => {
    // Force subscriberFactories to be undefined via spread override
    const st = deepSignal(
      { a: 1 },
      { subscriberFactories: undefined as any },
    );
    const calls: number[] = [];
    const factory = () => ({
      onGet: () => calls.push(1),
      onSet: () => {},
    });
    // Re-wrap: meta.options.subscriberFactories = undefined → ?? [] → L1257 covered
    const st2 = deepSignal(st, {
      subscriberFactories: new Set([factory]),
    });
    expect(st2).toBe(st);
    // Trigger onGet to confirm factory was registered
    void st.a;
    expect(calls.length).toBeGreaterThan(0);
  });
});
