export type {
    Deref, Reset,
    Sized, Indexed, IndexedMut, Spliceable,
    Reducible
};
export {ImmArrayAdapter, id, eq, str};

interface Deref<T> {
    ref: () => T;
}

interface Reset<T> {
    reset: (v: T) => T
}

interface Sized {
    size: () => number;
}

interface Indexed<T> {
    at: (i: number) => T | undefined; // TODO: What about negative indices?
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

// TODO: Make this unnecessary:
class ImmArrayAdapter<T> implements Reducible<T>, Sized, Indexed<T> {
    constructor(
        private readonly vs: readonly T[]
    ) {}
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U { return this.vs.reduce(f, acc); }
    
    size(): number { return this.vs.length; }
    
    at(i: number): T { return this.vs[i]; }
}

function id<T>(v: T): T { return v; }

// TODO: Add default arguments to various places instead of just callously throwing
//       this in whenever required:
// TODO: Default to `Object.is` instead?
function eq<T>(x: T, y: T): boolean { return x === y; }

function str(x: any): string { return `${x}`; }

