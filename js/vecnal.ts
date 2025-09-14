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
import {eq} from "./prelude.js";
import * as diff from "./diff.js"
import type {Subscriber} from "./signal.js";
import * as signal from "./signal.js";
import {Signal, CheckingSubscribingSubscribeableSignal} from "./signal.js";

interface IndexedSubscriber<T> {
    onInsert: (i: number, v: T) => void;
    onRemove: (i: number) => void;
    // TODO: onMove: (i: number, j: number) => void;
    onSubstitute: (i: number, v: T) => void;
}

interface IndexedObservable<T> {
    iSubscribe: (subscriber: IndexedSubscriber<T>) => void;
    
    iUnsubscribe: (subscriber: IndexedSubscriber<T>) => void;
    
    notifyInsert: (i: number, v: T) => void;
    notifyRemove: (i: number) => void;
    // TODO: notifyMove: (i: number, j: number) => void;
    notifySubstitute: (i: number, /* TODO: Remove this param if possible: */ v: T, u: T) => void;
}

// TODO: Ribbon cable -inspired name:
interface IVecnal<T> extends Indexed<T>, Sized, Reducible<T>, IndexedObservable<T> {}

interface ListBuilder<Item, Coll> {
    push: (v: Item) => void;
    
    build: () => Coll;
}

abstract class Vecnal<T> implements IVecnal<T> {
    abstract size(): number;
    
    abstract at(i: number): T;
    
    abstract reduce<U>(f: (acc: U, v: T) => U, acc: U): U;
    
    abstract iSubscribe(subscriber: IndexedSubscriber<T>): void;
    abstract iUnsubscribe(subscriber: IndexedSubscriber<T>): void;
    abstract notifyInsert(i: number, v: T): void;
    abstract notifyRemove(i: number): void;
    abstract notifySubstitute(i: number, v: T, u: T): void;
    
    map<U>(equals: (x: U, y: U) => boolean, f: (v: T) => U): Vecnal<U> {
        return new MappedVecnal(equals, f, this);
    }
    
    filter(f: (v: T) => boolean): Vecnal<T> { return new FilteredVecnal(f, this); }
    
    reduceS<U>(equals: (x: U, y: U) => boolean, f: (acc: U, v: T) => U, accS: Signal<U>
    ): Signal<U> {
        return new ReducedSignal(equals, f, accS, this);
    }
    
    view(): Vecnal<Signal<T>> { return new ViewVecnal(this); }
    
    mux<Coll>(builders: () => ListBuilder<T, Coll>): Signal<Coll> {
        return this.reduceS(eq, (builder, v) => {
            builder.push(v);
            return builder;
        }, new ThunkSignal<ListBuilder<T, Coll>>(builders))
        .map(eq, (builder) => builder.build());
    }
}

abstract class SubscribeableVecnal<T> extends Vecnal<T> {
    protected readonly subscribers = new Set<IndexedSubscriber<T>>();
    
    iSubscribe(subscriber: IndexedSubscriber<T>) {
        this.subscribers.add(subscriber);
    }
    
    iUnsubscribe(subscriber: IndexedSubscriber<T>) {
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

    iSubscribe(subscriber: IndexedSubscriber<T>) {
        if (this.subscribers.size === 0) {
            /* To avoid space leaks and 'unused' updates to `this` only start watching
             * dependencies when `this` gets its first watcher: */
            this.subscribeToDeps();
        }
        
        super.iSubscribe(subscriber);
    }
    
    iUnsubscribe(subscriber: IndexedSubscriber<T>) {
        super.iUnsubscribe(subscriber);
        
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

class ConstVecnal<T> extends Vecnal<T> {
    private readonly vs: readonly T[];
    
    constructor(
        vs: Iterable<T>
    ) {
        super();
        
        const builder = [];
        for (const v of vs) { builder.push(v); }
        this.vs = builder;
    }
    
    size(): number { return this.vs.length; }
    
    at(i: number): T { return this.vs[i]; }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U { return this.vs.reduce(f, acc); }
    
    iSubscribe(_: IndexedSubscriber<T>) {}
    
    iUnsubscribe(_: IndexedSubscriber<T>) {}
    
    notifyInsert(_: number, _1: T) {}
    
    notifyRemove(_: number) {}
    
    notifySubstitute(_: number, _1: T) {}
}

function stable<T>(vs: Iterable<T>): Vecnal<T> { return new ConstVecnal(vs); }

class SourceVecnal<T> extends CheckingSubscribeableVecnal<T> implements Spliceable<T> {
    private readonly vs: T[]; // OPTIMIZE: RRB vector
    
    constructor(
        equals: (x: T, y: T) => boolean,
        vs: Iterable<T>
    ) {
        super(equals);
        
        const builder = [];
        for (const v of vs) { builder.push(v); }
        this.vs = builder;
    }
    
    size(): number { return this.vs.length; }
    
    at(i: number): T { return this.vs[i]; }
    
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

function source<T>(equals: (x: T, y: T) => boolean, initVals: Iterable<T>
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
        
        this.vs = [];
        const len = input.size();
        for (let i = 0; i < len; ++i) {
            this.vs.push(f(input.at(i)));
        }
    }
    
    size(): number {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            const oldLen = this.vs.length;
            const newLen = this.input.size();
            if (oldLen < newLen) {
                for (let i = oldLen; i < newLen; ++i) {
                    this.vs.push(this.f(this.input.at(i)));
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
    
    at(i: number): U {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            this.vs[i] = this.f(this.input.at(i));
            // OPTIMIZE: This combined with dep `at()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
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
    
    subscribeToDeps() { this.input.iSubscribe(this); }
    
    unsubscribeFromDeps() { this.input.iUnsubscribe(this); }
    
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
        
        this.notifySubstitute(i, oldU, u);
    }
}

class FilteredVecnal<T> extends SubscribingSubscribeableVecnal<T>
    implements IndexedSubscriber<T>
{
    // C style non-index should make `indexMapping` an array of 32-bit ints at runtime:
    private static readonly NO_INDEX = -1;

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
            const v = input.at(i);
            if (f(v)) {
                this.vs.push(v);
                this.indexMapping[i] = this.vs.length - 1;
            } else {
                this.indexMapping[i] = FilteredVecnal.NO_INDEX;
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
                const v = this.input.at(i);
                if (this.f(v)) {
                    this.vs.push(v);
                    this.indexMapping[i] = this.vs.length - 1;
                } else {
                    this.indexMapping[i] = FilteredVecnal.NO_INDEX;
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
                const v = this.input.at(i);
                if (this.f(v)) {
                    this.vs.push(v);
                    this.indexMapping[i] = this.vs.length - 1;
                } else {
                    this.indexMapping[i] = FilteredVecnal.NO_INDEX;
                }
            }
            // OPTIMIZE: This combined with dep `size()` in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.vs.reduce(f, acc);
    }
    
    at(i: number): T {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            this.vs.splice(0);
            this.indexMapping.splice(0);
            const len = this.input.size();
            for (let j = 0; j < len; ++j) {
                const v = this.input.at(j);
                if (this.f(v)) {
                    this.vs.push(v);
                    this.indexMapping[j] = this.vs.length - 1;
                    if (i < this.vs.length) {
                        break; // They only asked for `this.vs[i]`, can skip the following elements
                    }
                } else {
                    this.indexMapping[j] = FilteredVecnal.NO_INDEX;
                }
            }
            // OPTIMIZE: This combined with dep `at()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.vs[i];
    }
    
    subscribeToDeps() { this.input.iSubscribe(this); }
    
    unsubscribeFromDeps() { this.input.iUnsubscribe(this); }
    
    private insert(i: number, v: T) {
        const j = i > 0 ? this.indexMapping[i - 1] + 1 : 0;
        
        // Insert to output:
        this.vs.splice(j, 0, v);
        
        // Update index mapping:
        this.indexMapping.push(FilteredVecnal.NO_INDEX);
        const newLen = this.indexMapping.length;
        let newIndex = j;
        for (let k = i; k < newLen; ++k) {
            const tmp = this.indexMapping[k];
            this.indexMapping[k] = newIndex;
            newIndex = tmp >= 0 ? tmp + 1 : tmp;
        }
        
        this.notifyInsert(j, v);
    }
    
    private remove(i: number) {
        const j = this.indexMapping[i];
        
        // Remove from output:
        this.vs.splice(j, 1);
        
        // Update index mapping:
        const newLen = this.input.size() - 1;
        for (let k = i; k < newLen; ++k) {
            const oldIndexOfNext = this.indexMapping[k + 1];
            this.indexMapping[k] = oldIndexOfNext >= 0 ? oldIndexOfNext - 1 : oldIndexOfNext;
        }
        this.indexMapping.pop();
        
        this.notifyRemove(j);
    }
    
    private substitute(i: number, v: T) {
        let j = this.indexMapping[i];
        
        const oldV = this.vs[j];
        this.vs[j] = v;
        
        this.notifySubstitute(j, oldV, v);
    }
    
    onInsert(i: number, v: T) {
        if (this.f(v)) {
            this.insert(i, v);
        } else {
            // Output does not change but still need to update index mapping:
            this.indexMapping.push(FilteredVecnal.NO_INDEX);
            const newLen = this.indexMapping.length;
            let newIndex = FilteredVecnal.NO_INDEX;
            for (let k = i; k < newLen; ++k) {
                const tmp = this.indexMapping[k];
                this.indexMapping[k] = newIndex;
                newIndex = tmp;
            }
        }
    }
    
    onRemove(i: number) {
        const j = this.indexMapping[i];
        
        if (j >= 0) {
            this.remove(i);
        } else {
            // Output does not change but still need to update index mapping:
            const newLen = this.input.size() - 1;
            for (let k = i; k < newLen; ++k) {
                const oldIndexOfNext = this.indexMapping[k + 1];
                this.indexMapping[k] = oldIndexOfNext;
            }
            this.indexMapping.pop();
        }
    }
    
    onSubstitute(i: number, v: T) {
        let j = this.indexMapping[i];
        
        if (j >= 0) { // Old value was not filtered out
            if (this.f(v)) { // New value not filtered out either
                this.substitute(i, v);
            } else { // New value is filtered out
                this.remove(i);
            }
        } else { // Old value was filtered out
            if (this.f(v)) { // New value is not filtered out
                this.insert(i, v);
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
        const i = this.vecnal.offsets[this.depIndex] + subIndex;
        this.vecnal.vs.splice(i, 0, v);
        {
            const len = this.vecnal.offsets.length;
            for (let j = this.depIndex + 1; j < len; ++j) {
                ++this.vecnal.offsets[j];
            }
        }
        this.vecnal.notifyInsert(i, v);
    }
    
    onRemove(subIndex: number) {
        const i = this.vecnal.offsets[this.depIndex] + subIndex;
        this.vecnal.vs.splice(i, 1);
        {
            const len = this.vecnal.offsets.length;
            for (let j = this.depIndex + 1; j < len; ++j) {
                --this.vecnal.offsets[j];
            }
        }
        this.vecnal.notifyRemove(i);
    }
    
    onSubstitute(subIndex: number, v: T) {
        const i = this.vecnal.offsets[this.depIndex] + subIndex;
        const oldv = this.vecnal.vs[i];
        this.vecnal.vs[i] = v;
        this.vecnal.notifySubstitute(i, oldv, v);
    }
}

class ConcatVecnal<T> extends SubscribingSubscribeableVecnal<T> {
    // Some members need to be public for `ConcatVecnalDepSubscriber`. This class itself need not be
    // a public module member though so it will be fine:
    readonly vs: T[]; // OPTIMIZE: RRB vector
    readonly offsets: number[];
    private readonly depSubscribers: IndexedSubscriber<T>[];
    
    constructor(
        private readonly deps: Vecnal<T>[]
    ) {
        super();
        
        this.vs = [];
        this.offsets = [];
        this.depSubscribers = [];
        {
            const len = deps.length;
            let offset = 0;
            for (let i = 0; i < len; ++i) {
                const dep = this.deps[i];
            
                dep.reduce((acc, v) => this.vs.push(v), 0);
                
                this.offsets.push(offset);
                offset += dep.size();
                
                this.depSubscribers.push(new ConcatVecnalDepSubscriber(this, i));
            }
        }
    }
    
    size(): number {
        if (this.subscribers.size > 0) {
            return this.vs.length;
        } else {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            return this.deps.reduce((acc, dep) => acc + dep.size(), 0);
            // OPTIMIZE: This combined with dep `reduce()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
    }
    
    at(index: number): T {
        if (this.subscribers.size > 0) {
            return this.vs[index];
        } else {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            {
                let subi = index;
                for (const dep of this.deps) {
                    const depLen = dep.size();
                
                    if (subi < depLen) {
                        return dep.at(subi);
                    }
                    
                    subi -= depLen;
                }
            }
            // OPTIMIZE: This combined with dep `reduce()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
            
            // TODO: Should it be possible to return a default (usually `undefined`/sentinel) instead?:
            throw Error("Out of bounds");
        }
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U {
        if (this.subscribers.size > 0) {
            return this.vs.reduce(f, acc);
        } else {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            return this.deps.reduce((acc, dep) => dep.reduce(f, acc), acc);
            // OPTIMIZE: This combined with dep `reduce()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
    }
    
    subscribeToDeps() {
        const len = this.deps.length;
        for (let i = 0; i < len; ++i) {
            this.deps[i].iSubscribe(this.depSubscribers[i]);
        }
    }
    
    unsubscribeFromDeps() {
        const len = this.deps.length;
        for (let i = 0; i < len; ++i) {
            this.deps[i].iUnsubscribe(this.depSubscribers[i]);
        }
    }
}

function concat<T>(...vecnals: Vecnal<T>[]): Vecnal<T> { return new ConcatVecnal(vecnals); }

class SingleElementVecnal<T> extends SubscribingSubscribeableVecnal<T> {
    private v: T;
    private readonly depSubscriber: Subscriber<T>;
    
    constructor(
        private readonly signal: Signal<T>
    ) {
        super();
        
        this.v = signal.ref();
        this.depSubscriber = (oldVal, newVal) => {
            this.v = newVal;
            this.notifySubstitute(0, oldVal, newVal);
        }
    }
    
    size(): number { return 1; }
    
    at(i: number): T {
        if (i !== 0) { throw Error("Out of bounds"); }
        
        return this.v;
    }
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U { return f(acc, this.v); }
    
    subscribeToDeps() { this.signal.subscribe(this.depSubscriber); }
    
    unsubscribeFromDeps() { this.signal.unsubscribe(this.depSubscriber); }
}

function lift<T>(signal: Signal<T>): Vecnal<T> { return new SingleElementVecnal(signal); }

class ReducedSignal<U, T> extends CheckingSubscribingSubscribeableSignal<U>
    implements IndexedSubscriber<T>
{
    private v: U;
    private readonly depSubscriber: Subscriber<U>;

    constructor(
        equals: (x: U, y: U) => boolean,
        private readonly f: (acc: U, v: T) => U,
        private readonly inputAcc: Signal<U>,
        private readonly inputColl: Vecnal<T>
    ) {
        super(equals);
        
        this.v = inputColl.reduce(f, inputAcc.ref());
        this.depSubscriber = (_, newAcc) => {
            const oldVal = this.v;
            const newVal = this.inputColl.reduce(this.f, newAcc);
            this.v = newVal;
            this.notify(oldVal, newVal);
        };
    }
    
    ref(): U {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.v` could be stale:
            this.v = this.inputColl.reduce(this.f, this.inputAcc.ref());
            // OPTIMIZE: This combined with dep `ref()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.v;
    }
    
    subscribeToDeps() {
        this.inputAcc.subscribe(this.depSubscriber);
        this.inputColl.iSubscribe(this);
    }
    
    unsubscribeFromDeps() {
        this.inputAcc.unsubscribe(this.depSubscriber);
        this.inputColl.iUnsubscribe(this);
    }
    
    private onChange() {
        const oldVal = this.v;
        const newVal = this.inputColl.reduce(this.f, this.inputAcc.ref());
        this.v = newVal;
        this.notify(oldVal, newVal);
    }
    
    onInsert(_: number, _1: T) { this.onChange(); }
    
    onRemove(_: number) { this.onChange(); }
    
    onSubstitute(_: number, _1: T) { this.onChange(); }
}

class ThunkSignal<T> extends Signal<T> {
    constructor(
        private readonly f: () => T
    ) {
        super();
    }
    
    ref(): T { return this.f(); }
    
    subscribe(_: Subscriber<T>) {}
    
    unsubscribe(_: Subscriber<T>) {}
    
    notify(v: T, u: T) {}
}

class ViewVecnal<T> extends SubscribingSubscribeableVecnal<Signal<T>>
    implements IndexedSubscriber<T>
{
    private readonly signals: (Signal<T> & Reset<T>)[]; // OPTIMIZE: RRB vector
    
    constructor(
        private readonly input: Vecnal<T>
    ) {
        super();
        
        this.signals = [];
        input.reduce((_, v) => { this.signals.push(signal.source(eq, v)); },
            /*HACK:*/ undefined as void);
    }
    
    size(): number {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.signals` could be stale:
            return this.input.size();
            // OPTIMIZE: This combined with dep `size()` in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.signals.length;
    }
    
    at(i: number): Signal<T> {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.signals` could be stale:
            const requiredLen = i + 1;
            for (let j = this.signals.length; j < requiredLen; ++j) {
                this.signals[j] = signal.source(eq, this.input.at(j));
            }
            // OPTIMIZE: This combined with dep `at()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.signals[i];
    }
    
    reduce<V>(f: (acc: V, v: Signal<T>) => V, acc: V): V {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.signals` could be stale:
            const requiredLen = this.input.size();
            for (let j = this.signals.length; j < requiredLen; ++j) {
                this.signals[j] = signal.source(eq, this.input.at(j));
            }
            // OPTIMIZE: This combined with dep `at()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.signals.reduce(f, acc);
    }
    
    subscribeToDeps() { this.input.iSubscribe(this); }
    
    unsubscribeFromDeps() { this.input.iUnsubscribe(this); }
    
    onInsert(i: number, v: T) {
        const sig = signal.source(eq, v);
        this.signals.splice(i, 0, sig);
        
        this.notifyInsert(i, sig);
    }
    
    onRemove(i: number) {
        this.signals.splice(i, 1);
        
        this.notifyRemove(i);
    }
    
    onSubstitute(i: number, v: T) {
        this.signals[i].reset(v);
    }
}

class ImuxVecnal<T> extends SubscribingSubscribeableVecnal<T> {
    private readonly vs: T[];
    private readonly inputSubscriber: Subscriber<Sized & Indexed<T>>;
    
    constructor(
        private readonly equals: (x: T, y: T) => boolean,
        private readonly input: Signal<Reducible<T> & Sized & Indexed<T>>
    ) {
        super();
        
        this.vs = input.ref().reduce<T[]>((builder, v) => {
            builder.push(v);
            return builder;
        }, []);
        
        this.inputSubscriber = (oldVs, newVs) => {
            const edits = diff.diff(oldVs, newVs, this.equals);
            this.patch(newVs, edits);
        };
    }
    
    private patch(newVs: Sized & Indexed<T>, edits: diff.EditScript) {
        for (const edit of edits) {
            if (edit instanceof diff.Insert) {
                const i = edit.index;
                const v = newVs.at(i);
                this.vs.splice(i, 0, v);
                this.notifyInsert(i, v);
            } else if (edit instanceof diff.Delete) {
                const i = edit.index;
                this.vs.splice(i, 1);
                this.notifyRemove(i);
            } else if (edit instanceof diff.Substitute) {
                const i = edit.index;
                const u = this.vs[i];
                const v = newVs.at(i);
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
    
    at(index: number): T {
        if (this.subscribers.size > 0) {
            return this.vs[index];
        } else {
            // If `this` has no subscribers it does not watch deps either so `this.vs` could be stale:
            return this.input.ref().at(index);
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
    
    subscribeToDeps() { this.input.subscribe(this.inputSubscriber); }
    
    unsubscribeFromDeps() { this.input.unsubscribe(this.inputSubscriber); }
}

function imux<T>(equals: (x: T, y: T) => boolean,
    input: Signal<Reducible<T> & Sized & Indexed<T>>
): Vecnal<T> {
    return new ImuxVecnal(equals, input);
}

