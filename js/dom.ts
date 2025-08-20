import {eq} from "./prelude.js"
import type {Observable, Subscriber} from "./signal.js"
import {Signal, map} from "./signal.js"
import type {IndexedObservable, IndexedSubscriber} from "./vecnal.js"
import {Vecnal, ConstVecnal, MappedVecnal, concat, lift} from "./vecnal.js"

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

function addWatchee<T>(node: MountableNode, signal: Signal<T>, subscriber: Subscriber<T>) {
    if (!node.__vcnWatchees) { node.__vcnWatchees = new Map(); }
    
    const subscribers = node.__vcnWatchees.get(signal);
    if (subscribers) {
        subscribers.add(subscriber);
    } else {
        node.__vcnWatchees.set(signal, new Set([subscriber]));
    }
}

function removeWatchee<T>(node: MountableNode, signal: Signal<T>, subscriber: Subscriber<T>) {
    if (!node.__vcnWatchees) { node.__vcnWatchees = new Map(); }
    
    const subscribers = node.__vcnWatchees.get(signal);
    if (subscribers) {
        subscribers.delete(subscriber);
    } else {
        console.error("signal has no subscribers to delete from");
    }
}

function addMultiWatchee<T>(node: MountableNode, vecnal: Vecnal<T>,
    subscriber: IndexedSubscriber<T>
) {
    if (!node.__vcnMultiWatchees) { node.__vcnMultiWatchees = new Map(); }
    
    const subscribers = node.__vcnMultiWatchees.get(vecnal);
    if (subscribers) {
        subscribers.add(subscriber);
    } else {
        node.__vcnMultiWatchees.set(vecnal, new Set([subscriber]));
    }
}

function removeMultiWatchee<T>(node: MountableNode, vecnal: Vecnal<T>,
    subscriber: IndexedSubscriber<T>
) {
    if (!node.__vcnMultiWatchees) { node.__vcnMultiWatchees = new Map(); }
    
    const subscribers = node.__vcnMultiWatchees.get(vecnal);
    if (subscribers) {
        subscribers.delete(subscriber);
    } else {
        console.error("vecnal has no subscribers to delete from");
    }
}

function activateSink(node: MountableNode) {
    if (node.__vcnWatchees) {
        for (const [signal, subscribers] of node.__vcnWatchees) {
            for (const subscriber of subscribers) {
                signal.subscribe(subscriber as Subscriber<any>);
            }
        }
    }
        
    if (node.__vcnMultiWatchees) {
        for (const [signal, subscribers] of node.__vcnMultiWatchees) {
            for (const subscriber of subscribers) {
                signal.iSubscribe(subscriber as IndexedSubscriber<any>);
            }
        }
    }
}

function deactivateSink(node: MountableNode) {
    if (node.__vcnWatchees) {
        for (const [signal, subscribers] of node.__vcnWatchees) {
            for (const subscriber of subscribers) {
                signal.unsubscribe(subscriber as Subscriber<any>);
            }
        }
    }
        
    if (node.__vcnMultiWatchees) {
        for (const [signal, subscribers] of node.__vcnMultiWatchees) {
            for (const subscriber of subscribers) {
                signal.iUnsubscribe(subscriber as IndexedSubscriber<any>);
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

export function insertBefore(parent: Element, child: Node, successor: Node) {
    parent.insertBefore(child, successor);
    if (isMounted(parent)) {
        mount(child);
        activateSink(parent as unknown as MountableNode);
    }
}

export function removeChild(parent: Element, child: Node) {
    parent.removeChild(child);
    if (isMounted(parent)) {
        unmount(child);
    }
}

export function replaceChild(parent: Element, child: Node, oldChild: Node) {
    parent.replaceChild(child, oldChild);
    if (isMounted(parent)) {
        unmount(oldChild);
        mount(child);
    }
}

type AttributeString = string | undefined;

type AttributeValue = AttributeString | Signal<AttributeString> | EventHandler;

function setAttributeString(node: Element, name: string, val: AttributeString) {
    if (typeof val === "string") {
        node.setAttribute(name, val);
    } else if (typeof val === "undefined") {
        node.removeAttribute(name);
    } else {
        const exhaust: never = val;
        return exhaust;
    }
}

function setAttribute(node: Element, name: string, val: AttributeValue) {
    if (typeof val === "string" || typeof val === "undefined") {
        setAttributeString(node, name, val);
    } else if (val instanceof Signal) {
        setAttributeString(node, name, val.ref());
        addWatchee(node as unknown as MountableNode, val, (_, newVal) =>
            setAttributeString(node, name, newVal)
        );
    } else if (typeof val === "function") {
        console.assert(name.slice(0, 2) === "on", "%s does not begin with 'on'", name);
        node.addEventListener(name.slice(2), val);
    } else {
        const exhaust: never = val;
        return exhaust;
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
        return new MappedVecnal(eq, childValueToNode, child);
    } else if (child instanceof Signal) {
        return lift(map(eq, childValueToNode, child));
    } else if (Array.isArray(child)) {
        return new ConstVecnal(child.map(childValueToNode));
    } else {
        return new ConstVecnal([childValueToNode(child)]);
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

export function el(tagName: string, attrs: {[key: string]: AttributeValue}, ...children: Child[]): Element {
    const node = document.createElement(tagName);
    (node as unknown as MountableNode).__vcnDetached = true;
    
    for (const attrName in attrs) {
        setAttribute(node, attrName, attrs[attrName]);
    }
    
    {
        // Need to cast from `Vecnal<unknown>` because `apply` is so weakly typed:
        const childrenVecnal = concat.apply(undefined, children.map(childToVecnal)) as Vecnal<Node>;
        
        childrenVecnal.reduce((_, child) => node.appendChild(child), /*HACK:*/ undefined as void);
        
        addMultiWatchee(node as unknown as MountableNode, childrenVecnal, new Nanny(node));
    }
    
    return node;
}

