export type {
    AttributeString, BaseAttributeValue, StyleAttributeValue, AttributeValue,
    ChildValue, Child
};
export {
    el,
    insertBefore, removeChild, replaceChild
};

import {eq} from "./prelude.js";
import type {Observable, Subscriber} from "./signal.js";
import * as signal from "./signal.js";
import {Signal} from "./signal.js";
import type {IndexedObservable, IndexedSubscriber} from "./vecnal.js";
import * as vecnal from "./vecnal.js";
import {Vecnal} from "./vecnal.js";

type EventHandler = (event: Event) => void;

// Using the correct variances here although unsafe casts will be required on actual use:
type Watchees = Map<Observable<any>, Set<Subscriber<never>>>;
type MultiWatchees = Map<IndexedObservable<any>, Set<IndexedSubscriber<never>>>;

// HACK for forcibly shoving these properties into DOM nodes:
interface MountableNode {
    __vcnDetached: boolean | undefined,
    __vcnWatchees?: Watchees,
    __vcnMultiWatchees?: MultiWatchees
}

function addWatchee<T>(node: MountableNode, valS: Signal<T>, subscriber: Subscriber<T>) {
    if (!node.__vcnWatchees) { node.__vcnWatchees = new Map(); }
    
    const subscribers = node.__vcnWatchees.get(valS);
    if (subscribers) {
        subscribers.add(subscriber);
    } else {
        node.__vcnWatchees.set(valS, new Set([subscriber]));
    }
}

function removeWatchee<T>(node: MountableNode, valS: Signal<T>, subscriber: Subscriber<T>) {
    if (!node.__vcnWatchees) { node.__vcnWatchees = new Map(); }
    
    const subscribers = node.__vcnWatchees.get(valS);
    if (subscribers) {
        subscribers.delete(subscriber);
    } else {
        console.error("signal has no subscribers to delete from");
    }
}

function addMultiWatchee<T>(node: MountableNode, collS: Vecnal<T>,
    subscriber: IndexedSubscriber<T>
) {
    if (!node.__vcnMultiWatchees) { node.__vcnMultiWatchees = new Map(); }
    
    const subscribers = node.__vcnMultiWatchees.get(collS);
    if (subscribers) {
        subscribers.add(subscriber);
    } else {
        node.__vcnMultiWatchees.set(collS, new Set([subscriber]));
    }
}

function removeMultiWatchee<T>(node: MountableNode, collS: Vecnal<T>,
    subscriber: IndexedSubscriber<T>
) {
    if (!node.__vcnMultiWatchees) { node.__vcnMultiWatchees = new Map(); }
    
    const subscribers = node.__vcnMultiWatchees.get(collS);
    if (subscribers) {
        subscribers.delete(subscriber);
    } else {
        console.error("vecnal has no subscribers to delete from");
    }
}

function activateSink(node: MountableNode) {
    if (node.__vcnWatchees) {
        for (const [valS, subscribers] of node.__vcnWatchees) {
            for (const subscriber of subscribers) {
                valS.addSubscriber(subscriber as Subscriber<any>);
            }
        }
    }
        
    if (node.__vcnMultiWatchees) {
        for (const [collS, subscribers] of node.__vcnMultiWatchees) {
            for (const subscriber of subscribers) {
                collS.addISubscriber(subscriber as IndexedSubscriber<any>);
            }
        }
    }
}

function deactivateSink(node: MountableNode) {
    if (node.__vcnWatchees) {
        for (const [valS, subscribers] of node.__vcnWatchees) {
            for (const subscriber of subscribers) {
                valS.removeSubscriber(subscriber as Subscriber<any>);
            }
        }
    }
        
    if (node.__vcnMultiWatchees) {
        for (const [collS, subscribers] of node.__vcnMultiWatchees) {
            for (const subscriber of subscribers) {
                collS.removeISubscriber(subscriber as IndexedSubscriber<any>);
            }
        }
    }
}

function isMounted(node: Node) {
    return !(node as unknown as MountableNode).__vcnDetached;
}

function mount(el: Node) {
    if (el instanceof Element) {
        for (const child of el.children) { mount(child); }
    }
    
    activateSink(el as unknown as MountableNode);
    
    (el as unknown as MountableNode).__vcnDetached = false;
}

function unmount(el: Node) {
    if (el instanceof Element) {
        for (const child of el.children) { unmount(child); }
    }
    
    deactivateSink(el as unknown as MountableNode);
    
    (el as unknown as MountableNode).__vcnDetached = true;
}

function insertBefore(parent: Element, child: Node, successor: Node) {
    parent.insertBefore(child, successor);
    if (isMounted(parent)) {
        mount(child);
        activateSink(parent as unknown as MountableNode);
    }
}

function removeChild(parent: Element, child: Node) {
    parent.removeChild(child);
    if (isMounted(parent)) {
        unmount(child);
    }
}

function replaceChild(parent: Element, child: Node, oldChild: Node) {
    parent.replaceChild(child, oldChild);
    if (isMounted(parent)) {
        unmount(oldChild);
        mount(child);
    }
}

type AttributeString = string | undefined;

type BaseAttributeValue = AttributeString | Signal<AttributeString>;

type StyleAttributeValue = {[key: string]: BaseAttributeValue};

type AttributeValue = BaseAttributeValue | EventHandler | StyleAttributeValue;

function setAttributeString(node: Element, name: string, val: AttributeString) {
    if (typeof val === "string") {
        node.setAttribute(name, val);
    } else if (typeof val === "undefined") {
        node.removeAttribute(name);
    } else {
        const _exhaust: never = val;
    }
}

function setStyleAttribute(node: HTMLElement, name: string, val: BaseAttributeValue) {
    if (typeof val === "string" || typeof val === "undefined") {
        (node.style as unknown as StyleAttributeValue)[name] = val;
    } else if (val instanceof Signal) {
        (node.style as unknown as StyleAttributeValue)[name] = val.ref();
        addWatchee(node as unknown as MountableNode, val, {onChange: (newVal) => {
            (node.style as unknown as StyleAttributeValue)[name] = newVal;
        }});
    } else {
        const _exhaust: never = val;
    }
}

function setAttribute(node: Element, name: string, val: AttributeValue) {
    if (typeof val === "string" || typeof val === "undefined") {
        setAttributeString(node, name, val);
    } else if (val instanceof Signal) {
        setAttributeString(node, name, val.ref());
        addWatchee(node as unknown as MountableNode, val, {onChange: (newVal) =>
            setAttributeString(node, name, newVal)
        });
    } else if (typeof val === "function") {
        console.assert(name.slice(0, 2) === "on", "%s does not begin with 'on'", name);
        
        node.addEventListener(name.slice(2), val);
    } else if (typeof val === "object") {
        console.assert(name === "style", "%s !== \"style\"", name); // FIXME: Ensure this statically
        
        for (const key in val) {
            setStyleAttribute(node as HTMLElement, key, val[key]);
        }
    } else {
        const _exhaust: never = val;
    }
}

type ChildValue = Node | string;

type Child = ChildValue | ChildValue[] | Signal<ChildValue> | Vecnal<ChildValue>;

function childValueToNode(child: ChildValue): Node {
    if (child instanceof Node) {
        return child;
    } else if (typeof child === "string") {
        return document.createTextNode(child);
    } else {
        const exhaust: never = child;
        return exhaust;
    }
}

function childToVecnal(child: Child): Vecnal<Node> {
    if (child instanceof Vecnal) {
        return child.map(eq, childValueToNode);
    } else if (child instanceof Signal) {
        return vecnal.lift(child.map(eq, childValueToNode));
    } else if (Array.isArray(child)) {
        return vecnal.stable(child.map(childValueToNode));
    } else {
        return vecnal.stable([childValueToNode(child)]);
    }
}

class Nanny implements IndexedSubscriber<Node> {
    constructor(
        private readonly parent: Element
    ) {}

    onInsert(i: number, child: Node) {
        const successor = this.parent.childNodes[i];
        insertBefore(this.parent, child, successor);
    }
    
    onRemove(i: number) {
        removeChild(this.parent, this.parent.childNodes[i]);
    }

    onSubstitute(i: number, child: Node) {
        replaceChild(this.parent, child, this.parent.childNodes[i]);
    }
}

function el(tagName: string, attrs: {[key: string]: AttributeValue}, ...children: Child[]): Element {
    const node = document.createElement(tagName);
    (node as unknown as MountableNode).__vcnDetached = true;
    
    for (const attrName in attrs) {
        setAttribute(node, attrName, attrs[attrName]);
    }
    
    {
        // Need to cast from `Vecnal<unknown>` because `apply` is so weakly typed:
        const childrenVecnal =
            vecnal.concat.apply(undefined, children.map(childToVecnal)) as Vecnal<Node>;
        
        childrenVecnal.reduce((_, child) => node.appendChild(child), /*HACK:*/ undefined as void);
        
        addMultiWatchee(node as unknown as MountableNode, childrenVecnal, new Nanny(node));
    }
    
    return node;
}

