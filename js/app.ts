export {model, controller};

import type {Reset} from "./prelude.js";
import {ImmArrayAdapter, eq, str} from "./prelude.js";
import type {Signal} from "./signal.js";
import * as signal from "./signal.js";
import type {Vecnal} from "./vecnal.js";
import * as vecnal from "./vecnal.js";
import * as dom from "./dom.js";
import {el} from "./dom.js";

type Routes = {
    [k: string]: () => void
};

interface Router {
    init(): void;
};

const createRouter = (window as {[k: string]: any})["Router"] as (routes: Routes) => Router;

// TODO: More lightweight approach to immutable record:
class Todo {
    constructor(
        public readonly id: number,
        public readonly text: string,
        public readonly isComplete = false
    ) {}
    
    withCompletion(isComplete: boolean): Todo {
        return new Todo(this.id, this.text, isComplete);
    }
    
    withText(text: string): Todo {
        return new Todo(this.id, text, this.isComplete);
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
    
    withTodoText(id: number, text: string): Model {
        return new Model(
            this.nextId,
            this.todos.map((todo) => todo.id !== id
                ? todo
                : todo.withText(text)
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

type Filter = "all" | "active" | "completed";

function filterFn(filter: Filter): (todo: Todo) => boolean {
    if (filter === "all") {
        return (_: Todo) => true;
    } else if (filter === "active") {
        return ({isComplete}: Todo) => !isComplete;
    } else if (filter === "completed") {
        return ({isComplete}: Todo) => isComplete;
    } else {
        const exhaust: never = filter;
        return exhaust;
    }
}

// Global for REPL testing:
const filterS: Signal<Filter> & Reset<Filter> = signal.source<Filter>(eq, "all");

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
    
    setText(id: number, text: string) {
        this.model.reset(this.model.ref().withTodoText(id, text));
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

function itemCheckbox(
    isCompleteS: Signal<boolean>, onCompletionChange: (isComplete: boolean) => void
): Node {
    const checkedS: Signal<string | undefined> =
        isCompleteS.map(eq, (isComplete) => isComplete ? "true" : undefined);
        
    return el("input", {
        "class": "toggle",
        "type": "checkbox",
        "checked": checkedS,
        "onchange": (ev: Event) => {
            const event = ev as InputEvent;
            const input = event.target as HTMLInputElement;
            onCompletionChange(input.checked);
        }
    });
}

class ItemEditCtrl {
    constructor(
        private readonly tmpTextS: Signal<string> & Reset<string>,
        private readonly onFinish: (finalText: string) => void
    ) {}
    
    init(text: string) { this.setText(text); }
    
    setText(text: string) { this.tmpTextS.reset(text); }
    
    finish() { this.onFinish(this.tmpTextS.ref()); }
}

// TODO: Interaction:
function itemEditor(ctrl: ItemEditCtrl, isEditingS: Signal<boolean>, tmpTextS: Signal<string>): Node {
    const displayEditS: Signal<string> =
        isEditingS.map(eq, (isEditing) => isEditing ? "inline" : "none");

    return el("input", {
        "class": "edit",
        "display": displayEditS,
        "value": tmpTextS,
        "onchange": (ev: Event) => {
            const event = ev as InputEvent;
            const input = event.target as HTMLInputElement;
            ctrl.setText(input.value);
        },
        "onblur": (_) => ctrl.finish()
    });
}

function item(ctrl: Ctrl, todoS: Signal<Todo>): Node {
    function onDestroy(_: Event) { ctrl.clearTodo(todoS.ref().id); }
    
    function onCompletionChange(isComplete: boolean) {
        ctrl.setIsComplete(todoS.ref().id, isComplete);
    }
    
    function startEditing(_: Event) {
        isEditingS.reset(true);
        editCtrl.init(textS.ref());
    }
    
    function finishEditing(finalText: string) {
        ctrl.setText(todoS.ref().id, finalText);
        isEditingS.reset(false);
    }
    
    const isCompleteS = todoS.map(eq, ({isComplete}: Todo) => isComplete);
    const isEditingS = signal.source(eq, false);
    const textS = todoS.map(eq, ({text}: Todo) => text);
    
    const classeS: Signal<string> =
        isCompleteS.map2(eq, (isComplete, isEditing) => {
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
            isEditingS
        );
        
    const tmpTextS = signal.source(eq, textS.ref());
    const editCtrl = new ItemEditCtrl(tmpTextS, finishEditing);

    return el("li", {"class": classeS},
        el("div", {"class": "view"}, 
            itemCheckbox(isCompleteS, onCompletionChange),
                         
            el("label", {"ondblclick": startEditing}, textS),
                
            el("button", {"class": "destroy",
                          "onclick": onDestroy})),
        itemEditor(editCtrl, isEditingS, tmpTextS));
}

function todoList(ctrl: Ctrl, todoS: Vecnal<Todo>): Node {
    return el("section", {"class": "main"},
        el("input", {"id": "toggle-all", "class": "toggle-all", "type": "checkbox"}),
        el("label", {"for": "toggle-all"}, "Mark all as complete"),
        
        el("ul", {"class": "todo-list"},
            todoS
                .view()
                .map(eq, (todoS) => item(ctrl, todoS))))
}

function todoFilter(label: string, path: string, isSelected: Signal<boolean>): Node {
    return el("li", {},
        el("a", {"class": isSelected.map(eq, (isSelected) => isSelected ? "selected" : ""),
                 "href": `#${path}`},
             label));
}

function todosFooter(ctrl: Ctrl, todoCount: Signal<number>, filterS: Signal<Filter>): Node {
    function onClearCompleteds(_: Event) {
        ctrl.clearCompleteds();
    }
    
    const allIsSelected: Signal<boolean> = filterS.map(eq, (v) => v === "all");
    const activeIsSelected: Signal<boolean> = filterS.map(eq, (v) => v === "active");
    const completedIsSelected: Signal<boolean> = filterS.map(eq, (v) => v === "completed");
    
    return el("footer", {"class": "footer"},
        el("span", {"class": "todo-count"},
            el("strong", {}, todoCount.map(eq, str)), " items left"),
        
        el("ul", {"class": "filters"},
            todoFilter("All", "/", allIsSelected), // TODO: Interaction
            todoFilter("Active", "/active", activeIsSelected), // TODO: Interaction
            todoFilter("Completed", "/completed", completedIsSelected)), // TODO: Interaction
        
        el("button", {"class": "clear-completed",
                      "onclick": onClearCompleteds},
            "Clear completed"));
}

function createUI(ctrl: Ctrl, todoS: Signal<Todo[]>, filterS: Signal<Filter>): Element {
    const visibleTodoS: Signal<ImmArrayAdapter<Todo>> = todoS.map2(eq,
        (todos, filter) => new ImmArrayAdapter(todos.filter(filterFn(filter))), // OPTIMIZE
        filterS);
    const todoCount: Signal<number> = todoS.map(eq, (todos) => todos.length);
    
    return el("section", {"class": "todoapp"},
        todosHeader(ctrl),
                         
        todoList(ctrl, vecnal.imux(eq, visibleTodoS)),
                
        todosFooter(ctrl, todoCount, filterS));
}

// TODO: Do not hammer `filterS` directly from here:
const routes = {
    "/": () => filterS.reset("all"),
    "/active": () => filterS.reset("active"),
    "/completed": () => filterS.reset("completed")
};

(function (window) {
	'use strict';

    const todos = model.map(eq, (model: Model) => model.todos);
	const ui = createUI(controller, todos, filterS);
	const body = document.body;
	dom.insertBefore(body, ui, body.children[0]);
	
	const router = createRouter(routes);
	router.init();
})(window);

