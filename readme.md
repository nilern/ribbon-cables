# Vecnal • [TodoMVC](http://todomvc.com)

> Vector element -optimized FRP MVC library

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
    - Microbenchmarks (for e.g. `diff`)
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

## Resources

- [Website]()
- [Documentation]()
- [Used by]()
- [Blog]()
- [FAQ]()

### Articles

- [Interesting article]()

### Support

- [Stack Overflow](http://stackoverflow.com/questions/tagged/__)
- [Google Groups]()
- [Twitter](http://twitter.com/__)
- [Google+]()

*Let us [know](https://github.com/tastejs/todomvc/issues) if you discover anything worth sharing.*


## Implementation

How was the app created? Anything worth sharing about the process of creating the app? Any spec violations?


## Credit

Created by [Pauli Jaakkola](http://deepbeginnings.com)

