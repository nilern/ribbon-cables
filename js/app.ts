import type {Spliceable} from "./prelude.js";
import {eq, str} from "./prelude.js";
import type {Signal} from "./signal.js";
import * as signal from "./signal.js";
import type {Vecnal} from "./vecnal.js";
import * as vecnal from "./vecnal.js";
import * as dom from "./dom.js";
import {el} from "./dom.js";

class Todo {
    constructor(
        public readonly text: string,
        public readonly isComplete = false
    ) {}
};

const todos = vecnal.source<Todo>(eq, []); // Global for REPL testing

function todosHeader(todos: Vecnal<Todo> & Spliceable<Todo>): Node {
    function handleKey(e: Event) {
        const event = e as KeyboardEvent;
        if (event.key === "Enter") {
            const input = event.target as HTMLInputElement;
            todos.insert(todos.size(), new Todo(input.value.trim())); // TODO: Add `todos.push()`
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

function item(todoS: Signal<Todo>): Node {
    const isCompleteS = signal.map(eq, ({isComplete}: Todo) => isComplete, todoS);
    const textS = signal.map(eq, ({text}: Todo) => text, todoS);
    
    const classeS: Signal<string> =
        signal.map(eq, (isComplete) => isComplete ? "completed" : "", isCompleteS);
    const checkedS: Signal<string | undefined> =
        signal.map(eq, (isComplete) => isComplete ? "true" : undefined, isCompleteS);

    return el("li", {"class": classeS},
        el("div", {"class": "view"}, 
            el("input", {"class": "toggle",
                         "type": "checkbox",
                         "checked": checkedS}), // TODO: Interaction
            el("label", {}, textS),
            el("button", {"class": "destroy"})), // TODO: Interaction
        el("input", {"class": "edit", "value": textS})); // TODO: Interaction
}

function todoList(todos: Vecnal<Todo>): Node {
    return el("section", {"class": "main"},
        el("input", {"id": "toggle-all", "class": "toggle-all", "type": "checkbox"}),
        el("label", {"for": "toggle-all"}, "Mark all as complete"),
        
        el("ul", {"class": "todo-list"},
            vecnal.map(eq, item, vecnal.view(todos))))
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

function createUI(todos: Vecnal<Todo> & Spliceable<Todo>): Element {
    return el("section", {"class": "todoapp"},
        todosHeader(todos),
                         
        todoList(todos),
                
        todosFooter(todos));
}

(function (window) {
	'use strict';

	const ui = createUI(todos);
	const body = document.body;
	dom.insertBefore(body, ui, body.children[0]);
})(window);

