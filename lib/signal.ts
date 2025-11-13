export type {
    Observable, Subscriber  
};
export {
    Signal,
    NonNotifyingSignal,
    SubscribeableSignal, SubscribingSubscribeableSignal, CheckingSubscribingSubscribeableSignal,
    stable, source
};

import type {Deref, Reset} from "./prelude.js";

/** An object that can be notified of value changes. */
interface Subscriber<T> {
    /** Receives the new value v. */
    onChange: (v: T) => void; // TODO: Already reject non-changes here
}

/** An object that can inform {@link Subscriber}s of changes to a value of type T. */
interface Observable<T> {
    /** Add a {@link Subscriber}. */
    addSubscriber: (subscriber: Subscriber<T>) => void;
    
    /** Remove a {@link Subscriber}. */
    removeSubscriber: (subscriber: Subscriber<T>) => void;
    
    /** Notify all {@link Subscriber}s that the value is now v. */
    notify: (oldVal: T, newVal: T) => void;
}

/** Contains a value that changes over time and can read and the changes subscribed to. */
abstract class Signal<T> implements Deref<T>, Observable<T> {
    abstract ref(): T;
    
    abstract addSubscriber(subscriber: Subscriber<T>): void;
    abstract removeSubscriber(subscriber: Subscriber<T>): void;
    abstract notify(v: T, u: T): void;
    
    /** Create a derived signal whose value is always f(this.ref()).
        If the derived signal receives a new value from this that does not change its value wrt.
        equals() it will not notify its subscribers. */
    map<U>(equals: (x: U, y: U) => boolean, f: (v: T) => U): Signal<U> {
        return new SinglyMappedSignal(equals, f, this);
    }
    
    /** Create a derived signal whose value is always f(this.ref(), that.ref()).
        If the derived signal receives a new value from this or that that does not change its value
        wrt. equals() it will not notify its subscribers. */
    map2<R, U>(equals: (x: R, y: R) => boolean, f: (x: T, y: U) => R, that: Signal<U>
    ): Signal<R> {
        // SAFETY: `xs` are `[this, that].map((x) => x.ref())`:
        const g = f as (...xs: any[]) => R; 
        
        return new MappedSignal(equals, g, this, that);
    }
    
    // TODO: map3 etc.
}

// TODO: Use mixins instead of this slightly arbitrary hierarchy of abstract classes:

/** A {@link Signal} that never notifies (and thus does not even store) its {@link Subscriber}s. */
abstract class NonNotifyingSignal<T> extends Signal<T> {
    addSubscriber(_: Subscriber<T>) {}
    
    removeSubscriber(_: Subscriber<T>) {}
    
    notify(_: T, _1: T) {}
}

/** A {@link Signal} that stores its subscribers in a {@link Set}. */
abstract class SubscribeableSignal<T> extends Signal<T> {
    /** The internal set of subscribers. */
    protected readonly subscribers = new Set<Subscriber<T>>();
    
    addSubscriber(subscriber: Subscriber<T>) {
        this.subscribers.add(subscriber);
    }
    
    removeSubscriber(subscriber: Subscriber<T>) {
        this.subscribers.delete(subscriber);
    }
    
    notify(_: T, u: T) {
        for (const subscriber of this.subscribers) {
            subscriber.onChange(u);
        }
    }
}

/** A {@link SubscribeableSignal} that only notifies its subscribers if its value changes wrt.
    equals() */
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

/** A {@link SubscribeableSignal} that subscribes to its own dependencies while it itself has
    subscribers */
abstract class SubscribingSubscribeableSignal<T> extends SubscribeableSignal<T> {
    /** Subscribe to dependencies (called when this gets its first subscriber). */
    abstract subscribeToDeps(): void;
    /** Unsubscribe from dependencies (called when this loses its last subscriber). */
    abstract unsubscribeFromDeps(): void;
    
    addSubscriber(subscriber: Subscriber<T>) {
        if (this.subscribers.size === 0) {
            /* To avoid space leaks and 'unused' updates to `this` only start watching 
             * dependencies when `this` gets its first watcher: */
            this.subscribeToDeps();
        }
        
        super.addSubscriber(subscriber);
    }
    
    removeSubscriber(subscriber: Subscriber<T>) {
        super.removeSubscriber(subscriber);
        
        if (this.subscribers.size === 0) {
            /* Watcher count just became zero, but watchees still have pointers to `this`. 
             * Remove those to avoid space leaks and 'unused' updates to `this`: */
            this.unsubscribeFromDeps();
        }
    }
}
/** A {@link SubscribingSubscribeableSignal} that only notifies its subscribers if its value changes
    wrt. equals() */
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

class ConstSignal<T> extends NonNotifyingSignal<T> {
    constructor(
        private readonly v: T
    ) {
        super();
    }
    
    ref(): T { return this.v; }
}

/** Create a {@link Signal} that always has the value v. */
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

/** Creates a {@link Reset}able signal with initial value initVal that only notifies its subscribers
    if its value changes wrt. equals() */
function source<T>(equals: (x: T, y: T) => boolean, initVal: T): Signal<T> & Reset<T> {
    return new SourceSignal(equals, initVal);
}

class SinglyMappedSignal<U, T> extends CheckingSubscribingSubscribeableSignal<U>
    implements Subscriber<T>
{
    private v: U | undefined = undefined;
    
    constructor(
        equals: (x: U, y: U) => boolean,
        private readonly f: (v: T) => U,
        private readonly input: Signal<T>
    ) {
        super(equals);
    }
    
    ref(): U {
        if (this.subscribers.size === 0) { return this.f(this.input.ref()); }
        
        return this.v!;
    }
    
    subscribeToDeps() {
        this.input.addSubscriber(this);
        
        this.v = this.f(this.input.ref());
    }
    
    unsubscribeFromDeps() {
        this.input.removeSubscriber(this);
    }
    
    onChange(v: T) {
        const oldVal = this.v!;
        const newVal = this.f(v);
        this.v = newVal;
        
        this.notify(oldVal, newVal);
    }
}

class MappedSignal<U, T extends Signal<any>[]>
    extends CheckingSubscribingSubscribeableSignal<U>
{
    private readonly deps: T;
    private readonly depSubscribers: Subscriber<any>[] = [];
    private v: U | undefined = undefined;
    
    constructor(
        equals: (x: U, y: U) => boolean,
        private readonly f: (...depVals: any[]) => U,
        ...deps: T
    ) {
        super(equals);
        
        this.deps = deps;
        
        for (const dep of deps) {
            this.depSubscribers.push({onChange: (_: any) => {
                const oldVal = this.v!;
                const newVal = this.f.apply(undefined, this.deps.map((dep) => dep.ref()));
                this.v = newVal;
                this.notify(oldVal, newVal);
            }})
        }
    }
    
    ref(): U {
        if (this.subscribers.size === 0) {
            // If `this` has no subscribers it does not watch deps either so `this.v` could be stale:
            return this.f.apply(undefined, this.deps.map((dep) => dep.ref()));
            // OPTIMIZE: This combined with dep `ref()`:s in ctor makes signal graph construction
            // O(signalGraphLength^2). That is unfortunate, but less unfortunate than the leaks that
            // would result from eagerly subscribing in ctor...
        }
        
        return this.v!;
    }
    
    subscribeToDeps() {
        this.deps.forEach((dep, i) => dep.addSubscriber(this.depSubscribers[i]));
        
        this.v = this.f.apply(undefined, this.deps.map((dep) => dep.ref()));
    }
    
    unsubscribeFromDeps() {
        this.deps.forEach((dep, i) => dep.removeSubscriber(this.depSubscribers[i]));
    }
}

