# RibbonCables

RibbonCables is a Typescript FRP Model-View library experiment primarily around
signal [imuxing](https://en.wikipedia.org/wiki/Inverse_multiplexer). It also
incorporates proper signal chain resource management and layout jank reduction
via DOM mutation batching.

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

To achieve the tracking the derived signal subscribes to the original signal
behind the scenes (but only while it itself has subscribers, see "Signal Chain
Resource Management" below).

We also have `map2` for deriving from two signals:

```typescript
// Incidentally, `multiplier` is unchanging but technically a signal:
const multiplier: Signal<number> = sig.stable(5);
const strider: Signal<number> = counter.map2(eq, (n, k) => n * k, multiplier);
console.assert(strider.ref() === 5);
```

(As usual chaining the binary operation (`map2`) is theoretically sufficiently
expressive but cumbersome and inefficient in practice so a production library should also have `map3` etc. It is too bad we cannot have a type safe variadic
map since [Typescript lacks variadic generics](https://github.com/Microsoft/TypeScript/issues/5453) (because it is unclear how to implement those sanely in
the actual type system instead of cheating with template expansion like C++ and
D). Most of the code behind `map2` is actually variadic but has to resort unsafe
casts to achieve that).

When a signal value does not actually change (here wrt. `prelude.eq` i.e. `===`)
subscribers are not notified to prevent such useless no-op updates from
cascading:

```typescript
counter.reset(counter.ref()); // Does not print anything or inform `countStr`.
```

## Inverse Multiplexing of Sequence Signals

Having worked on a number of [Re-Frame](https://day8.github.io/re-frame/) apps I
noticed that most signals actually contain sequential collections and derived 
signals are created with the usual FP sequence functions (`map`, `filter` etc.):

```typescript
type User = {id: number, username: string};

// Obviously these would be fetched from a server in practice:
const users: Signal<readonly User[]> = sig.source(eq, [
	{id: 0, username: "Foo"},
	{id: 1, username: "Bar"}
]);

const userIds: Signal<readonly number[]> = users.map( // `Signal.prototype.map`
	eq,
	(users) => users.map((user) => user.id) // `Array.prototype.map`
);
```

I thought such signal chains might be quite inefficient since most changes would
concern only a minority of `users` but the derived signals need to process full
collections any way.

Furthermore Re-Frame is a framework for [Reagent](https://reagent-project.github.io/)
which in turn is a [React](https://react.dev/) wrapper. So changing a minority
of `users` would produce a variety of user view child lists in the Virtual DOM
which React is actually not very smart at diffing (hence the tiresome
requirement for ubiquituous [keys](https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key)). A library with signals at its core
instead of an additional Model abstraction on top of a VDOM view library can
diff the sequences that the user views are derived from instead of the view
nodes themselves.

But I thought it would be best to move the diffing process to as far up the
signal [DAG](https://en.wikipedia.org/wiki/Directed_acyclic_graph) as possible
and propagate only the element changes (substitutions, additions, deletions and
possibly even moves) through the signal DAG, resulting in a surgical set of DOM
changes and no redundant recomputation of irrelevant elements at intermediate
signal nodes.

So (like surely many other FRP libraries before) we are diffing the current
values of sequence signals with their previous values. Thus we are blessed with
a much richer literature of concepts and solutions than VDOM diffing which has
to deal with trees. Admittedly most of that literature deals with strings of
character or at most files of lines of text like `diff` and `patch`. But
generalizing to sequences of a type `T` that implements an
[equivalence relation](https://en.wikipedia.org/wiki/Equivalence_relation)
(i.e. a function of type `(x: T, y: T) => boolean` as has already been on display in preceding code examples) did not make me bat an eye, having
implemented [Malli seqexes](https://www.metosin.fi/blog/malli-regex-schemas)
where the operations concerning elements were much more numerous and
complicated.

But which notion of [edit distance](https://en.wikipedia.org/wiki/Edit_distance)
or actually the associated [edit script](https://en.wikipedia.org/wiki/String-to-string_correction_problem)
should we use? (An edit script is a sequence of operations that can be applied to change a sequence to equal another e.g. the `diff` output used to `patch` source code in
the olden days.) Although signals can very well exist independent of UI
considerations (and do so in many libraries), we should first examine DOM
operations to ensure efficiency or at the very least minimal development friction in the form of "adapter" code. The relevant DOM operations here are the
[Node](https://developer.mozilla.org/en-US/docs/Web/API/Node) child manipulation
operations

* `appendChild`
* `insertBefore`
* `removeChild`
* and `replaceChild`.

The last three roughly correspond to the edit distance operations of insertion,
deletion and substitution. `appendChild` is merely a specialized version of 
`insertBefore` for just the end (like `Array.prototype.push` is for
`Array.prototype.splice`) and can thus be ignored at this level of abstraction.

An API that is very similar to the fused sequence signals envisioned here is
[QAbstractItemModel](https://doc.qt.io/qt-6/qabstractitemmodel.html) with its
modification signals

* `rowsInserted`
* `rowsMoved`
* and `rowsRemoved`.

(Qt signals are like callback parameters, **not** like our `Signal`s that are
entire mutable objects.) Clearly `rowsInserted` is an insertion event and
`rowsRemoved` is a deletion event. Since the elements in complex Qt models are
likely mutable objects, what would be a substitution in FRP is often handled by
mutating the elements objects instead and genuine substitutions just result in the
obvious pair of removal and insertion. `rowsMoved` is of great interest in terms
of efficiency since the performance gains of React keys are largely due to being
able to move entire subtrees (with `removeChild` followed by `insertBefore`)
instead of having to discard and recreate them for model data that itself has not
changed, just moved (like a "world traveler" with little self-awareness).

Unfortunately considering arbitrary
movement of elements would make the search space too big for an efficient diff
algorithm; React requires keys to be unique and can thus manage in linear time (I
assume), acting more like the register shuffling at CFG joins in certain register
allocation algorithms ([Hack et al. 2006](https://compilers.cs.uni-saarland.de/papers/ssara.pdf),
[Wang & Dybvig 2012](https://arxiv.org/pdf/1202.5539) which I came to know when
writing my [Bachelor's thesis](https://urn.fi/URN:NBN:fi:tty-201904051374)) than
an edit distance -related algorithm. Efficient edit script generation seems to
require only looking at small windows in the input sequences at a time so the best
they can give us in terms of element moves is transposition of two adjacent
elements. Nevertheless we might consider adding a move operation at some point
since most sequence signal nodes could consume and produce them slightly more
efficiently than deletion-insertion pairs even if the general diffing node can
not.

So I settled for the following interface (and a corresponding
`IndexedObservable<T>`) to propagate insertions, deletions and substitutions of
sequence signal elements:

```typescript
// lib/vecnal.ts

interface IndexedSubscriber<T> {
    /** Called when value v is inserted at index i. */
    onInsert: (i: number, v: T) => void;
    
    /** Called when a value is removed at index i. */
    onRemove: (i: number) => void;
    
    // TODO: onMove: (i: number, j: number) => void;
    
    /** Called when a value is replaced with v at index i. */
    onSubstitute: (i: number, v: T) => void;
}
```

So now we can have an inversely muxed source sequence signal, effectively an array
whose changes can be subscribed to:

```typescript
import type {Vecnal} from "lib/vecnal.js";
import * as vec from "lib/vecnal.js";

const vs: Vecnal<number> = vec.source(eq, [1, 2, 3]);

vs.addISubscriber({
	onInsert: (i, v) => console.log("insert", v, "at index", i),
	onRemove: (i) => console.log("delete at index", i),
	onSubstitute: (i, v) => console.log("substitute", v, "at index", i)
});

vs.insert(3, 4); // Prints "insert 4 at index 3".
vs.remove(2); // Prints "remove at index 2".
vs.setAt(2, 3); // Prints "substitute 3 at index 2"
```

More interestingly we can derive Vecnals analogously to familiar FP sequence
functions:

```typescript
const userz: Vecnal<User> = vec.source(eq, [
	{id: 0, username: "Foo"},
	{id: 1, username: "Bar"}
]);

const userIdz: Vecnal<number> = userz.map(eq, (user) => user.id);
```

Not only is that shorter than the `Signal<readonly User[]>` version shown above
(and for `map` specifically, perhaps less confusing) but we should also be able to
make it more efficient.

TODO: `diff` from Musistant

TODO: disappointing perf (consider `Array.prototype.splice`, index mapping etc.),
not worth the complexity

## Signal Chain Resource Management

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