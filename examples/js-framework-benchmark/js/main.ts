"use strict";

import * as dom from "../../../lib/dom.js";
import type {NodeFactory} from "../../../lib/dom.js";

function createUI(nodes: NodeFactory) {
    return nodes.el("div", {class: "container"});
}

(() => {
    const nodeManager = new dom.NodeManager();
    const ui = createUI(nodeManager);
    const body = document.body;
    dom.insertBefore(body, ui, body.children[0]);
})();

