export type {
    IndexedObservable, IndexedSubscriber
};
export {
    Vecnal,
    stable, source,
    imux, lift,
    concat
};

import type {Reset, Sized, Indexed, Spliceable, Reducible} from "./prelude.js";
import {ImmArrayAdapter, eq} from "./prelude.js";
import * as diff from "./diff.js"
import type {Subscriber} from "./signal.js";
import * as signal from "./signal.js";
import {Signal, NonNotifyingSignal, CheckingSubscribingSubscribeableSignal}
    from "./signal.js";
    
// OPTIMIZE: Why even bother with init in constructors when e.g. `this.vs` is ignored
// anyway until subscribers appear?

 // TODO: Already reject non-changes here:
interface IndexedSubscriber<T> {
    onInsert: (i: number, v: T) => void;
    onRemove: (i: number) => void;
    // TODO: onMove: (i: number, j: number) => void;
    onSubstitute: (i: number, v: T) => void;
}

interface IndexedObservable<T> {
    addISubscriber: (subscriber: IndexedSubscriber<T>) => void;
    
    removeISubscriber: (subscriber: IndexedSubscriber<T>) => void;
    
    notifyInsert: (i: number, v: T) => void;
    notifyRemove: (i: number) => void;
    // TODO: notifyMove: (i: number, j: number) => void;
    notifySubstitute: (i: number, /* TODO: Remove this param if possible: */ v: T, u: T) => void;
}

// TODO: `extends Iterable<T>`:
// TODO: Ribbon cable -inspired name:
interface IVecnal<T> extends Indexed<T>, Sized, Reducible<T>, IndexedObservable<T> {}

interface ListBuilder<Item, Coll> {
    push: (v: Item) => void;
    
    build: () => Coll;
}

abstract class Vecnal<T> implements IVecnal<T> {
    abstract size(): number;
    
    abstract atOr(i: number, defaultValue: T): T;
    
    abstract reduce<U>(f: (acc: U, v: T) => U, acc: U): U;
    
    abstract addISubscriber(subscriber: IndexedSubscriber<T>): void;
    abstract removeISubscriber(subscriber: IndexedSubscriber<T>): void;
    abstract notifyInsert(i: number, v: T): void;
    abstract notifyRemove(i: number): void;
    abstract notifySubstitute(i: number, v: T, u: T): void;
    
    at(i: number): T | undefined { return this.atOr(i, undefined as T); }
    
    map<U>(equals: (x: U, y: U) => boolean, f: (v: T) => U): Vecnal<U> {
        return new MappedVecnal(equals, f, this);
    }
    
    filter(f: (v: T) => boolean): Vecnal<T> { return new FilteredVecnal(f, this); }
    
    reduceS<U>(equals: (x: U, y: U) => boolean, f: (acc: U, v: T) => U, accS: Signal<U>
    ): Signal<U> {
        return new ReducedSignal(equals, f, accS, this);
    }
    
    reverse(): Vecnal<T> { return new ReversedVecnal(this); }
    
    // TODO: Default comparator
    // TODO: `sortBy` (?):
    sort(compare: (x: T, y: T) => number): Vecnal<T> {
        return new SortedVecnal(this, compare);
    }
    
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
    protected readonly subscribers = new Set<IndexedSubscriber<T>>(); // TODO: `Set<WeakRef<`
    
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

function stable<T>(vs: Reducible<T>): Vecnal<T> { return new StableVecnal(vs); }

class SourceVecnal<T> extends CheckingSubscribeableVecnal<T> implements Spliceable<T> {
    private readonly vs: T[]; // OPTIMIZE: RRB vector
    
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

function source<T>(equals: (x: T, y: T) => boolean, initVals: Reducible<T>
): Vecnal<T> & Spliceable<T> {
    return new SourceVecnal(equals, initVals);
}

class MappedVecnal<U, T> extends CheckingSubscribingSubscribeableVecnal<U>
    implements IndexedSubscriber<T>
{
    private readonly vs: U[]; // OPTIMIZE: RRB vector

    constructor(
        equals: (x: U, y: U) => boolean,
        private readonly f: (v: T) => U,
        private readonly input: Vecnal<T>
    ) {
        super(equals);
        
        this.vs = input.reduce<typeof this.vs>((vs, v) => {
            vs.push(f(v));
            return vs;
        }, []);
    }
    
    size(): number {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            const oldLen = this.vs.length;
            const newLen = this.input.size();
            if (oldLen < newLen) {
                for (let i = oldLen; i < newLen; ++i) {
                    this.vs.push(this.f(this.input.at(i)!));
                }
            } else if (oldLen > newLen) {
                this.vs.splice(newLen);
            }
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
            
            this.vs[i] = this.f(this.input.at(i)!);
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
            this.input.reduce((i, v) => {
                this.vs[i] = this.f(v);
                return i + 1;
            }, 0);
            // OPTIMIZE: This combined with dep `at()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.vs.reduce(f, acc);
    }
    
    subscribeToDeps() { this.input.addISubscriber(this); }
    
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
    private readonly vs: T[]; // OPTIMIZE: RRB vector
    private readonly indexMapping: number[];

    constructor(
        private readonly f: (v: T) => boolean,
        private readonly input: Vecnal<T>
    ) {
        super();
        
        this.vs = [];
        this.indexMapping = [];
        const len = input.size();
        for (let i = 0; i < len; ++i) {
            const v = input.at(i)!;
            if (f(v)) {
                this.vs.push(v);
                this.indexMapping[i] = this.vs.length - 1;
            } else {
                this.indexMapping[i] = NO_INDEX;
            }
        }
    }
    
    size(): number {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            this.vs.splice(0);
            this.indexMapping.splice(0);
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
            // OPTIMIZE: This combined with dep `size()` in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.vs.length;
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            this.vs.splice(0);
            this.indexMapping.splice(0);
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
            // OPTIMIZE: This combined with dep `size()` in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.vs.reduce(f, acc);
    }
    
    atOr(i: number, defaultValue: T): T {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            this.vs.splice(0);
            this.indexMapping.splice(0);
            const len = this.input.size();
            for (let j = 0; j < len; ++j) {
                const v = this.input.at(j)!;
                if (this.f(v)) {
                    this.vs.push(v);
                    this.indexMapping[j] = this.vs.length - 1;
                    if (i < this.vs.length) {
                        break; // They only asked for `this.vs[i]`, can skip the following elements
                    }
                } else {
                    this.indexMapping[j] = NO_INDEX;
                }
            }
            // OPTIMIZE: This combined with dep `at()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        if (i >= this.vs.length) { return defaultValue; }
        
        return this.vs[i];
    }
    
    subscribeToDeps() { this.input.addISubscriber(this); }
    
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
        const newLen = this.input.size() - 1;
        for (let i = inputIndex; i < newLen; ++i) {
            const outputIndex = this.indexMapping[i + 1];
            this.indexMapping[i] = outputIndex >= 0
                ? outputIndex - 1
                : outputIndex;
        }
        
        this.indexMapping.pop();
    }
    
    private substitute(inputIndex: number, v: T) {
        let substIndex = this.indexMapping[inputIndex];
        
        const oldV = this.vs[substIndex];
        this.vs[substIndex] = v;
        
        this.notifySubstitute(substIndex, oldV, v);
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
                this.substitute(i, v);
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
    public readonly vs: T[]; // OPTIMIZE: RRB vector
    public readonly offsets: number[];
    private readonly depSubscribers: IndexedSubscriber<T>[];
    
    constructor(
        private readonly deps: Vecnal<T>[]
    ) {
        super();
        
        this.vs = [];
        this.offsets = [];
        this.depSubscribers = [];
        {
            let offset = 0;
            this.deps.forEach((dep, i) => {
                dep.reduce((acc, v) => this.vs.push(v), 0);
                
                this.offsets.push(offset);
                offset += dep.size();
                
                this.depSubscribers.push(new ConcatVecnalDepSubscriber(this, i));
            });
        }
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
    }
    
    unsubscribeFromDeps() {
        this.deps.forEach((dep, i) => dep.removeISubscriber(this.depSubscribers[i]));
    }
}

function concat<T>(...vecnals: Vecnal<T>[]): Vecnal<T> { return new ConcatVecnal(vecnals); }

class SingleElementVecnal<T> extends SubscribingSubscribeableVecnal<T>
    implements Subscriber<T>
{
    private v: T;
    
    constructor(
        private readonly signal: Signal<T>
    ) {
        super();
        
        this.v = signal.ref();
    }
    
    size(): number { return 1; }
    
    atOr(i: number, defaultValue: T): T {
        if (i !== 0) { return defaultValue; }
        
        return this.v;
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U { return f(acc, this.v); }
    
    subscribeToDeps() { this.signal.addSubscriber(this); }
    
    unsubscribeFromDeps() { this.signal.removeSubscriber(this); }
    
    onChange(newVal: T) {
        const oldVal = this.v;
        this.v = newVal;
        this.notifySubstitute(0, oldVal, newVal);
    }
}

function lift<T>(signal: Signal<T>): Vecnal<T> { return new SingleElementVecnal(signal); }

class ReducedSignal<U, T> extends CheckingSubscribingSubscribeableSignal<U>
    implements Subscriber<U>, IndexedSubscriber<T>
{
    private v: U;

    constructor(
        equals: (x: U, y: U) => boolean,
        private readonly f: (acc: U, v: T) => U,
        private readonly inputAcc: Signal<U>,
        private readonly inputColl: Vecnal<T>
    ) {
        super(equals);
        
        this.v = inputColl.reduce(f, inputAcc.ref());
    }
    
    ref(): U {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.v` could be stale:
            return this.inputColl.reduce(this.f, this.inputAcc.ref());
            // OPTIMIZE: This combined with dep `ref()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.v;
    }
    
    subscribeToDeps() {
        this.inputAcc.addSubscriber(this);
        this.inputColl.addISubscriber(this);
    }
    
    unsubscribeFromDeps() {
        this.inputAcc.removeSubscriber(this);
        this.inputColl.removeISubscriber(this);
    }
    
    private onCollChange() {
        const oldVal = this.v;
        const newVal = this.inputColl.reduce(this.f, this.inputAcc.ref());
        this.v = newVal;
        this.notify(oldVal, newVal);
    }
    
    onInsert(_: number, _1: T) { this.onCollChange(); }
    
    onRemove(_: number) { this.onCollChange(); }
    
    onSubstitute(_: number, _1: T) { this.onCollChange(); }
    
    onChange(newAcc: U) {
        const oldVal = this.v;
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
    private readonly vs = [] as T[];
    
    constructor(
        private readonly input: Vecnal<T>
    ) {
        super();
        
        const len = this.vs.length = input.size();
        input.reduce((i, v) => {
            this.vs[i] = v;
            return i - 1;
        }, len - 1);
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
    
    subscribeToDeps() { this.input.addISubscriber(this); }
    
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
    private readonly vs = [] as T[];
    private readonly indexMapping = [] as number[];
    private readonly revIndexMapping = [] as number[];

    constructor(
        private readonly input: Vecnal<T>,
        private readonly compare: (x: T, y: T) => number
    ) {
        super();
        
        this.reInit();
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
                if (j > index) {
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
            this.reInit();
        }
        
        if (index >= this.vs.length) { return defaultValue; }
        
        return this.vs[index];
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U {
        if (this.subscribers.size === 0) {
            this.reInit();
        }
        
        return this.vs.reduce(f, acc);
    }
    
    subscribeToDeps() { this.input.addISubscriber(this); }
    
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
    private readonly vs: T[];
    
    constructor(
        private readonly equals: (x: T, y: T) => boolean,
        private readonly input: Signal<Reducible<T> & Sized & Indexed<T>>
    ) {
        super();
        
        this.vs = input.ref().reduce<T[]>((builder, v) => {
            builder.push(v);
            return builder;
        }, []);
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
    
    subscribeToDeps() { this.input.addSubscriber(this); }
    
    unsubscribeFromDeps() { this.input.removeSubscriber(this); }
    
    onChange(newVs: ImuxableVal<T>) {
        const edits = diff.diff(new ImmArrayAdapter(this.vs), newVs, this.equals);
        this.patch(newVs, edits);
    }
}

function imux<T>(equals: (x: T, y: T) => boolean,
    input: Signal<Reducible<T> & Sized & Indexed<T>>
): Vecnal<T> {
    return new ImuxVecnal(equals, input);
}

