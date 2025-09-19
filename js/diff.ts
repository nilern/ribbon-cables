export type {
    EditScript
};
export {
    Edit, Delete, Insert, Substitute,
    diff
};

import {Sized, Indexed} from "./prelude.js";

// EUGENE W. MYERS: An O(ND) Difference Algorithm and Its Variations
// 4b. A Linear Space Refinement

class Insert {
    constructor(public readonly index: number) {}
}

class Delete {
    constructor(public readonly index: number) {}
}

class Substitute {
    constructor(public readonly index: number) {}
}

type DiffEdit = Insert | Delete;

type DiffEditScript = DiffEdit[];

type Edit = Insert | Delete | Substitute;

type EditScript = Edit[];

class Box {
    constructor(
        public readonly left: number,
        public readonly top: number,
        public readonly right: number,
        public readonly bottom: number
    ) {}
    
    width(): number { return this.right - this.left; }
    
    height(): number { return this.bottom - this.top; }
    
    size(): number { return this.width() + this.height(); }
    
    delta(): number { return this.width() - this.height(); }
}

class Point {
    constructor(
        public readonly currIndex: number,
        public readonly goalIndex: number
    ) {}
}

class Coords {
    private readonly items: number[];
    
    constructor(size: number) {
        this.items = (new Array(size)).fill(0);
    }
    
    at(i: number): number { return this.items[this.translateIndex(i)]; }
    
    setAt(i: number, v: number) { this.items[this.translateIndex(i)] = v; }
    
    private translateIndex(i: number): number {
        return i >= 0 ? i % this.items.length : i + this.items.length;
    }
}

class Snake {
    constructor(
        public readonly start: Point,
        public readonly end: Point
    ) {}
}

class Path {
    private readonly points: Point[];

    constructor(...points: Point[]) { this.points = points; }
    
    size(): number { return this.points.length; }
    
    pushBack(point: Point) { this.points.push(point); }
    
    pushFront(point: Point) { this.points.unshift(point); }
    
    append(other: Path) { this.points.push(...other.points); }
    
    [Symbol.iterator](): Iterator<Point> { return this.points[Symbol.iterator](); }
}

class Differ<T, U> {
    constructor(
        private readonly curr: Sized & Indexed<T>,
        private readonly goal: Sized & Indexed<U>,
        private readonly eq: (x: T, y: U) => boolean
    ) {}
    
    diff(): DiffEditScript {
        const edits: DiffEditScript = [];
        
        const optPath = this.findPath(new Box(0, 0, this.curr.size(), this.goal.size()));
        if (optPath) {
            this.walkSnakes(optPath, edits);
        }
        
        return edits;
    }
    
    private findPath(box: Box): Path | undefined {
        const optSnake = this.midpoint(box);
        if (!optSnake) {
            return undefined;
        }
        
        const snake: Snake = optSnake;
        const start = snake.start;
        const end = snake.end;
        
        const optHead = this.findPath(new Box(box.left, box.top, start.currIndex, start.goalIndex));
        const optTail = this.findPath(new Box(end.currIndex, end.goalIndex, box.right, box.bottom));
        
        if (optHead) {
            const head: Path = optHead;
        
            if (optTail) {
                const tail = optTail;
                head.append(tail);
            } else {
                head.pushBack(end);
            }
            
            return head;
        } else {
            if (optTail) {
                const tail: Path = optTail;
                tail.pushFront(start);
                return tail;
            } else {
                return new Path(start, end);
            }
        }
    }
    
    private midpoint(box: Box): Snake | undefined {
        if (box.size() === 0) {
            return undefined;
        }
        
        const maxEditDistance = Math.ceil(box.size() / 2);
        
        const coordsSize = 2 * maxEditDistance + 1;
        const coordsFwd = new Coords(coordsSize);
        coordsFwd.setAt(1, box.left);
        const coordsBwd = new Coords(coordsSize);
        coordsBwd.setAt(1, box.bottom);
        
        for (let editDistance = 0; editDistance <= maxEditDistance; ++editDistance) {
            {
                const optSnake = this.forwards(box, coordsFwd, coordsBwd, editDistance);
                if (optSnake) {
                    return optSnake;
                }
            }
            
            {
                const optSnake = this.backwards(box, coordsFwd, coordsBwd, editDistance);
                if (optSnake) {
                    return optSnake;
                }
            }
        }
    }
    
    private forwards(box: Box, coordsFwd: Coords, coordsBwd: Coords, editDistance: number
    ): Snake | undefined {
        const maxOpsSum = editDistance;
        const minOpsSum = -maxOpsSum;
        for (let opsSum = minOpsSum; opsSum <= maxOpsSum; opsSum += 2) {
            const bwdOpsSum = opsSum - box.delta();
            
            let currIndex = 0;
            let prevCurrIndex = 0;
            if (opsSum === minOpsSum // Can only have come here by insertion
                || (opsSum !== maxOpsSum // If `opsSum == maxOpsSum` could not have come here by insertion
                    && coordsFwd.at(opsSum - 1) < coordsBwd.at(opsSum + 1))) { // Insertion starts from further along
                prevCurrIndex = currIndex = coordsFwd.at(opsSum + 1); // Insert   
            } else { // Delete:
                prevCurrIndex = coordsFwd.at(opsSum - 1);
                currIndex = prevCurrIndex + 1;
            }
            
            // By definition of opsSum := (currIndex - box.left) - (goalIndex - box.top):
            let goalIndex = box.top + (currIndex - box.left) - opsSum;
            const prevGoalIndex = (editDistance === 0 // No edits yet
                                   || currIndex !== prevCurrIndex) // Came here by deletion
                ? goalIndex
                : goalIndex - 1;
            
            while (currIndex < box.right && goalIndex < box.bottom // Inside `box`
                   && this.eq(this.curr.at(currIndex)!, this.goal.at(goalIndex)!)) // No edit here
            { // Preserve:
                ++currIndex;
                ++goalIndex;
            }
            
            coordsFwd.setAt(opsSum, currIndex); // Got this far (`goalIndex` stored implicitly by definition of `opsSum`)
            
            if (box.delta() % 2 !== 0
                    && minOpsSum + 1 <= bwdOpsSum && bwdOpsSum <= maxOpsSum - 1
                    && goalIndex >= coordsBwd.at(bwdOpsSum)) { // Overlap with previous backwards scan
                return new Snake(
                    new Point(prevCurrIndex, prevGoalIndex),
                    new Point(currIndex, goalIndex)
                );
            }
        }
        
        return undefined;
    }
    
    private backwards(box: Box, coordsFwd: Coords, coordsBwd: Coords, editDistance: number
    ): Snake | undefined {
        const maxOpsSum = editDistance;
        const minOpsSum = -maxOpsSum;
        for (let opsSum = minOpsSum; opsSum <= maxOpsSum; opsSum += 2) {
            const fwdOpsSum = opsSum + box.delta();
            
            let goalIndex = 0;
            let prevGoalIndex = 0;
            if (opsSum === minOpsSum
                || (opsSum !== maxOpsSum
                    && coordsBwd.at(opsSum - 1) > coordsBwd.at(opsSum + 1))) {
                prevGoalIndex = goalIndex = coordsBwd.at(opsSum + 1);
            } else {
                prevGoalIndex = coordsBwd.at(opsSum - 1);
                goalIndex = prevGoalIndex - 1;
            }
            
            // By definition of fwdOpsSum := (currIndex - box.left) - (goalIndex - box.top):
            let currIndex = box.left + (goalIndex - box.top) + fwdOpsSum;
            const prevCurrIndex = (editDistance === 0 // No edits yet
                                   || goalIndex !== prevGoalIndex)
                ? currIndex
                : currIndex + 1;
                
            while (currIndex > box.left && goalIndex > box.top // Inside `box`
                   && this.eq(this.curr.at(currIndex - 1)!, this.goal.at(goalIndex - 1)!)) // No edit here
            { // Preserve:
                --currIndex;
                --goalIndex;
            }
            
            coordsBwd.setAt(opsSum, goalIndex);
            
            if (box.delta() % 2 === 0
                    && minOpsSum <= fwdOpsSum && fwdOpsSum <= maxOpsSum
                    && currIndex <= coordsFwd.at(fwdOpsSum)) { // Overlap with previous forwards scan
                return new Snake(
                    new Point(currIndex, goalIndex),
                    new Point(prevCurrIndex, prevGoalIndex)
                );
            }
        }
        
        return undefined;
    }
    
    private walkSnakes(path: Path, edits: DiffEditScript) {
        const pathSize = path.size();
        if (pathSize < 2) {
            return;
        }
        
        {
            const it = path[Symbol.iterator]();
            for (let start = it.next().value; // `it.next().done === true` since `pathSize >= 2`
            ;) {
                const itRes = it.next();
                if (itRes.done) { break; }
                const end = itRes.value;
                
                const editStart = this.walkDiagonal(start, end);
                
                let editEnd = editStart;
                const currIndexChange = end.currIndex - editStart.currIndex;
                const goalIndexChange = end.goalIndex - editStart.goalIndex;
                if (currIndexChange < goalIndexChange) {
                    edits.push(new Insert(editStart.goalIndex));
                    editEnd = new Point(editStart.currIndex, editStart.goalIndex + 1);
                } else if (currIndexChange > goalIndexChange) {
                    edits.push(new Delete(editStart.goalIndex));
                    editEnd = new Point(editStart.currIndex + 1, editStart.goalIndex);
                }
                
                this.walkDiagonal(editEnd, end);
                
                start = end;
            }
        }
    }
    
    private walkDiagonal(start: Point, end: Point): Point {
        let currIndex = start.currIndex;
        let goalIndex = start.goalIndex;
        
        while (currIndex < end.currIndex && goalIndex < end.goalIndex // Before `end`
               && this.eq(this.curr.at(currIndex)!, this.goal.at(goalIndex)!)) // No edit here
        { // Preserve:
            ++currIndex;
            ++goalIndex;
        }
        
        return new Point(currIndex, goalIndex);
    }
}

function myersDiff<T, U>(curr: Sized & Indexed<T>, goal: Sized & Indexed<U>, eq: (x: T, y: U) => boolean
): DiffEditScript {
    return (new Differ(curr, goal, eq)).diff();
}

// OPTIMIZE: In place:
function substituteSubstitutions(diffEdits: DiffEditScript): EditScript {
    const len = diffEdits.length;
    
    if (len < 2) { return [...diffEdits]; }

    const edits: EditScript = [];
    
    {
        let prevEdit: DiffEdit | undefined = diffEdits[0];
        
        for (let i = 1; i < len; ++i) {
            const edit = diffEdits[i];
            
            if (prevEdit instanceof Insert
                && edit instanceof Delete
                && prevEdit.index + 1 === edit.index
            ) {
                edits.push(new Substitute(prevEdit.index));
                prevEdit = undefined;
            } else {
                if (prevEdit) { edits.push(prevEdit); }
                prevEdit = edit;
            }
        }
        
        if (prevEdit) { edits.push(prevEdit); }
    }
    
    return edits;
}

// OPTIMIZE: Take callbacks object instead of returning array of edits:
function diff<T, U>(curr: Sized & Indexed<T>, goal: Sized & Indexed<U>, eq: (x: T, y: U) => boolean
): EditScript {
    return substituteSubstitutions(myersDiff(curr, goal, eq));
}

