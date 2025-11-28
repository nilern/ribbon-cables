export {save, tryLoad};

import {Model, Todo} from './model.js';

const nextIdKey = 'todos-nextid-ribboncables';
const todosKey = 'todos-ribboncables';

type SerializableTodo = {
    readonly id: number,
    readonly title: string,
    readonly completed: boolean
};

function todoToSerializable({id, text, isComplete}: Todo): SerializableTodo {
    return {
        id: id,
        title: text,
        completed: isComplete
    };
}

function todoFromSerializable({id, title, completed}: SerializableTodo): Todo {
    return new Todo(id, title, completed);
}

function serializeTodos(todos: readonly Todo[]): string {
    const serializableTodos: readonly SerializableTodo[] = todos.map(todoToSerializable);
    return JSON.stringify(serializableTodos);
}

function save(model: Model) {
    localStorage.setItem(nextIdKey, model.nextId.toString());
    localStorage.setItem(todosKey, serializeTodos(model.todos));
}

function tryLoad(): Model | undefined {
    const nextIdStr = localStorage.getItem(nextIdKey);
    if (!nextIdStr) { return undefined; }
    const todosStr = localStorage.getItem(todosKey);
    if (!todosStr) { return undefined; }
    
    const nextId = Number.parseInt(nextIdStr);
    if (Number.isNaN(nextId)) { return undefined; }
    const serializableTodos = JSON.parse(todosStr) as readonly SerializableTodo[];
    const todos = serializableTodos.map(todoFromSerializable);
    
    return new Model(nextId, todos);
}

