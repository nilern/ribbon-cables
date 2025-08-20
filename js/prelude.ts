export interface Deref<T> {
    ref: () => T;
}

export interface Reset<T> {
    reset: (v: T) => T
}

export interface Indexed<T> {
    at: (i: number) => T;
}

export interface IndexedMut<T> extends Indexed<T> {
    setAt: (i: number, v: T) => T;
}

export interface Spliceable<T> extends IndexedMut<T> {
    insert: (i: number, v: T) => T;
    
    remove: (i: number) => T;
}

export interface Reducible<T> {
    reduce: <U>(f: (acc: U, v: T) => U, acc: U) => U;
}

export interface Sized {
    size: () => number;
}

export function eq<T>(x: T, y: T): boolean { return x === y; }

export function str(x: any): string { return `${x}`; }

