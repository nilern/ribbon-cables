/**
 * @jest-environment jsdom
 */ 

import * as dom from '../js/dom';

import * as sig from '../js/signal';
import * as vec from '../js/vecnal';
import {id, eq} from '../js/prelude';

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

describe('testing `el', () => {
    test('creates `__vcnDetached` `Element`', () => {
        const node = dom.el('div', {});
        
        expect(node instanceof Element).toBeTruthy();
        expect(node.__vcnDetached).toBe(true);
        expect(node.tagName).toBe('DIV');
    });
    
    test('initializes `AttributeString`', () => {
        const node = dom.el('link', {
            'rel': 'stylesheet',
            'href': undefined
        });
        
        expect(node.getAttribute('rel')).toBe('stylesheet');
        expect(node.getAttribute('href')).toBe(null);
        
        const valueS = sig.stable('foo');
        const input = dom.el('input', {'value': valueS});
        
        expect(input.getAttribute('value')).toBe('foo');
    });
    
    test('initializes style attribute', () => {
        const colorS = sig.stable('black');
        const node = dom.el('span', {
            'style': {
                'backgroundColor': 'white',
                'color': colorS
            }
        }) as unknown as HTMLElement; // HACK
        
        const style = node.style as
            unknown as {[key: string]: dom.BaseAttributeValue}; // HACK
        expect(style['background-color']).toBe('white');
        expect(style['color']).toBe('black');
    });
    
    test('initializes event listener', () => {
        // This is complicated by the nonexistence of `getEventListener(s)`.
    
        let event = undefined as Event | undefined;
        const lick = (ev: Event) => event = ev;
        const node = dom.el('button', {'onclick': lick})
        
        const clickEvent = new Event('click');
        node.dispatchEvent(clickEvent);
        
        expect(event).toBe(clickEvent);
    });
    
    test('reactive attribute', () => {
        const valueS = sig.source(eq, 'foo');
        const node = dom.el('input', {'value': valueS});
        dom.appendChild(document.body, node);
    
        valueS.reset('bar');
        
        expect(node.getAttribute('value')).toBe('bar');
    });
    
    test('reactive style attribute', () => {
        const colorS = sig.source(eq, 'black');
        const node = dom.el('span', {'style': {'color': colorS}}) as
            unknown as HTMLElement; // HACK
        dom.appendChild(document.body, node);
        
        colorS.reset('red');
        
        const style = node.style as
            unknown as {[key: string]: dom.BaseAttributeValue}; // HACK
        expect(style['color']).toBe('red');
        
        dom.removeChild(document.body, node);
    });
    
    test('child element', () => {
        const span = dom.el('span', {});
        const node = dom.el('div', {}, span);
        dom.appendChild(document.body, node);
        
        expect(node.childNodes.length).toBe(1);
        expect(node.childNodes[0]).toBe(span);
        
        dom.removeChild(document.body, node);
    });
    
    test('child text', () => {
        const text = 'foo';
        const node = dom.el('span', {}, text);
        dom.appendChild(document.body, node);
        
        expect(node.childNodes.length).toBe(1);
        const child = node.childNodes[0];
        expect(child instanceof Text).toBeTruthy();
        expect((child as unknown as Text).data).toBe('foo');
        
        dom.removeChild(document.body, node);
    });
    
    test('child text from signal', () => {
        const text = sig.stable('foo');
        const node = dom.el('span', {}, text);
        dom.appendChild(document.body, node);
        
        expect(node.childNodes.length).toBe(1);
        const child = node.childNodes[0];
        expect(child instanceof Text).toBeTruthy();
        expect((child as unknown as Text).data).toBe('foo');
        
        dom.removeChild(document.body, node);
    });
    
    test('children from iterable', () => {
        const children = [
            dom.text('foo'),
            dom.text('bar'),
            dom.text('baz'),
        ];
        const node = dom.el('div', {}, children as Iterable<dom.MountableNode>);
        dom.appendChild(document.body, node);
        
        expect(node.childNodes.length).toBe(3);
        for (let i = 0; i < node.childNodes.length; ++i) {
            expect(node.childNodes[i]).toBe(children[i]);
        }
        
        dom.removeChild(document.body, node);
    });
    
    test('children from `Vecnal`', () => {
        const strS = vec.stable(['foo', 'bar', 'baz']);
        const node = dom.el('div', {}, dom.forVecnal(strS, dom.text));
        dom.appendChild(document.body, node);
        
        expect(node.childNodes.length).toBe(3);
        for (let i = 0; i < node.childNodes.length; ++i) {
            const child = node.childNodes[i];
            expect(child instanceof Text).toBeTruthy();
            expect((child as Text).data).toBe(strS.at(i)!);
        }
        
        dom.removeChild(document.body, node);
    });
    
    test('reactive children from `Vecnal`', () => {
        const strS = vec.source(eq, ['foo', 'bar', 'baz']);
        const node = dom.el('div', {}, dom.forVecnal(strS, dom.text));
        dom.appendChild(document.body, node);
        
        strS.setAt(1, 'Bar');
        
        expect(node.childNodes.length).toBe(3);
        expect((node.childNodes[1] as Text).data).toBe('Bar');
        
        strS.insert(3, 'quux');
        
        expect(node.childNodes.length).toBe(4);
        expect((node.childNodes[3] as Text).data).toBe('quux');
        
        strS.remove(1);
        
        expect(node.childNodes.length).toBe(3);
        expect((node.childNodes[1] as Text).data).toBe('baz');
        
        dom.removeChild(document.body, node);
    });
    
    test('reactive inner children from `Vecnal`', () => {
        const abS = ['a', 'b', 'c'];
        const efS = vec.source(eq, ['e', 'f']);
        const ghS = ['g', 'h'];
        const node = dom.el('div', {},
            abS,
            dom.forVecnal(efS, id),
            ghS
        );
        dom.appendChild(document.body, node);
        
        efS.insert(0, 'D');
        
        expect(node.childNodes.length).toBe(8);
        expect((node.childNodes[3] as Text).data).toBe('D');
        expect((node.childNodes[6] as Text).data).toBe('g');
        
        efS.setAt(0, 'd');
        
        expect(node.childNodes.length).toBe(8);
        expect((node.childNodes[3] as Text).data).toBe('d');
        expect((node.childNodes[6] as Text).data).toBe('g');
        
        efS.remove(0);
        
        expect(node.childNodes.length).toBe(7);
        expect((node.childNodes[3] as Text).data).toBe('e');
        expect((node.childNodes[5] as Text).data).toBe('g');
        
        dom.removeChild(document.body, node);
    });
});

describe('testing `text', () => {
    test('from string', () => {
        const text = dom.text('foo');
        
        expect(text instanceof Text).toBeTruthy();
        expect(text.__vcnDetached).toBe(true);
        expect(text.data).toBe('foo');
    });
    
    test('from signal', () => {
        const dataS = sig.stable('foo');
        const text = dom.text(dataS);
        
        expect(text instanceof Text).toBeTruthy();
        expect(text.__vcnDetached).toBe(true);
        expect(text.data).toBe('foo');
    });
    
    test('`reset()` dep', () => {
        const dataS = sig.source(eq, 'foo');
        const text = dom.text(dataS);
        dom.appendChild(document.body, text);
        
        expect(text.__vcnDetached).toBe(false);
        expect(text.data).toBe('foo');
        
        dataS.reset('bar');
        
        expect(text.data).toBe('bar');
        
        dom.removeChild(document.body, text);
    });
});

