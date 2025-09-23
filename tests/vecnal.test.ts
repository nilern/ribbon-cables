import {stable, source, lift, concat} from "../js/vecnal";

import * as sig from "../js/signal";
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
        
        const newItem = alphabetS.setAt(1, 'B');
        
        expect(newItem).toBe('B');
        expect(alphabetS.at(1)).toBe('B');
        expect(change[0]).toBe(1);
        expect(change[1]).toBe('B');
        
        let notified = false;
        alphabetS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (_, _1) => notified = true
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
        
        const newItem = alphabetS.insert(0, 'Z');
        
        expect(newItem).toBe('Z');
        expect(alphabetS.size()).toBe(4);
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
        
        const removedItem = alphabetS.remove(1);
        
        expect(removedItem).toBe('b');
        expect(alphabetS.size()).toBe(2);
        expect(alphabetS.at(1)).toBe('c');
        expect(changeIndex).toBe(1);
    });
});

describe('testing `lift`', () => {
    test('Sized & Indexed<T> & Reducible<T>', () => {
        const answerS = sig.stable(42);
        const answerZ = lift(answerS);
        
        expect(answerZ.size()).toBe(1);
        
        expect(answerZ.at(0)).toBe(42);
        expect(answerZ.at(1)).toBe(undefined);
        
        expect(answerZ.reduce((acc, answer) => acc + answer, 5)).toBe(47);
    });
    
    test('reset() dep', () => {
        const mealS = sig.source(eq, 'raw');
        const mealZ = lift(mealS);
        let change = [-1, ''];
        mealZ.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (i, v) => change = [i, v]
        });
        
        mealS.reset('cooked');
        
        expect(mealZ.at(0)).toBe('cooked');
        expect(change[0]).toBe(0);
        expect(change[1]).toBe('cooked');
    });
});

describe('testing `map`', () => {
    test('Sized & Indexed<T> & Reducible<T>', () => {
        const alphabetS = source(eq, ['a', 'b', 'c']);
        const capitalS = alphabetS.map<string>(eq, (c) => c.toUpperCase());
        
        expect(capitalS.size()).toBe(3);
        expect(capitalS.at(0)).toBe('A');
        expect(capitalS.at(1)).toBe('B');
        expect(capitalS.at(2)).toBe('C');
        expect(capitalS.at(3)).toBe(undefined);
        expect(capitalS.reduce((acc, c) => acc + c, '')).toBe('ABC');
    });
    
    test('setAt() dep', () => {
        const alphabetS = source(eq, ['a', 'b', 'c']);
        const capitalS = alphabetS.map<string>(eq, (c) => c.toUpperCase());
        let change = [-1, ''];
        capitalS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (i, v) => change = [i, v]
        });
        
        alphabetS.setAt(0, 'b');
        
        expect(capitalS.at(0)).toBe('B');
        expect(change[0]).toBe(0);
        expect(change[1]).toBe('B');
        
        let notified = false;
        capitalS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (_, _1) => notified = true
        });
        
        alphabetS.setAt(0, 'B');
        
        expect(capitalS.at(0)).toBe('B');
        expect(notified).toBeFalsy();
    });
    
    test('insert() dep', () => {
        const alphabetS = source(eq, ['a', 'b', 'c']);
        const capitalS = alphabetS.map<string>(eq, (c) => c.toUpperCase());
        let change = [-1, ''];
        capitalS.addISubscriber({
            onInsert: (i, v) => change = [i, v],
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        alphabetS.insert(0, 'z');
        
        expect(capitalS.size()).toBe(4);
        expect(capitalS.at(0)).toBe('Z');
        expect(change[0]).toBe(0);
        expect(change[1]).toBe('Z');
    });
    
    test('remove() dep', () => {
        const alphabetS = source(eq, ['a', 'b', 'c']);
        const capitalS = alphabetS.map<string>(eq, (c) => c.toUpperCase());
        let changeIndex = -1;
        capitalS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (i) => changeIndex = i,
            onSubstitute: (_, _1) => {}
        });
        
        alphabetS.remove(1);
        
        expect(capitalS.size()).toBe(2);
        expect(alphabetS.at(1)).toBe('c');
        expect(changeIndex).toBe(1);
    });
});

describe('testing `filter`', () => {
    test('Sized & Indexed<T> & Reducible<T>', () => {
        const naturalS = stable([0, 1, 2, 3, 4, 5, 6]);
        const oddS = naturalS.filter((n) => n % 2 === 1);
        
        expect(oddS.size()).toBe(3);
        expect(oddS.at(0)).toBe(1);
        expect(oddS.at(1)).toBe(3);
        expect(oddS.at(2)).toBe(5);
        expect(oddS.at(3)).toBe(undefined);
        expect(oddS.reduce((acc, n) => acc + n, 0)).toBe(9);
    });
    
    test('setAt() dep', () => {
        const naturalS = source(eq, [0, 1, 2, 3, 4, 5, 6]);
        const oddS = naturalS.filter((n) => n % 2 === 1);
        const noChange = ['', -1, -1];
        let change = noChange;
        oddS.addISubscriber({
            onInsert: (i, v) => change = ['insert', i, v],
            onRemove: (i) => change = ['remove', i, -1],
            onSubstitute: (i, v) => change = ['substitute', i, v]
        });
        
        naturalS.setAt(3, 23);
        
        expect(oddS.at(1)).toBe(23);
        expect(change[0]).toBe('substitute');
        expect(change[1]).toBe(1);
        expect(change[2]).toBe(23);
        
        naturalS.setAt(3, 42);
        
        expect(oddS.size()).toBe(2);
        expect(oddS.at(1)).toBe(5);
        expect(change[0]).toBe('remove');
        expect(change[1]).toBe(1);
        
        naturalS.setAt(0, 5);
        
        expect(oddS.size()).toBe(3);
        expect(oddS.at(0)).toBe(5);
        expect(change[0]).toBe('insert');
        expect(change[1]).toBe(0);
        expect(change[2]).toBe(5);
        
        change = noChange;
        naturalS.setAt(2, 42);
        
        expect(oddS.size()).toBe(3);
        expect(change).toBe(noChange);
    });
    
    test('insert() dep', () => {
        const naturalS = source(eq, [0, 1, 2, 3, 4, 5, 6]);
        const oddS = naturalS.filter((n) => n % 2 === 1);
        const noChange = [-1, -1];
        let change = noChange;
        oddS.addISubscriber({
            onInsert: (i, v) => change = [i, v],
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        naturalS.insert(2, 23);
        
        expect(oddS.size()).toBe(4);
        expect(oddS.at(1)).toBe(23);
        expect(change[0]).toBe(1);
        expect(change[1]).toBe(23);
        
        change = noChange;
        naturalS.insert(3, 42);
        
        expect(oddS.size()).toBe(4);
        expect(change).toBe(noChange);
    });
    
    test('remove() dep', () => {
        const naturalS = source(eq, [0, 1, 2, 3, 4, 5, 6]);
        const oddS = naturalS.filter((n) => n % 2 === 1);
        const noChange = -1;
        let change = noChange;
        oddS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (i) => change = 1,
            onSubstitute: (_, _1) => {}
        });
        
        naturalS.remove(3);
        
        expect(oddS.size()).toBe(2);
        expect(oddS.at(1)).toBe(5);
        expect(change).toBe(1);
        
        change = noChange;
        naturalS.remove(2);
        
        expect(oddS.size()).toBe(2);
        expect(change).toBe(noChange);
    });
});

describe('testing `concat`', () => {
    test('Sized & Indexed<T> & Reducible<T>', () => {
        const conS = stable(['c', 'o', 'n']);
        const catS = stable(['c', 'a', 't']);
        const eS = stable(['e']);
        const nateS = stable(['n', 'a', 't', 'e']);
        const catedS = concat(conS, catS, eS, nateS);
        
        expect(catedS.size()).toBe(11);
        
        expect(catedS.at(0)).toBe('c');
        expect(catedS.at(2)).toBe('n');
        expect(catedS.at(4)).toBe('a');
        expect(catedS.at(6)).toBe('e');
        expect(catedS.at(8)).toBe('a');
        expect(catedS.at(10)).toBe('e');
        expect(catedS.at(11)).toBe(undefined);
        
        expect(catedS.reduce((acc, c) => acc + c, '')).toBe('concatenate');
    });
    
    test('setAt() dep', () => {
        const conS = source(eq, ['c', 'o', 'n']);
        const catS = source(eq, ['c', 'a', 't']);
        const eS = source(eq, ['e']);
        const nateS = source(eq, ['n', 'a', 't', 'e']);
        const catedS = concat(conS, catS, eS, nateS);
        let change = [-1, ''];
        catedS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (i, v) => change = [i, v]
        });
        
        conS.setAt(0, 'C');
        
        expect(catedS.at(0)).toBe('C');
        expect(change[0]).toBe(0);
        expect(change[1]).toBe('C');
        
        catS.setAt(2, 'T');
        
        expect(catedS.at(5)).toBe('T');
        expect(change[0]).toBe(5);
        expect(change[1]).toBe('T');
        
        expect(catedS.size()).toBe(11);
        expect(catedS.at(11)).toBe(undefined);
        expect(catedS.reduce((acc, c) => acc + c, '')).toBe('ConcaTenate');
    });
    
    test('insert() dep', () => {
        const conS = source(eq, ['c', 'o', 'n']);
        const catS = source(eq, ['c', 'a', 't']);
        const eS = source(eq, ['e']);
        const nateS = source(eq, ['n', 'a', 't', 'e']);
        const catedS = concat(conS, catS, eS, nateS);
        let change = [-1, ''];
        catedS.addISubscriber({
            onInsert: (i, v) => change = [i, v],
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        conS.insert(0, 'i');
        
        expect(catedS.at(0)).toBe('i');
        expect(change[0]).toBe(0);
        expect(change[1]).toBe('i');
        
        eS.insert(1, 't');
        
        expect(catedS.at(8)).toBe('t');
        expect(change[0]).toBe(8);
        expect(change[1]).toBe('t');
        
        expect(catedS.size()).toBe(13);
        expect(catedS.at(13)).toBe(undefined);
        expect(catedS.reduce((acc, c) => acc + c, '')).toBe('iconcatetnate');
    });
    
    test('remove() dep', () => {
        const conS = source(eq, ['c', 'o', 'n']);
        const catS = source(eq, ['c', 'a', 't']);
        const eS = source(eq, ['e']);
        const nateS = source(eq, ['n', 'a', 't', 'e']);
        const catedS = concat(conS, catS, eS, nateS);
        let change = -1;
        catedS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (i) => change = i,
            onSubstitute: (_, _1) => {}
        });
        
        conS.remove(0);
        
        expect(catedS.at(0)).toBe('o');
        expect(change).toBe(0);
        
        catS.remove(2);
        
        expect(catedS.at(4)).toBe('e');
        expect(change).toBe(4);
        
        expect(catedS.size()).toBe(9);
        expect(catedS.at(9)).toBe(undefined);
        expect(catedS.reduce((acc, c) => acc + c, '')).toBe('oncaenate');
    });
});

describe('testing `reduceS`', () => {
    test('ref()', () => {
        const kS = sig.stable(1);
        const natS = stable([1, 2, 3, 4, 5]);
        const factS =
            natS.reduceS<number>(eq, (acc, n) => Math.abs(acc) * Math.abs(n), kS);
        
        expect(factS.ref()).toBe(120);
    });
    
    test('reset() dep', () => {
        const kS = sig.source(eq, 1);
        const natS = stable([1, 2, 3, 4, 5]);
        const factS =
            natS.reduceS<number>(eq, (acc, n) => Math.abs(acc) * Math.abs(n), kS);
        const noChange = 0;
        let change = noChange;
        factS.addSubscriber({
            onChange: (v) => change = v
        });
        
        kS.reset(3);
        
        expect(factS.ref()).toBe(360);
        expect(change).toBe(360);
        
        change = noChange;
        kS.reset(-3);
        
        expect(factS.ref()).toBe(360);
        expect(change).toBe(noChange);
    });
    
    test('setAt() dep', () => {
        const kS = sig.stable(1);
        const natS = source(eq, [1, 2, 3, 4, 5]);
        const factS =
            natS.reduceS<number>(eq, (acc, n) => Math.abs(acc) * Math.abs(n), kS);
        const noChange = 0;
        let change = noChange;
        factS.addSubscriber({
            onChange: (v) => change = v
        });
        
        natS.setAt(2, 9);
        
        expect(factS.ref()).toBe(360);
        expect(change).toBe(360);
        
        change = noChange;
        natS.setAt(2, -9);
        
        expect(factS.ref()).toBe(360);
        expect(change).toBe(noChange);
    });
    
    test('insert() dep', () => {
        const kS = sig.stable(1);
        const natS = source(eq, [1, 2, 3, 4, 5]);
        const factS =
            natS.reduceS<number>(eq, (acc, n) => Math.abs(acc) * Math.abs(n), kS);
        const noChange = 0;
        let change = noChange;
        factS.addSubscriber({
            onChange: (v) => change = v
        });
        
        natS.insert(0, 0);
        
        expect(factS.ref()).toBe(0);
        expect(change).toBe(0);
        
        change = noChange;
        natS.insert(6, 6);
        
        expect(factS.ref()).toBe(0);
        expect(change).toBe(noChange);
    });
    
    test('insert() dep', () => {
        const kS = sig.stable(1);
        const natS = source(eq, [1, 2, 3, 4, 5]);
        const factS =
            natS.reduceS<number>(eq, (acc, n) => Math.abs(acc) * Math.abs(n), kS);
        const noChange = 0;
        let change = noChange;
        factS.addSubscriber({
            onChange: (v) => change = v
        });
        
        natS.remove(4);
        
        expect(factS.ref()).toBe(24);
        expect(change).toBe(24);
        
        change = noChange;
        natS.remove(0);
        
        expect(factS.ref()).toBe(24);
        expect(change).toBe(noChange);
    });
});

