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

(function (window) {
	'use strict';

	// Your starting point. Enjoy the ride!

})(window);

