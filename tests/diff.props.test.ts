import {test as tst, fc} from '@fast-check/jest';

import * as diff from '../js/diff.js';

import {eq} from '../js/prelude.js';

// HACK:
class StringAdapter {
    constructor(
        private readonly str: string
    ) {}
    
    size(): number { return this.str.length; }
    
    at(i: number): string { return this.str[i]; }
}

function patch(current: string, goal: string, edits: diff.EditScript): string {
    const result = [...current];
    
    for (const edit of edits) {
        const i = edit.index;
                
        if (edit instanceof diff.Insert) {
            result.splice(i, 0, goal[i]);
        } else if (edit instanceof diff.Delete) {
            result.splice(i, 1);
        } else if (edit instanceof diff.Substitute) {
            result[i] = goal[i];
        } else {
            const _exhaust: never = edit;
        }
    }
    
    return result.join("");
}

tst.prop({current: fc.string(), goal: fc.string()})(
    'patching `current` with edit script produces `goal`',
    ({current, goal}) => {
        const edits = diff.diff(
            new StringAdapter(current),
            new StringAdapter(goal),
            eq
        );
        const patched = patch(current, goal, edits);
        
        expect(patched).toBe(goal);
    }
);

