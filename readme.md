# RibbonCables

RibbonCables is a Typescript FRP Model-View library experiment primarily around signal
"vectorization". It also incorporates proper signal chain resource management and layout jank 
reduction via DOM mutation batching.

## Intro to Signals

```typescript
import type {Reset} from "lib/prelude.js";
import {eq} from "lib/prelude.js";
import type {Signal} from "lib/signal.js";
import * as sig from "lib/signal.js";
```

A `Signal<T>` contains a value of type `T`:

```typescript
const counter: Signal<number> & Reset<number> = sig.source(eq, 0);
console.assert(counter.ref() === 0);
```

The signal value can change over time and the changes can be subscribed to
(via the Observer pattern (`signal.Observable`)):

```typescript
counter.addSubscriber({onChange: (v) => console.log(v)});
// Source signals can be reset directly (as they implement `prelude.Reset`):
counter.reset(counter.ref() + 1); // Prints "1" to console.
```

`Signal.prototype.map` creates a derived signal whose value is always the
value of calling the provided function on the value of the original signal.
So a signal is a functor (in the Haskell sense, not the C++ or OCaml sense):

```typescript
const countStr: Signal<string> = counter.map(eq, (n) => n.toString());
```

We also have `map2` for deriving from two signals:

```typescript
// Incidentally, `multiplier` is unchanging but technically a signal:
const multiplier: Signal<number> = sig.stable(5);
const strider: Signal<number> = counter.map2(eq, (n, k) => n * k, multiplier);
console.assert(strider.ref() === 5);
```

(A production library should also have `map3` etc. It is too bad we cannot have
a type safe variadic map since
[Typescript lacks variadic generics](https://github.com/Microsoft/TypeScript/issues/5453)
(because it is unclear how to implement those sanely in the actual type system 
instead of cheating with template expansion like C++ and D). Most of the code
behind `map2` is actually variadic but has to resort unsafe casts to achieve
that.)

When a signal value does not actually change (here wrt. `prelude.eq` i.e. `===`)
subscribers are not notified to prevent such useless no-op updates from
cascading:

```typescript
counter.reset(counter.ref()); // Does not print anything or inform `countStr`.
```

## Goals

* Dev UX
    - Convenient API
    - Thorough documentation
    - TodoMVC example
* Correctness
    - Strictly typed
    - Thoroughly tested
        * Basic tests
        * Property-based testing
* Performance
    - Microbenchmarks (for e.g. `diff` & `sort`)
    - Macrobenchmarks (e.g. https://github.com/krausest/js-framework-benchmark)

---

* A signal node that is not (transitively) in use by a sink should not be
  referenced by its dependencies. If it were (as it is in some other frameworks)
  the dependencies would keep sending updates to it and its memory would leak
  when it became otherwise unreachable.
    - In general this requires using the
      [Dispose pattern](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/dispose-pattern)
      for sinks.
        - But most sinks will be DOM nodes created by the framework and for
          those the framework can call `dispose` when the node is removed from
          the DOM.
* Optimize array-like signal nodes so that e.g. `map`ped and `filter`ed nodes
  need not call their callback function for every element when only one really
  changed (or worse, was just inserted or removed).
    - `Vecnal` abstraction similar to
      [Qt models](https://doc.qt.io/qt-6/qabstractitemmodel.html#signals)
      and also related to DOM child management (`Node::replaceChild`) and
      [edit distance](https://en.wikipedia.org/wiki/Edit_distance).
        - We can use edit distance -related algorithms such as the
          [Myers Diff](http://www.xmailserver.org/diff2.pdf)
          to efficiently compute a minimal set of changes to the source data
          (e.g. a "frontend database" signal) instead  of using heuristics at
          the last possible moment: when updating the DOM (like some other
          frameworks do and React is forced to do).
    - Internally use
      [RRB vectors](https://www.cs.purdue.edu/homes/rompf/papers/stucki-icfp15.pdf)
      for *O(1)* insertion and deletion in the middle without sacrificing
      *O(1)* indexing (like a doubly linked list would).
* Batch DOM updates to reduce UI jank from layout storms.


## TODO

* Prevent [glitches](https://en.wikipedia.org/wiki/Reactive_programming#Glitches) (due to diamonds and also e.g. `SliceVecnal`)?