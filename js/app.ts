interface Deref<T> {
    ref: () => T;
}

interface Reset<T> {
    reset: (v: T) => T
}

interface Indexed<T> {
    at: (i: number) => T;
}

interface IndexedMut<T> extends Indexed<T> {
    setAt: (i: number, v: T) => T;
}

interface Spliceable<T> extends IndexedMut<T> {
    insert: (i: number, v: T) => T;
    
    remove: (i: number) => T;
}

interface Reducible<T> {
    reduce: <U>(f: (acc: U, v: T) => U, acc: U) => U;
}

interface Sized {
    size: () => number;
}

function eq<T>(x: T, y: T): boolean { return x === y; }

function str(x: any): string { return `${x}`; }

type Subscriber<T> = (v: T, u: T) => void;

interface Observable<T> {
    subscribe: (subscriber: Subscriber<T>) => void;
    
    unsubscribe: (subscriber: Subscriber<T>) => void;
    
    notify: (/* TODO: Remove this param if possible: */ oldVal: T, newVal: T) => void;
}

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

interface ISignal<T> extends Deref<T>, Observable<T> {}

abstract class Signal<T> implements ISignal<T> {
    abstract ref(): T;
    
    abstract subscribe(subscriber: Subscriber<T>): void;
    
    abstract unsubscribe(subscriber: Subscriber<T>): void;
    
    abstract notify(v: T, u: T): void;
}

interface Vecnal<T> extends Indexed<T>, Sized, Reducible<T>, IndexedObservable<T> {}

class ConstSignal<T> extends Signal<T> {
    constructor(
        private readonly v: T
    ) {
        super();
    }
    
    ref(): T { return this.v; }
    
    subscribe(_: Subscriber<T>) {}
    
    unsubscribe(_: Subscriber<T>) {}
    
    notify(v: T, u: T) {}
}

class ConstVecnal<T> implements Vecnal<T> {
    private readonly vs: T[]; // TODO: Immutable vector
    
    constructor(
        vs: T[] // TODO: Immutable vector
    ) {
        this.vs = [...vs];
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

class SourceSignal<T> extends Signal<T> implements Reset<T> {
    private readonly subscribers = new Set<Subscriber<T>>();
    
    constructor(
        private readonly equals: (x: T, y: T) => boolean,
        private v: T
    ) {
        super();
    }
    
    ref(): T { return this.v; }
    
    reset(v: T): T {
        const old = this.v;
        this.v = v;
        
        this.notify(old, v);
        
        return v;
    }
    
    subscribe(subscriber: Subscriber<T>) {
        this.subscribers.add(subscriber);
    }
    
    unsubscribe(subscriber: Subscriber<T>) {
        this.subscribers.delete(subscriber);
    }
    
    notify(v: T, u: T) {
        if (!this.equals(v, u)) {
            for (const subscriber of this.subscribers) {
                subscriber(v, u);
            }
        }
    }
}

class SourceVecnal<T> implements Vecnal<T>, Spliceable<T> {
    private readonly vs: T[]; // OPTIMIZE: RRB vector
    private readonly subscribers = new Set<IndexedSubscriber<T>>();
    
    constructor(
        private readonly equals: (x: T, y: T) => boolean,
        vs: T[] // TODO: Immutable vector
    ) {
        this.vs = [...vs];
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
    
    iSubscribe(subscriber: IndexedSubscriber<T>) {
        this.subscribers.add(subscriber);
    }
    
    iUnsubscribe(subscriber: IndexedSubscriber<T>) {
        this.subscribers.delete(subscriber);
    }
    
    notifySubstitute(i: number, v: T, u: T) {
        if (!this.equals(v, u)) {
            for (const subscriber of this.subscribers) {
                subscriber.onSubstitute(i, u);
            }
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

class MappedSignal<U, T extends Signal<any>[]> extends Signal<U> {
    private readonly subscribers = new Set<Subscriber<U>>();
    private readonly deps: T;
    private readonly depSubscribers: Subscriber<any>[] = [];
    private v: U;
    
    constructor(
        private readonly equals: (x: U, y: U) => boolean,
        private readonly f: (...depVals: any[]) => U,
        ...deps: T
    ) {
        super();
        
        this.deps = deps;
        
        for (const dep of deps) {
            this.depSubscribers.push((_: any, _1: any) => {
                const oldVal = this.v;
                const newVal = this.f.apply(undefined, this.deps.map((dep) => dep.ref()));
                this.v = newVal;
                this.notify(oldVal, newVal);
            })
        }
    
        this.v = f.apply(undefined, deps.map((dep) => dep.ref()));
    }
    
    ref(): U {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.v` could be stale:
            this.v = this.f.apply(undefined, this.deps.map((dep) => dep.ref()));
            // OPTIMIZE: This combined with dep `ref()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.v;
    }
    
    subscribe(subscriber: Subscriber<U>) {
        if (this.subscribers.size === 0) {
            // To avoid space leaks and 'unused' updates to `this` only start watching dependencies
            // when `this` gets its first watcher:
            for (let i = 0; i < this.deps.length; ++i) {
                this.deps[i].subscribe(this.depSubscribers[i]);
            }
        }
        
        this.subscribers.add(subscriber);
    }
    
    unsubscribe(subscriber: Subscriber<U>) {
        this.subscribers.delete(subscriber);
        
        if (this.subscribers.size === 0) {
            // Watcher count just became zero, but watchees still have pointers to `this` (via
            // `depSubscriber`). Remove those to avoid space leaks and 'unused' updates to `this`:
            for (let i = 0; i < this.deps.length; ++i) {
                this.deps[i].unsubscribe(this.depSubscribers[i]);
            }
        }
    }
    
    notify(v: U, u: U) { // TODO: DRY wrt. `SourceSignal::notify`
        if (!this.equals(v, u)) {
            for (const subscriber of this.subscribers) {
                subscriber(v, u);
            }
        }
    }
}

// Type safe wrappers for `MappedSignal` creation:

// TODO: Make into methods of `Signal`:

function map<R, T>(equals: (x: R, y: R) => boolean, f: (x: T) => R, s: Signal<T>): Signal<R> {
    const g = f as (...xs: any[]) => R; // SAFETY: `xs` are `[s].map((x) => x.ref())`
    
    return new MappedSignal(equals, g, s);
}

function map2<R, T, U>(equals: (x: R, y: R) => boolean, f: (x: T, y: U) => R,
    s1: Signal<T>, s2: Signal<U>
): Signal<R> {
    const g = f as (...xs: any[]) => R; // SAFETY: `xs` are `[s1, s2].map((x) => x.ref())`
    
    return new MappedSignal(equals, g, s1, s2);
}

class MappedVecnal<U, T> implements Vecnal<U>, IndexedSubscriber<T> {
    private readonly vs: U[]; // OPTIMIZE: RRB vector
    private readonly subscribers = new Set<IndexedSubscriber<U>>();

    constructor(
        private readonly equals: (x: U, y: U) => boolean,
        private readonly f: (v: T) => U,
        private readonly input: Vecnal<T>
    ) {
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
    
    iSubscribe(subscriber: IndexedSubscriber<U>) {
        if (this.subscribers.size === 0) {
            // To avoid space leaks and 'unused' updates to `this` only start watching dependencies
            // when `this` gets its first watcher:
            this.input.iSubscribe(this);
        }
        
        this.subscribers.add(subscriber);
    }
    
    iUnsubscribe(subscriber: IndexedSubscriber<U>) {
        this.subscribers.delete(subscriber);
        
        if (this.subscribers.size === 0) {
            // Watcher count just became zero, but watchees still have pointers to `this` (via
            // `depSubscriber`). Remove those to avoid space leaks and 'unused' updates to `this`:
            this.input.iUnsubscribe(this);
        }
    }
    
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
    
    notifySubstitute(i: number, v: U, u: U) { // TODO: DRY (wrt. e.g. `SourceVecnal`)
        if (!this.equals(v, u)) {
            for (const subscriber of this.subscribers) {
                subscriber.onSubstitute(i, u);
            }
        }
    }
    
    notifyInsert(i: number, v: U) { // TODO: DRY (wrt. e.g. `SourceVecnal`)
        for (const subscriber of this.subscribers) {
            subscriber.onInsert(i, v);
        }
    }
    
    notifyRemove(i: number) { // TODO: DRY (wrt. e.g. `SourceVecnal`)
        for (const subscriber of this.subscribers) {
            subscriber.onRemove(i);
        }
    }
}

class FilteredVecnal<T> implements Vecnal<T>, IndexedSubscriber<T> {
    // C style non-index should make `indexMapping` an array of 32-bit ints at runtime:
    private static readonly NO_INDEX = -1;

    private readonly vs: T[]; // OPTIMIZE: RRB vector
    private readonly indexMapping: number[];
    private readonly subscribers = new Set<IndexedSubscriber<T>>();

    constructor(
        private readonly f: (v: T) => boolean,
        private readonly input: Vecnal<T>
    ) {
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
    
    iSubscribe(subscriber: IndexedSubscriber<T>) { // TODO: DRY (wrt. e.g. `MappedVecnal`)
        if (this.subscribers.size === 0) {
            // To avoid space leaks and 'unused' updates to `this` only start watching dependencies
            // when `this` gets its first watcher:
            this.input.iSubscribe(this);
        }
        
        this.subscribers.add(subscriber);
    }
    
    iUnsubscribe(subscriber: IndexedSubscriber<T>) { // TODO: DRY (wrt. e.g. `MappedVecnal`)
        this.subscribers.delete(subscriber);
        
        if (this.subscribers.size === 0) {
            // Watcher count just became zero, but watchees still have pointers to `this` (via
            // `depSubscriber`). Remove those to avoid space leaks and 'unused' updates to `this`:
            this.input.iUnsubscribe(this);
        }
    }
    
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
    
    notifySubstitute(i: number, v: T, u: T) {
        // No `this.equals` check; presumably `this.input` already took care of that. 
        for (const subscriber of this.subscribers) {
            subscriber.onSubstitute(i, u);
        }
    }
    
    notifyInsert(i: number, v: T) { // TODO: DRY (wrt. e.g. `SourceVecnal`)
        for (const subscriber of this.subscribers) {
            subscriber.onInsert(i, v);
        }
    }
    
    notifyRemove(i: number) { // TODO: DRY (wrt. e.g. `SourceVecnal`)
        for (const subscriber of this.subscribers) {
            subscriber.onRemove(i);
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

class ConcatVecnal<T> implements Vecnal<T> {
    // Some members need to be public for `ConcatVecnalDepSubscriber`:
    // TODO: Avoid that.
    readonly vs: T[]; // OPTIMIZE: RRB vector
    readonly offsets: number[];
    private readonly deps: Vecnal<T>[];
    private readonly depSubscribers: IndexedSubscriber<T>[];
    private readonly subscribers = new Set<IndexedSubscriber<T>>();
    
    constructor(
        ...inputs: Vecnal<T>[]
    ) {
        this.vs = [];
        this.offsets = [];
        this.depSubscribers = [];
        {
            const len = inputs.length;
            let offset = 0;
            for (let i = 0; i < len; ++i) {
                const input = inputs[i];
            
                input.reduce((acc, v) => this.vs.push(v), 0);
                
                this.offsets.push(offset);
                offset += input.size();
                
                this.depSubscribers.push(new ConcatVecnalDepSubscriber(this, i));
            }
        }
        
        this.deps = inputs;
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
    
    iSubscribe(subscriber: IndexedSubscriber<T>) {
        if (this.subscribers.size === 0) {
            // To avoid space leaks and 'unused' updates to `this` only start watching dependencies
            // when `this` gets its first watcher:
            {
                const len = this.deps.length;
                for (let i = 0; i < len; ++i) {
                    this.deps[i].iSubscribe(this.depSubscribers[i]);
                }
            }
        }
        
        this.subscribers.add(subscriber);
    }
    
    iUnsubscribe(subscriber: IndexedSubscriber<T>) {
        this.subscribers.delete(subscriber);
        
        if (this.subscribers.size === 0) {
            // Watcher count just became zero, but watchees still have pointers to `this` (via
            // `depSubscriber`). Remove those to avoid space leaks and 'unused' updates to `this`:
            {
                const len = this.deps.length;
                for (let i = 0; i < len; ++i) {
                    this.deps[i].iUnsubscribe(this.depSubscribers[i]);
                }
            }
        }
    }
    
    notifySubstitute(i: number, v: T, u: T) { // TODO: DRY (wrt. e.g. `FilteredVecnal`)
        // No `this.equals` check; presumably the dependency already took care of that.:
        for (const subscriber of this.subscribers) {
            subscriber.onSubstitute(i, u);
        }
    }
    
    notifyInsert(i: number, v: T) { // TODO: DRY (wrt. e.g. `SourceVecnal`)
        for (const subscriber of this.subscribers) {
            subscriber.onInsert(i, v);
        }
    }
    
    notifyRemove(i: number) { // TODO: DRY (wrt. e.g. `SourceVecnal`)
        for (const subscriber of this.subscribers) {
            subscriber.onRemove(i);
        }
    }
}

class ReducedSignal<U, T> extends Signal<U> implements IndexedSubscriber<T> {
    private v: U;
    private readonly subscribers = new Set<Subscriber<U>>();
    private readonly depSubscriber: Subscriber<U>;

    constructor(
        private readonly equals: (x: U, y: U) => boolean,
        private readonly f: (acc: U, v: T) => U,
        private readonly inputAcc: Signal<U>,
        private readonly inputColl: Vecnal<T>
    ) {
        super();
        
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
    
    subscribe(subscriber: Subscriber<U>) {
        if (this.subscribers.size === 0) {
            // To avoid space leaks and 'unused' updates to `this` only start watching dependencies
            // when `this` gets its first watcher:
            this.inputAcc.subscribe(this.depSubscriber);
            this.inputColl.iSubscribe(this);
        }
        
        this.subscribers.add(subscriber);
    }
    
    unsubscribe(subscriber: Subscriber<U>) {
        this.subscribers.delete(subscriber);
        
        if (this.subscribers.size === 0) {
            // Watcher count just became zero, but watchees still have pointers to `this` (via
            // `depSubscriber`). Remove those to avoid space leaks and 'unused' updates to `this`:
            this.inputAcc.unsubscribe(this.depSubscriber);
            this.inputColl.iUnsubscribe(this);
        }
    }
    
    notify(v: U, u: U) { // TODO: DRY wrt. `SourceSignal::notify`
        if (!this.equals(v, u)) {
            for (const subscriber of this.subscribers) {
                subscriber(v, u);
            }
        }
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

// DOM
// ===

type EventHandler = (event: Event) => void;

// Using the correct variances here although unsafe casts will be required on actual use:
type Watchees = Map<Observable<any>, Set<Subscriber<never>>>;

// HACK for forcibly shoving these properties into DOM nodes:
interface MountableNode {
    __vcnDetached: boolean | undefined,
    __vcnWatchees?: Watchees
}

function addWatchee<T>(node: MountableNode, signal: Signal<T>, subscriber: Subscriber<T>) {
    if (!node.__vcnWatchees) { node.__vcnWatchees = new Map(); }
    
    const subscribers = node.__vcnWatchees.get(signal);
    if (subscribers) {
        subscribers.add(subscriber);
    } else {
        node.__vcnWatchees.set(signal, new Set([subscriber]));
    }
}

function removeWatchee<T>(node: MountableNode, signal: Signal<T>, subscriber: Subscriber<T>) {
    if (!node.__vcnWatchees) { node.__vcnWatchees = new Map(); }
    
    const subscribers = node.__vcnWatchees.get(signal);
    if (subscribers) {
        subscribers.delete(subscriber);
    } else {
        console.error("signal has no subscribers to delete from");
    }
}

function activateSink(node: MountableNode) {
    if (node.__vcnWatchees) {
        for (const [signal, subscribers] of node.__vcnWatchees) {
            for (const subscriber of subscribers) {
                signal.subscribe(subscriber as Subscriber<any>);
            }
        }
    }
}

function deactivateSink(node: MountableNode) {
    if (node.__vcnWatchees) {
        for (const [signal, subscribers] of node.__vcnWatchees) {
            for (const subscriber of subscribers) {
                signal.unsubscribe(subscriber as Subscriber<any>);
            }
        }
    }
}

function isMounted(node: Node) {
    return !(node as unknown as MountableNode).__vcnDetached;
}

function mount(el: Node) {
    if (el instanceof Element) {
        for (const child of el.children) { mount(child); }
    }
    
    activateSink(el as unknown as MountableNode);
    
    (el as unknown as MountableNode).__vcnDetached = false;
}

function unmount(el: Node) {
    if (el instanceof Element) {
        for (const child of el.children) { unmount(child); }
    }
    
    deactivateSink(el as unknown as MountableNode);
    
    (el as unknown as MountableNode).__vcnDetached = true;
}

function insertBefore(parent: Node, child: Element, successor: Node) {
    parent.insertBefore(child, successor);
    if (isMounted(parent)) {
        mount(child);
        activateSink(parent as unknown as MountableNode);
    }
}

function replaceChild(parent: Node, child: Element, oldChild: Element) {
    parent.replaceChild(child, oldChild);
    if (isMounted(parent)) {
        unmount(oldChild);
        mount(child);
    }
}

type AttributeString = string | undefined;

type AttributeValue = AttributeString | Signal<AttributeString> | EventHandler;

function setAttributeString(node: Element, name: string, val: AttributeString) {
    if (typeof val === "string") {
        node.setAttribute(name, val);
    } else if (typeof val === "undefined") {
        node.removeAttribute(name);
    } else {
        const exhaust: never = val;
        return exhaust;
    }
}

function setAttribute(node: Element, name: string, val: AttributeValue) {
    if (typeof val === "string" || typeof val === "undefined") {
        setAttributeString(node, name, val);
    } else if (val instanceof Signal) {
        setAttributeString(node, name, val.ref());
        addWatchee(node as unknown as MountableNode, val, (_, newVal) =>
            setAttributeString(node, name, newVal)
        );
    } else if (typeof val === "function") {
        console.assert(name.slice(0, 2) === "on", "%s does not begin with 'on'", name);
        node.addEventListener(name.slice(2), val);
    } else {
        const exhaust: never = val;
        return exhaust;
    }
}

type ChildValue = Node | string;

type Child = ChildValue | Signal<ChildValue>;

function childValueToNode(child: ChildValue): Node {
    if (child instanceof Node) {
        return child;
    } else if (typeof child === "string") {
        return document.createTextNode(child);
    } else {
        const exhaust: never = child;
        return exhaust;
    }
}

function initChild(node: Element, index: number, child: Child) {
    if (child instanceof Node || typeof child === "string") {
        node.appendChild(childValueToNode(child));
    } else if (child instanceof Signal) {
        const childNode = childValueToNode(child.ref());
        node.appendChild(childNode);
        addWatchee(node as unknown as MountableNode, child, (_, childVal) => {
            const childNode = childValueToNode(childVal);
            const oldChildNode = node.childNodes[index];
            replaceChild(node, childNode as Element, oldChildNode as Element);
        });
    } else {
        const _exhaust: never = child;
    }
}

function el(tagName: string, attrs: {[key: string]: AttributeValue}, ...children: Child[]): Element {
    const node = document.createElement(tagName);
    (node as unknown as MountableNode).__vcnDetached = true;
    
    for (const attrName in attrs) {
        setAttribute(node, attrName, attrs[attrName]);
    }
    
    {
        const len = children.length;
        for (let i = 0; i < len; ++i) {
            initChild(node, i, children[i]);
        }
    }
    
    return node;
}

// App
// ===

const todoCount = new SourceSignal(eq, 0); // Global for REPL testing

function todosHeader(): Node {
    return el("header", {"class": "header"},
        el("h1", {}, "todos"),
        
        el("input", {"class": "new-todo",
                     "placeholder": "What needs to be done?",
                     "autofocus": "true"}));
}

function item(text: string, isComplete: boolean): Node {
    return el("li", {"class": isComplete ? "completed" : ""},
        el("div", {"class": "view"}, 
            el("input", {"class": "toggle",
                         "type": "checkbox",
                         "checked": isComplete ? "true" : undefined}),
            el("label", {}, text), 
            el("button", {"class": "destroy"})),
        el("input", {"class": "edit", "value": text}));
}

function todos(): Node {
    return el("section", {"class": "main"},
        el("input", {"id": "toggle-all", "class": "toggle-all", "type": "checkbox"}),
        el("label", {"for": "toggle-all"}, "Mark all as complete"),
        
        el("ul", {"class": "todo-list"},
            item("Taste JavaScript", true),
            item("Buy a unicorn", false)))
}

function todoFilter(label: string, path: string, isSelected: Signal<boolean>): Node {
    return el("li", {},
        el("a", {"class": map(eq, (isSelected) => isSelected ? "selected" : "",
                    isSelected),
                 "href": `#${path}`},
             label));
}

const allIsSelected = new SourceSignal(eq, true);

function todosFooter(todoCount: Signal<number>): Node {
    return el("footer", {"class": "footer"},
        el("span", {"class": "todo-count"},
            el("strong", {}, map(eq, str, todoCount)), " items left"),
        
        el("ul", {"class": "filters"},
            todoFilter("All", "/", allIsSelected),
            todoFilter("Active", "/active", new ConstSignal(false)),
            todoFilter("Completed", "/completed", new ConstSignal(false))),
        
        el("button", {"class": "clear-completed"}, "Clear completed"));
}

function createUI(todoCount: Signal<number>): Element {
    return el("section", {"class": "todoapp"},
        todosHeader(),
                         
        todos(),
                
        todosFooter(todoCount));
}

(function (window) {
	'use strict';

	const ui = createUI(todoCount);
	const body = document.body;
	insertBefore(body, ui, body.children[0]);
})(window);

