export {
    Vec
};

type ChildSizes = readonly number[]; // OPTIMIZE: Use typed array?
type VecNodeSizes = ChildSizes | undefined;

type VecNode = readonly any[];
type VecNodeMut = any[];
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
    for (let shift = level * indexBitsPerLevel; level > 0; --level) {
        const indexInLevel = (index >> shift) & levelMask;
        tree = tree[indexInLevel + 1] as VecNode;
        shift -= indexBitsPerLevel;
    }
    
    return tree[index & levelMask];
}

function treeGet(tree: VecNode, level: number, index: number): any {
    for (; level > 0; --level) {
        const sizes = tree[0] as VecNodeSizes;
        if (!sizes) {
            return treeGetRadix(tree, level, index);
        }
        
        const branchIndex = getBranchIndex(sizes, index);
        tree = tree[branchIndex + 1] as VecNode;
        index -= branchIndex > 0 ? sizes[branchIndex - 1] : 0;
    }
    
    return tree[index & levelMask];
}

function radixTreeWith<T>(tree: VecNode, level: number, i: number, v: T): VecNode {
    const newTree = [...tree];
    const indexInLevel = (i >> (level * indexBitsPerLevel)) & levelMask;

    if (isInternalNode(newTree, level + 1)) {
        newTree[indexInLevel + 1] = radixTreeWith(
            newTree[indexInLevel + 1],
            level - 1,
            i, v
        );
    } else {
        newTree[indexInLevel] = v;
    }
    
    return newTree;
}

function anyTreeWith<T>(tree: VecNode, level: number, i: number, v: T): VecNode {
    if (level === 0) { // Leaf:
        const newTree = [...tree];
        newTree[i & levelMask] = v;
        return newTree;
    }

    const sizes = tree[0] as VecNodeSizes;
    if (!sizes) { // Balanced subtree:
        return radixTreeWith(tree, level, i, v);
    }
    
    const branchIndex = getBranchIndex(sizes, i);
    const newTree = [...tree];
    newTree[branchIndex + 1] = anyTreeWith(
        newTree[branchIndex + 1],
        level - 1,
        branchIndex > 0 ? i - sizes[branchIndex - 1] : i,
        v
    );
    return newTree;
}

function treeWith<T>(tree: VecNode, level: number, index: number, v: T): VecNode {
    return anyTreeWith(tree, level, index, v);
}

function createBranch<T>(depth: number, v: T): VecNode {
    let branch = [v] as VecNode;
    
    for (let d = 1; d < depth; ++d) {
        branch = [undefined, branch] as InternalNode;
    }
    
    return branch as VecNode;
}

function computeSizes(node: InternalNode, depth: number): VecNodeSizes {
    if (depth <= 2) {
        return undefined;
    }

    let balanced = true;
    const sizes = [];
    
    {
        const limit = node.length;
        let size = 0;
        for (let i = 1; i < limit; ++i) {
            const child = node[i];
            
            size += child.length - 1;
            sizes.push(size);
            
            if (child[0]) {
                balanced = false;
            }
        }
    }
    
    return balanced ? undefined : sizes;
}

function mergedLeaves(left: VecNode, right: VecNode): VecNode {
    const newRoot = [undefined] as InternalNodeMut;
    let newNode = [] as VecNodeMut;
    
    function mergeSubtree(subtree: VecNode) {
        for (const leaf of subtree) {
            if (newNode.length === branchingFactor) {
                newRoot.push(newNode);
                newNode = [];
            }
            
            newNode.push(leaf);
        }
    }
    
    mergeSubtree(left);
    
    mergeSubtree(right);
    
    if (newNode.length > 0) {
        newRoot.push(newNode);
    }
    
    return newRoot;
}

function mergeRebalance(left: VecNode, center: VecNode, right: VecNode, depth: number
): VecNode {
    const newRoot = [undefined] as InternalNodeMut;
    let newSubtree = [undefined] as InternalNodeMut;
    let newNode = (depth > 2 ? [undefined] : []) as VecNodeMut;
    
    function checkSubtree() {
        if (newSubtree.length > branchingFactor) {
            newSubtree[0] = computeSizes(newSubtree, depth);
            newRoot.push(newSubtree);
            newSubtree = [undefined];
        }
    }
    
    const mergeSubtree = depth > 2
        ? (subtree: VecNode) => {
            const limit = subtree.length;
            for (let i = 1; i < limit; ++i) {
                if (newNode.length > branchingFactor) {
                    checkSubtree();
                    
                    newNode[0] = computeSizes(
                        newNode as unknown as InternalNode,
                        depth - 1
                    );
                    newSubtree.push(newNode);
                    newNode = [undefined];
                }
                
                newNode.push(subtree[i]);
            }
        }
        : (subtree: VecNode) => {
            const limit = subtree.length;
            for (let i = 0; i < limit; ++i) {
                if (newNode.length === branchingFactor) {
                    checkSubtree();
                    
                    newSubtree.push(newNode);
                    newNode = [];
                }
                
                newNode.push(subtree[i]);
            }
        };
    
    {
        const limit = left.length - 1;
        for (let i = 1; i < limit; ++i) {
            mergeSubtree(left[i]);
        }
    }
    
    center.forEach(mergeSubtree);
    
    {
        const limit = right.length;
        for (let i = 2; i < limit; ++i) {
            mergeSubtree(right[i]);
        }
    }
    
    newSubtree[0] = computeSizes(newSubtree, depth);
    newRoot.push(newSubtree);
    newRoot[0] = computeSizes(newRoot, depth + 1);
    
    return newRoot;
}

function mergedTrees(left: VecNode, right: VecNode, depth: number): VecNode {
    if (depth > 1) {
        const merged = mergedTrees(left[left.length - 1], right[1], depth - 1);
        return mergeRebalance(left, merged, right, depth);
    } else {
        return mergedLeaves(left, right);
    }
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
    
    cat(that: Vec<T>): Vec<T> {
        // FIXME: Depths may actually be different:
        const newTree = mergedTrees(this.root, that.root, this.depth);
        const maxDepth = Math.max(this.depth, that.depth);
        const newLength = this.length + that.length;
        if (newTree.length > 2) {
            return new Vec(
                newLength,
                maxDepth + 1,
                newTree
            );
        } else {
            return new Vec(
                newLength,
                maxDepth,
                newTree[1]
            );
        }
    }
};

