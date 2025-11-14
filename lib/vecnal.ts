export type {
    IndexedObservable, IndexedSubscriber, ListBuilder
};
export {
    Vecnal,
    stable, source,
    imux, empty, lift,
    concat
};

import type {Reset, Sized, Indexed, Spliceable, Reducible} from "./prelude.js";
import {ImmArrayAdapter, eq} from "./prelude.js";
import * as diff from "./diff.js"
import type {Subscriber} from "./signal.js";
import * as signal from "./signal.js";
import {Signal, NonNotifyingSignal, CheckingSubscribingSubscribeableSignal}
    from "./signal.js";
    
// FIXME?: When a single change in dep causes multiple changes in vecnals (e.g. `slice`,
// `imux`, `sort`), dependents can observe intermediate states that do not strictly
// adhere to the vecnal contract (e.g. sorted vecnal missing an element of sortee).
// OTOH conventional signal DAG:s already have similar wobbles from diamonds (e.g.
// `const a = source(eq, 5); const b = a.map(eq, inc); const c = a.map(eq, dec);
// const d = b.map2(eq, (x, y) => x + y); a.reset(a.ref() + 1);` causes a moment where
// d = b + c = (a1 + 1) + (a0 - 1) = a1 + a0 = (a0 + 1) + a0 = 2a0 + 1 although the 
// expected contract is that always d = b + c = (a + 1) + (a - 1) = 2a. Perhaps e.g. S.js
// fixes that by explicitly traversing the DAG and updating it "transactionally" but
// even then sinks (e.g. the DOM) are updated sequentially. Ultimately the only hope is
// to only render a frame after all the changes have fully propagated; since we are using
// the DOM we approximate that by just flushing the change batch as quickly as possible 
// with `requestAnimationFrame`.

// OPTIMIZE: Why even bother with init in constructors when e.g. `this.vs` is ignored
// anyway until subscribers appear?

 // TODO: Already reject non-changes here:

/** An object that can be notified of indexed value changes. */
interface IndexedSubscriber<T> {
    /** Called when value v is inserted at index i. */
    onInsert: (i: number, v: T) => void;
    
    /** Called when a value is removed at index i. */
    onRemove: (i: number) => void;
    
    // TODO: onMove: (i: number, j: number) => void;
    
    /** Called when a value is replaced with v at index i. */
    onSubstitute: (i: number, v: T) => void;
}

 /** An object that can inform {@link IndexedSubscriber}s of changes to indexed values of type T. */
interface IndexedObservable<T> {
    /** Add an {@link IndexedSubscriber}. */
    addISubscriber: (subscriber: IndexedSubscriber<T>) => void;
    
    /** Remove an {@link IndexedSubscriber}. */
    removeISubscriber: (subscriber: IndexedSubscriber<T>) => void;
    
    
    /** Notify all {@link IndexedSubscriber}s that v was inserted at index i. */
    notifyInsert: (i: number, v: T) => void;
    
    /** Notify all {@link IndexedSubscriber}s that a value was removed at index i. */
    notifyRemove: (i: number) => void;
    
    // TODO: notifyMove: (i: number, j: number) => void;
    
    /** Notify all {@link IndexedSubscriber}s that a value was replaced with v at index i. */
    notifySubstitute: (i: number, /* TODO: Remove this param if possible: */ v: T, u: T) => void;
}

/** A builder for an Item list of type Coll (e.g. Coll = Array<Item>). */
interface ListBuilder<Item, Coll> {
    /** Add v to the list under construction. */
    push: (v: Item) => void;
    
    /** Produce the final list. */
    build: () => Coll;
}

// TODO: `implements Iterable<T>`:
// TODO: Ribbon cable -inspired name:
/** A container of indexed values that change over time, can be reduced over and read  and the
    changes subscribed to. A class instead of just an interface because the DOM module needs to
    check object membership of this and instanceof is the most straightforward way while having to
    concretely inherit from this should not cause issues for any reasonable implementation.  */
abstract class Vecnal<T>
    implements Indexed<T>, Sized, Reducible<T>, IndexedObservable<T>
{
    abstract size(): number;
    
    /* TODO: Remove(?) since JS API:s typically are like `at()`; ok with problems storing
       `undefined` */
    /** Get the value at index i (or defaultValue if i is out of bounds). */
    abstract atOr(i: number, defaultValue: T): T;
    
    abstract reduce<U>(f: (acc: U, v: T) => U, acc: U): U;
    
    abstract addISubscriber(subscriber: IndexedSubscriber<T>): void;
    abstract removeISubscriber(subscriber: IndexedSubscriber<T>): void;
    abstract notifyInsert(i: number, v: T): void;
    abstract notifyRemove(i: number): void;
    abstract notifySubstitute(i: number, v: T, u: T): void;
    
    at(i: number): T | undefined { return this.atOr(i, undefined as T); }
    
    // TODO: Optional `start` & `end`:
    // TODO: Negative indices and other such oddities (see `Array.prototype.slice`):
    /** Create a derived {@link Vecnal} that only stores the elements of this between start
        (inclusive) and end (exclusive) (i.e. start <= i < end). */
    slice(start: number, end: number): Vecnal<T> {
        return new SliceVecnal(this, start, end);
    }
    
    /** Create a derived {@link Vecnal} whose elements are the elements of this transformed by f
        (i.e. this.map(eq, f).at(i) = f(this.at(i))). If the derived vecnal receives a new value
        substitution from this that does not change its (transformed) value wrt. equals() it will
        not notify its subsribers of a substitution . */
    map<U>(equals: (x: U, y: U) => boolean, f: (v: T) => U): Vecnal<U> {
        return new MappedVecnal(equals, f, this);
    }
    
    /** Create a derived {@link Vecnal} with only the elements from this for which f returns true.
    */
    filter(f: (v: T) => boolean): Vecnal<T> { return new FilteredVecnal(f, this); }
    
    /** Create a derived {@link Signal} that contains the current value of
        this.reduce(f, accS.ref()) and that only notifies its subscribers if the reduced value
        changes wrt. equals(). */
    reduceS<U>(equals: (x: U, y: U) => boolean, f: (acc: U, v: T) => U, accS: Signal<U>
    ): Signal<U> {
        return new ReducedSignal(equals, f, accS, this);
    }
    
    /** Create a derived {@link Vecnal} whose values are the values of this in reverse order. */
    reverse(): Vecnal<T> { return new ReversedVecnal(this); }
    
    // TODO: Default comparator
    // TODO: `sortBy` (?):
    /** Create a derived {@link Vecnal} whose values are the values of this sorted by the comparator
        compare (as in {@link Array.sort}). */
    sort(compare: (x: T, y: T) => number): Vecnal<T> {
        return new SortedVecnal(this, compare);
    }
    
    // TODO: Support an `equals` argument?
    /** Create a derived {@link Signal} that contains the values of this collected into a Coll.
        builders is a "list Builder Factory" function i.e. it is called to create a new ListBuilder
        every time there is a change in this. */
    mux<Coll>(builders: () => ListBuilder<T, Coll>): Signal<Coll> {
        return this.reduceS(eq, (builder, v) => {
            builder.push(v);
            return builder;
        }, new ThunkSignal<ListBuilder<T, Coll>>(builders))
        .map(eq, (builder) => builder.build());
    }
}

// TODO: Use mixins instead of this slightly arbitrary hierarchy of abstract classes:

abstract class NonNotifyingVecnal<T> extends Vecnal<T> {
    addISubscriber(_: IndexedSubscriber<T>) {}
    
    removeISubscriber(_: IndexedSubscriber<T>) {}
    
    notifyInsert(_: number, _1: T) {}
    
    notifyRemove(_: number) {}
    
    notifySubstitute(_: number, _1: T) {}
}

abstract class SubscribeableVecnal<T> extends Vecnal<T> {
    protected readonly subscribers = new Set<IndexedSubscriber<T>>();
    
    addISubscriber(subscriber: IndexedSubscriber<T>) {
        this.subscribers.add(subscriber);
    }
    
    removeISubscriber(subscriber: IndexedSubscriber<T>) {
        this.subscribers.delete(subscriber);
    }
    
    notifySubstitute(i: number, v: T, u: T) {
        for (const subscriber of this.subscribers) {
            subscriber.onSubstitute(i, u);
        }
    }
    
    notifyInsert(i: number, v: T) {
        for (const subscriber of this.subscribers) {
            subscriber.onInsert(i, v);
        }
    }
    
    notifyRemove(i: number) {
        for (const subscriber of this.subscribers) {
            subscriber.onRemove(i);
        }
    }
}

abstract class CheckingSubscribeableVecnal<T> extends SubscribeableVecnal<T> {
    constructor(
        private readonly equals: (x: T, y: T) => boolean
    ) {
        super();
    }
    
    notifySubstitute(i: number, v: T, u: T) {
        if (!this.equals(v, u)) {
            super.notifySubstitute(i, v, u);
        }
    }
}

abstract class SubscribingSubscribeableVecnal<T> extends SubscribeableVecnal<T> {
    abstract subscribeToDeps(): void;
    abstract unsubscribeFromDeps(): void;

    addISubscriber(subscriber: IndexedSubscriber<T>) {
        if (this.subscribers.size === 0) {
            /* To avoid space leaks and 'unused' updates to `this` only start watching
             * dependencies when `this` gets its first watcher: */
            this.subscribeToDeps();
        }
        
        super.addISubscriber(subscriber);
    }
    
    removeISubscriber(subscriber: IndexedSubscriber<T>) {
        super.removeISubscriber(subscriber);
        
        if (this.subscribers.size === 0) {
            /* Watcher count just became zero, but watchees still have pointers to `this`.
             * Remove those to avoid space leaks and 'unused' updates to `this`: */
            this.unsubscribeFromDeps();
        }
    }
}

abstract class CheckingSubscribingSubscribeableVecnal<T>
    extends SubscribingSubscribeableVecnal<T>
{
    constructor(
        private readonly equals: (x: T, y: T) => boolean
    ) {
        super();
    }

    notifySubstitute(i: number, v: T, u: T) {
        if (!this.equals(v, u)) {
            super.notifySubstitute(i, v, u);
        }
    }
}

class StableVecnal<T> extends NonNotifyingVecnal<T> {
    private readonly vs: readonly T[];
    
    constructor(
        vs: Reducible<T>
    ) {
        super();
        
        this.vs = vs.reduce<T[]>((acc, v) => {
            acc.push(v);
            return acc;
        }, []);
    }
    
    size(): number { return this.vs.length; }
    
    atOr(i: number, defaultValue: T): T {
        if (i >= this.vs.length) { return defaultValue; }
    
        return this.vs[i];
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U { return this.vs.reduce(f, acc); }
}

/** A {@link Vecnal} whose values are extracted from vs at time of construction and immutable
    thereafter. */
function stable<T>(vs: Reducible<T>): Vecnal<T> { return new StableVecnal(vs); }

class SourceVecnal<T> extends CheckingSubscribeableVecnal<T> implements Spliceable<T> {
    private readonly vs: T[];
    
    constructor(
        equals: (x: T, y: T) => boolean,
        vs: Reducible<T>
    ) {
        super(equals);
        
        this.vs = vs.reduce<typeof this.vs>((acc, v) => {
            acc.push(v);
            return acc;
        }, []);
    }
    
    size(): number { return this.vs.length; }
    
    atOr(i: number, defaultValue: T): T {
        if (i >= this.vs.length) { return defaultValue; }
    
        return this.vs[i];
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U { return this.vs.reduce(f, acc); }
    
    setAt(i: number, v: T): T {
        const oldV = this.vs[i];
        this.vs[i] = v;
        
        this.notifySubstitute(i, oldV, v);
        
        return v;
    }
    
    insert(i: number, v: T): T {
        this.vs.splice(i, 0, v); // OPTIMIZE
        
        this.notifyInsert(i, v);
    
        return v;
    }
    
    remove(i: number): T {
        const v = this.vs[i];
        this.vs.splice(i, 1); // OPTIMIZE
        
        this.notifyRemove(i);
    
        return v;
    }
}

/** Create a {@link Vecnal} whose values are extracted from vs at time of construction and can be
    altered via the {@link Spliceable} interface. */
function source<T>(equals: (x: T, y: T) => boolean, initVals: Reducible<T>
): Vecnal<T> & Spliceable<T> {
    return new SourceVecnal(equals, initVals);
}

class SliceVecnal<T> extends SubscribingSubscribeableVecnal<T>
    implements IndexedSubscriber<T>
{
    constructor(
        private readonly input: Vecnal<T>,
        private readonly start: number,
        private end: number
    ) {
        super();
    }
    
    size(): number {
        const inputLen = this.input.size();
        
        if (this.start >= inputLen) { return 0; }
        
        if (this.end >= inputLen) { return inputLen - this.start; }
        
        return this.end - this.start;
    }
    
    atOr(i: number, defaultVal: T): T {
        if (i >= this.size()) { return defaultVal; }
        
        return this.input.atOr(this.start + i, defaultVal);
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U {
        for (let i = this.start; i < this.end && i < this.input.size(); ++i) {
            acc = f(acc, this.input.at(i)!);
        }
        
        return acc;
    }
    
    subscribeToDeps() { this.input.addISubscriber(this); }
    
    unsubscribeFromDeps() { this.input.removeISubscriber(this); }
    
    onInsert(inputIndex: number, v: T) {
        if (inputIndex < this.start) {
            ++this.end; // HACK?
            this.notifyInsert(0, this.input.at(this.start)!);
            
            --this.end; // HACK?
            this.notifyRemove(this.size() - 1);
        } else if (inputIndex < this.end) {
            ++this.end; // HACK?
            this.notifyInsert(inputIndex - this.start, v);
            
            --this.end; // HACK?
            this.notifyRemove(this.size() - 1);
        } // else `inputIndex >= this.end` => noop
    }
    
    onRemove(inputIndex: number) {
        if (inputIndex < this.start) {
            --this.end; // HACK?
            this.notifyRemove(0);
            
            ++this.end; // HACK?
            if (this.end <= this.input.size()) {
                this.notifyInsert(this.size() - 1, this.input.at(this.end - 1)!);
            }
        } else if (inputIndex < this.end) {
            --this.end; // HACK?
            this.notifyRemove(inputIndex - this.start);
            
            ++this.end; // HACK?
            if (this.end <= this.input.size()) {
                this.notifyInsert(this.size() - 1, this.input.at(this.end - 1)!);
            }
        } // else `inputIndex >= this.end` => noop
    }
    
    onSubstitute(inputIndex: number, v: T) {
        if (inputIndex >= this.start && inputIndex < this.end) {
            const index = inputIndex - this.start;
            this.notifySubstitute(index, this.at(index)!, v);
        }
    }
}

class MappedVecnal<U, T> extends CheckingSubscribingSubscribeableVecnal<U>
    implements IndexedSubscriber<T>
{
    private readonly vs: U[] = [];

    constructor(
        equals: (x: U, y: U) => boolean,
        private readonly f: (v: T) => U,
        private readonly input: Vecnal<T>
    ) {
        super(equals);
    }
    
    size(): number {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            return this.input.size();
            // OPTIMIZE: This combined with dep `size()` in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.vs.length;
    }
    
    atOr(i: number, defaultValue: U): U {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            if (i >= this.input.size()) { return defaultValue; }
            
            return this.f(this.input.at(i)!);
            // OPTIMIZE: This combined with dep `at()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        if (i >= this.vs.length) { return defaultValue; }
        
        return this.vs[i];
    }
    
    reduce<V>(f: (acc: V, v: U) => V, acc: V): V {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            return this.input.reduce((acc, v) => f(acc, this.f(v)), acc);
            // OPTIMIZE: This combined with dep `at()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.vs.reduce(f, acc);
    }
    
    subscribeToDeps() {
        this.input.addISubscriber(this);
        
        this.vs.length = 0;
        this.input.reduce<typeof this.vs>((vs, v) => {
            vs.push(this.f(v));
            return vs;
        }, this.vs);
    }
    
    unsubscribeFromDeps() { this.input.removeISubscriber(this); }
    
    onInsert(i: number, v: T) {
        const u = this.f(v);
        this.vs.splice(i, 0, u);
        
        this.notifyInsert(i, u);
    }
    
    onRemove(i: number) {
        this.vs.splice(i, 1);
        
        this.notifyRemove(i);
    }
    
    onSubstitute(i: number, v: T) {
        const oldU = this.vs[i];
        const u = this.f(v);
        this.vs[i] = u;
        
        this.notifySubstitute(i, oldU, u);
    }
}

// C style non-index should make `indexMapping`s arrays of 32-bit ints at runtime:
const NO_INDEX = -1;

class FilteredVecnal<T> extends SubscribingSubscribeableVecnal<T>
    implements IndexedSubscriber<T>
{
    private readonly vs: T[] = [];
    private readonly indexMapping: number[] = [];

    constructor(
        private readonly f: (v: T) => boolean,
        private readonly input: Vecnal<T>
    ) {
        super();
    }
    
    size(): number {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            return this.input.reduce((len, v) => this.f(v) ? len + 1 : len, 0);
            // OPTIMIZE: This combined with dep `size()` in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.vs.length;
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            return this.input.reduce((acc, v) => this.f(v) ? f(acc, v) : acc, acc);
            // OPTIMIZE: This combined with dep `size()` in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.vs.reduce(f, acc);
    }
    
    atOr(index: number, defaultValue: T): T {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            const len = this.input.size();
            let i = 0;
            for (let inputIdx = 0; inputIdx < len; ++inputIdx) {
                const v = this.input.at(inputIdx)!;
                if (this.f(v)) {
                    if (i === index) { return v; }
                    
                    ++i;
                }
            }
            
            return defaultValue;
            // OPTIMIZE: This combined with dep `at()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        if (index >= this.vs.length) { return defaultValue; }
        
        return this.vs[index];
    }
    
    subscribeToDeps() {
        this.input.addISubscriber(this);
        
        this.vs.length = 0;
        this.indexMapping.length = 0;
        const len = this.input.size();
        for (let i = 0; i < len; ++i) {
            const v = this.input.at(i)!;
            if (this.f(v)) {
                this.vs.push(v);
                this.indexMapping[i] = this.vs.length - 1;
            } else {
                this.indexMapping[i] = NO_INDEX;
            }
        }
    }
    
    unsubscribeFromDeps() { this.input.removeISubscriber(this); }
    
    private insertionIndex(inputIndex: number): number {
        if (inputIndex >= this.indexMapping.length) {
            return this.vs.length; // Insertion at the end
        }
        
        {
            const insertionIndex = this.indexMapping[inputIndex]; 
            if (insertionIndex >= 0) {
                return insertionIndex; // Insertion before `this.input[inputIndex]`
            }
        }
        
        for (let i = inputIndex - 1; i >= 0; --i) {
            let prevIndex = this.indexMapping[i];
            if (prevIndex >= 0) {
                return prevIndex + 1; // Insertion after `this.input[i]`
            }
        }
        
        return 0; // Insertion at the start
    }
    
    private insertInsertionIndex(inputIndex: number, insertionIndex: number) {
        this.indexMapping[inputIndex] = insertionIndex;
        
        const len = this.indexMapping.length;
        for (let i = inputIndex + 1; i < len; ++i) {
            const outputIndex = this.indexMapping[i];
            this.indexMapping[i] = outputIndex >= 0
                ? outputIndex + 1
                : outputIndex;
        }
    }
    
    private spliceInsertionIndex(inputIndex: number, insertionIndex: number) {
        this.indexMapping.push(NO_INDEX);
            
        for (let i = this.indexMapping.length - 1; i > inputIndex; --i) {
            const outputIndex = this.indexMapping[i - 1];
            this.indexMapping[i] = outputIndex >= 0
                ? outputIndex + 1
                : outputIndex;
        }
        
        this.indexMapping[inputIndex] = insertionIndex;
    }
    
    private removeRemovalIndex(inputIndex: number) {
        this.indexMapping[inputIndex] = NO_INDEX;
        
        const len = this.indexMapping.length;
        for (let i = inputIndex + 1; i < len; ++i) {
            const outputIndex = this.indexMapping[i];
            this.indexMapping[i] = outputIndex >= 0
                ? outputIndex - 1
                : outputIndex;
        }
    }
    
    private spliceRemovalIndex(inputIndex: number) {
        const newLen = this.indexMapping.length - 1;
        for (let i = inputIndex; i < newLen; ++i) {
            const outputIndex = this.indexMapping[i + 1];
            this.indexMapping[i] = outputIndex >= 0
                ? outputIndex - 1
                : outputIndex;
        }
        
        this.indexMapping.pop();
    }
    
    onInsert(i: number, v: T) {
        if (this.f(v)) {
            const insertionIndex = this.insertionIndex(i);
        
            this.vs.splice(insertionIndex, 0, v);
            this.spliceInsertionIndex(i, insertionIndex);
            
            this.notifyInsert(insertionIndex, v);
        } else {
            // Output does not change but still need to update index mapping:
            this.indexMapping.splice(i, 0, NO_INDEX);
        }
    }
    
    onRemove(i: number) {
        const j = this.indexMapping[i];
        
        if (j >= 0) {
            const removalIndex = this.indexMapping[i];
        
            this.vs.splice(removalIndex, 1);
            this.spliceRemovalIndex(i);
            
            this.notifyRemove(removalIndex);
        } else {
            // Output does not change but still need to update index mapping:
            this.indexMapping.splice(i, 1);
        }
    }
    
    onSubstitute(i: number, v: T) {
        let j = this.indexMapping[i];
        
        if (j >= 0) { // Old value was not filtered out
            if (this.f(v)) { // New value not filtered out either
                let substIndex = this.indexMapping[i];
        
                const oldV = this.vs[substIndex];
                this.vs[substIndex] = v;
                
                this.notifySubstitute(substIndex, oldV, v);
            } else { // New value is filtered out
                const removalIndex = this.indexMapping[i];
        
                this.vs.splice(removalIndex, 1);
                this.removeRemovalIndex(i);
                
                this.notifyRemove(removalIndex);
            }
        } else { // Old value was filtered out
            if (this.f(v)) { // New value is not filtered out
                const insertionIndex = this.insertionIndex(i);
        
                this.vs.splice(insertionIndex, 0, v);
                this.insertInsertionIndex(i, insertionIndex);
                
                this.notifyInsert(insertionIndex, v);
            } // else still filtered out => no change
        }
    }
}

class ConcatVecnalDepSubscriber<T> implements IndexedSubscriber<T> {
    constructor(
        private readonly vecnal: ConcatVecnal<T>,
        private readonly depIndex: number
    ) {}
    
    onInsert(subIndex: number, v: T) {
        const insertionIndex = this.vecnal.offsets[this.depIndex] + subIndex;
        
        this.vecnal.vs.splice(insertionIndex, 0, v);
        
        {
            const len = this.vecnal.offsets.length;
            for (let i = this.depIndex + 1; i < len; ++i) {
                ++this.vecnal.offsets[i];
            }
        }
        
        this.vecnal.notifyInsert(insertionIndex, v);
    }
    
    onRemove(subIndex: number) {
        const removalIndex = this.vecnal.offsets[this.depIndex] + subIndex;
        
        this.vecnal.vs.splice(removalIndex, 1);
        
        {
            const len = this.vecnal.offsets.length;
            for (let i = this.depIndex + 1; i < len; ++i) {
                --this.vecnal.offsets[i];
            }
        }
        
        this.vecnal.notifyRemove(removalIndex);
    }
    
    onSubstitute(subIndex: number, v: T) {
        const substIndex = this.vecnal.offsets[this.depIndex] + subIndex;
        
        const oldv = this.vecnal.vs[substIndex];
        
        this.vecnal.vs[substIndex] = v;
        
        this.vecnal.notifySubstitute(substIndex, oldv, v);
    }
}

class ConcatVecnal<T> extends SubscribingSubscribeableVecnal<T> {
    // Some members need to be public for `ConcatVecnalDepSubscriber`.
    // This class itself is not a public module member though so it is not too bad:
    public readonly vs: T[] = [];
    public readonly offsets: number[] = [];
    private readonly depSubscribers: IndexedSubscriber<T>[];
    
    constructor(
        private readonly deps: Vecnal<T>[]
    ) {
        super();
        
        this.depSubscribers = [];
        this.deps.forEach((dep, i) => {
            this.depSubscribers.push(new ConcatVecnalDepSubscriber(this, i));
        });
    }
    
    size(): number {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            return this.deps.reduce((acc, dep) => acc + dep.size(), 0);
            // OPTIMIZE: This combined with dep `reduce()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.vs.length;
    }
    
    atOr(index: number, defaultValue: T): T {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            {
                let subi = index;
                for (const dep of this.deps) {
                    const depLen = dep.size();
                
                    if (subi < depLen) {
                        return dep.at(subi)!;
                    }
                    
                    subi -= depLen;
                }
            }
            // OPTIMIZE: This combined with dep `reduce()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
            
            return defaultValue;
        }
        
        if (index >= this.vs.length) { return defaultValue; }
        
        return this.vs[index];
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            return this.deps.reduce((acc, dep) => dep.reduce(f, acc), acc);
            // OPTIMIZE: This combined with dep `reduce()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.vs.reduce(f, acc);
    }
    
    subscribeToDeps() {
        this.deps.forEach((dep, i) => dep.addISubscriber(this.depSubscribers[i]));
        
        this.vs.length = 0;
        this.offsets.length = 0;
        this.deps.reduce((offset, dep) => {
            dep.reduce((vs, v) => {
                vs.push(v);
                return vs;
            }, this.vs);
            
            this.offsets.push(offset);
            return offset + dep.size();
        }, 0);
    }
    
    unsubscribeFromDeps() {
        this.deps.forEach((dep, i) => dep.removeISubscriber(this.depSubscribers[i]));
    }
}

/** Create a {@link Vecnal} whose values are the values of vecnals concatenated. */
function concat<T>(...vecnals: Vecnal<T>[]): Vecnal<T> { return new ConcatVecnal(vecnals); }

class EmptyVecnal<T> extends NonNotifyingVecnal<T> {
    static readonly INSTANCE: EmptyVecnal<any> = new EmptyVecnal();

    constructor() { super(); }
    
    size(): number { return 0; }
    
    atOr(i: number, defaultValue: T): T { return defaultValue; }
    
    reduce<U>(_: (acc: U, v: T) => U, acc: U): U { return acc; }
}

/** Create a {@link Vecnal} that is always empty of values (size() === 0). */
function empty<T>(): Vecnal<T> { return EmptyVecnal.INSTANCE as EmptyVecnal<T>; }

class SingleElementVecnal<T> extends SubscribingSubscribeableVecnal<T>
    implements Subscriber<T>
{
    private v: T | undefined = undefined;
    
    constructor(
        private readonly signal: Signal<T>
    ) {
        super();
    }
    
    size(): number { return 1; }
    
    atOr(i: number, defaultValue: T): T {
        if (i !== 0) { return defaultValue; }
        
        if (this.subscribers.size === 0) { return this.signal.ref(); }
        
        return this.v!;
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U {
        const v = this.subscribers.size === 0 ? this.signal.ref() : this.v!;
        return f(acc, v);
    }
    
    subscribeToDeps() {
        this.signal.addSubscriber(this);
        
        this.v = this.signal.ref();
    }
    
    unsubscribeFromDeps() { this.signal.removeSubscriber(this); }
    
    onChange(newVal: T) {
        const oldVal = this.v!;
        this.v = newVal;
        this.notifySubstitute(0, oldVal, newVal);
    }
}

/** Create a {@link Vecnal} that always contains the single value (size() === 1) from signal. */
function lift<T>(signal: Signal<T>): Vecnal<T> { return new SingleElementVecnal(signal); }

class ReducedSignal<U, T> extends CheckingSubscribingSubscribeableSignal<U>
    implements Subscriber<U>, IndexedSubscriber<T>
{
    private v: U | undefined = undefined;

    constructor(
        equals: (x: U, y: U) => boolean,
        private readonly f: (acc: U, v: T) => U,
        private readonly inputAcc: Signal<U>,
        private readonly inputColl: Vecnal<T>
    ) {
        super(equals);
    }
    
    ref(): U {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.v` could be stale:
            return this.inputColl.reduce(this.f, this.inputAcc.ref());
            // OPTIMIZE: This combined with dep `ref()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.v!;
    }
    
    subscribeToDeps() {
        this.inputAcc.addSubscriber(this);
        this.inputColl.addISubscriber(this);
        
        this.v = this.inputColl.reduce(this.f, this.inputAcc.ref());
    }
    
    unsubscribeFromDeps() {
        this.inputAcc.removeSubscriber(this);
        this.inputColl.removeISubscriber(this);
    }
    
    private onCollChange() {
        const oldVal = this.v!;
        const newVal = this.inputColl.reduce(this.f, this.inputAcc.ref());
        this.v = newVal;
        this.notify(oldVal, newVal);
    }
    
    onInsert(_: number, _1: T) { this.onCollChange(); }
    
    onRemove(_: number) { this.onCollChange(); }
    
    onSubstitute(_: number, _1: T) { this.onCollChange(); }
    
    onChange(newAcc: U) {
        const oldVal = this.v!;
        const newVal = this.inputColl.reduce(this.f, newAcc);
        this.v = newVal;
        this.notify(oldVal, newVal);
    }
}

class ThunkSignal<T> extends NonNotifyingSignal<T> {
    constructor(
        private readonly f: () => T
    ) {
        super();
    }
    
    ref(): T { return this.f(); }
}

class ReversedVecnal<T> extends SubscribingSubscribeableVecnal<T>
    implements IndexedSubscriber<T>
{
    private readonly vs: T[] = [];
    
    constructor(
        private readonly input: Vecnal<T>
    ) {
        super();
    }
    
    size(): number {
        if (this.subscribers.size === 0) {
            return this.input.size();
        }
        
        return this.vs.length;
    }
    
    atOr(index: number, defaultValue: T): T {
        if (this.subscribers.size === 0) {
            return this.input.atOr(this.input.size() - index - 1, defaultValue);
        }
        
        if (index >= this.vs.length) { return defaultValue; }
        
        return this.vs[index];
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U {
        if (this.subscribers.size === 0) {
            // OPTIMIZE?:
            const len = this.input.size();
            for (let i = len - 1; i >= 0; --i) {
                acc = f(acc, this.input.at(i)!);
            }
            
            return acc;
        }
        
        return this.vs.reduce(f, acc);
    }
    
    subscribeToDeps() {
        this.input.addISubscriber(this);
        
        const len = this.vs.length = this.input.size();
        this.input.reduce((i, v) => {
            this.vs[i] = v;
            return i - 1;
        }, len - 1);
    }
    
    unsubscribeFromDeps() { this.input.removeISubscriber(this); }
    
    onInsert(inputIndex: number, v: T) {
        const index = this.vs.length - inputIndex;
        this.vs.splice(index, 0, v);
        
        this.notifyInsert(index, v);
    }
    
    onRemove(inputIndex: number) {
        const index = this.vs.length - inputIndex - 1;
        this.vs.splice(index, 1);
        
        this.notifyRemove(index);
    }
    
    onSubstitute(inputIndex: number, v: T) {
        const index = this.vs.length - inputIndex - 1;
        const oldV = this.vs[index];
        this.vs[index] = v;
        
        this.notifySubstitute(index, oldV, v);
    }
}

class SortedVecnal<T> extends SubscribingSubscribeableVecnal<T>
    implements IndexedSubscriber<T>
{
    private readonly vs: T[] = [];
    private readonly indexMapping: number[] = [];
    private readonly revIndexMapping: number[] = [];

    constructor(
        private readonly input: Vecnal<T>,
        private readonly compare: (x: T, y: T) => number
    ) {
        super();
    }
    
    // OPTIMIZE: Replace with Powersort:
    // Cannot use `Array.prototype.sort` since we need to maintain `this.indexMapping`:
    private mergeSort() {
        const cmp = this.compare;
    
        function merge(
            dest: T[], destRevIndexMapping: number[],
            src: T[], srcRevIndexMapping: number[],
            low: number, mid: number, high: number
        ) {
            for (let li = low, ri = mid, di = low; di < high; ++di) {
                const l = src[li], r = src[ri];
                if (li < mid && (ri >= high || cmp(l, r) <= 0)) {
                    dest[di] = l;
                    destRevIndexMapping[di] = srcRevIndexMapping[li];
                    ++li;
                } else {
                    dest[di] = r;
                    destRevIndexMapping[di] = srcRevIndexMapping[ri];
                    ++ri;
                }
            }
        }
    
        function mergeSortRange(
            dest: T[], destRevIndexMapping: number[],
            src: T[], srcRevIndexMapping: number[],
            low: number, high: number
        ) {
            const length = high - low;
            if (length <= 1) { return; }
            
            const mid = low + Math.floor(length / 2);
            mergeSortRange(
                src, srcRevIndexMapping,
                dest, destRevIndexMapping,
                low, mid
            );
            mergeSortRange(
                src, srcRevIndexMapping,
                dest, destRevIndexMapping,
                mid, high
            );
            merge(
                dest, destRevIndexMapping,
                src, srcRevIndexMapping,
                low, mid, high
            );
        }
        
        mergeSortRange(
            this.vs, this.revIndexMapping,
            [...this.vs], [...this.revIndexMapping],
            0, this.vs.length
        );
        
        { // Update `this.indexMapping` from `this.revIndexMapping`:
            const len = this.revIndexMapping.length;
            for (let index = 0; index < len; ++index) {
                const inputIndex = this.revIndexMapping[index];
                this.indexMapping[inputIndex] = index;
            }
        }
    }
    
    private stableCompare(xInputIndex: number, x: T, yInputIndex: number, y: T): number {
        const ordering = this.compare(x, y);
        return ordering !== 0 ? ordering : xInputIndex - yInputIndex;
    }

    private insertionIndex(inputIndex: number, v: T): number {
        // Typical cache line size is 64 bytes.
        // Typical object reference size is 8 bytes (even on 32-bit machines due to
        // NaN-tagging).
        const linearTreshold = 8; // 64 / 8
        
        let low = 0;
        const len = this.vs.length;
        
        // Binary search:
        for (let high = len, length = high - low;
             length > linearTreshold;
             length = high - low
        ) {
            const mid = low + Math.floor(length / 2);
            
            const ordering = this.stableCompare(
                this.revIndexMapping[mid], this.vs[mid],
                inputIndex, v
            );
            
            if (ordering < 0) {
                low = mid + 1;
            } else if (ordering > 0) {
                high = mid;
            } else { // `ordering === 0`
                return low;
            }
        }
        
        // Linear search:
        while (low < len && this.stableCompare(
            this.revIndexMapping[low], this.vs[low],
            inputIndex, v
        ) < 0) {
            ++low;
        }
        
        return low;
    }
    
    private insertIndexMapping(inputIndex: number, index: number) {
        // OPTIMIZE: Instead of splicing at the end push `NO_INDEX` and move elements
        // after `inputIndex`/`index` forwards while updating them.
    
        {
            const len = this.indexMapping.length;
            for (let i = 0; i < len; ++i) {
                const j = this.indexMapping[i];
                if (j >= index) {
                    this.indexMapping[i] = j + 1;
                }
            }
        }
        this.indexMapping.splice(inputIndex, 0, index);
        
        {
            const len = this.revIndexMapping.length;
            for (let i = 0; i < len; ++i) {
                const j = this.revIndexMapping[i];
                if (j >= inputIndex) {
                    this.revIndexMapping[i] = j + 1;
                }
            }
        }
        this.revIndexMapping.splice(index, 0, inputIndex);
    }
    
    private removeIndexMapping(inputIndex: number, index: number) {
        // OPTIMIZE: Instead of splicing at the end move elements after
        // `inputIndex`/`index` backwards while updating them and pop at the end.
        
        {
            const len = this.indexMapping.length;
            for (let i = 0; i < len; ++i) {
                const j = this.indexMapping[i];
                if (j > index) {
                    this.indexMapping[i] = j - 1;
                }
            }
        }
        this.indexMapping.splice(inputIndex, 1);
    
        {
            const len = this.revIndexMapping.length;
            for (let i = 0; i < len; ++i) {
                const j = this.revIndexMapping[i];
                if (j > inputIndex) {
                    this.revIndexMapping[i] = j - 1;
                }
            }
        }
        this.revIndexMapping.splice(index, 1);
    }
    
    private reInit() {
        this.vs.length = 0;
        this.indexMapping.length = 0;
        this.revIndexMapping.length = 0;
        this.input.reduce((i, v) => {
            this.vs.push(v);
            this.indexMapping.push(i);
            this.revIndexMapping.push(i);
            return i + 1;
        }, 0);
        
        this.mergeSort();
    }
    
    size(): number {
        if (this.subscribers.size === 0) {
            return this.input.size();
        }
        
        return this.vs.length;
    }
    
    atOr(index: number, defaultValue: T): T {
        if (this.subscribers.size === 0) {
            if (index >= this.input.size()) { return defaultValue; }
        
            // OPTIMIZE: Algorithms that bypass the full sort for this exist:
            const vs = this.input.reduce<T[]>((vs, v) => {
                vs.push(v);
                return vs;
            }, []);
            vs.sort(this.compare);
            return vs[index];
        }
        
        if (index >= this.vs.length) { return defaultValue; }
        
        return this.vs[index];
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U {
        if (this.subscribers.size === 0) {
            const vs = this.input.reduce<T[]>((vs, v) => {
                vs.push(v);
                return vs;
            }, []);
            vs.sort(this.compare);
            return vs.reduce(f, acc);
        }
        
        return this.vs.reduce(f, acc);
    }
    
    subscribeToDeps() {
        this.input.addISubscriber(this);
        
        this.reInit();
    }
    
    unsubscribeFromDeps() { this.input.removeISubscriber(this); }
    
    onInsert(inputIndex: number, v: T) {
        const index = this.insertionIndex(inputIndex, v);
        this.vs.splice(index, 0, v);
        this.insertIndexMapping(inputIndex, index);
        
        this.notifyInsert(index, v);
    }
    
    onRemove(inputIndex: number) {
        const index = this.indexMapping[inputIndex];
        this.vs.splice(index, 1);
        this.removeIndexMapping(inputIndex, index);
        
        this.notifyRemove(index);
    }
    
    onSubstitute(inputIndex: number, v: T) {
        const removalIndex = this.indexMapping[inputIndex];
        let insertionIndex = this.insertionIndex(inputIndex, v);
        if (insertionIndex > removalIndex) {
            --insertionIndex;
        }
        
        if (insertionIndex === removalIndex) {
            const oldV = this.vs[insertionIndex];
            this.vs[insertionIndex] = v;
            
            this.notifySubstitute(insertionIndex, oldV, v);
            return;
        }
        
        // OPTIMIZE: Combine linear-time `vs` & `indexMapping` updates (if
        // `notifyMove` becomes available to accompany that):
        
        this.vs.splice(removalIndex, 1);
        this.removeIndexMapping(inputIndex, removalIndex);
        this.notifyRemove(removalIndex);
        
        this.vs.splice(insertionIndex, 0, v);
        this.insertIndexMapping(inputIndex, insertionIndex);
        this.notifyInsert(insertionIndex, v);
    }
}

type ImuxableVal<T> = Reducible<T> & Sized & Indexed<T>;

class ImuxVecnal<T> extends SubscribingSubscribeableVecnal<T>
    implements Subscriber<ImuxableVal<T>>
{
    private readonly vs: T[] = [];
    
    constructor(
        private readonly equals: (x: T, y: T) => boolean,
        private readonly input: Signal<Reducible<T> & Sized & Indexed<T>>
    ) {
        super();
    }
    
    private patch(newVs: Sized & Indexed<T>, edits: diff.EditScript) {
        for (const edit of edits) {
            const i = edit.index;
                
            if (edit instanceof diff.Insert) {
                const v = newVs.at(i)!;
                this.vs.splice(i, 0, v); // OPTIMIZE
                this.notifyInsert(i, v);
            } else if (edit instanceof diff.Delete) {
                this.vs.splice(i, 1); // OPTIMIZE
                this.notifyRemove(i);
            } else if (edit instanceof diff.Substitute) {
                const u = this.vs[i];
                const v = newVs.at(i)!;
                this.vs[i] = v;
                this.notifySubstitute(i, u, v);
            } else {
                const _exhaust: never = edit;
            }
        }
    }
    
    size(): number {
        if (this.subscribers.size > 0) {
            return this.vs.length;
        } else {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            return this.input.ref().size();
            // OPTIMIZE: This combined with dep `reduce()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
    }
    
    atOr(index: number, defaultValue: T): T {
        if (this.subscribers.size > 0) {
            if (index >= this.vs.length) { return defaultValue; }
        
            return this.vs[index];
        } else {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            const newVs = this.input.ref();
            
            if (index >= newVs.size()) { return defaultValue; }
            
            return newVs.at(index)!;
            // OPTIMIZE: This combined with dep `reduce()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U {
        if (this.subscribers.size > 0) {
            return this.vs.reduce(f, acc);
        } else {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            return this.input.ref().reduce(f, acc);
            // OPTIMIZE: This combined with dep `reduce()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
    }
    
    subscribeToDeps() {
        this.input.addSubscriber(this);
        
        this.vs.length = 0;
        this.input.ref().reduce((builder, v) => {
            builder.push(v);
            return builder;
        }, this.vs);
    }
    
    unsubscribeFromDeps() { this.input.removeSubscriber(this); }
    
    onChange(newVs: ImuxableVal<T>) {
        const edits = diff.diff(new ImmArrayAdapter(this.vs), newVs, this.equals);
        this.patch(newVs, edits);
    }
}

/** Create a {@link Vecnal} whose values are the values of the lists contained in input. */
function imux<T>(equals: (x: T, y: T) => boolean,
    input: Signal<Reducible<T> & Sized & Indexed<T>>
): Vecnal<T> {
    return new ImuxVecnal(equals, input);
}

