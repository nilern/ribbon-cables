export type {Insertion, Removal, Substitution, Op};
export {arbOpIn, arbArrayHistory};

import {fc} from '@fast-check/jest';

type Insertion = {
    name: 'insert',
    index: number,
    username: string
};

type Removal = {
    name: 'remove',
    index: number
};

type Substitution = {
    name: 'substitute',
    index: number,
    username: string
};

type Op = Insertion | Removal | Substitution;

function arbOpIn(maxLength: number): Arb<Op> {
    return fc.oneof(
        fc.record({
            'name': fc.constant('insert'),
            'index': fc.nat(maxLength),
            'username': fc.string()
        }),
        fc.record({
            'name': fc.constant('remove'),
            'index': fc.nat(maxLength)
        }),
        fc.record({
            'name': fc.constant('substitute'),
            'index': fc.nat(maxLength),
            'username': fc.string()
        })
    );
}

function arbArrayHistory<T>(vs: readonly T[]): Arb<{vs: T[], ops: Op[]}> {
    return fc.record({
        vs: fc.constant(vs),
        ops: fc.array(arbOpIn(vs.length))
    });
}

