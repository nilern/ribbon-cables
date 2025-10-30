export { model, controller };
import { ImmArrayAdapter, eq, str } from "../js/prelude.js";
import * as signal from "../js/signal.js";
import * as vecnal from "../js/vecnal.js";
import * as dom from "../js/dom.js";
import { NodeManager } from "../js/dom.js";
;
const createRouter = window["Router"];
// TODO: More lightweight approach to immutable record:
class Todo {
    constructor(id, text, isComplete = false) {
        this.id = id;
        this.text = text;
        this.isComplete = isComplete;
    }
    withCompletion(isComplete) {
        return new Todo(this.id, this.text, isComplete);
    }
    withText(text) {
        return new Todo(this.id, text, this.isComplete);
    }
}
;
class Model {
    constructor(nextId = 0, todos = []) {
        this.nextId = nextId;
        this.todos = todos;
    }
    withTodo(text, isComplete) {
        return new Model(this.nextId + 1, [...this.todos, new Todo(this.nextId, text, isComplete)]);
    }
    withTodoCompleted(id, isComplete) {
        return new Model(this.nextId, this.todos.map((todo) => todo.id !== id
            ? todo
            : todo.withCompletion(isComplete)));
    }
    withTodoText(id, text) {
        return new Model(this.nextId, this.todos.map((todo) => todo.id !== id
            ? todo
            : todo.withText(text)));
    }
    withoutTodo(id) {
        return new Model(this.nextId, this.todos.filter((todo) => todo.id !== id));
    }
    withoutCompleteds() {
        return new Model(this.nextId, this.todos.filter((todo) => !todo.isComplete));
    }
}
const model = signal.source(eq, new Model()); // Global for REPL testing
function filterFn(filter) {
    if (filter === "all") {
        return (_) => true;
    }
    else if (filter === "active") {
        return ({ isComplete }) => !isComplete;
    }
    else if (filter === "completed") {
        return ({ isComplete }) => isComplete;
    }
    else {
        const exhaust = filter;
        return exhaust;
    }
}
// Global for REPL testing:
const filterS = signal.source(eq, "all");
// TODO: Limited versions for different components:
class Ctrl {
    constructor(framer, model) {
        this.framer = framer;
        this.model = model;
    }
    // TODO: `this.model.swap(...)`:
    addTodo(text, isComplete = false) {
        this.framer.frame(() => this.model.reset(this.model.ref().withTodo(text, isComplete)));
    }
    setIsComplete(id, isComplete) {
        this.framer.frame(() => this.model.reset(this.model.ref().withTodoCompleted(id, isComplete)));
    }
    setText(id, text) {
        this.framer.frame(() => this.model.reset(this.model.ref().withTodoText(id, text)));
    }
    clearTodo(id) {
        this.framer.frame(() => this.model.reset(this.model.ref().withoutTodo(id)));
    }
    clearCompleteds() {
        this.framer.frame(() => this.model.reset(this.model.ref().withoutCompleteds()));
    }
}
const nodeManager = new NodeManager(); // Global for REPL testing
const controller = new Ctrl(nodeManager, model); // Global for REPL testing
function todosHeader(nodes, ctrl) {
    function handleKey(e) {
        const event = e;
        if (event.key === "Enter") {
            const input = event.target;
            ctrl.addTodo(input.value.trim());
            input.value = "";
        }
    }
    return nodes.el("header", { "class": "header" }, nodes.el("h1", {}, "todos"), nodes.el("input", { "class": "new-todo",
        "placeholder": "What needs to be done?",
        "autofocus": "true",
        "onkeydown": handleKey }));
}
function itemCheckbox(nodes, isCompleteS, onCompletionChange) {
    const checkedS = isCompleteS.map(eq, (isComplete) => isComplete ? "true" : undefined);
    return nodes.el("input", {
        "class": "toggle",
        "type": "checkbox",
        "checked": checkedS,
        "onchange": (ev) => {
            const event = ev;
            const input = event.target;
            onCompletionChange(input.checked);
        }
    });
}
class ItemEditCtrl {
    constructor(framer, tmpTextS, onFinish) {
        this.framer = framer;
        this.tmpTextS = tmpTextS;
        this.onFinish = onFinish;
    }
    init(text) { this.setText(text); }
    setText(text) {
        this.framer.frame(() => this.tmpTextS.reset(text));
    }
    finish() { this.onFinish(this.tmpTextS.ref()); }
}
// TODO: Interaction:
function itemEditor(nodes, ctrl, isEditingS, tmpTextS) {
    const displayEditS = isEditingS.map(eq, (isEditing) => isEditing ? "inline" : "none");
    return nodes.el("input", {
        "class": "edit",
        "display": displayEditS,
        "value": tmpTextS,
        "onchange": (ev) => {
            const event = ev;
            const input = event.target;
            ctrl.setText(input.value);
        },
        "onblur": (_) => ctrl.finish()
    });
}
function item(nodes, ctrl, todoS) {
    function onDestroy(_) { ctrl.clearTodo(todoS.ref().id); }
    function onCompletionChange(isComplete) {
        ctrl.setIsComplete(todoS.ref().id, isComplete);
    }
    function startEditing(_) {
        nodes.frame(() => isEditingS.reset(true));
        editCtrl.init(textS.ref());
    }
    function finishEditing(finalText) {
        ctrl.setText(todoS.ref().id, finalText);
        nodes.frame(() => isEditingS.reset(false));
    }
    const isCompleteS = todoS.map(eq, ({ isComplete }) => isComplete);
    const isEditingS = signal.source(eq, false);
    const textS = todoS.map(eq, ({ text }) => text);
    const classeS = isCompleteS.map2(eq, (isComplete, isEditing) => {
        if (isComplete) {
            if (isEditing) {
                return "completed editing";
            }
            else {
                return "completed";
            }
        }
        else {
            if (isEditing) {
                return "editing";
            }
            else {
                return "";
            }
        }
    }, isEditingS);
    const tmpTextS = signal.source(eq, textS.ref());
    const editCtrl = new ItemEditCtrl(nodes, tmpTextS, finishEditing);
    return nodes.el("li", { "class": classeS }, nodes.el("div", { "class": "view" }, itemCheckbox(nodes, isCompleteS, onCompletionChange), nodes.el("label", { "ondblclick": startEditing }, textS), nodes.el("button", { "class": "destroy",
        "onclick": onDestroy })), itemEditor(nodes, editCtrl, isEditingS, tmpTextS));
}
function todoList(nodes, ctrl, todoS) {
    return nodes.el("section", { "class": "main" }, nodes.el("input", { "id": "toggle-all", "class": "toggle-all", "type": "checkbox" }), nodes.el("label", { "for": "toggle-all" }, "Mark all as complete"), nodes.el("ul", { "class": "todo-list" }, nodes.forVecnal(todoS, (todoS) => item(nodes, ctrl, todoS))));
}
function todoFilter(nodes, label, path, isSelected) {
    return nodes.el("li", {}, nodes.el("a", { "class": isSelected.map(eq, (isSelected) => isSelected ? "selected" : ""),
        "href": `#${path}` }, label));
}
function todosFooter(nodes, ctrl, todoCount, filterS) {
    function onClearCompleteds(_) {
        ctrl.clearCompleteds();
    }
    const allIsSelected = filterS.map(eq, (v) => v === "all");
    const activeIsSelected = filterS.map(eq, (v) => v === "active");
    const completedIsSelected = filterS.map(eq, (v) => v === "completed");
    return nodes.el("footer", { "class": "footer" }, nodes.el("span", { "class": "todo-count" }, nodes.el("strong", {}, todoCount.map(eq, str)), " items left"), nodes.el("ul", { "class": "filters" }, todoFilter(nodes, "All", "/", allIsSelected), // TODO: Interaction
    todoFilter(nodes, "Active", "/active", activeIsSelected), // TODO: Interaction
    todoFilter(nodes, "Completed", "/completed", completedIsSelected)), // TODO: Interaction
    nodes.el("button", { "class": "clear-completed",
        "onclick": onClearCompleteds }, "Clear completed"));
}
function createUI(nodes, ctrl, todoS, filterS) {
    const visibleTodoS = todoS.map2(eq, (todos, filter) => new ImmArrayAdapter(todos.filter(filterFn(filter))), // OPTIMIZE
    filterS);
    const todoCount = todoS.map(eq, (todos) => todos.length);
    return nodes.el("section", { "class": "todoapp" }, todosHeader(nodes, ctrl), todoList(nodes, ctrl, vecnal.imux(eq, visibleTodoS)), todosFooter(nodes, ctrl, todoCount, filterS));
}
// TODO: Do not hammer `filterS` directly from here:
const routes = {
    "/": () => nodeManager.frame(() => filterS.reset("all")),
    "/active": () => nodeManager.frame(() => filterS.reset("active")),
    "/completed": () => nodeManager.frame(() => filterS.reset("completed"))
};
(function (window) {
    'use strict';
    const todos = model.map(eq, (model) => model.todos);
    const ui = createUI(nodeManager, controller, todos, filterS);
    const body = document.body;
    dom.insertBefore(body, ui, body.children[0]);
    const router = createRouter(routes);
    router.init();
})(window);
