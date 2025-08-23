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
    
    withoutTodo(id: number): Model {
        return new Model(
            this.nextId,
            this.todos.filter((todo) => todo.id !== id)
        )
    }
}

const model = signal.source(eq, new Model()); // Global for REPL testing

// TODO: Limited versions for different components:
class Ctrl {
    constructor(private readonly model: Signal<Model> & Reset<Model>) {}
    
    addTodo(text: string, isComplete = false) {
        this.model.reset(this.model.ref().withTodo(text, isComplete));
    }
    
    clearTodo(id: number) {
        this.model.reset(this.model.ref().withoutTodo(id));
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
    const isCompleteS = signal.map(eq, ({isComplete}: Todo) => isComplete, todoS);
    const textS = signal.map(eq, ({text}: Todo) => text, todoS);
    
    const classeS: Signal<string> =
        signal.map(eq, (isComplete) => isComplete ? "completed" : "", isCompleteS);
    const checkedS: Signal<string | undefined> =
        signal.map(eq, (isComplete) => isComplete ? "true" : undefined, isCompleteS);
        
    function onDestroy(_: Event) {
        ctrl.clearTodo(todoS.ref().id);
    }

    return el("li", {"class": classeS},
        el("div", {"class": "view"}, 
            el("input", {"class": "toggle",
                         "type": "checkbox",
                         "checked": checkedS}), // TODO: Interaction
            el("label", {}, textS),
            el("button", {"class": "destroy",
                          "onclick": onDestroy})),
        el("input", {"class": "edit", "value": textS})); // TODO: Interaction
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

function todosFooter(todos: Vecnal<Todo>): Node {
    // OPTIMIZE: Add signal versions of `size()` and `at()` in addition to `reduce()`:
    const todoCount = vecnal.reduce(eq, (acc, _) => acc + 1, signal.stable(0), todos);
    
    return el("footer", {"class": "footer"},
        el("span", {"class": "todo-count"},
            el("strong", {}, signal.map(eq, str, todoCount)), " items left"),
        
        el("ul", {"class": "filters"},
            todoFilter("All", "/", allIsSelected), // TODO: Interaction
            todoFilter("Active", "/active", signal.stable(false)), // TODO: Interaction
            todoFilter("Completed", "/completed", signal.stable(false))), // TODO: Interaction
        
        el("button", {"class": "clear-completed"}, "Clear completed")); // TODO: Interaction
}

function createUI(ctrl: Ctrl, todos: Vecnal<Todo>): Element {
    return el("section", {"class": "todoapp"},
        todosHeader(ctrl),
                         
        todoList(ctrl, todos),
                
        todosFooter(todos));
}

(function (window) {
	'use strict';

    const todos = vecnal.imux(eq, signal.map(eq, (model: Model) => model.todos, model));
	const ui = createUI(controller, todos);
	const body = document.body;
	dom.insertBefore(body, ui, body.children[0]);
})(window);

