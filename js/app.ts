interface Deref<T> {
    ref: () => T;
}

interface Reset<T> {
    reset: (v: T) => T
}

type Subscriber<T> = (v: T, u: T) => void;

interface Observable<T> {
    subscribe: (subscriber: Subscriber<T>) => void;
    
    unsubscribe: (subscriber: Subscriber<T>) => void;
    
    notify: (v: T, u: T) => void;
}

interface Signal<T> extends Deref<T>, Observable<T> {}

class ConstSignal<T> implements Signal<T> {
    constructor(
        private readonly v: T
    ) {}
    
    ref(): T { return this.v; }
    
    subscribe(_: Subscriber<T>) {}
    
    unsubscribe(_: Subscriber<T>) {}
    
    notify(v: T, u: T) {}
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

class MappedSignal<T, U> implements Signal<U> {
    private readonly subscribers = new Set<Subscriber<U>>();
    private v: U | undefined = undefined;
    private readonly depSubscriber: Subscriber<T>;
    
    constructor(
        private readonly equals: (x: U, y: U) => boolean,
        private readonly f: (depVal: T) => U,
        private readonly dependency: Signal<T>
    ) {
        this.depSubscriber = (_: T, newDepVal: T) => {
            const oldVal = this.v as U; // TODO: Ensure safety
            const newVal = this.f(newDepVal);
            this.v = newVal;
            this.notify(oldVal, newVal);
        };
    }
    
    ref(): U {
        if (this.subscribers.size === 0) {
            this.v = this.f(this.dependency.ref()); // OPTIMIZE: Could this call could be cached?
        }
        
        return this.v as U; // TODO: Ensure safety
    }
    
    subscribe(subscriber: Subscriber<U>) {
        if (this.subscribers.size === 0) {
            // To avoid space leaks and 'unused' updates to `this` only start watching dependencies
            // when `this` gets its first watcher:
            this.dependency.subscribe(this.depSubscriber);
        }
        
        this.subscribers.add(subscriber);
    }
    
    unsubscribe(subscriber: Subscriber<U>) {
        this.subscribers.delete(subscriber);
        
        if (this.subscribers.size === 0) {
            // Watcher count just became zero, but watchees still have pointers to `this` (via
            // `depSubscriber`). Remove those to avoid space leaks and 'unused' updates to `this`:
            this.dependency.unsubscribe(this.depSubscriber);
        }
    }
    
    notify(v: U, u: U) {
        if (!this.equals(v, u)) {
            for (const subscriber of this.subscribers) {
                subscriber(v, u);
            }
        }
    }
}

(function (window) {
	'use strict';

	// Your starting point. Enjoy the ride!

})(window);

