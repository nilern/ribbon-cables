import * as vec from "../js/vecnal";
import {stable, source, lift, concat, imux} from "../js/vecnal";

import * as sig from "../js/signal";
import {eq, ImmArrayAdapter} from "../js/prelude";

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

describe('testing `slice`', () => {
    test('Sized & Indexed<T> & Reducible<T>', () => {
        const natS = vec.stable([0, 1, 2, 3, 4, 5, 6, 7]);
        const sliceS = natS.slice(2, 5);
        
        expect(sliceS.size()).toBe(3);
        
        expect(sliceS.at(0)).toBe(2);
        expect(sliceS.at(1)).toBe(3);
        expect(sliceS.at(2)).toBe(4);
        expect(sliceS.at(3)).toBe(undefined);
        
        expect(sliceS.reduce((acc, ans) => acc + ans, 0)).toBe(9);
    });
    
    test('setAt() dep', () => {
        const natS = vec.source(eq, [0, 1, 2, 3, 4, 5, 6, 7]);
        const sliceS = natS.slice(2, 5);
        const noChange = [-1, -1];
        let change = noChange;
        sliceS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (i, v) => change = [i, v]
        });
        
        natS.setAt(1, 42);
        
        expect(change).toBe(noChange);
        
        natS.setAt(3, 42);
        expect(change).toEqual([1, 42]);
        
        change = noChange;
        natS.setAt(6, 42);
        
        expect(change).toBe(noChange);
    });
    
    test('insert() dep', () => {
        const natS = vec.source(eq, [0, 1, 2, 3, 4, 5, 6, 7]);
        const sliceS = natS.slice(2, 5);
        let changes = [];
        sliceS.addISubscriber({
            onInsert: (i, v) => changes.push(['insert', i, v]),
            onRemove: (i) => changes.push(['remove', i, -1]),
            onSubstitute: (i, v) => changes.push(['substitute', i, v])
        });
        
        natS.insert(1, 0);
        
        expect(sliceS.at(0)).toBe(1);
        expect(changes).toEqual([
            ['insert', 0, 1],
            ['remove', 2, -1]
        ]);
        
        changes.length = 0;
        natS.insert(3, 1);
        
        expect(sliceS.at(1)).toBe(1);
        expect(changes).toEqual([
            ['insert', 1, 1],
            ['remove', 2, -1]
        ]);
        
        changes.length = 0;
        natS.insert(6, 2);
        
        expect(changes).toEqual([]);
    });
    
    test('remove() dep', () => {
        const natS = vec.source(eq, [0, 1, 2, 3, 4, 5, 6, 7]);
        const sliceS = natS.slice(2, 5);
        let changes = [];
        sliceS.addISubscriber({
            onInsert: (i, v) => changes.push(['insert', i, v]),
            onRemove: (i) => changes.push(['remove', i, -1]),
            onSubstitute: (i, v) => changes.push(['substitute', i, v])
        });
        
        natS.remove(1); // => [0, 2, 3, 4, 5, 6, 7]
        
        expect(sliceS.at(0)).toBe(3);
        expect(changes).toEqual([
            ['remove', 0, -1],
            ['insert', 2, 5]
        ]);
        
        changes.length = 0;
        natS.remove(3); // => [0, 2, 3, 5, 6, 7]
        
        expect(sliceS.at(1)).toBe(5);
        expect(changes).toEqual([
            ['remove', 1, -1],
            ['insert', 2, 6]
        ]);
        
        changes.length = 0;
        natS.remove(5); // => [0, 2, 3, 5, 6]
        
        expect(changes).toEqual([]);
    });
    
    test('first subscribe (re)init', () => {
        const natS = vec.source(eq, [0, 1, 2, 3, 4, 5, 6, 7]);
        const sliceS = natS.slice(2, 5);
        
        natS.setAt(3, 42);
        
        sliceS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        expect(sliceS.at(1)).toBe(42);
    });
});

describe('testing `empty`', () => {
    test('Sized & Indexed<T> & Reducible<T>', () => {
        const nopeS = vec.empty();
        
        expect(nopeS.size()).toBe(0);
        
        expect(nopeS.at(0)).toBe(undefined);
        
        expect(nopeS.reduce((acc, answer) => acc + answer, 5)).toBe(5);
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
    
    test('first subscribe (re)init', () => {
        const alphabetS = source(eq, ['a', 'b', 'c']);
        const capitalS = alphabetS.map<string>(eq, (c) => c.toUpperCase());
        
        alphabetS.setAt(0, 'b');
        
        capitalS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        expect(capitalS.at(0)).toBe('B');
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
    
    test('first subscribe (re)init', () => {
        const naturalS = source(eq, [0, 1, 2, 3, 4, 5, 6]);
        const oddS = naturalS.filter((n) => n % 2 === 1);
        
        naturalS.setAt(3, 23);
        
        oddS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        expect(oddS.at(1)).toBe(23);
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
    
    test('first subscribe (re)init', () => {
        const conS = source(eq, ['c', 'o', 'n']);
        const catS = source(eq, ['c', 'a', 't']);
        const eS = source(eq, ['e']);
        const nateS = source(eq, ['n', 'a', 't', 'e']);
        const catedS = concat(conS, catS, eS, nateS);
        
        conS.setAt(0, 'C');
        
        catedS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        expect(catedS.at(0)).toBe('C');
    });
});

describe('testing `reverse`', () => {
    test('Sized & Indexed<T> & Reducible<T>', () => {
        const vS = stable([0, 1, 2, 3]);
        const revS = vS.reverse();
        
        expect(revS.size()).toBe(4);
        
        expect(revS.at(0)).toBe(3);
        expect(revS.at(1)).toBe(2);
        expect(revS.at(2)).toBe(1);
        expect(revS.at(3)).toBe(0);
        
        expect(revS.reduce((acc, n) => acc + n, 0)).toBe(6);
    });
    
    test('setAt() dep', () => {
        const vS = source(eq, [0, 1, 2, 3]);
        const revS = vS.reverse();
        let change = [-1, -1];
        revS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (i, v) => change = [i, v]
        });
        
        vS.setAt(2, 5);
        
        expect(revS.size()).toBe(4);
        expect(revS.at(1)).toBe(5);
        
        expect(change[0]).toBe(1);
        expect(change[1]).toBe(5);
        expect(revS.reduce((acc, n) => acc + n, 0)).toBe(9);
    });
    
    test('insert() dep', () => {
        const vS = source(eq, [0, 1, 2, 3]);
        const revS = vS.reverse();
        let change = [-1, -1];
        revS.addISubscriber({
            onInsert: (i, v) => change = [i, v],
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        vS.insert(2, 5);
        
        expect(revS.size()).toBe(5);
        expect(revS.at(2)).toBe(5);
        
        expect(change[0]).toBe(2);
        expect(change[1]).toBe(5);
    });
    
    test('remove() dep', () => {
        const vS = source(eq, [0, 1, 2, 3]);
        const revS = vS.reverse();
        let changeIndex = -1;
        revS.addISubscriber({
            onInsert: (i, v) => {},
            onRemove: (i) => changeIndex = i,
            onSubstitute: (_, _1) => {}
        });
        
        vS.remove(2);
        
        expect(revS.size()).toBe(3);
        expect(revS.at(1)).toBe(1);
        
        expect(changeIndex).toBe(1);
    });
});

describe('testing `sort`', () => {
    test('Sized & Indexed<T> & Reducible<T>', () => {
        const vS = stable([7, 2, 9, 4, 1, 18, 14, 19, 12]);
        const sortedS = vS.sort((x, y) => x - y);
        
        expect(sortedS.size()).toBe(9);
        
        expect(sortedS.at(0)).toBe(1);
        expect(sortedS.at(1)).toBe(2);
        expect(sortedS.at(2)).toBe(4);
        expect(sortedS.at(3)).toBe(7);
        expect(sortedS.at(4)).toBe(9);
        expect(sortedS.at(9)).toBe(undefined);
        
        expect(sortedS.reduce((acc, n) => acc + n, 0)).toBe(86);
    });
    
    test('setAt() dep', () => {
        const vS = source(eq, [7, 2, 9, 4, 1, 18, 14, 19, 12]);
        const sortedS = vS.sort((x, y) => x - y);
        const changes = [];
        sortedS.addISubscriber({
            onInsert: (i, v) => changes.push(["insert", i, v]),
            onRemove: (i) => changes.push(["remove", i, -1]),
            onSubstitute: (i, v) => changes.push(["substitute", i, v])
        });
        
        vS.setAt(1, 5);
        
        expect(sortedS.size()).toBe(9);
        expect(sortedS.at(1)).toBe(4);
        expect(sortedS.at(2)).toBe(5);
        
        expect(changes.length).toBe(2);
        expect(changes[0][0]).toBe("remove");
        expect(changes[0][1]).toBe(1);
        expect(changes[1][0]).toBe("insert");
        expect(changes[1][1]).toBe(2);
        expect(changes[1][2]).toBe(5);
        
        changes.length = 0;
        vS.setAt(3, 3);
        
        expect(sortedS.size()).toBe(9);
        expect(sortedS.at(1)).toBe(3);
        
        expect(changes.length).toBe(1);
        expect(changes[0][0]).toBe("substitute");
        expect(changes[0][1]).toBe(1);
        expect(changes[0][2]).toBe(3);
    })
    
    test('insert() dep', () => {
        const vS = source(eq, [7, 2, 9, 4, 1, 18, 14, 19, 12]);
        const sortedS = vS.sort((x, y) => x - y);
        let change = [-1, -1];
        sortedS.addISubscriber({
            onInsert: (i, v) => change = [i, v],
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        vS.insert(3, 3);
        
        expect(sortedS.size()).toBe(10);
        expect(sortedS.at(2)).toBe(3);
        
        expect(change[0]).toBe(2);
        expect(change[1]).toBe(3);
    });
    
    test('remove() dep', () => {
        const vS = source(eq, [7, 2, 9, 4, 1, 18, 14, 19, 12]);
        const sortedS = vS.sort((x, y) => x - y);
        let changeIndex = -1;
        sortedS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (i) => changeIndex = i,
            onSubstitute: (_, _1) => {}
        });
        
        vS.remove(3);
        
        expect(sortedS.size()).toBe(8);
        expect(sortedS.at(2)).toBe(7);
        
        expect(changeIndex).toBe(2);
    });
    
    test('stable sorting', () => {
        class User {
            static private currentId = 0;
            
            public readonly id: number;
        
            constructor(
                public username: string
            ) {
                this.id = User.currentId++;
            }
            
            eq(that: User): Boolean { return this.id === that.id; }
        }
        
        const userS = source((user1, user2) => user1.eq(user2), [
            new User("John Doe"),
            new User("Jane Doe"),
            new User("Bambi Doe"),
            new User("John Doe")
        ]);
        const sortedUserS = userS.sort((user1, user2) =>
            user1.username.localeCompare(user2.username)
        );
        sortedUserS.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        expect(sortedUserS.size()).toBe(4);
        expect(sortedUserS.at(0).username).toBe("Bambi Doe");
        expect(sortedUserS.at(1).username).toBe("Jane Doe");
        expect(sortedUserS.at(2).username).toBe("John Doe");
        expect(sortedUserS.at(2).id).toBe(0);
        expect(sortedUserS.at(3).username).toBe("John Doe");
        expect(sortedUserS.at(3).id).toBe(3);
        
        userS.insert(4, new User("Jane Doe"));
        
        expect(sortedUserS.size()).toBe(5);
        expect(sortedUserS.at(0).username).toBe("Bambi Doe");
        expect(sortedUserS.at(1).username).toBe("Jane Doe");
        expect(sortedUserS.at(1).id).toBe(1);
        expect(sortedUserS.at(2).username).toBe("Jane Doe");
        expect(sortedUserS.at(2).id).toBe(4);
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
    
    test('remove() dep', () => {
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
    
    test('first subscribe (re)init', () => {
        const kS = sig.source(eq, 1);
        const natS = stable([1, 2, 3, 4, 5]);
        const factS =
            natS.reduceS<number>(eq, (acc, n) => Math.abs(acc) * Math.abs(n), kS);
        
        kS.reset(3);
        
        factS.addSubscriber({onChange: (_) => {}});
        
        expect(factS.ref()).toBe(360);
    });
});

describe('testing `imux`', () => {
    test('Sized & Indexed<T> & Reducible<T>', () => {
        const naturalS = sig.source(eq, new ImmArrayAdapter([1, 2, 3]));
        const naturalZ = imux(eq, naturalS);
        
        expect(naturalZ.size()).toBe(3);
        
        expect(naturalZ.at(0)).toBe(1);
        expect(naturalZ.at(1)).toBe(2);
        expect(naturalZ.at(2)).toBe(3);
        expect(naturalZ.at(3)).toBe(undefined);
        
        expect(naturalZ.reduce((acc, c) => acc + c, 0)).toBe(6);
    });
    
    test('setAt() dep', () => {
        const naturalS = sig.source(eq, new ImmArrayAdapter([1, 2, 3]));
        const naturalZ = imux(eq, naturalS);
        const noChange = [-1, NaN];
        let change = noChange;
        naturalZ.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (_) => {},
            onSubstitute: (i, v) => change = [i, v]
        });
        
        naturalS.reset(new ImmArrayAdapter([1, 4, 3]));
        
        expect(naturalZ.size()).toBe(3);
        
        expect(naturalZ.at(0)).toBe(1);
        expect(naturalZ.at(1)).toBe(4);
        expect(naturalZ.at(2)).toBe(3);
        expect(naturalZ.at(3)).toBe(undefined);
        
        expect(naturalZ.reduce((acc, c) => acc + c, 0)).toBe(8);
        
        expect(change[0]).toBe(1);
        expect(change[1]).toBe(4);
        
        change = noChange;
        naturalS.reset(new ImmArrayAdapter([1, 4, 3]));
        
        expect(naturalZ.size()).toBe(3);
        
        expect(naturalZ.at(0)).toBe(1);
        expect(naturalZ.at(1)).toBe(4);
        expect(naturalZ.at(2)).toBe(3);
        expect(naturalZ.at(3)).toBe(undefined);
        
        expect(naturalZ.reduce((acc, c) => acc + c, 0)).toBe(8);
        
        expect(change).toBe(noChange);
    });
    
    test('insert() dep', () => {
        const naturalS = sig.source(eq, new ImmArrayAdapter([1, 2, 3]));
        const naturalZ = imux(eq, naturalS);
        let change = [-1, NaN];
        naturalZ.addISubscriber({
            onInsert: (i, v) => change = [i, v],
            onRemove: (_) => {},
            onSubstitute: (_, _1) => {}
        });
        
        naturalS.reset(new ImmArrayAdapter([1, 2, 4, 3]));
        
        expect(naturalZ.size()).toBe(4);
        
        expect(naturalZ.at(0)).toBe(1);
        expect(naturalZ.at(1)).toBe(2);
        expect(naturalZ.at(2)).toBe(4);
        expect(naturalZ.at(3)).toBe(3);
        expect(naturalZ.at(4)).toBe(undefined);
        
        expect(naturalZ.reduce((acc, c) => acc + c, 0)).toBe(10);
        
        expect(change[0]).toBe(2);
        expect(change[1]).toBe(4);
    });
    
    test('remove() dep', () => {
        const naturalS = sig.source(eq, new ImmArrayAdapter([1, 2, 3]));
        const naturalZ = imux(eq, naturalS);
        let changeIndex = -1;
        naturalZ.addISubscriber({
            onInsert: (_, _1) => {},
            onRemove: (i) => changeIndex = i,
            onSubstitute: (_, _1) => {}
        });
        
        naturalS.reset(new ImmArrayAdapter([1, 3]));
        
        expect(naturalZ.size()).toBe(2);
        
        expect(naturalZ.at(0)).toBe(1);
        expect(naturalZ.at(1)).toBe(3);
        expect(naturalZ.at(4)).toBe(undefined);
        
        expect(naturalZ.reduce((acc, c) => acc + c, 0)).toBe(4);
        
        expect(changeIndex).toBe(1);
    });
});

