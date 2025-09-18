import {stable, source} from "../js/vecnal";

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

