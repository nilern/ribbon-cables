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
        
        let answer = answerS.reset(5);
        
        expect(answer).toBe(5);
        expect(answerS.ref()).toBe(5);
        expect(changedV).toBe(5);
        
        let notified = false;
        answerS.addSubscriber({onChange: (_) => notified = true});
        
        answer = answerS.reset(5);
        
        expect(answer).toBe(5);
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
        
        let name = nameS.reset('Siegfried');
        
        expect(name).toBe('Siegfried');
        expect(lengthS.ref()).toBe(9);
        expect(notifiedLength).toBe(9);
        
        let notified = false;
        lengthS.addSubscriber({onChange: (_) => notified = true});
        
        name = nameS.reset('Abendlied');
        
        expect(name).toBe('Abendlied');
        expect(lengthS.ref()).toBe(9);
        expect(notified).toBeFalsy();
    });
    
    test('first subscribe (re)init', () => {
        const nameS = source(eq, 'Sigurd');
        const lengthS = nameS.map<number>(eq, (str) => str.length);
        
        nameS.reset('Siegfried');
        
        lengthS.addSubscriber({onChange: (_) => {}});
        
        expect(lengthS.ref()).toBe(9);
    });
});

describe('testing `map2`', () => {
    test('ref()', () => {
        const aS = source(eq, 1);
        const bS = source(eq, 2);
        const sumS = aS.map2<number, number>(eq, (a, b) => a + b, bS);
        
        expect(sumS.ref()).toBe(3);
    });
    
    test('reset() dep', () => {
        const aS = source(eq, 1);
        const bS = source(eq, 2);
        const sumS = aS.map2<number, number>(eq, (a, b) => a + b, bS);
        
        let notifiedSum = 0;
        sumS.addSubscriber({onChange: (sum) => notifiedSum = sum});
        
        let b = bS.reset(5);
        
        expect(b).toBe(5);
        expect(sumS.ref()).toBe(6);
        expect(notifiedSum).toBe(6);
        
        let notified = false;
        sumS.addSubscriber({onChange: (_) => notified = true});
        
        b = bS.reset(5);
        
        expect(b).toBe(5);
        expect(sumS.ref()).toBe(6);
        expect(notified).toBeFalsy();
    });
});

