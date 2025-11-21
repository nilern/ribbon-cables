/**
 * @jest-environment jsdom
 */ 

import type {Arb} from 'fast-check';
import {test as tst, fc} from '@fast-check/jest';

import type {Op} from './test-util.ts';
import {arbOpIn} from './test-util.ts';

import * as dom from '../lib/dom.js';

import * as sig from '../lib/signal.js';
import {Signal} from '../lib/signal.js';
import * as vec from '../lib/vecnal.js';
import {eq, id} from '../lib/prelude.js';

type NestMaterial = dom.TextValue | dom.TextValue[] | Vecnal<dom.TextValue>;

const arbTextSignal: Arb<Signal<string>> = fc.string().map(sig.stable);

const arbTextValue: Arb<dom.TextValue> = fc.oneof(
    fc.string(),
    arbTextSignal
);

const arbTextArray: arb<dom.TextValue[]> = fc.array(arbTextValue);

const arbTextVecnal: Arb<dom.Fragment> = fc.array(fc.string()).map(vec.stable);
    
const arbNestMaterial: Arb<NestMaterial> = fc.oneof(
    arbTextValue,
    arbTextArray,
    arbTextVecnal
);

function buildNest(nodes: dom.NodeFactory, materials: NestMaterial): dom.Nest {
    if (typeof materials === 'string'
        || materials instanceof Signal
        || Array.isArray(materials)
    ) {
        return materials;
    } else {
        return nodes.forVecnal(materials, id);
    }
}

function textValueData(v: dom.TextValue): string {
    return typeof v === 'string' ? v : v.ref();
}

tst.prop({nestMaterials: fc.array(arbNestMaterial)})(
    '`el` children are nests concatenated',
    ({nestMaterials}) => {
        const nodes = new dom.NodeManager();
        const nests = nestMaterials.map((materialS) => buildNest(nodes, materialS));
        const element = nodes.el.apply(nodes, ['div', {}, ...nests]);
        dom.appendChild(document.body, element);
        
        const childDatas = nestMaterials.reduce((acc, materials) => {
            if (typeof materials === 'string' || materials instanceof Signal) {
                acc.push(textValueData(materials));
            } else if (Array.isArray(materials)) {
                for (const material of materials) {
                    acc.push(textValueData(material));
                }
            } else {
                materials.reduce((acc, material) => {
                    acc.push(material);
                    return acc;
                }, acc);
            }
            
            return acc;
        }, []);
        expect(element.childNodes.length).toBe(childDatas.length);
        element.childNodes.forEach((child, i) => {
            expect(child instanceof Text).toBeTruthy();
            expect((child as Text).data).toBe(childDatas[i]);
        });
        
        dom.removeChild(document.body, element);
    }
);

const arbTextVecnalMut: Arb<Vecnal<dom.TextValue>> = fc.array(fc.string())
    .map((vs) => vec.source(eq, vs));

type VecnalHistory = {
    materials: Vecnal<dom.TextValue>,
    ops: Op[]
};

type NestHistory
    = dom.TextValue
    | dom.TextValue[]
    | VecnalHistory;
    
const arbNestHistory: Arb<NestHistory> = fc.oneof(
    arbTextValue,
    arbTextArray,
    arbTextVecnalMut
        .chain((materials) => fc.record({
            materials: fc.constant(materials),
            ops: fc.array(arbOpIn(materials.size()))
        }))
);

tst.prop({nestHistories: fc.array(arbNestHistory)})(
    '`el` children after input modifications are still nests concatenated',
    ({nestHistories}) => {
        const nodes = new dom.NodeManager();
        const nests = nestHistories.map((history) =>
            typeof history === 'string'
                || history instanceof Signal
                || Array.isArray(history)
            ? buildNest(nodes, history)
            : buildNest(nodes, history.materials)
        );
        const element = nodes.el.apply(nodes, ['div', {}, ...nests]);
        dom.appendChild(document.body, element);
        
        nodes.jankyFrame(() => {
            for (const history of nestHistories) {
                if (!(typeof history === 'string'
                      || history instanceof Signal
                      || Array.isArray(history))
                ) {
                    const {materials, ops} = history;
                    
                    for (const op of ops) {
                        switch (op.name) {
                        case 'insert':
                            if (op.index <= materials.size()) {
                                materials.insert(op.index, op.username);
                            }
                            break;
                    
                        case 'remove':
                            if (op.index < materials.size()) {
                                materials.remove(op.index);
                            }
                            break;
                        
                        case 'substitute':
                            if (op.index < materials.size()) {
                                materials.setAt(op.index, op.username);
                            }
                            break;
                        
                        default: { const _exhaust: never = op.name; }
                        }
                    }
                }
            }
        });
        
        const childDatas = nestHistories.reduce((acc, history) => {
            if (typeof history === 'string' || history instanceof Signal) {
                acc.push(textValueData(history));
            } else if (Array.isArray(history)) {
                for (const material of history) {
                    acc.push(textValueData(material));
                }
            } else {
                history.materials.reduce((acc, material) => {
                    acc.push(material);
                    return acc;
                }, acc);
            }
            
            return acc;
        }, []);
        expect(element.childNodes.length).toBe(childDatas.length);
        element.childNodes.forEach((child, i) => {
            expect(child instanceof Text).toBeTruthy();
            expect((child as Text).data).toBe(childDatas[i]);
        });
        
        dom.removeChild(document.body, element);
    }
);

