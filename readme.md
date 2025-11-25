# RibbonCables

RibbonCables is a Typescript FRP Model-View library experiment primarily around
signal [imuxing](https://en.wikipedia.org/wiki/Inverse_multiplexer). It also
incorporates proper signal chain resource management and layout jank reduction
via DOM mutation batching.

## Intro to Signals

TODO: Sources, sinks and intermediate nodes

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

## Fused Sequence Signal Protocol

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

So now we can have an inversely muxed source sequence signal emitting those
events, effectively an array whose changes can be subscribed to:

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

More interestingly by not only emitting but also listening to such changes we
can derive Vecnals analogously to familiar FP sequence functions:

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

## Inverse Multiplexing of Signals

`vec.source` is fine as a basic sequence model but inconvenient for more complex
operations that might feature reading from the model as well as writing to it or
bulk changes, perhaps of a transactional nature (although extending that
transactionality to the signal graph and DOM would require the same machinery
as preventing "glitches", see below). For example removing all "bot" users:

```typescript
function isBot(user: User): boolean { return user.username.includes("b0t"); }

// `Signal`:
users.reset(users.ref().filter((user) => !isBot(user)));

// `Vecnal`:
for (let i = 0; i < userz.size(); ++i) {
    if (isBot(userz.at(i))) {
        userz.remove(i);
    }
}
```

The `Signal` version is quite clean and could be cleaned up even further by
adding `Signal.prototype.swap`, effectively an in-place `map`
(`users.swap((users) => users.filter...`). The `Vecnal` version had to resort
to old-school imperative code, how barbaric. The loop could be cleaned up with
iterators (too complicated to bother implementing at this point) or `reduce`
(which is implemented and much used internally but not everyone is comfortable
reading).

The best of both worlds would be having the canonical model just be a
`Signal<readonly User[]>` to allow arbitrary sequence processing in your
preferred style but being able to adapt it to be used as a `Vecnal` to only hit
the DOM with the necessary edit distance operations:

```typescript
const usersz: Vecnal<User> = vec.imux(eq, users);
```

Now if we remove the bots from `users` as above, `usersz` will infer a necessary
set (actually a minimal set, as we shall see) of edit distance operations
(presumably deletions in this case) and emit them in sequence.

Magic? No, just the [Myers Diff](http://www.xmailserver.org/diff2.pdf). (There
is no magic in programming and if you are relying blindly on something "magical"
you are in DANGER). The quintessential edit distance calculation and edit script
generation algorithms are refinements of a dynamic programming approach, which
is quadratic (more precisely *O(nm)* since the two input sequences can have
different lengths *n* and *m*). I chose the Myers diff because by the ingenous
transformation of the problem to a search through the space of edit script

> a simple O(ND) time and space algorithm is developed where N is the sum of the
> lengths of A and B and D is the size of the minimum edit script for A and B.
> The algorithm performs well when differences are small (sequences are
> similar) and is consequently fast in typical applications.

So its worst-case (delete all elements of *A* and insert all elements of *B*)
complexity is actually no better than the dynamic programming approach. But in
the typical case where we change only a handful of elements or just one it can
be **much** more efficient in both time and space!

The Myers diff does not consider substitutions but I added a simple edit script
[peephole optimizer](https://en.wikipedia.org/wiki/Peephole_optimization) to
fuse deletion-insertion (actually insertion-deletion) pairs into substitutions.

Actually the full story is that in the spring (of 2025) I was building a desktop
app (how quaint!) for music composition. I wanted its canonical music model of
melodies (and block chords) to be independent of the clutter of barlines and
ties that make it easier for score readers to keep in time but annoy composers
because e.g. simply rhythmically displacing a melody can make its rhythmic
notation appear quite different. (Although Dorico seems to take such an
approach, overall it is still fundamentally a notation editor and only
incidentally a composition tool.)

Having long been enamoured with compilers (especially [functional](https://www.amazon.com/exec/obidos/ASIN/052103311X/acmorg-20)
[ones](https://andykeep.com/pubs/dissertation.pdf) <3) my first instinct was to
create a pipeline of intermediate representation transformations. When 
researching music notation rendering libraries and later (after deciding to 
create my own (for QML)) music notation spacing and line splitting, I found that
such a "compilation" approach was [tried and true](https://github.com/grame-cncm/guidolib/blob/dev/doc/papers/kai_renz_diss.pdf)
at least in [Guido Engine](https://guidodoc.grame.fr/).

But since I was building a GUI editor instead of a batch compiler like
[Lilypond](https://lilypond.org/) I needed to diff the end results with the
previous ones to emit the changes to the score's QML tree (via the
aforementioned `QAbstractItemModel`). And that is where I actually implemented
the Myers diff, in C++ and for this project I just ported that to Typescript,
aided by new robust tests more than a proper recollection of the algorithm. If I
had gotten obsessed with game engines instead of compilers deep in the past I
would have probably just rendered a full frame with raw OpenGL instead and we
would not be here in this README.

I even found an evocative name for the diffing node here,
[inverse multiplexing](https://en.wikipedia.org/wiki/Inverse_multiplexer). We
also have the inverse operation, plain multiplexing as `Vecnal.prototype.mux`
(which unlike `imux` can be a method because I wanted to keep `Vecnal` in a
separate module and for that to depend on the signal module instead of the other
way around). Aside from the combination of efficiency and convenience discussed
at length above the API would seem rather incomplete without both of those
conversions. Compared to `imux` (and most `Vecnal` operations), multiplexing is
almost trivial; just re-collect all the `Vecnal` elements into a new sequence on
receiving any edit.

TODO: Mistletoe(?)

TODO: disappointing perf (consider `Array.prototype.splice`, index mapping etc.),
not worth the complexity

## Reactive DOM Nodes

RibbonCables DOM nodes are created via a `NodeFactory`. A Factory is needed to
support batching DOM changes on `requestAnimationFrame` (see below) while
allowing use cases where multiple RibbonCables applications (applets?) exist
independently on the same page. In all my example code I parameter inject the
`NodeFactory` because I am used to that after writing so much Rust. But avoiding
that hassle by making the factory global to an application would not cause the
RibbonCables *library* to have shared global state (and could certainly not
cause threading issues).

Many parts of DOM nodes are actually not reactive, so at the limit we can create
entirely passive nodes:

```typescript
import * as dom from "lib/dom.js";
import type {NodeFactory} from "lib/dom.js";

function usersTableHead(nodes: NodeFactory): Node {
    return nodes.el("thead", {},
        nodes.el("tr", {},
            nodes.el("td", {}, "DB ID"),
            nodes.el("td", {}, "Username")));
}
```

Note how string children are automatically converted to `Text` nodes.
`NodeFactory` does also have an explicit `text` method to create `Text`s but
that is rarely needed in practice.

Of course we need more than just a less verbose interface to create DOM nodes.
Node properties can also be bound to `Signal`s and `Signal<string>` children are
converted to reactive `Text` nodes:

```typescript
function userRow(nodes: NodeFactory, userS: Signal<User>): Node {
    return nodes.el("tr", {},
        nodes.el("td", {}, userS.map(eq, (user) => user.id.toString()),
        nodes.el("td", {}, userS.map(eq, (user) => user.username)));
}
```

How about `Vecnal`s? Well, `forVecnal` takes a `Vecnal<T>` and a view function
of type `(vS: Signal<T>) => dom.ChildValue` and returns a value that `el` can
use to create and update a list of children:

```typescript
function usersTable(nodes: NodeFactory, userZ: Vecnal<User>): Node {
    return nodes.el("table", {},
        usersTableHead(nodes),
                
        nodes.el("tbody", {},
            nodes.forVecnal(userZ, (userS) => userRow(nodes, userS))));
}
```

So when a value is inserted into or removed from the `Vecnal` a new child node
also gets inserted into the parent. In order to avoid needlessly discarding and
recreating DOM child trees, substitutions instead cause just the view function
argument (e.g. `userS`) to be set to the new value.

To avoid memory and update leaks (see resource management section below)
reactive DOM nodes need to behave differently based on whether they are
"mounted" i.e. connected to the visible DOM tree or not. Making those guarantees
requires a lot of plumbing in the library but library users just need to
remember to insert their application root node with the augmented version of
`appendChild`, `removeChild`, `insertBefore` or `replaceChild` supplied in the
`dom` module:

```typescript
const nodes = new dom.NodeManager();
const ui = usersTable(nodes, userz);
{
    const body = document.body;
    dom.insertBefore(body, ui, body.children[0]);
}
```

## Signal Chain Resource Management

## Avoiding UI Jank by Batching DOM Updates

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