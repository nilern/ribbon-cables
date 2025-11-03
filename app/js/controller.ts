export {Ctrl};

import {Model} from "./model.js";

import type {Reset} from "../../js/prelude.js";
import type {Signal} from "../../js/signal.js";
import type {Framer} from "../../js/dom.js";

// TODO: Limited versions for different components:
class Ctrl {
    constructor(
        private readonly framer: Framer,
        private readonly model: Signal<Model> & Reset<Model>
    ) {}
    
    // TODO: `this.model.swap(...)`:
    
    addTodo(text: string, isComplete = false) {
        this.framer.frame(() =>
            this.model.reset(this.model.ref().withTodo(text, isComplete))
        );
    }
    
    setIsComplete(id: number, isComplete: boolean) {
        this.framer.frame(() =>
            this.model.reset(this.model.ref().withTodoCompleted(id, isComplete))
        );
    }
    
    setText(id: number, text: string) {
        this.framer.frame(() =>
            this.model.reset(this.model.ref().withTodoText(id, text))
        );
    }
    
    clearTodo(id: number) {
        this.framer.frame(() =>
            this.model.reset(this.model.ref().withoutTodo(id))
        );
    }
    
    toggleAll(areCompleted: boolean) {
        this.framer.frame(() =>
            this.model.reset(this.model.ref().withAllCompleted(areCompleted))
        );
    }
    
    clearCompleteds() {
        this.framer.frame(() =>
            this.model.reset(this.model.ref().withoutCompleteds())
        );
    }
}
