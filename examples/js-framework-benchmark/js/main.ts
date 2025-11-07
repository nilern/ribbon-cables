"use strict";

import type {Reset} from "../../../lib/prelude.js";
import {eq, ImmArrayAdapter} from "../../../lib/prelude.js"; // HACK
import type {Framer} from "../../../lib/dom.js";
import * as dom from "../../../lib/dom.js";
import type {NodeFactory, EventHandler} from "../../../lib/dom.js";
import {Signal} from "../../../lib/signal.js";
import * as sig from "../../../lib/signal.js";
import {Vecnal} from "../../../lib/vecnal.js";
import * as vec from "../../../lib/vecnal.js";

function randNat(max: number) { return Math.floor(Math.random() * max); }

const adjectives: readonly string[] = [
  "pretty",
  "large",
  "big",
  "small",
  "tall",
  "short",
  "long",
  "handsome",
  "plain",
  "quaint",
  "clean",
  "elegant",
  "easy",
  "angry",
  "crazy",
  "helpful",
  "mushy",
  "odd",
  "unsightly",
  "adorable",
  "important",
  "inexpensive",
  "cheap",
  "expensive",
  "fancy",
];

const colours: readonly string[] = [
    "red",
    "yellow",
    "blue",
    "green",
    "pink",
    "brown",
    "purple",
    "brown",
    "white",
    "black",
    "orange"
];

const nouns: readonly string[] = [
  "table",
  "chair",
  "house",
  "bbq",
  "desk",
  "car",
  "pony",
  "cookie",
  "sandwich",
  "burger",
  "pizza",
  "mouse",
  "keyboard",
];

function randLabel(): string {
    return adjectives[randNat(adjectives.length)] + " " +
        colours[randNat(colours.length)] + " " +
        nouns[randNat(nouns.length)];
}

class Datum {
    constructor(
        public readonly id: number,
        public readonly label: string
    ) {}
    
    withLabel(label: string): Datum { return new Datum(this.id, label); }
}

class Model {
    constructor(
        public readonly nextId: number = 0,
        public readonly data: readonly Datum[] = []
    ) {}
    
    rebuild(count: number): Model {
        let nextId = this.nextId;
        const data = new Array(count);
        
        for (let i = 0; i < count; ++i) {
            data[i] = new Datum(nextId++, randLabel());
        }
        
        return new Model(nextId, data);
    }
    
    append(count: number): Model {
        let nextId = this.nextId;
        const data = [...this.data];
        const oldLen = this.data.length;
        const len = data.length = oldLen + count;
        
        for (let i = oldLen; i < len; ++i) {
            data[i] = new Datum(nextId++, randLabel());
        }
        
        return new Model(nextId, data);
    }
    
    updateNth(stride: number): Model {
        const data = [...this.data];
        
        const len = data.length;
        for (let i = 0; i < len; i += stride) {
            const datum = data[i];
            data[i] = datum.withLabel(datum.label + " !!!"); // OPTIMIZE
        }
        
        return new Model(this.nextId, data);
    }
    
    clear(): Model { return new Model(this.nextId); }
    
    withoutRow(id: number): Model {
        return new Model(
            this.nextId,
            this.data.filter((datum) => datum.id !== id)
        );
    }
}

class Ctrl {
    constructor(
        private readonly nodes: Framer,
        private readonly modelS: Signal<Model> & Reset<Model>,
        private readonly selectedS: Signal<number | undefined> & Reset<number | undefined>
    ) {}
    
    rebuild(count: number) {
        this.nodes.frame(() => this.modelS.reset(this.modelS.ref().rebuild(count)));
    }
    
    append(count: number) {
        this.nodes.frame(() => this.modelS.reset(this.modelS.ref().append(count)));
    }
    
    updateNth(stride: number) {
        this.nodes.frame(() => this.modelS.reset(this.modelS.ref().updateNth(stride)));
    }
    
    clear() {
        this.nodes.frame(() => {
            this.modelS.reset(this.modelS.ref().clear());
            this.selectedS.reset(undefined);
        });
    }
    
    selectRow(id: number) { this.nodes.frame(() => this.selectedS.reset(id)); }
    
    deleteRow(id: number) {
        this.nodes.frame(() => this.modelS.reset(this.modelS.ref().withoutRow(id)));
    }
}

function heading(nodes: NodeFactory): Node {
    return nodes.el("row", {class: "col-md-6"},
        nodes.el("h1", {}, "RibbonCables"));
}
             
function benchButton(nodes: NodeFactory, id: string, label: string, onClick: EventHandler): Node {
    return nodes.el("div", {class: "col-sm-6 smallpad"},
        nodes.el("button",  {
            class: "btn btn-primary btn-block",
            type: "button",
            id: id,
            onclick: onClick
        }, label))
}

type BenchButtonsProps = {
    onBuild: (count: number) => void,
    onAdd: (count: number) => void,
    onUpdate: (stride: number) => void,
    onClear: () => void
};

function benchButtons(nodes: NodeFactory, {onBuild, onAdd, onUpdate, onClear}: BenchButtonsProps
): Node {
    return nodes.el("div", {class: "col-md-6"},
        nodes.el("div", {class: "row"},
           benchButton(nodes, "run", "Create 1,000 rows", (_) => onBuild(1000)),
           benchButton(nodes, "runlots", "Create 10,000 rows", (_) => onBuild(10000)),
           benchButton(nodes, "add", "Append 1,000 rows", (_) => onAdd(1000)),
           benchButton(nodes, "update", "Update every 10th row", (_) => onUpdate(10)),
           benchButton(nodes, "clear", "Clear", (_) => onClear()),
           benchButton(nodes, "swaprows", "Swap rows", (_) => {})));
}
 
type RowProps = {
    datumS: Signal<Datum>,
    selectedS: Signal<number | undefined>
    onClick: (id: number) => void,
    onDelete: (id: number) => void
};
 
function row(nodes: NodeFactory, {datumS, selectedS, onClick, onDelete}: RowProps): Node {
    const idS = datumS.map<number>(eq, (datum) => datum.id);
    const isSelectedS = datumS.map2<boolean, number | undefined>(
        eq,
        (datum, selected) => datum.id === selected,
        selectedS
    );

    return nodes.el("tr",
        {class: isSelectedS.map(eq, (isSelected) => isSelected ? "danger" : undefined)},
        nodes.el("td", {class: "col-md-1"}, idS.map(eq, (id) => id.toString())),
        nodes.el("td", {class: "col-md-4"},
            nodes.el("a", {onclick: (_) => onClick(idS.ref())},
                datumS.map(eq, (datum) => datum.label))),
        nodes.el("td", {class: "col-md-1"},
            nodes.el("a", {onclick: (_) => onDelete(idS.ref())},
                nodes.el("span", {
                    class: "glyphicon glyphicon-remove",
                    'aria-hidden': "true"
                }))),
        nodes.el("td", {class: "col-md-6"}));
}

type TableProps = {
    dataS: Vecnal<Datum>,
    selectedS: Signal<number | undefined>,
    onRowClick: (id: number) => void,
    onRowDelete: (id: number) => void
};

function table(nodes: NodeFactory, {dataS, selectedS, onRowClick, onRowDelete}: TableProps): Node {
    return nodes.el("table", {class: "table table-hover table-striped test-data"},
        nodes.el("tbody", {},
            nodes.forVecnal(dataS, (datumS) =>
                row(nodes, {
                    datumS, selectedS,
                    onClick: onRowClick, onDelete: onRowDelete
                }))));
}

function createUI(
    nodes: NodeFactory,
    modelS: Signal<Model>, selectedS: Signal<number | undefined>,
    ctrl: Ctrl
): Node {
    return nodes.el("div", {class: "container"},
        nodes.el("div", {class: "jumbotron"},
            nodes.el("div", {class: "row"},
                heading(nodes),
                benchButtons(nodes, {
                    onBuild: (count) => ctrl.rebuild(count),
                    onAdd: (count) => ctrl.append(count),
                    onUpdate: (stride) => ctrl.updateNth(stride),
                    onClear: () => ctrl.clear()
                }))),
                
        table(nodes, {
            dataS: vec.imux(eq, modelS.map(eq, (model) => new ImmArrayAdapter(model.data))),
            selectedS,
            onRowClick: (id) => ctrl.selectRow(id),
            onRowDelete: id => ctrl.deleteRow(id)
        }),
        
        nodes.el("span", {
            class: "preloadicon glyphicon glyphicon-remove",
            'aria-hidden': "true"}));
}

(() => {
    const nodeManager = new dom.NodeManager();
    
    const modelS = sig.source(eq, new Model());
    const selectedS = sig.source<number | undefined>(eq, undefined);
    
    const ctrl = new Ctrl(nodeManager, modelS, selectedS);
    
    const ui = createUI(nodeManager, modelS, selectedS, ctrl);
    const body = document.body;
    dom.insertBefore(body, ui, body.children[0]);
})();

