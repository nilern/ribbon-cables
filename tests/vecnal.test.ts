import {stable, source} from "../js/vecnal";

import {eq} from "../js/prelude";

describe('testing `stable`', () => {
    test('Sized & Indexed<T> & Reducible<T>', () => {
        const alphabetS = stable(['a', 'b', 'c']);
        
        expect(alphabetS.size()).toBe(3);
        
        expect(alphabetS.at(0)).toBe('a');
        expect(alphabetS.at(1)).toBe('b');
        expect(alphabetS.at(2)).toBe('c');
        expect(alphabetS.at(3)).toBe(undefined);
        
        expect(alphabetS.reduce((acc, c) => acc + c, '')).toBe('abc');
    });
});

describe('testing `source`', () => {
    test('Sized & Indexed<T> & Reducible<T>', () => {
        const alphabetS = source(eq, ['a', 'b', 'c']);
        
        expect(alphabetS.size()).toBe(3);
        
        expect(alphabetS.at(0)).toBe('a');
        expect(alphabetS.at(1)).toBe('b');
        expect(alphabetS.at(2)).toBe('c');
        expect(alphabetS.at(3)).toBe(undefined);
        
        expect(alphabetS.reduce((acc, c) => acc + c, '')).toBe('abc');
    });
    
    test('setAt()', () => {
        const alphabetS = source(eq, ['a', 'b', 'c']);
        let change = [-1, ''];
        alphabetS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (i, v) => change = [i, v]
        });
        
        alphabetS.setAt(1, 'B');
        
        expect(alphabetS.at(1)).toBe('B');
        expect(change[0]).toBe(1);
        expect(change[1]).toBe('B');
        
        let notified = false;
        alphabetS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (i, v) => notified = true
        });
        
        alphabetS.setAt(1, 'B');
        
        expect(alphabetS.at(1)).toBe('B');
        expect(notified).toBeFalsy();
    });
    
    test('insert()', () => {
        const alphabetS = source(eq, ['a', 'b', 'c']);
        let change = [-1, ''];
        alphabetS.addISubscriber({
            onInsert: (i, v) => change = [i, v],
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        alphabetS.insert(0, 'Z');
        
        expect(alphabetS.at(0)).toBe('Z');
        expect(change[0]).toBe(0);
        expect(change[1]).toBe('Z');
    });
    
    test('remove()', () => {
        const alphabetS = source(eq, ['a', 'b', 'c']);
        let changeIndex = -1;
        alphabetS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (i) => changeIndex = i,
            onSubstitute: (_, _1) => {}
        });
        
        alphabetS.remove(1);
        
        expect(alphabetS.at(1)).toBe('c');
        expect(changeIndex).toBe(1);
    });
});

