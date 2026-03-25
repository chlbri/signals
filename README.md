# @bemedev/signals

Deep structural reactivity for plain objects, arrays and Sets — built on
top of [alien-signals](https://www.npmjs.com/package/alien-signals),
**without any frontend-framework dependency**.

Inspired by
[`@ng-org/alien-deepsignals`](https://www.npmjs.com/package/@ng-org/alien-deepsignals).
All the core deep-reactivity logic is preserved.

> **Credits** — original deep-signal implementation by
> [Laurin Weger](https://www.npmjs.com/package/@ng-org/alien-deepsignals)
> (Par le Peuple / NextGraph.org). Licensed under Apache-2.0 OR MIT.

<br/>

## Installation

```bash
pnpm add @bemedev/signals
# or
npm install @bemedev/signals
# or
yarn add @bemedev/signals
```

> Requires Node.js ≥ 24.

<br/>

## Quick start

```ts
import {
  deepSignal,
  computed,
  batch,
  effect,
  watch,
} from '@bemedev/signals';

const state = deepSignal({
  user: { firstName: 'Ada', lastName: 'Lovelace' },
  scores: [10, 20, 30],
});

// Derived value — recomputes lazily
const fullName = computed(
  () => `${state.user.firstName} ${state.user.lastName}`,
);
console.log(fullName()); // "Ada Lovelace"

// Reactive side-effect
effect(() =>
  console.log(
    'Score sum:',
    state.scores.reduce((a, b) => a + b, 0),
  ),
);
// → "Score sum: 60"

// Batch multiple writes → effects/computed run only once
batch(() => {
  state.user.firstName = 'Grace';
  state.scores.push(40);
});
// → "Score sum: 100"

// Watch deep mutations
const { stopListening } = watch(state, ({ patches, newValue }) => {
  console.log('patches:', patches);
  console.log('newValue:', newValue);
});

state.user.lastName = 'Hopper'; // triggers watch callback
stopListening(); // unsubscribe
```

<br/>

## API

### `deepSignal(value, options?)`

Wraps a plain object, array or `Set` in a deep-reactive proxy. Nested
objects/arrays/Sets are wrapped automatically.

```ts
const state = deepSignal({ count: 0, tags: new Set(['ts']) });
state.count = 1; // reactive mutation
state.tags.add('js'); // reactive Set mutation
```

**Options** (`DeepSignalOptions`):

| Option                           | Type                             | Description                                                                                   |
| -------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| `propGenerator`                  | `DeepSignalPropGenFn`            | Called when new objects attach; may return additional properties                              |
| `syntheticIdPropertyName`        | `string`                         | Property name used as identifier inside `Set` patches                                         |
| `readOnlyProps`                  | `string[]`                       | Properties that are read-only once attached                                                   |
| `replaceProxiesInBranchOnChange` | `boolean`                        | Replace proxies on the path to a mutated property — required for identity checks (e.g. React) |
| `subscriberFactories`            | `Set<ExternalSubscriberFactory>` | External `onGet`/`onSet` hooks                                                                |

---

### `watch(source, callback, options?)`

High-level watcher that fires whenever the deep signal mutates.

```ts
const { stopListening, registerCleanup } = watch(
  state,
  ({ patches, version, newValue }) => {
    /* ... */
  },
  { immediate: false, once: false, triggerInstantly: false },
);
```

**`WatchOptions`**:

| Option             | Default | Description                                                                             |
| ------------------ | ------- | --------------------------------------------------------------------------------------- |
| `immediate`        | `false` | Fire callback immediately after `watch()` is called                                     |
| `once`             | `false` | Auto-unsubscribe after first event                                                      |
| `triggerInstantly` | `false` | Call callback synchronously on every property change instead of batching in a microtask |

---

### `computed(getter)`

Lazy derived signal — re-export from `alien-signals`.

```ts
const double = computed(() => state.count * 2);
console.log(double()); // reads the cached value or recomputes
```

---

### `batch(fn)`

Defers all downstream recomputations until `fn` returns.

```ts
batch(() => {
  state.a = 1;
  state.b = 2;
}); // effects/computed run once, not twice
```

---

### `effect(fn)`

Runs `fn` immediately and re-runs it whenever any signal read inside it
changes. Re-export from `alien-signals`.

---

### `getRaw(proxy)`

Unwraps a deep-signal proxy and returns the underlying raw object.

---

### `isDeepSignal(value)`

Type guard — returns `true` if `value` is a deep-signal proxy created by
`deepSignal()`.

---

### `shallow(value)`

Marks an object so that it is **not** made deeply reactive when assigned
into a deep signal.

```ts
const state = deepSignal({ config: shallow({ debug: true }) });
// state.config is NOT a reactive proxy
```

---

### `addWithId(set, item)`

Helper to add an item to a `Set` that lives inside a deep signal, ensuring
the correct synthetic-id bookkeeping.

---

### `subscribeDeepMutations(rootId, callback, triggerInstantly?)`

Low-level subscription API. Use `watch()` unless you need direct access to
the patch stream.

<br/>

## Types

| Type                 | Description                                                 |
| -------------------- | ----------------------------------------------------------- |
| `DeepSignal<T>`      | A deeply reactive version of `T`                            |
| `DeepPatch`          | A single structural change (`add` / `remove` with a `path`) |
| `DeepPatchBatch`     | A versioned batch of `DeepPatch` entries                    |
| `WatchPatchEvent<T>` | Payload received by a `watch` callback                      |
| `DeepSignalOptions`  | Options for `deepSignal()`                                  |

<br/>

## Licence

MIT

## CHANGELOG

Read [CHANGELOG.md](CHANGELOG.md) for more details about the changes.

<br/>

## Auteur

chlbri (bri_lvi@icloud.com)

[My github](https://github.com/chlbri?tab=repositories)

[<svg width="98" height="96" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" fill="#24292f"/></svg>](https://github.com/chlbri?tab=repositories)

<br/>

## Liens

- [Documentation](https://github.com/chlbri/new-package)
