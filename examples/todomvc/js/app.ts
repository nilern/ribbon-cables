export {model, controller};

import {Model} from "./model.js";
import {Ctrl} from "./controller.js";
import type {Filter} from "./view.js";
import {createUI} from "./view.js";

import type {Reset} from "../dist/prelude.js";
import {ImmArrayAdapter, eq, str} from "../dist/prelude.js";
import type {Signal} from "../dist/signal.js";
import * as signal from "../dist/signal.js";
import * as dom from "../dist/dom.js";
import {NodeManager} from "../dist/dom.js";

type Routes = {
    [k: string]: () => void
};

interface Router {
    init(): void;
};

const createRouter = (window as {[k: string]: any})["Router"] as (routes: Routes) => Router;

const model = signal.source(eq, new Model()); // Global for REPL testing

// Global for REPL testing:
const filterS: Signal<Filter> & Reset<Filter> = signal.source<Filter>(eq, "all");

const nodeManager = new NodeManager(); // Global for REPL testing

const controller = new Ctrl(nodeManager, model); // Global for REPL testing

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

