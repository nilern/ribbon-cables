export {
    Vec
};

type ChildSizes = readonly number[];
type VecNodeSizes = ChildSizes | undefined;

type VecNode = readonly any[];
type InternalNode = readonly [VecNodeSizes, ...any[]];
type InternalNodeMut = [VecNodeSizes, ...any[]];

function isInternalNode(tree: VecNode, depth: number): tree is InternalNode {
    return depth > 1;
}

const indexBitsPerLevel = 5; // Branching factor 2^5 = 32
const branchingFactor = 1 << indexBitsPerLevel; // 2^5 = 32
const levelMask = branchingFactor - 1; // 0b11111

/* Typical cache line size is 64 bytes.
 * Typical `number` size is 8 bytes (even on 32-bit machines due to NaN-tagging). */
const linearTreshold = 8; // 64 / 8

function getBranchIndex(sizes: ChildSizes, indexInTree: number): number {
    let low = 0;
    
    // Binary search:
    for (let high = sizes.length, length = high - low;
         length > linearTreshold;
         length = high - low
    ) {
        const mid = low + length / 2;
        
        if (sizes[mid] <= indexInTree) {
            low = mid + 1;
        } else {
            high = mid + 1;
        }
    }
    
    // Linear search:
    while (sizes[low] <= indexInTree) { ++low; }
    
    return low;
}

function treeGetRadix(tree: VecNode, level: number, index: number): any {
    for (let shift = level * indexBitsPerLevel;
         level > 0;
         --level, shift -= indexBitsPerLevel
    ) {
        const indexInLevel = (index >> shift) & levelMask;
        tree = tree[indexInLevel + 1] as VecNode;
    }
    
    return tree[index & levelMask];
}

function treeGet(tree: VecNode, level: number, index: number): any {
    for (let subIndex = index; level > 0; --level) {
        const sizes = tree[0] as VecNodeSizes;
        if (!sizes) {
            return treeGetRadix(tree, level, index);
        }
        
        const branchIndex = getBranchIndex(sizes, subIndex);
        subIndex -= branchIndex > 0 ? sizes[branchIndex - 1] : 0;
        tree = tree[branchIndex + 1];
    }
    
    return tree[index & levelMask];
}

function radixTreeWith<T>(tree: VecNode, level: number, i: number, v: T): VecNode {
    const newTree = [...tree];
    const indexInLevel = (i >> (level * indexBitsPerLevel)) & levelMask;

    if (isInternalNode(newTree, level + 1)) {
        newTree[indexInLevel + 1] =
            radixTreeWith(newTree[indexInLevel + 1], level - 1, i, v);
    } else {
        newTree[indexInLevel] = v;
    }
    
    return newTree;
}

function anyTreeWith<T>(
    tree: VecNode, level: number, index: number, subIndex: number, v: T
): VecNode {
    if (level === 0) { // Leaf:
        const newTree = [...tree];
        newTree[index & levelMask] = v;
        return newTree;
    }

    const sizes = tree[0] as VecNodeSizes;
    if (!sizes) { // Balanced subtree:
        return radixTreeWith(tree, level, index, v);
    }
    
    const branchIndex = getBranchIndex(sizes, subIndex);
    const newTree = [...tree];
    const newSubIndex = branchIndex > 0 ? subIndex - sizes[branchIndex - 1] : subIndex;
    newTree[branchIndex + 1] = anyTreeWith(tree, level - 1, index, newSubIndex, v);
    return newTree;
}

function treeWith<T>(tree: VecNode, level: number, index: number, v: T): VecNode {
    return anyTreeWith(tree, level, index, index, v);
}

function createBranch<T>(depth: number, v: T): VecNode {
    let branch = [v] as VecNode;
    
    for (let d = 1; d < depth; ++d) {
        branch = [undefined, branch] as InternalNode;
    }
    
    return branch as VecNode;
}

// Returns `undefined` on overflow:
function treeWithPushedLeaf<T>(tree: VecNode, depth: number, v: T): VecNode | undefined {
    if (isInternalNode(tree, depth)) {
        const lastBranchIndex = tree.length - 1;
        const lastChild = treeWithPushedLeaf(tree[lastBranchIndex], depth - 1, v);
        if (lastChild) {
            const newTree = [...tree];
                
            const sizes = tree[0] as VecNodeSizes;
            if (sizes) {
                const newSizes = [...sizes];
                ++newSizes[lastBranchIndex];
                newTree[0] = newSizes;
            }
            
            newTree[lastBranchIndex] = lastChild;
            return newTree;
        } else { // Did not fit in last existing child
            if (tree.length - 1 < branchingFactor) { // But this node can fit a new child tree
                const newTree = [...tree, createBranch(depth - 1, v)];
                
                const sizes = tree[0] as VecNodeSizes;
                if (sizes) {
                    const newSizes = [...sizes, sizes[lastBranchIndex] + 1];
                    newTree[0] = newSizes;
                }
                
                return newTree;
            } else {
                return undefined;
            }
        }
    } else {
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
        return treeGet(this.root, this.depth - 1, index) as T;
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
                [undefined, this.root, createBranch(this.depth, v)] as InternalNode
            );
        }
    }
};

