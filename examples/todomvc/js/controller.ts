export {Ctrl};

import {Model} from "./model.js";
import * as storage from "./storage.js";

import type {Reset} from "../dist/prelude.js";
import type {Signal} from "../dist/signal.js";
import type {Framer} from "../dist/dom.js";

// TODO: Limited versions for different components:
class Ctrl {
    constructor(
        private readonly framer: Framer,
        private readonly modelS: Signal<Model> & Reset<Model>
    ) {}
    
    private commit(newModel: Model) {
        storage.save(newModel);
        
        this.framer.frame(() => this.modelS.reset(newModel));
    }
    
    addTodo(text: string, isComplete = false) {
        this.commit(this.modelS.ref().withTodo(text, isComplete));
    }
    
    setIsComplete(id: number, isComplete: boolean) {
        this.commit(this.modelS.ref().withTodoCompleted(id, isComplete));
    }
    
    setText(id: number, text: string) {
        this.commit(this.modelS.ref().withTodoText(id, text));
    }
    
    clearTodo(id: number) {
        this.commit(this.modelS.ref().withoutTodo(id));
    }
    
    toggleAll(areCompleted: boolean) {
        this.commit(this.modelS.ref().withAllCompleted(areCompleted));
    }
    
    clearCompleteds() {
        this.commit(this.modelS.ref().withoutCompleteds());
    }
}
