/**
 * @jest-environment jsdom
 */ 

import * as dom from '../js/dom';

import * as sig from '../js/signal';
import * as vec from '../js/vecnal';
import {id, eq} from '../js/prelude';

describe('testing `forVecnal`', () => {
    test('hatchChildren()', () => {
        const nodes = new dom.NodeManager();
        const alphabetS = vec.source(eq, ['a', 'b', 'c']);
        const alphaNest = nodes.forVecnal(alphabetS, (strS) => nodes.text(strS));
        
        const alphaTexts = alphaNest.hatchChildren();
        
        {
            let i = 0;
            
            for (const node of alphaTexts) {
                const str = alphabetS.at(i)!;
                
                expect(node instanceof Text).toBeTruthy();
                const textNode = node as dom.MountableText;
                if (!textNode.__vcnData) {
                    expect(textNode.data).toBe(str);
                } else {
                    expect(textNode.__vcnData.ref()).toBe(str);
                }
            
                ++i;
            }
            
            expect(i).toBe(alphabetS.size());
        }
    });
    
    test('setAt() dep', () => {
        const nodes = new dom.NodeManager();
        const alphabetS = vec.source(eq, ['a', 'b', 'c']);
        const noChange = '';
        let change = noChange;
        const alphaNest = nodes.forVecnal(alphabetS, (strS) => {
            if (strS.ref() === 'b') {
                strS.addSubscriber({onChange: (v) => change = v});
            }
            
            return nodes.text(strS);
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
        const nodes = new dom.NodeManager();
        const alphabetS = vec.source(eq, ['a', 'b', 'c']);
        const alphaNest = nodes.forVecnal(alphabetS, (strS) => nodes.text(strS));
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
        const textNode = change[1]  as dom.MountableText;
        if (!textNode.__vcnData) {
            expect(textNode.data).toBe(str);
        } else {
            expect(textNode.__vcnData.ref()).toBe('Z');
        }
    });
    
    test('remove() dep', () => {
        const nodes = new dom.NodeManager();
        const alphabetS = vec.source(eq, ['a', 'b', 'c']);
        const alphaNest = nodes.forVecnal(alphabetS, (strS) => nodes.text(strS));
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

describe('testing `el`', () => {
    test('creates `__vcnDetached` `Element`', () => {
        const nodes = new dom.NodeManager();
        const node = nodes.el('div', {});
        
        expect(node instanceof Element).toBeTruthy();
        expect(node.__vcnDetached).toBe(true);
        expect(node.tagName).toBe('DIV');
    });
    
    test('initializes `AttributeString`', () => {
        const nodes = new dom.NodeManager();
        const node = nodes.el('link', {
            'rel': 'stylesheet',
            'href': undefined
        });
        dom.appendChild(document.body, node);
        
        expect(node.getAttribute('rel')).toBe('stylesheet');
        expect(node.getAttribute('href')).toBe(null);
        
        dom.removeChild(document.body, node);
        
        const valueS = sig.stable('foo');
        const input = nodes.el('input', {'value': valueS});
        dom.appendChild(document.body, input);
        
        expect(input.getAttribute('value')).toBe('foo');
        
        dom.removeChild(document.body, input);
    });
    
    test('initializes style attribute', () => {
        const nodes = new dom.NodeManager();
        const colorS = sig.stable('black');
        const node = nodes.el('span', {
            'style': {
                'backgroundColor': 'white',
                'color': colorS
            }
        }) as unknown as HTMLElement; // HACK
        dom.appendChild(document.body, node);
        
        const style = node.style as
            unknown as {[key: string]: dom.BaseAttributeValue}; // HACK
        expect(style['background-color']).toBe('white');
        expect(style['color']).toBe('black');
        
        dom.removeChild(document.body, node);
    });
    
    test('initializes event listener', () => {
        const nodes = new dom.NodeManager();
        
        // This is complicated by the nonexistence of `getEventListener(s)`.
    
        let event = undefined as Event | undefined;
        const lick = (ev: Event) => event = ev;
        const node = nodes.el('button', {'onclick': lick});
        dom.appendChild(document.body, node);
        
        const clickEvent = new Event('click');
        node.dispatchEvent(clickEvent);
        
        expect(event).toBe(clickEvent);
        
        dom.removeChild(document.body, node);
    });
    
    test('reactive attribute', () => {
        const nodes = new dom.NodeManager();
        const valueS = sig.source(eq, 'foo');
        const node = nodes.el('input', {'value': valueS});
        dom.appendChild(document.body, node);
    
        nodes.jankyFrame(() => valueS.reset('bar'));
        
        expect(node.getAttribute('value')).toBe('bar');
    });
    
    test('reactive style attribute', () => {
        const nodes = new dom.NodeManager();
        const colorS = sig.source(eq, 'black');
        const node = nodes.el('span', {'style': {'color': colorS}}) as
            unknown as HTMLElement; // HACK
        dom.appendChild(document.body, node);
        
        nodes.jankyFrame(() => colorS.reset('red'));
        
        const style = node.style as
            unknown as {[key: string]: dom.BaseAttributeValue}; // HACK
        expect(style['color']).toBe('red');
        
        dom.removeChild(document.body, node);
    });
    
    test('child element', () => {
        const nodes = new dom.NodeManager();
        const span = nodes.el('span', {});
        const node = nodes.el('div', {}, span);
        dom.appendChild(document.body, node);
        
        expect(node.childNodes.length).toBe(1);
        expect(node.childNodes[0]).toBe(span);
        
        dom.removeChild(document.body, node);
    });
    
    test('child text', () => {
        const nodes = new dom.NodeManager();
        const text = 'foo';
        const node = nodes.el('span', {}, text);
        dom.appendChild(document.body, node);
        
        expect(node.childNodes.length).toBe(1);
        const child = node.childNodes[0];
        expect(child instanceof Text).toBeTruthy();
        expect((child as unknown as Text).data).toBe('foo');
        
        dom.removeChild(document.body, node);
    });
    
    test('child text from signal', () => {
        const nodes = new dom.NodeManager();
        const text = sig.stable('foo');
        const node = nodes.el('span', {}, text);
        dom.appendChild(document.body, node);
        
        expect(node.childNodes.length).toBe(1);
        const child = node.childNodes[0];
        expect(child instanceof Text).toBeTruthy();
        expect((child as unknown as Text).data).toBe('foo');
        
        dom.removeChild(document.body, node);
    });
    
    test('children from iterable', () => {
        const nodes = new dom.NodeManager();
        const children = [
            nodes.text('foo'),
            nodes.text('bar'),
            nodes.text('baz'),
        ];
        const node = nodes.el('div', {}, children as Iterable<dom.MountableNode>);
        dom.appendChild(document.body, node);
        
        expect(node.childNodes.length).toBe(3);
        for (let i = 0; i < node.childNodes.length; ++i) {
            expect(node.childNodes[i]).toBe(children[i]);
        }
        
        dom.removeChild(document.body, node);
    });
    
    test('children from `Vecnal`', () => {
        const nodes = new dom.NodeManager();
        const strS = vec.stable(['foo', 'bar', 'baz']);
        const node = nodes.el('div', {},
            nodes.forVecnal(strS, (strS) => nodes.text(strS)));
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
        const nodes = new dom.NodeManager();
        const strS = vec.source(eq, ['foo', 'bar', 'baz']);
        const node = nodes.el('div', {},
            nodes.forVecnal(strS, (strS) => nodes.text(strS)));
        dom.appendChild(document.body, node);
        
        nodes.jankyFrame(() => strS.setAt(1, 'Bar'));
        
        expect(node.childNodes.length).toBe(3);
        expect((node.childNodes[1] as Text).data).toBe('Bar');
        
        nodes.jankyFrame(() => strS.insert(3, 'quux'));
        
        expect(node.childNodes.length).toBe(4);
        expect((node.childNodes[3] as Text).data).toBe('quux');
        
        nodes.jankyFrame(() => strS.remove(1));
        
        expect(node.childNodes.length).toBe(3);
        expect((node.childNodes[1] as Text).data).toBe('baz');
        
        dom.removeChild(document.body, node);
    });
    
    test('reactive inner children from `Vecnal`', () => {
        const nodes = new dom.NodeManager();
        const abS = ['a', 'b', 'c'];
        const efS = vec.source(eq, ['e', 'f']);
        const ghS = ['g', 'h'];
        const node = nodes.el('div', {},
            abS,
            nodes.forVecnal(efS, id),
            ghS
        );
        dom.appendChild(document.body, node);
        
        nodes.jankyFrame(() => efS.insert(0, 'D'));
        
        expect(node.childNodes.length).toBe(8);
        expect((node.childNodes[3] as Text).data).toBe('D');
        expect((node.childNodes[6] as Text).data).toBe('g');
        
        nodes.jankyFrame(() => efS.setAt(0, 'd'));
        
        expect(node.childNodes.length).toBe(8);
        expect((node.childNodes[3] as Text).data).toBe('d');
        expect((node.childNodes[6] as Text).data).toBe('g');
        
        nodes.jankyFrame(() => efS.remove(0));
        
        expect(node.childNodes.length).toBe(7);
        expect((node.childNodes[3] as Text).data).toBe('e');
        expect((node.childNodes[5] as Text).data).toBe('g');
        
        dom.removeChild(document.body, node);
    });
});

describe('testing `text`', () => {
    test('from string', () => {
        const nodes = new dom.NodeManager();
        const text = nodes.text('foo');
        
        expect(text instanceof Text).toBeTruthy();
        expect(text.__vcnDetached).toBe(true);
        expect(text.data).toBe('foo');
    });
    
    test('from signal', () => {
        const nodes = new dom.NodeManager();
        const dataS = sig.stable('foo');
        const text = nodes.text(dataS);
        dom.appendChild(document.body, text);
        
        expect(text instanceof Text).toBeTruthy();
        expect(text.__vcnDetached).toBe(false);
        expect(text.data).toBe('foo');
        
        dom.removeChild(document.body, text);
    });
    
    test('`reset()` dep', () => {
        const nodes = new dom.NodeManager();
        const dataS = sig.source(eq, 'foo');
        const text = nodes.text(dataS);
        dom.appendChild(document.body, text);
        
        expect(text.__vcnDetached).toBe(false);
        expect(text.data).toBe('foo');
        
        nodes.jankyFrame(() => dataS.reset('bar'));
        
        expect(text.data).toBe('bar');
        
        dom.removeChild(document.body, text);
    });
});

