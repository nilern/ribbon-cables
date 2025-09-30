export type {
    MountableNode, MountableElement, MountableText,
    AttributeString, BaseAttributeValue, StyleAttributeValue, AttributeValue,
    EventHandler,
    ChildValue, Nest, Fragment,
    TextValue
};
export {
    el, text,
    forVecnal, // TODO: `ifSignal`
    insertBefore, removeChild, replaceChild
};

import type {Reset} from "./prelude.js";
import type {Observable, Subscriber} from "./signal.js";
import {Signal, SubscribeableSignal} from "./signal.js";
import type {IndexedObservable, IndexedSubscriber} from "./vecnal.js";
import {Vecnal} from "./vecnal.js";

type EventHandler = (event: Event) => void;

type ChildValue = MountableNode | string;

type Nest = ChildValue | Signal<string> | Fragment;

function childValueToNode(child: ChildValue): MountableNode {
    if (child instanceof Node) {
        return child;
    } else if (typeof child === "string") {
        return document.createTextNode(child);
    } else {
        const exhaust: never = child;
        return exhaust;
    }
}

// Using the correct variances here although unsafe casts will be required on actual use:
type Watchees = Map<Observable<any>, Set<Subscriber<never>>>;
type MultiWatchees = Map<IndexedObservable<any>, Set<IndexedSubscriber<never>>>;
// HACKs for forcibly shoving these properties into DOM nodes:
interface MountableNode extends Node {
    __vcnDetached?: boolean,
    __vcnWatchees?: Watchees
}
interface MountableElement extends Element {
    __vcnDetached?: boolean,
    __vcnWatchees?: Watchees,
    __vcnMultiWatchees?: MultiWatchees,
    __vcnNests?: readonly Nest[],
    __vcnOffsets?: number[]
}
interface MountableText extends Text {
    __vcnDetached?: boolean,
    __vcnWatchees?: Watchees
}

class ChildSignal<T> extends SubscribeableSignal<T> implements Reset<T> {
    constructor(
        private v: T
    ) {
        super();
    }
    
    ref(): T { return this.v; }
    
    reset(v: T): T {
        const old = this.v;
        this.v = v;
        
        this.notify(old, v);
        
        return v;
    }
}

abstract class Fragment implements IndexedObservable<Node> {
    abstract hatchChildren(): Iterable<MountableNode>;
    
    abstract addISubscriber(subscriber: IndexedSubscriber<Node>): void;
    abstract removeISubscriber(subscriber: IndexedSubscriber<Node>): void;
    abstract notifySubstitute(i: number, _: Node, newNode: Node): void;
    abstract notifyInsert(i: number, node: Node): void;
    abstract notifyRemove(i: number): void;
}

// TODO: Use mixin for `MapFragment.prototype.subscribers`:
class MapFragment<T> extends Fragment implements IndexedSubscriber<T> {
    private readonly subscribers = new Set<IndexedSubscriber<Node>>(); // TODO: `Set<WeakRef<`
    private readonly signals = [] as ChildSignal<T>[];
    
    constructor(
        private readonly input: Vecnal<T>,
        private readonly f: (v: Signal<T>) => ChildValue
    ) {
        super();
    }
    
    hatchChildren(): Iterable<MountableNode> {
        return this.input.reduce<MountableNode[]>((children, v) => {
            const vS = new ChildSignal(v);
            this.signals.push(vS);
            children.push(childValueToNode(this.f(vS)));
            return children;
        }, []);
    }
    
    addISubscriber(subscriber: IndexedSubscriber<Node>) {
        if (this.subscribers.size === 0) {
            /* To avoid space leaks and 'unused' updates to `this` only start watching
             * dependencies when `this` gets its first watcher: */
            this.input.addISubscriber(this);
        }
        
        this.subscribers.add(subscriber);
    }
    
    removeISubscriber(subscriber: IndexedSubscriber<Node>) {
        this.subscribers.delete(subscriber);
        
        if (this.subscribers.size === 0) {
            /* Watcher count just became zero, but watchees still have pointers to `this`.
             * Remove those to avoid space leaks and 'unused' updates to `this`: */
            this.input.removeISubscriber(this);
        }
    }
    
    notifySubstitute(i: number, _: Node, newNode: Node) {
        throw new Error("Unreachable");
    }
    
    notifyInsert(i: number, node: Node) {
        for (const subscriber of this.subscribers) {
            subscriber.onInsert(i, node);
        }
    }
    
    notifyRemove(i: number) {
        for (const subscriber of this.subscribers) {
            subscriber.onRemove(i);
        }
    }
    
    onSubstitute(i: number, v: T) {
        this.signals[i].reset(v);
    }
    
    onInsert(i: number, v: T) {
        const vS = new ChildSignal(v);
        this.signals.splice(i, 0, vS);
    
        const node = childValueToNode(this.f(vS));
        this.notifyInsert(i, node);
    }
    
    onRemove(i: number) {
        this.signals.splice(i, 1);
        
        this.notifyRemove(i);
    }
}

function forVecnal<T>(vS: Vecnal<T>, itemView: (vS: Signal<T>) => ChildValue): Fragment {
    return new MapFragment(vS, itemView);
}

function hatchChildren(nest: Nest): Iterable<MountableNode> {
    if (nest instanceof Fragment) {
        return nest.hatchChildren();
    } if (nest instanceof Signal) {
        return [text(nest)];
    } else {
        return [childValueToNode(nest)];
    }
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

function addMultiWatchee<T>(node: MountableElement, collS: IndexedObservable<T>,
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

function removeMultiWatchee<T>(node: MountableElement, collS: Vecnal<T>,
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
        
    if (node instanceof Element) {
        const elem = node as MountableElement;
        
        if (elem.__vcnMultiWatchees) {
            for (const [collS, subscribers] of elem.__vcnMultiWatchees) {
                for (const subscriber of subscribers) {
                    collS.addISubscriber(subscriber as IndexedSubscriber<any>);
                }
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
        
    if (node instanceof Element) {
        const elem = node as MountableElement;
    
        if (elem.__vcnMultiWatchees) {
            for (const [collS, subscribers] of elem.__vcnMultiWatchees) {
                for (const subscriber of subscribers) {
                    collS.removeISubscriber(subscriber as IndexedSubscriber<any>);
                }
            }
        }
    }
}

class Nanny implements IndexedSubscriber<Node> {
    constructor(
        private readonly parent: MountableElement,
        private readonly nestIndex: number
    ) {}

    onInsert(subIndex: number, child: Node) {
        const offsets = this.parent.__vcnOffsets!;
        
        const index = offsets[this.nestIndex] + subIndex;
        const successor = this.parent.childNodes[index];
        insertBefore(this.parent, child, successor);
        
        {
            const len = offsets.length;
            for (let i = this.nestIndex + 1; i < len; ++i) {
                ++offsets[i];
            }
        }
    }
    
    onRemove(subIndex: number) {
        const offsets = this.parent.__vcnOffsets!;
        
        const index = offsets[this.nestIndex] + subIndex;
        removeChild(this.parent, this.parent.childNodes[index]);
        
        {
            const len = offsets.length;
            for (let i = this.nestIndex + 1; i < len; ++i) {
                --offsets[i];
            }
        }
    }

    onSubstitute(i: number, child: Node) {
        replaceChild(this.parent, child, this.parent.childNodes[i]);
    }
}

function isMounted(node: Node): boolean {
    return !(node as unknown as MountableNode).__vcnDetached;
}

function mount(node: MountableNode) {
    if (node instanceof Element) {
        const elem = node as MountableElement;
    
        const nests = elem.__vcnNests;
        if (nests) {
            const offsets = [] as number[];
            
            let offset = 0;
            nests.forEach((nest, nestIndex) => {
                offsets.push(offset);
                
                for (const child of hatchChildren(nest)) {
                    mount(child);
                    elem.appendChild(child);
                    ++offset;
                }
                
                if (nest instanceof Fragment) {
                    addMultiWatchee(elem, nest, new Nanny(elem, nestIndex));
                }
            });
            
            elem.__vcnOffsets = offsets;
        }
    }
    
    activateSink(node);
    
    node.__vcnDetached = false;
}

function unmount(node: MountableNode) {
    node.__vcnDetached = true;
    
    deactivateSink(node);
    
    if (node instanceof Element) {
        for (const child of node.children) {
            unmount(child);
        }
    }
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

function el(tagName: string, attrs: {[key: string]: AttributeValue}, ...children: Nest[]): 
    MountableElement
{
    const node = document.createElement(tagName) as MountableElement;
    node.__vcnDetached = true;
    
    for (const attrName in attrs) {
        setAttribute(node, attrName, attrs[attrName]);
    }
    
    node.__vcnNests = children;
    
    return node;
}

type TextValue = string | Signal<string>;

function text(data: TextValue): MountableText {
    const text = data instanceof Signal ? data.ref() : data;

    const node = document.createTextNode(text) as MountableText;
    node.__vcnDetached = true;
    
    if (data instanceof Signal) {
        addWatchee(node, data, {
            onChange: (newStr) => node.replaceData(0, node.length, newStr)
        });
    }
        
    return node;
}

