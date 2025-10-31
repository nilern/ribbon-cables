export {model, controller};

import type {Reset} from "../js/prelude.js";
import {ImmArrayAdapter, eq, str} from "../js/prelude.js";
import type {Signal} from "../js/signal.js";
import * as signal from "../js/signal.js";
import type {Vecnal} from "../js/vecnal.js";
import * as vecnal from "../js/vecnal.js";
import * as dom from "../js/dom.js";
import type {NodeFactory, Framer} from "../js/dom.js";
import {NodeManager} from "../js/dom.js";

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
        public readonly todos: readonly Todo[] = []
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
    
    withAllCompleted(areCompleted: boolean): Model {
        return new Model(
            this.nextId,
            this.todos.map((todo) => todo.withCompletion(areCompleted))
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

const nodeManager = new NodeManager(); // Global for REPL testing

const controller = new Ctrl(nodeManager, model); // Global for REPL testing

function todosHeader(nodes: NodeFactory, ctrl: Ctrl): Node {
    function handleKey(e: Event) {
        const event = e as KeyboardEvent;
        if (event.key === "Enter") {
            const input = event.target as HTMLInputElement;
            ctrl.addTodo(input.value.trim());
            input.value = "";
        }
    }

    return nodes.el("header", {"class": "header"},
        nodes.el("h1", {}, "todos"),
        
        nodes.el("input", {"class": "new-todo",
                     "placeholder": "What needs to be done?",
                     "autofocus": "true",
                     "onkeydown": handleKey}));
}

function itemCheckbox(nodes: NodeFactory, isCompleteS: Signal<boolean>,
    onCompletionChange: (isComplete: boolean) => void
): Node {
    const checkedS: Signal<string | undefined> =
        isCompleteS.map(eq, (isComplete) => isComplete ? "true" : undefined);
        
    return nodes.el("input", {
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
        private readonly framer: Framer,
        private readonly tmpTextS: Signal<string> & Reset<string>,
        private readonly onFinish: (finalText: string) => void
    ) {}
    
    init(text: string) { this.setText(text); }
    
    setText(text: string) {
        this.framer.frame(() => this.tmpTextS.reset(text));
    }
    
    finish() { this.onFinish(this.tmpTextS.ref()); }
}

// TODO: Interaction:
function itemEditor(nodes: NodeFactory, ctrl: ItemEditCtrl, isEditingS: Signal<boolean>, 
    tmpTextS: Signal<string>
): Node {
    const displayEditS: Signal<string> =
        isEditingS.map(eq, (isEditing) => isEditing ? "inline" : "none");

    return nodes.el("input", {
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

function item(nodes: NodeFactory & Framer, ctrl: Ctrl, todoS: Signal<Todo>): Node {
    function onDestroy(_: Event) { ctrl.clearTodo(todoS.ref().id); }
    
    function onCompletionChange(isComplete: boolean) {
        ctrl.setIsComplete(todoS.ref().id, isComplete);
    }
    
    function startEditing(_: Event) {
        nodes.frame(() => isEditingS.reset(true));
        editCtrl.init(textS.ref());
    }
    
    function finishEditing(finalText: string) {
        ctrl.setText(todoS.ref().id, finalText);
        nodes.frame(() => isEditingS.reset(false));
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
    const editCtrl = new ItemEditCtrl(nodes, tmpTextS, finishEditing);

    return nodes.el("li", {"class": classeS},
        nodes.el("div", {"class": "view"}, 
            itemCheckbox(nodes, isCompleteS, onCompletionChange),
                         
            nodes.el("label", {"ondblclick": startEditing}, textS),
                
            nodes.el("button", {"class": "destroy",
                          "onclick": onDestroy})),
        itemEditor(nodes, editCtrl, isEditingS, tmpTextS));
}

function todoList(nodes: NodeFactory & Framer, ctrl: Ctrl, todoS: Vecnal<Todo>): Node {
    const allAreCompleteS: Signal<boolean> = todoS.reduceS(
        eq,
        (allAreComplete, todo) => allAreComplete && todo.isComplete,
        signal.stable(true)
    );

    return nodes.el("section", {"class": "main"},
        nodes.el("input", {
            "id": "toggle-all",
            "class": "toggle-all",
            "type": "checkbox",
            "checked": allAreCompleteS.map(eq, (allAreComplete) => {
                return allAreComplete ? "true" : undefined;
            }),
           "onchange": (ev: Event) => {
                const event = ev as InputEvent;
                const input = event.target as HTMLInputElement;
                ctrl.toggleAll(input.checked);
            }
        }),
        nodes.el("label", {"for": "toggle-all"}, "Mark all as complete"),
        
        nodes.el("ul", {"class": "todo-list"},
            nodes.forVecnal(todoS, (todoS) => item(nodes, ctrl, todoS))));
}

function todoFilter(nodes: NodeFactory, label: string, path: string,
    isSelected: Signal<boolean>
): Node {
    return nodes.el("li", {},
        nodes.el("a", {"class": isSelected.map(eq, (isSelected) => isSelected ? "selected" : ""),
                 "href": `#${path}`},
             label));
}

function todosFooter(nodes: NodeFactory, ctrl: Ctrl, todoCount: Signal<number>,
    filterS: Signal<Filter>
): Node {
    function onClearCompleteds(_: Event) {
        ctrl.clearCompleteds();
    }
    
    const allIsSelected: Signal<boolean> = filterS.map(eq, (v) => v === "all");
    const activeIsSelected: Signal<boolean> = filterS.map(eq, (v) => v === "active");
    const completedIsSelected: Signal<boolean> = filterS.map(eq, (v) => v === "completed");
    
    return nodes.el("footer", {"class": "footer"},
        nodes.el("span", {"class": "todo-count"},
            nodes.el("strong", {}, todoCount.map(eq, str)), " items left"),
        
        nodes.el("ul", {"class": "filters"},
            todoFilter(nodes, "All", "/", allIsSelected), // TODO: Interaction
            todoFilter(nodes, "Active", "/active", activeIsSelected), // TODO: Interaction
            todoFilter(nodes, "Completed", "/completed", completedIsSelected)), // TODO: Interaction
        
        nodes.el("button", {"class": "clear-completed",
                      "onclick": onClearCompleteds},
            "Clear completed"));
}

function createUI(nodes: NodeFactory & Framer, ctrl: Ctrl, todoS: Signal<readonly Todo[]>,
    filterS: Signal<Filter>
): Element {
    const visibleTodoS: Signal<ImmArrayAdapter<Todo>> = todoS.map2(eq,
        (todos, filter) => new ImmArrayAdapter(todos.filter(filterFn(filter))), // OPTIMIZE
        filterS);
    const todoCount: Signal<number> = todoS.map(eq, (todos) => todos.length);
    
    return nodes.el("section", {"class": "todoapp"},
        todosHeader(nodes, ctrl),
                         
        todoList(nodes, ctrl, vecnal.imux(eq, visibleTodoS)),
                
        todosFooter(nodes, ctrl, todoCount, filterS));
}

// TODO: Do not hammer `filterS` directly from here:
const routes = {
    "/": () => nodeManager.frame(() => filterS.reset("all")),
    "/active": () => nodeManager.frame(() => filterS.reset("active")),
    "/completed": () => nodeManager.frame(() => filterS.reset("completed"))
};

(function (window) {
	'use strict';

    const todos = model.map(eq, (model: Model) => model.todos);
	const ui = createUI(nodeManager, controller, todos, filterS);
	const body = document.body;
	dom.insertBefore(body, ui, body.children[0]);
	
	const router = createRouter(routes);
	router.init();
})(window);

