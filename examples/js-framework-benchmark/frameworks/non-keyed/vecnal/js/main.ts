import {eq} from "../dist/prelude.js"; // HACK
import * as dom from "../dist/dom.js";
import * as sig from "../dist/signal.js";

import {Model} from "./model.js";
import {Ctrl} from "./controller.js";
import {createUI} from "./view.js";

(() => {
    const nodeManager = new dom.NodeManager();
    
    const modelS = sig.source(eq, new Model());
    const selectedS = sig.source<number | undefined>(eq, undefined);
    
    const ctrl = new Ctrl(nodeManager, modelS, selectedS);
    
    const ui = createUI(nodeManager, modelS, selectedS, ctrl);
    const body = document.body;
    dom.insertBefore(body, ui, body.children[0]);
})();

