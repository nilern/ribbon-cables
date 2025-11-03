export type {Filter};
export {createUI};

import {Todo, Model} from "./model.js";
import {Ctrl} from "./controller.js";

import type {Reset} from "../js/prelude.js";
import {ImmArrayAdapter, eq, str} from "../js/prelude.js";
import type {Signal} from "../js/signal.js";
import * as signal from "../js/signal.js";
import type {Vecnal} from "../js/vecnal.js";
import * as vecnal from "../js/vecnal.js";
import * as dom from "../js/dom.js";
import type {NodeFactory, Framer} from "../js/dom.js";

function count<T>(vs: Iterable<T>, pred: (v: T) => boolean): number {
    let n = 0;

    for (const v of vs) {
        if (pred(v)) { ++n; }
    }
    
    return n;
}

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
        private readonly textS: Signal<string>,
        private readonly tmpTextS: Signal<string> & Reset<string>,
        private readonly onFinish: (finalText: string) => void,
        private readonly onCancel: () => void
    ) {}
    
    init(text: string) { this.setText(text); }
    
    setText(text: string) {
        this.framer.frame(() => this.tmpTextS.reset(text));
    }
    
    finish() {
        this.framer.frame(() => this.tmpTextS.reset(this.tmpTextS.ref().trim()));
        this.onFinish(this.tmpTextS.ref());
    }
    
    cancel() {
        this.framer.frame(() => this.tmpTextS.reset(this.textS.ref()));
        this.onCancel();
    }
}

function itemEditor(nodes: NodeFactory, ctrl: ItemEditCtrl, isEditingS: Signal<boolean>, 
    tmpTextS: Signal<string>
): Node {
    function handleKey(e: Event) {
        const event = e as KeyboardEvent;
        if (event.key === "Enter") {
            ctrl.finish();
        } else if (event.key === "Escape") {
            ctrl.cancel();
        }
    }
    
    const displayEditS: Signal<string> =
        isEditingS.map(eq, (isEditing) => isEditing ? "inline" : "none");

    return nodes.el("input", {
        "class": "edit",
        "display": displayEditS,
        "value": tmpTextS,
        "onchange": (ev: Event) => {
            const event = ev as InputEvent;
            const input = event.target as HTMLInputElement;
            if (isEditingS.ref()) { // HACK?
                ctrl.setText(input.value);
            }
        },
        "onkeydown": handleKey,
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
    
    function cancelEditing() {
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
    const editCtrl =
        new ItemEditCtrl(nodes, textS, tmpTextS, finishEditing, cancelEditing);

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

function todosFooter(nodes: NodeFactory, ctrl: Ctrl, incompleteTodoCount: Signal<number>,
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
            nodes.el("strong", {},
                incompleteTodoCount.map(eq, (n) =>
                    `${n} ${n === 1 ? "item" : "items"} left`
                ))),
        
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
    const incompleteTodoCount: Signal<number> =
        todoS.map(eq, (todos) => count(todos, (todo) => !todo.isComplete));
    
    return nodes.el("section", {"class": "todoapp"},
        todosHeader(nodes, ctrl),
                         
        todoList(nodes, ctrl, vecnal.imux(eq, visibleTodoS)),
                
        todosFooter(nodes, ctrl, incompleteTodoCount, filterS));
}

