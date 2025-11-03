export {Todo, Model};

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
        if (text.length === 0) {
            return this;
        }
    
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
        if (text.length === 0) {
            return this.withoutTodo(id);
        }
        
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

