// Copyright (c) 2025 Laurin Weger, Par le Peuple, NextGraph.org developers
// All rights reserved.
// Licensed under the Apache License, Version 2.0
// <LICENSE-APACHE2 or http://www.apache.org/licenses/LICENSE-2.0>
// or the MIT license <LICENSE-MIT or http://opensource.org/licenses/MIT>,
// at your option. All files in the project carrying such
// notice may not be copied, modified, or distributed except
// according to those terms.
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { alienSignal, batch, effect } from '../core';

describe('batch', () => {
  it('returns the value produced by the callback', () => {
    const result = batch(() => 42);
    expect(result).toBe(42);
  });

  it('defers effect execution until the batch ends', () => {
    const count = alienSignal(0);
    const other = alienSignal(0);
    let runs = 0;

    effect(() => {
      count();
      other();
      runs++;
    });

    // initial run
    expect(runs).toBe(1);

    batch(() => {
      count(count() + 1);
      other(other() + 1);
    });

    // both updates merged into a single effect re-run
    expect(runs).toBe(2);
  });

  it('effect runs once per signal update outside of a batch', () => {
    const sig = alienSignal(0);
    let runs = 0;

    effect(() => {
      sig();
      runs++;
    });

    expect(runs).toBe(1);

    sig(1);
    sig(2);

    // without batch each write triggers an effect run
    expect(runs).toBe(3);
  });

  it('effect runs only once for multiple updates inside a batch', () => {
    const sig = alienSignal(0);
    let runs = 0;

    effect(() => {
      sig();
      runs++;
    });

    expect(runs).toBe(1);

    batch(() => {
      sig(1);
      sig(2);
      sig(3);
    });

    expect(runs).toBe(2);
  });

  it('still ends the batch and rethrows when the callback throws', () => {
    const sig = alienSignal(0);
    let runs = 0;

    effect(() => {
      sig();
      runs++;
    });

    expect(runs).toBe(1);

    expect(() =>
      batch(() => {
        sig(99);
        throw new Error('boom');
      }),
    ).toThrow('boom');

    // the batch ended (via finally) so the effect should have re-run
    expect(runs).toBe(2);
    expect(sig()).toBe(99);
  });

  it('supports nested batches', () => {
    const a = alienSignal(0);
    const b = alienSignal(0);
    let runs = 0;

    effect(() => {
      a();
      b();
      runs++;
    });

    expect(runs).toBe(1);

    batch(() => {
      a(1);
      batch(() => {
        b(1);
      });
    });

    // outer batch flushes once
    expect(runs).toBe(2);
  });
});
