export type {
    Deref, Reset,
    Sized, Indexed, IndexedMut, Spliceable,
    Reducible
};
export {ImmArrayAdapter, id, eq, str};

/** An abstract read-only container for a value of type T. */
interface Deref<T> {
    /** Get the contained value. */
    ref: () => T;
}

/** An abstract write-only container for a value of type T. */
interface Reset<T> {
    /** Set the contained value. */
    reset: (v: T) => T
}

/** A collection whose size can be measured in constant time. */
interface Sized {
    /** Get the current size. */
    size: () => number;
}

/** A collection whose i:th element can be read in constant time. */
interface Indexed<T> {
    /** Get the i:th element. */
    at: (i: number) => T | undefined; // TODO: What about negative indices?
}

/** A collection whose i:th element can be read and written in constant time. */
interface IndexedMut<T> extends Indexed<T> {
    /** Set the i:th element to v. */
    setAt: (i: number, v: T) => T;
}

/** An {@link IndexedMut} collection that supports insertions and removals in the middle. */
interface Spliceable<T> extends IndexedMut<T> {
    /** Insert v at index i (0 <= i <= this.size()), increasing collection size by one. */
    insert: (i: number, v: T) => T;
    
    /** Remove the value from index i (0 <= i < this.size()), decreasing collection size by one. */
    remove: (i: number) => T;
}

/** A collection that supports reduce (aka left fold) over its elements. */
interface Reducible<T> {
    /** Reduce over the collection with f and initial accumulator acc. */
    reduce: <U>(f: (acc: U, v: T) => U, acc: U) => U;
}

// TODO: Make this unnecessary:
/** A {@link Reducible}, {@link Sized} and {@link Indexed} wrapper for arrays. */
class ImmArrayAdapter<T> implements Reducible<T>, Sized, Indexed<T> {
    /** Wrap vs */
    constructor(
        private readonly vs: readonly T[]
    ) {}
    
    reduce<U>(f: (acc: U, v: T) => U, acc: U): U { return this.vs.reduce(f, acc); }
    
    size(): number { return this.vs.length; }
    
    at(i: number): T { return this.vs[i]; }
}

/** The identity function (just returns its argument). */
function id<T>(v: T): T { return v; }

// TODO: Add default arguments to various places instead of just callously throwing
//       this in whenever required:
// TODO: Default to `Object.is` instead?
/** The strict equality operator === as a function. */
function eq<T>(x: T, y: T): boolean { return x === y; }

/** Stringifies x. */
function str(x: any): string { return `${x}`; }

