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

interface Sized {
    size: () => number;
}

type Subscriber<T> = (v: T, u: T) => void;

interface Observable<T> {
    subscribe: (subscriber: Subscriber<T>) => void;
    
    unsubscribe: (subscriber: Subscriber<T>) => void;
    
    notify: (v: T, u: T) => void;
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
    notifySubstitute: (i: number, v: T, u: T) => void;
}

interface Signal<T> extends Deref<T>, Observable<T> {}

interface Vecnal<T> extends Indexed<T>, Sized, IndexedObservable<T> {}

class ConstSignal<T> implements Signal<T> {
    constructor(
        private readonly v: T
    ) {}
    
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
    
    iSubscribe(_: IndexedSubscriber<T>) {}
    
    iUnsubscribe(_: IndexedSubscriber<T>) {}
    
    notifyInsert(_: number, _1: T) {}
    
    notifyRemove(_: number) {}
    
    notifySubstitute(_: number, _1: T) {}
}

class SourceSignal<T> implements Signal<T>, Reset<T> {
    private readonly subscribers = new Set<Subscriber<T>>();
    
    constructor(
        private readonly equals: (x: T, y: T) => boolean,
        private v: T
    ) {}
    
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

class MappedSignal<U, T extends Signal<any>[]> implements Signal<U> {
    private readonly subscribers = new Set<Subscriber<U>>();
    private readonly deps: T;
    private readonly depSubscribers: Subscriber<any>[] = [];
    private v: U;
    
    constructor(
        private readonly equals: (x: U, y: U) => boolean,
        private readonly f: (...depVals: any[]) => U,
        ...deps: T
    ) {
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

// App
// ===

(function (window) {
	'use strict';

	// Your starting point. Enjoy the ride!
})(window);

