"use strict";

import * as dom from "../../../lib/dom.js";
import type {NodeFactory, EventHandler} from "../../../lib/dom.js";

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

function benchButtons(nodes: NodeFactory): Node {
    return nodes.el("div", {class: "col-md-6"},
        nodes.el("div", {class: "row"},
           benchButton(nodes, "run", "Create 1,000 rows", (_) => {}),
           benchButton(nodes, "runlots", "Create 10,000 rows", (_) => {}),
           benchButton(nodes, "add", "Append 1,000 rows", (_) => {}),
           benchButton(nodes, "update", "Update every 10th row", (_) => {}),
           benchButton(nodes, "clear", "Clear", (_) => {}),
           benchButton(nodes, "swaprows", "Swap rows", (_) => {})));
}

function createUI(nodes: NodeFactory): Node {
    return nodes.el("div", {class: "container"},
        nodes.el("div", {class: "jumbotron"},
            nodes.el("div", {class: "row"},
                heading(nodes),
                benchButtons(nodes))));
}

(() => {
    const nodeManager = new dom.NodeManager();
    const ui = createUI(nodeManager);
    const body = document.body;
    dom.insertBefore(body, ui, body.children[0]);
})();

