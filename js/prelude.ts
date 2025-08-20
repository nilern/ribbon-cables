export type {
    Deref, Reset,
    Sized, Indexed, IndexedMut, Spliceable,
    Reducible
};
export {eq, str};

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

function eq<T>(x: T, y: T): boolean { return x === y; }

function str(x: any): string { return `${x}`; }

