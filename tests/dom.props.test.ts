/**
 * @jest-environment jsdom
 */ 

import type {Arb} from 'fast-check';
import {test as tst, fc} from '@fast-check/jest';

import * as dom from '../js/dom.js';

import * as sig from '../js/signal.js';
import {Signal} from '../js/signal.js';
import * as vec from '../js/vecnal.js';
import {eq, id} from '../js/prelude.js';

const maxLength = 100;

type NestMaterial = dom.TextValue | dom.TextValue[] | Vecnal<dom.TextValue>;

const arbTextSignal: Arb<Signal<string>> = fc.string().map(sig.stable);

const arbTextValue: Arb<dom.TextValue> = fc.oneof(
    fc.string(),
    arbTextSignal
);

const arbTextArray: arb<dom.TextValue[]> = fc.array(arbTextValue);

const arbTextVecnal: Arb<dom.Fragment> =
    fc.array(fc.string(), {maxLength}).map(vec.stable);
    
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

const arbTextVecnalMut: Arb<dom.Fragment> =
    fc.array(fc.string(), {maxLength}).map((vs) => vec.source(eq, vs));

// TODO: DRY (wrt. `vecnal.props.test`):

type Insertion = {
    name: 'insert',
    index: number,
    username: string
};

type Removal = {
    name: 'remove',
    index: number
};

type Substitution = {
    name: 'substitute',
    index: number,
    username: string
};

type Op = Insertion | Removal | Substitution;

const arbOp: Arb<Op> = fc.oneof(
    fc.record({
        name: fc.constant('insert'),
        index: fc.nat(maxLength),
        username: fc.string()
    }),
    fc.record({
        name: fc.constant('remove'),
        index: fc.nat(maxLength)
    }),
    fc.record({
        name: fc.constant('substitute'),
        index: fc.nat(maxLength),
        username: fc.string()
    })
);

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
    fc.record({
        materials: arbTextVecnalMut,
        ops: fc.array(arbOp)
    })
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

