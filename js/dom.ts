export type {
    MountableNode, MountableElement, MountableText,
    AttributeString, BaseAttributeValue, StyleAttributeValue, AttributeValue,
    EventHandler,
    ChildValue, Nest, Fragment,
    TextValue,
    NodeFactory, FramingFn, Framer
};
export {
    NodeManager,
    // TODO: `ifSignal` (unless `Signal<MountableNode>` <: `ChildValue`)
    appendChild, insertBefore, removeChild, replaceChild
};

import type {Reset} from "./prelude.js";
import type {Observable, Subscriber} from "./signal.js";
import {Signal, SubscribeableSignal} from "./signal.js";
import type {IndexedObservable, IndexedSubscriber} from "./vecnal.js";
import {Vecnal} from "./vecnal.js";

type TextValue = string | Signal<string>;

type EventHandler = (event: Event) => void;

type ChildValue = MountableNode | TextValue; // TODO: `Signal<MountableNode>`

type Nest = ChildValue | Iterable<ChildValue> | Fragment;

function childValueToNode(nodes: NodeFactory, child: ChildValue): MountableNode {
    if (child instanceof Node) {
        return child;
    } else if (typeof child === "string" || child instanceof Signal) {
        return nodes.text(child);
    } else {
        const exhaust: never = child;
        return exhaust;
    }
}

// Using the correct variances here although unsafe casts will be required on actual use:
type Watchees = Map<Observable<any>, Set<Subscriber<never>>>;
type MultiWatchees = Map<IndexedObservable<any>, Set<IndexedSubscriber<never>>>;
// TODO: DRY out properties:
// HACKs for forcibly shoving these properties into DOM nodes:
interface MountableNode extends Node {
    __vcnDetached?: boolean,
    __vcnNodes?: NodeFactory & UpdateQueue,
    __vcnWatchees?: Watchees
}
interface MountableElement extends Element {
    __vcnDetached?: boolean,
    __vcnNodes?: NodeFactory & UpdateQueue,
    __vcnWatchees?: Watchees,
    __vcnMultiWatchees?: MultiWatchees,
    __vcnNests?: readonly Nest[],
    __vcnOffsets?: number[]
}
interface MountableText extends Text {
    __vcnDetached?: boolean,
    __vcnNodes?: NodeFactory & UpdateQueue,
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
        private readonly nodes: NodeFactory,
        private readonly input: Vecnal<T>,
        private readonly f: (v: Signal<T>) => ChildValue
    ) {
        super();
    }
    
    // TODO: Just `MapFragment<T> implements (lazy) Iterator<T>` instead?:
    hatchChildren(): Iterable<MountableNode> {
        return this.input.reduce<MountableNode[]>((children, v) => {
            const vS = new ChildSignal(v);
            this.signals.push(vS);
            children.push(childValueToNode(this.nodes, this.f(vS)));
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
    
        const node = childValueToNode(this.nodes, this.f(vS));
        this.notifyInsert(i, node);
    }
    
    onRemove(i: number) {
        this.signals.splice(i, 1);
        
        this.notifyRemove(i);
    }
}

function hatchChildren(nodes: NodeFactory, nest: Nest): Iterable<MountableNode> {
    if (nest instanceof Node || typeof nest === "string" || nest instanceof Signal) {
        return [childValueToNode(nodes, nest)];
    } else if (Symbol.iterator in nest) {
        const children = [];
    
        for (const child of nest) {
            children.push(childValueToNode(nodes, child));
        }
    
        return children;
    } else if (nest instanceof Fragment) {
        return nest.hatchChildren();
    } else {
        const _exhaust: never = nest;
        throw new Error("Unreachable");
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
        this.parent.__vcnNodes!.scheduleUpdate(() => {
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
        });
    }
    
    onRemove(subIndex: number) {
        this.parent.__vcnNodes!.scheduleUpdate(() => {
            const offsets = this.parent.__vcnOffsets!;
            
            const index = offsets[this.nestIndex] + subIndex;
            removeChild(this.parent, this.parent.childNodes[index]);
            
            {
                const len = offsets.length;
                for (let i = this.nestIndex + 1; i < len; ++i) {
                    --offsets[i];
                }
            }
        });
    }

    onSubstitute(subIndex: number, child: Node) {
        this.parent.__vcnNodes!.scheduleUpdate(() => {
            const offsets = this.parent.__vcnOffsets!;
            const index = offsets[this.nestIndex] + subIndex;
            replaceChild(this.parent, child, this.parent.childNodes[index])
        });
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
                
                for (const child of hatchChildren(elem.__vcnNodes!, nest)) {
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

function appendChild(parent: Element, child: Node) {
    parent.appendChild(child);
    if (isMounted(parent)) {
        mount(child);
    }
}

function insertBefore(parent: Element, child: Node, successor: Node) {
    parent.insertBefore(child, successor);
    if (isMounted(parent)) {
        mount(child);
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

function initAttribute(
    updater: UpdateQueue, node: Element, name: string, val: AttributeValue
) {
    if (typeof val === "string" || typeof val === "undefined") {
        setAttributeString(node, name, val);
    } else if (val instanceof Signal) {
        setAttributeString(node, name, val.ref());
        addWatchee(node as unknown as MountableNode, val, {
            onChange: (newVal) => updater.scheduleUpdate(() =>
                setAttributeString(node, name, newVal)
            )
        });
    } else if (typeof val === "function") {
        console.assert(name.slice(0, 2) === "on", "%s does not begin with 'on'", name);
        
        node.addEventListener(name.slice(2), val);
    } else if (typeof val === "object") {
        console.assert(name === "style", "%s !== \"style\"", name); // FIXME: Ensure this statically
        
        for (const key in val) {
            initStyleAttribute(updater, node as HTMLElement, key, val[key]);
        }
    } else {
        const _exhaust: never = val;
    }
}

// TODO: Should we actually `delete` instead of
// `this.element.style[this.name] = undefined`?:
function initStyleAttribute(
    updater: UpdateQueue, node: HTMLElement, name: string, val: BaseAttributeValue
) {
    if (typeof val === "string" || typeof val === "undefined") {
        (node.style as unknown as StyleAttributeValue)[name] = val;
    } else if (val instanceof Signal) {
        (node.style as unknown as StyleAttributeValue)[name] = val.ref();
        addWatchee(node as unknown as MountableNode, val, {
            onChange: (newVal) => updater.scheduleUpdate(() =>
                (node.style as unknown as StyleAttributeValue)[name] = newVal
            )
        });
    } else {
        const _exhaust: never = val;
    }
}

interface NodeFactory {
    el: (tagName: string, attrs: {[key: string]: AttributeValue}, ...children: Nest[])
        => MountableElement;
        
    text: (data: TextValue) => MountableText;
    
    forVecnal: <T>(vS: Vecnal<T>, itemView: (vS: Signal<T>) => ChildValue) => Fragment;
}

type NodeUpdate = () => void;

interface UpdateQueue {
    scheduleUpdate: (update: NodeUpdate) => void;
}

// TODO: Statically ensure that mutations are contained inside this (by e.g.
// passing a Witness/Capability to `mutate`)?:
type FramingFn = (mutate: () => void) => void;

interface Framer {
    frame: FramingFn,
    
    /** {@link frame} without `requestAnimationFrame` (for testing). */
    jankyFrame: FramingFn
}

/* FIXME:
,"vs":[" "," "," "," "," "," ","","","","",""," "," "," "," ","","","","",""," "," "," "," ","","","","",""," "," "," "," "," ",""," ","","","","","","","","","","",""," "," "," "," "," ","","","","","","","(","(","(","(","(","","","","","","","l(","l(","l(","l(","","","","","","","]","]","]","]","]","]","","]","]","]","]","]","]","]","]","]","]","","]","]","]","]","]","]","]","]","]","","]","]","]"]},"ops":[{"name":"insert","index":6,"username":""},{"name":"substitute","index":6,"username":" "}]}]}]
    Shrunk 18 time(s)

    Hint: Enable verbose mode in order to have the list of all failing values encountered during the run

      at buildError (node_modules/fast-check/lib/check/runner/utils/RunDetailsFormatter.js:156:19)
      at asyncThrowIfFailed (node_modules/fast-check/lib/check/runner/utils/RunDetailsFormatter.js:170:11)

    Cause:
    expect(received).toBe(expected) // Object.is equality

    Expected: " "
    Received: ""

      212 |         element.childNodes.forEach((child, i) => {
      213 |             expect(child instanceof Text).toBeTruthy();
    > 214 |             expect((child as Text).data).toBe(childDatas[i]);
          |                                          ^
      215 |         });
      216 |         
      217 |         dom.removeChild(document.body, element);
*/
class NodeManager implements NodeFactory, UpdateQueue, Framer {
    private readonly updates = [] as NodeUpdate[];

    constructor() {}

    el(tagName: string, attrs: {[key: string]: AttributeValue}, ...children: Nest[]): 
        MountableElement
    {
        const node = document.createElement(tagName) as MountableElement;
        node.__vcnDetached = true;
        node.__vcnNodes = this;
        
        // This could also be done lazily if reasons (beyond just consistency with 
        // `__vcnNests`) arise:
        for (const attrName in attrs) {
            initAttribute(this, node, attrName, attrs[attrName]);
        }
        
        node.__vcnNests = children;
        
        return node;
    }

    text(data: TextValue): MountableText {
        const text = data instanceof Signal ? data.ref() : data;

        const node = document.createTextNode(text) as MountableText;
        node.__vcnDetached = true;
        node.__vcnNodes = this;
        
        if (data instanceof Signal) {
            addWatchee(node, data, {
                onChange: (newStr) => this.scheduleUpdate(() =>
                    node.replaceData(0, node.length, newStr)
                )
            });
        }
            
        return node;
    }

    forVecnal<T>(vS: Vecnal<T>, itemView: (vS: Signal<T>) => ChildValue): Fragment {
        return new MapFragment(this, vS, itemView);
    }
    
    scheduleUpdate(update: NodeUpdate) { this.updates.push(update); }
    
    private flush() {
        for (const update of this.updates) {
            update();
        }
        this.updates.length = 0;
    }
    
    frame(mutate: () => void) {
        mutate();
        
        window.requestAnimationFrame((_) => this.flush());
    }
    
    jankyFrame(mutate: () => void) {
        mutate();
        
        this.flush();
    }
}

