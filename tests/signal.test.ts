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

describe('testing `map`', () => {
    test('ref()', () => {
        const nameS = source(eq, 'Sigurd');
        const lengthS = nameS.map<number>(eq, (str) => str.length);
        
        expect(lengthS.ref()).toBe(6);
    });
    
    test('reset() dep', () => {
        const nameS = source(eq, 'Sigurd');
        const lengthS = nameS.map<number>(eq, (str) => str.length);
        
        let notifiedLength = 0;
        lengthS.addSubscriber({onChange: (length) => notifiedLength = length});
        
        nameS.reset('Siegfried');
        
        expect(lengthS.ref()).toBe(9);
        expect(notifiedLength).toBe(9);
        
        let notified = false;
        lengthS.addSubscriber({onChange: (_) => notified = true});
        
        nameS.reset('Abendlied');
        
        expect(lengthS.ref()).toBe(9);
        expect(notified).toBeFalsy();
    });
});

