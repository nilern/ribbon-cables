export type {
    Observable, Subscriber  
};
export {
    Signal,
    stable, source
};

import type {Deref, Reset} from "./prelude.js";

type Subscriber<T> = (v: T, u: T) => void;

interface Observable<T> {
    subscribe: (subscriber: Subscriber<T>) => void;
    
    unsubscribe: (subscriber: Subscriber<T>) => void;
    
    notify: (/* TODO: Remove this param if possible: */ oldVal: T, newVal: T) => void;
}

interface ISignal<T> extends Deref<T>, Observable<T> {}

abstract class Signal<T> implements ISignal<T> {
    abstract ref(): T;
    
    abstract subscribe(subscriber: Subscriber<T>): void;
    abstract unsubscribe(subscriber: Subscriber<T>): void;
    abstract notify(v: T, u: T): void;
    
    map<U>(equals: (x: U, y: U) => boolean, f: (v: T) => U): Signal<U> {
        const g = f as (...xs: any[]) => U; // SAFETY: `xs` are `[this].map((x) => x.ref())`
    
        return new MappedSignal(equals, g, this);
    }
    
    map2<R, U>(equals: (x: R, y: R) => boolean, f: (x: T, y: U) => R, that: Signal<U>
    ): Signal<R> {
        // SAFETY: `xs` are `[this, that].map((x) => x.ref())`:
        const g = f as (...xs: any[]) => R; 
        
        return new MappedSignal(equals, g, this, that);
    }
}

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

function stable<T>(v: T): Signal<T> { return new ConstSignal(v); }

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

function source<T>(equals: (x: T, y: T) => boolean, initVal: T): Signal<T> & Reset<T> {
    return new SourceSignal(equals, initVal);
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

