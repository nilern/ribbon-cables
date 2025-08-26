export {model, controller};

import type {Reset} from "./prelude.js";
import {eq, str} from "./prelude.js";
import type {Signal} from "./signal.js";
import * as signal from "./signal.js";
import type {Vecnal} from "./vecnal.js";
import * as vecnal from "./vecnal.js";
import * as dom from "./dom.js";
import {el} from "./dom.js";

class Todo {
    constructor(
        public readonly id: number,
        public readonly text: string,
        public readonly isComplete = false
    ) {}
    
    withCompletion(isComplete: boolean): Todo {
        return new Todo(this.id, this.text, isComplete);
    }
};

class Model {
    constructor(
        public readonly nextId = 0,
        public readonly todos: Todo[] = []
    ) {
    
    }
    
    withTodo(text: string, isComplete: boolean): Model {
        return new Model(
            this.nextId + 1,
            [...this.todos, new Todo(this.nextId, text, isComplete)]
        );
    }
    
    withTodoCompleted(id: number, isComplete: boolean): Model {
        return new Model(
            this.nextId,
            this.todos.map((todo) => todo.id !== id
                ? todo
                : todo.withCompletion(isComplete)
            )
        );
    }
    
    withoutTodo(id: number): Model {
        return new Model(
            this.nextId,
            this.todos.filter((todo) => todo.id !== id)
        );
    }
    
    withoutCompleteds(): Model {
        return new Model(
            this.nextId,
            this.todos.filter((todo) => !todo.isComplete)
        );
    }
}

const model = signal.source(eq, new Model()); // Global for REPL testing

// TODO: Limited versions for different components:
class Ctrl {
    constructor(private readonly model: Signal<Model> & Reset<Model>) {}
    
    // TODO: `this.model.swap(...)`:
    
    addTodo(text: string, isComplete = false) {
        this.model.reset(this.model.ref().withTodo(text, isComplete));
    }
    
    setIsComplete(id: number, isComplete: boolean) {
        this.model.reset(this.model.ref().withTodoCompleted(id, isComplete));
    }
    
    clearTodo(id: number) {
        this.model.reset(this.model.ref().withoutTodo(id));
    }
    
    clearCompleteds() {
        this.model.reset(this.model.ref().withoutCompleteds());
    }
}

const controller = new Ctrl(model); // Global for REPL testing

function todosHeader(ctrl: Ctrl): Node {
    function handleKey(e: Event) {
        const event = e as KeyboardEvent;
        if (event.key === "Enter") {
            const input = event.target as HTMLInputElement;
            ctrl.addTodo(input.value.trim());
            input.value = "";
        }
    }

    return el("header", {"class": "header"},
        el("h1", {}, "todos"),
        
        el("input", {"class": "new-todo",
                     "placeholder": "What needs to be done?",
                     "autofocus": "true",
                     "onkeydown": handleKey}));
}

function item(ctrl: Ctrl, todoS: Signal<Todo>): Node {
    function onDestroy(_: Event) { ctrl.clearTodo(todoS.ref().id); }
    
    function onCompletionChange(ev: Event) {
        const input = ev.target! as HTMLInputElement;
        ctrl.setIsComplete(todoS.ref().id, input.checked);
    }
    
    const isCompleteS = signal.map(eq, ({isComplete}: Todo) => isComplete, todoS);
    const isEditingS = signal.source(eq, false);
    const textS = signal.map(eq, ({text}: Todo) => text, todoS);
    
    function startEditing(_: Event) { isEditingS.reset(true); }
    
    const classeS: Signal<string> =
        signal.map2(eq, (isComplete, isEditing) => {
                if (isComplete) {
                    if (isEditing) {
                        return "completed editing";
                    } else {
                        return "completed";
                    }
                } else {
                    if (isEditing) {
                        return "editing";
                    } else {
                        return "";
                    }
                }
            },
            isCompleteS, isEditingS
        );
    const checkedS: Signal<string | undefined> =
        signal.map(eq, (isComplete) => isComplete ? "true" : undefined, isCompleteS);
    const displayEditS: Signal<string> =
        signal.map(eq, (isEditing) => isEditing ? "inline" : "none", isEditingS);

    return el("li", {"class": classeS},
        el("div", {"class": "view"}, 
            el("input", {"class": "toggle",
                         "type": "checkbox",
                         "checked": checkedS,
                         "onchange": onCompletionChange}),
            el("label", {"ondblclick": startEditing},
                textS),
            el("button", {"class": "destroy",
                          "onclick": onDestroy})),
        el("input", {"class": "edit",
                     "display": displayEditS,
                     "value": textS})); // TODO: Interaction
}

function todoList(ctrl: Ctrl, todos: Vecnal<Todo>): Node {
    return el("section", {"class": "main"},
        el("input", {"id": "toggle-all", "class": "toggle-all", "type": "checkbox"}),
        el("label", {"for": "toggle-all"}, "Mark all as complete"),
        
        el("ul", {"class": "todo-list"},
            vecnal.map(eq, (todoS) => item(ctrl, todoS), vecnal.view(todos))))
}

function todoFilter(label: string, path: string, isSelected: Signal<boolean>): Node {
    return el("li", {},
        el("a", {"class": signal.map(eq, (isSelected) => isSelected ? "selected" : "",
                    isSelected),
                 "href": `#${path}`},
             label));
}

const allIsSelected = signal.source(eq, true);

function todosFooter(ctrl: Ctrl, todos: Vecnal<Todo>): Node {
    function onClearCompleteds(_: Event) {
        ctrl.clearCompleteds();
    }
    
    // OPTIMIZE: Add signal versions of `size()` and `at()` in addition to `reduce()`:
    const todoCount = vecnal.reduce(eq, (acc, _) => acc + 1, signal.stable(0), todos);
    
    return el("footer", {"class": "footer"},
        el("span", {"class": "todo-count"},
            el("strong", {}, signal.map(eq, str, todoCount)), " items left"),
        
        el("ul", {"class": "filters"},
            todoFilter("All", "/", allIsSelected), // TODO: Interaction
            todoFilter("Active", "/active", signal.stable(false)), // TODO: Interaction
            todoFilter("Completed", "/completed", signal.stable(false))), // TODO: Interaction
        
        el("button", {"class": "clear-completed",
                      "onclick": onClearCompleteds},
            "Clear completed"));
}

function createUI(ctrl: Ctrl, todos: Vecnal<Todo>): Element {
    return el("section", {"class": "todoapp"},
        todosHeader(ctrl),
                         
        todoList(ctrl, todos),
                
        todosFooter(ctrl, todos));
}

(function (window) {
	'use strict';

    const todos = vecnal.imux(eq, signal.map(eq, (model: Model) => model.todos, model));
	const ui = createUI(controller, todos);
	const body = document.body;
	dom.insertBefore(body, ui, body.children[0]);
})(window);

