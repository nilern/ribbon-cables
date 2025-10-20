/**
 * @jest-environment jsdom
 */ 

import type {Arb} from 'fast-check';
import {test as tst, fc} from '@fast-check/jest';

import * as dom from '../js/dom.js';

import * as sig from '../js/signal.js';
import {Signal} from '../js/signal.js';
import * as vec from '../js/vecnal.js';
import {id} from '../js/prelude.js';

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

