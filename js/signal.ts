export type {
    Observable, Subscriber  
};
export {
    Signal,
    CheckingSubscribingSubscribeableSignal,
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

abstract class SubscribeableSignal<T> extends Signal<T> {
    protected readonly subscribers = new Set<Subscriber<T>>();
    
    subscribe(subscriber: Subscriber<T>) {
        this.subscribers.add(subscriber);
    }
    
    unsubscribe(subscriber: Subscriber<T>) {
        this.subscribers.delete(subscriber);
    }
    
    notify(v: T, u: T) {
        for (const subscriber of this.subscribers) {
            subscriber(v, u);
        }
    }
}

abstract class CheckingSubscribeableSignal<T> extends SubscribeableSignal<T> {
    constructor(
        private readonly equals: (x: T, y: T) => boolean
    ) {
        super();
    }
    
    notify(v: T, u: T) {
        if (!this.equals(v, u)) {
            super.notify(v, u);
        }
    }
}

abstract class SubscribingSubscribeableSignal<T> extends SubscribeableSignal<T> {
    abstract subscribeToDeps(): void;
    abstract unsubscribeFromDeps(): void;
    
    subscribe(subscriber: Subscriber<T>) {
        if (this.subscribers.size === 0) {
            /* To avoid space leaks and 'unused' updates to `this` only start watching 
             * dependencies when `this` gets its first watcher: */
            this.subscribeToDeps();
        }
        
        super.subscribe(subscriber);
    }
    
    unsubscribe(subscriber: Subscriber<T>) {
        super.unsubscribe(subscriber);
        
        if (this.subscribers.size === 0) {
            /* Watcher count just became zero, but watchees still have pointers to `this`. 
             * Remove those to avoid space leaks and 'unused' updates to `this`: */
            this.unsubscribeFromDeps();
        }
    }
}

abstract class CheckingSubscribingSubscribeableSignal<T>
    extends SubscribingSubscribeableSignal<T>
{
    constructor(
        private readonly equals: (x: T, y: T) => boolean
    ) {
        super();
    }
    
    notify(v: T, u: T) {
        if (!this.equals(v, u)) {
            super.notify(v, u);
        }
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

class SourceSignal<T> extends CheckingSubscribeableSignal<T> implements Reset<T> {
    constructor(
        equals: (x: T, y: T) => boolean,
        private v: T
    ) {
        super(equals);
    }
    
    ref(): T { return this.v; }
    
    reset(v: T): T {
        const old = this.v;
        this.v = v;
        
        this.notify(old, v);
        
        return v;
    }
}

function source<T>(equals: (x: T, y: T) => boolean, initVal: T): Signal<T> & Reset<T> {
    return new SourceSignal(equals, initVal);
}

class MappedSignal<U, T extends Signal<any>[]>
    extends CheckingSubscribingSubscribeableSignal<U>
{
    private readonly deps: T;
    private readonly depSubscribers: Subscriber<any>[] = [];
    private v: U;
    
    constructor(
        equals: (x: U, y: U) => boolean,
        private readonly f: (...depVals: any[]) => U,
        ...deps: T
    ) {
        super(equals);
        
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
    
    subscribeToDeps() {
        this.deps.forEach((dep, i) => dep.subscribe(this.depSubscribers[i]));
    }
    
    unsubscribeFromDeps() {
        this.deps.forEach((dep, i) => dep.unsubscribe(this.depSubscribers[i]));
    }
}

