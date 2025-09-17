import {stable, source} from "../js/signal";

import {eq} from "../js/prelude";

describe('testing `stable`', () => {
    test('ref()', () => {
        const answerS = stable(42);
        
        expect(answerS.ref()).toBe(42);
    });
});

describe('testing `source`', () => {
    test('ref()', () => {
        const answerS = source(eq, 42);
        
        expect(answerS.ref()).toBe(42);
    });
    
    test('reset()', () => {
        const answerS = source(eq, 42);
        let changedV = undefined;
        answerS.addSubscriber({onChange: (v) => changedV = v});
        
        answerS.reset(5);
        
        expect(answerS.ref()).toBe(5);
        expect(changedV).toBe(5);
        
        let notified = false;
        answerS.addSubscriber({onChange: (_) => notified = true});
        
        answerS.reset(5);
        
        expect(answerS.ref()).toBe(5);
        expect(notified).toBeFalsy();
    });
});

