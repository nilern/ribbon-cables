export {Ctrl};

import type {Reset} from "../dist/prelude.js";
import type {Framer} from "../dist/dom.js";
import {Signal} from "../dist/signal.js";

import {Model} from "./model.js";

class Ctrl {
    constructor(
        private readonly nodes: Framer,
        private readonly modelS: Signal<Model> & Reset<Model>,
        private readonly selectedS: Signal<number | undefined> & Reset<number | undefined>
    ) {}
    
    rebuild(count: number) {
        this.nodes.frame(() => {
            this.modelS.reset(this.modelS.ref().rebuild(count));
            this.selectedS.reset(undefined);
        });
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
    
    swapRows() {
        this.nodes.frame(() => this.modelS.reset(this.modelS.ref().swapRows()));
    }
    
    selectRow(id: number) { this.nodes.frame(() => this.selectedS.reset(id)); }
    
    deleteRow(id: number) {
        this.nodes.frame(() => this.modelS.reset(this.modelS.ref().withoutRow(id)));
    }
}

