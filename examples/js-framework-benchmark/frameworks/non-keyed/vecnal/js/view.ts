export {createUI};

import {eq} from "../dist/prelude.js"; // HACK
import type {NodeFactory, EventHandler} from "../dist/dom.js";
import {Signal} from "../dist/signal.js";
import {Vecnal} from "../dist/vecnal.js";
import * as vec from "../dist/vecnal.js";

import {Datum, Model} from "./model.js";
import {Ctrl} from "./controller.js";

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
    onClear: () => void,
    onSwapRows: () => void
};

function benchButtons(
    nodes: NodeFactory, {onBuild, onAdd, onUpdate, onClear, onSwapRows}: BenchButtonsProps
): Node {
    return nodes.el("div", {class: "col-md-6"},
        nodes.el("div", {class: "row"},
           benchButton(nodes, "run", "Create 1,000 rows", (_) => onBuild(1000)),
           benchButton(nodes, "runlots", "Create 10,000 rows", (_) => onBuild(10000)),
           benchButton(nodes, "add", "Append 1,000 rows", (_) => onAdd(1000)),
           benchButton(nodes, "update", "Update every 10th row", (_) => onUpdate(10)),
           benchButton(nodes, "clear", "Clear", (_) => onClear()),
           benchButton(nodes, "swaprows", "Swap rows", (_) => onSwapRows())));
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
                    onClear: () => ctrl.clear(),
                    onSwapRows: () => ctrl.swapRows()
                }))),
                
        table(nodes, {
            dataS: vec.imux(eq, modelS.map(eq, (model) => model.data)),
            selectedS,
            onRowClick: (id) => ctrl.selectRow(id),
            onRowDelete: id => ctrl.deleteRow(id)
        }),
        
        nodes.el("span", {
            class: "preloadicon glyphicon glyphicon-remove",
            'aria-hidden': "true"}));
}

