/**
 * @jest-environment jsdom
 */ 

import * as dom from "../js/dom";

import * as vec from "../js/vecnal";
import {eq} from "../js/prelude";

describe('testing `forVecnal`', () => {
    test('hatchChildren()', () => {
        const alphabetS = vec.source(eq, ['a', 'b', 'c']);
        const alphaNest = dom.forVecnal(alphabetS, dom.text);
        
        const alphaTexts = alphaNest.hatchChildren();
        
        {
            let i = 0;
            
            for (const node of alphaTexts) {
                const str = alphabetS.at(i)!;
                
                expect(node instanceof Text).toBeTruthy();
                const textNode = node as Text;
                expect(textNode.data).toBe(str);
            
                ++i;
            }
            
            expect(i).toBe(alphabetS.size());
        }
    });
    
    test('setAt() dep', () => {
        const alphabetS = vec.source(eq, ['a', 'b', 'c']);
        const noChange = '';
        let change = noChange;
        const alphaNest = dom.forVecnal(alphabetS, (strS) => {
            if (strS.ref() === 'b') {
                strS.addSubscriber({onChange: (v) => change = v});
            }
            
            return dom.text(strS);
        });
        const alphaTexts = alphaNest.hatchChildren();
        alphaNest.addISubscriber({
            onSubstitute: (_, _1) => {},
            onInsert: (_, _1) => {},
            onRemove: (_) => {}
        });
        
        alphabetS.setAt(1, 'B');
        
        expect(change).toBe('B');
        
        change = noChange;
        alphabetS.setAt(1, 'B');
        
        expect(change).toBe(noChange);
    });
    
    test('insert() dep', () => {
        const alphabetS = vec.source(eq, ['a', 'b', 'c']);
        const alphaNest = dom.forVecnal(alphabetS, dom.text);
        const alphaTexts = alphaNest.hatchChildren();
        let change = [-1, document.createTextNode('') as Node];
        alphaNest.addISubscriber({
            onSubstitute: (_, _1) => {},
            onInsert: (i, v) => change = [i, v],
            onRemove: (_) => {}
        });
        
        alphabetS.insert(0, 'Z');
        
        expect(change[0]).toBe(0);
        expect(change[1] instanceof Text).toBeTruthy();
        expect((change[1] as Text).data).toBe('Z');
    });
    
    test('remove() dep', () => {
        const alphabetS = vec.source(eq, ['a', 'b', 'c']);
        const alphaNest = dom.forVecnal(alphabetS, dom.text);
        const alphaTexts = alphaNest.hatchChildren();
        let changeIndex = -1;
        alphaNest.addISubscriber({
            onSubstitute: (_, _1) => {},
            onInsert: (_, _1) => {},
            onRemove: (i) => changeIndex = i
        });
        
        alphabetS.remove(1);
        
        expect(changeIndex).toBe(1);
    });
});

