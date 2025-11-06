"use strict";

import * as dom from "../../../lib/dom.js";
import type {NodeFactory} from "../../../lib/dom.js";

function heading(nodes: NodeFactory): Node {
    return nodes.el("row", {class: "col-md-6"},
        nodes.el("h1", {}, "RibbonCables"));
}

function createUI(nodes: NodeFactory): Node {
    return nodes.el("div", {class: "container"},
        nodes.el("div", {class: "jumbotron"},
            heading(nodes)));
}

(() => {
    const nodeManager = new dom.NodeManager();
    const ui = createUI(nodeManager);
    const body = document.body;
    dom.insertBefore(body, ui, body.children[0]);
})();

