// Copyright (c) 2025 Laurin Weger, Par le Peuple, NextGraph.org developers
// All rights reserved.
// Licensed under the Apache License, Version 2.0
// <LICENSE-APACHE2 or http://www.apache.org/licenses/LICENSE-2.0>
// or the MIT license <LICENSE-MIT or http://opensource.org/licenses/MIT>,
// at your option. All files in the project carrying such
// notice may not be copied, modified, or distributed except
// according to those terms.
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { addWithId, deepSignal, getRaw, isDeepSignal } from '../../deepSignal';
import type { DeepPatch } from '../../types';
import { watch } from '../../watch';
import { createIteratorWithHelpers } from '../../iteratorHelpers';

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
        registerCleanup(() => log.push('cleanup'));
      },
      { immediate: true },
    );

    st.a = 2;
    await Promise.resolve();
    expect(log).toEqual(['callback', 'cleanup', 'callback']);
  });

  it('cleanup is invoked when once-watcher fires via stopListening', async () => {
    const st = deepSignal({ a: 1 });
    let cleaned = false;
    const { registerCleanup } = watch(
      st,
      () => {
        registerCleanup(() => {
          cleaned = true;
        });
      },
      { immediate: true },
    );
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

// ─── deepSignal – buildPath with numeric segment (lines 254–256) ─────────────

describe('deepSignal – buildPath with numeric array index after splice', () => {
  it('emits correct patch path after splice re-indexes elements (number index in meta)', async () => {
    const st = deepSignal({ arr: [{ x: 1 }, { x: 2 }, { x: 3 }] as any[] });
    const patches: DeepPatch[] = [];
    const { stopListening } = watch(st, ({ patches: p }) => patches.push(...p));

    // Access elements so their proxies are cached
    st.arr[0].x;
    st.arr[1].x;
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
    const { stopListening } = watch(st, ({ patches: p }) => patches.push(...p));
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
    st.data = [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }];
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
    const st = deepSignal({ arr: [] as any[] }, { syntheticIdPropertyName: 'myId' });
    const patches: DeepPatch[] = [];
    const { stopListening } = watch(st, ({ patches: p }) => patches.push(...p));
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

    st.s.forEach(function (value: any, value2: any, set: any) {
      received.push({ value, value2, set });
    });

    expect(received).toHaveLength(1);
    expect(received[0].value.v).toBe(1);
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
      s: new Set<any>([{ id: 'a', v: 1 }, { id: 'b', v: 2 }]),
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
      const iter = createIteratorWithHelpers(
        () =>
          val < 2
            ? ({ value: ++val, done: false } as IteratorResult<number, undefined>)
            : ({ value: undefined, done: true } as IteratorResult<number, undefined>),
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
        () => ({ value: 1, done: false } as IteratorResult<number, undefined>),
      );
      expect(iter[Symbol.iterator]()).toBe(iter);
    } finally {
      (globalThis as any).Iterator = orig;
    }
  });
});
