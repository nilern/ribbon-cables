export type {
    MountableNode, MountableElement, MountableText,
    AttributeString, BaseAttributeValue, StyleAttributeValue, AttributeValue,
    EventHandler, InitAttrs,
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

/** A (stable or changing) value that is convertible to a text node. */
type TextValue = string | Signal<string>;

/** An instantaneous value of a node attribute. */
type AttributeString = string | undefined;

/** A (stable or changing) value that is convertible to a node attribute. */
type BaseAttributeValue = AttributeString | Signal<AttributeString>;

/** A generic event handler function. */
type EventHandler = (event: Event) => void;

/** An instantaneous value of the style attribute. */
type StyleAttributeValue = {[key: string]: BaseAttributeValue};

/** Any value that is convertible to a node attribute. */
type AttributeValue = BaseAttributeValue | EventHandler | StyleAttributeValue;

/** Attribute initializer map. */
type InitAttrs = {[key: string]: AttributeValue};

/** A value that is convertible to a child node. */
type ChildValue = MountableNode | TextValue; // TODO: `Signal<MountableNode>`

/** A value that is convertible to a child node or multiple child nodes. */
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
// TODO: Most of these props are actually not optional (after checked cast):
// HACKs for forcibly shoving these properties into DOM nodes:
/** A {@link Node} that we can mount to the DOM (via e.g. {@link appendChild}). */
interface MountableNode extends Node {
    __vcnDetached?: boolean,
    __vcnNodes?: NodeFactory & UpdateQueue,
    __vcnWatchees?: Watchees
}

/** A {@link MountableNode} that is an {@link Element}. */
interface MountableElement extends Element {
    __vcnDetached?: boolean,
    __vcnNodes?: NodeFactory & UpdateQueue,
    __vcnWatchees?: Watchees,
    __vcnMultiWatchees?: MultiWatchees,
    __vcnAttrs?: InitAttrs,
    __vcnNests?: readonly Nest[],
    __vcnOffsets?: number[]
}

/** A {@link MountableNode} that is a {@link Text} node. */
interface MountableText extends Text {
    __vcnDetached?: boolean,
    __vcnNodes?: NodeFactory & UpdateQueue,
    __vcnWatchees?: Watchees,
    __vcnData?: Signal<string>
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

/** A {@link Nest} that produces the initial children via {@link Fragment.hatchChildren} and
    notifies of updates to them via the {@link IndexedObservable} interface. */
abstract class Fragment implements IndexedObservable<Node> {
    /** Produce the initial list of children. */
    abstract hatchChildren(): Iterable<MountableNode>;
    
    abstract addISubscriber(subscriber: IndexedSubscriber<Node>): void;
    abstract removeISubscriber(subscriber: IndexedSubscriber<Node>): void;
    abstract notifySubstitute(i: number, _: Node, newNode: Node): void;
    abstract notifyInsert(i: number, node: Node): void;
    abstract notifyRemove(i: number): void;
}

// TODO: Use mixin for `MapFragment.prototype.subscribers`:
class MapFragment<T> extends Fragment implements IndexedSubscriber<T> {
    private readonly subscribers = new Set<IndexedSubscriber<Node>>();
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
        
        const attrs = elem.__vcnAttrs;
        if (attrs) {
            for (const attrName in attrs) {
                initAttribute(elem.__vcnNodes!, node, attrName, attrs[attrName]);
            }
        }
    
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
    } else if (node instanceof Text) {
        const text = node as MountableText;
        
        const data = text.__vcnData;
        if (data) {
            text.data = data.ref();
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

/** Append a (possibly) reactive child node to parent element. */
function appendChild(parent: Element, child: Node) {
    parent.appendChild(child);
    if (isMounted(parent)) {
        mount(child);
    }
}

/** Insert a (possibly) reactive child node to parent element before successor. */
function insertBefore(parent: Element, child: Node, successor: Node) {
    parent.insertBefore(child, successor);
    if (isMounted(parent)) {
        mount(child);
    }
}

/** Remove a (possibly) reactive child node from parent element. */
function removeChild(parent: Element, child: Node) {
    parent.removeChild(child);
    if (isMounted(parent)) {
        unmount(child);
    }
}

/** Replace the (possibly) reactive old child node of parent with a new one. */
function replaceChild(parent: Element, child: Node, oldChild: Node) {
    parent.replaceChild(child, oldChild);
    if (isMounted(parent)) {
        unmount(oldChild);
        mount(child);
    }
}

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

/** An object that can create reactive nodes and reactive lists of reactive nodes. */
interface NodeFactory {
    /** Create a reactive element with tag tagName and attributes and elements created (on mount to
        visible DOM) from attrs and children respectively. */
    el: (tagName: string, attrs: InitAttrs, ...children: Nest[]) => MountableElement;
    
    /** Create a (possibly) reactive text node with text from data. */
    text: (data: TextValue) => MountableText;
    
    /** Create a reactive list of child nodes that are created (on mount to visible DOM or changes
        to vS thereafter) from signals tracking the elements of vS. */
    forVecnal: <T>(vS: Vecnal<T>, itemView: (vS: Signal<T>) => ChildValue) => Fragment;
}

type NodeUpdate = () => void;

interface UpdateQueue {
    scheduleUpdate: (update: NodeUpdate) => void;
}

// TODO: Statically ensure that mutations are contained inside this (by e.g.
// passing a Witness/Capability to `mutate`)?:
/** A function that calls mutate to generate DOM changes and commits those changes to the DOM in
bulk. */
type FramingFn = (mutate: () => void) => void;

/** Allows committing changes to the DOM. */
interface Framer {
    /** A {@link FramingFn} that commits the DOM changes on `requestAnimationFrame`. */
    frame: FramingFn,
    
    /** A {@link FramingFn} that does not use `requestAnimationFrame` (for e.g. testing with an
        emulated DOM). */
    jankyFrame: FramingFn
}

/** A concrete implementation of {@link NodeFactory} and {@link Framer} for all your high level
    DOM manipulation needs. */
class NodeManager implements NodeFactory, UpdateQueue, Framer {
    private readonly updates = [] as NodeUpdate[];

    constructor() {}

    el(tagName: string, attrs: InitAttrs, ...children: Nest[]): MountableElement {
        const node = document.createElement(tagName) as MountableElement;
        node.__vcnDetached = true;
        node.__vcnNodes = this;
        node.__vcnAttrs = attrs;
        node.__vcnNests = children;
        
        return node;
    }

    text(data: TextValue): MountableText {
        const text = data instanceof Signal ? "" : data;

        const node = document.createTextNode(text) as MountableText;
        node.__vcnDetached = true;
        node.__vcnNodes = this;
        
        if (data instanceof Signal) {
            node.__vcnData = data;
            
            addWatchee(node, data, {
                onChange: (newStr) => this.scheduleUpdate(() =>
                    node.data = newStr
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
        // The update functions can generate more updates so using indexed loop
        // without `const len = this.updates.length` to surely get to the actual end:
        for (let i = 0; i < this.updates.length; ++i) {
            this.updates[i]();
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

