export {
    Vec
};

type VecNode = readonly any[];

const indexBitsPerLevel = 5; // Branching factor 2^5 = 32
const branchingFactor = 1 << indexBitsPerLevel; // 2^5 = 32
const levelMask = branchingFactor - 1; // 0b11111

function treeWith<T>(tree: VecNode, level: number, i: number, v: T): VecNode {
    const newTree = [...tree];
    const indexInLevel = (i >> (level * indexBitsPerLevel)) & levelMask;

    newTree[indexInLevel] = level > 0
        ? treeWith(newTree[indexInLevel], level - 1, i, v)
        : v;
    
    return newTree;
}

function createBranch<T>(depth: number, v: T): VecNode {
    let branch: any = v;
    
    for (let d = 0; d < depth; ++d) {
        branch = [branch];
    }
    
    return branch as VecNode;
}

// Returns `undefined` on overflow:
function treeWithPushedLeaf<T>(tree: VecNode, depth: number, v: T): VecNode | undefined {
    if (depth > 1) { // Internal node
        const lastBranchIndex = tree.length - 1;
        const lastChild = treeWithPushedLeaf(tree[lastBranchIndex], depth - 1, v);
        if (lastChild) {
            const newTree = [...tree];
            newTree[lastBranchIndex] = lastChild;
            return newTree;
        } else { // Did not fit in last existing child
            if (tree.length < branchingFactor) { // But this node can fit a new child tree
                return [...tree, createBranch(depth - 1, v)];
            } else {
                return undefined;
            }
        }
    } else { // Leafy node
        if (tree.length < branchingFactor) {
            return [...tree, v];
        } else {
            return undefined;
        }
    }
}

class Vec<T> {
    constructor(
        public readonly length = 0,
        private readonly depth = 1,
        private readonly root: VecNode = []
    ) {}
    
    get(index: number): T {
        let node: VecNode = this.root;
        
        for (let level = this.depth - 1, shift = level * indexBitsPerLevel;
             level > 0;
             --level, shift -= indexBitsPerLevel
        ) {
            const indexInLevel = (index >> shift) & levelMask;
            node = node[indexInLevel] as VecNode;
        }
        
        return node[index & levelMask] as T;
    }
    
    with(i: number, v: T): Vec<T> {
        return new Vec(
            this.length,
            this.depth,
            treeWith(this.root, this.depth - 1, i, v)
        );
    }
    
    withPushed(v: T): Vec<T> {
        const newTree = treeWithPushedLeaf(this.root, this.depth, v);
        if (newTree) {
            return new Vec(
                this.length + 1,
                this.depth,
                newTree
            );
        } else {
            return new Vec(
                this.length + 1,
                this.depth + 1,
                [this.root, createBranch(this.depth, v)]
            );
        }
    }
};

