/**
 * Minimal binary max-heap priority queue.
 * Items with higher priority are dequeued first.
 * Zero dependencies.
 */

interface HeapEntry<T> {
    item: T;
    priority: number;
}

export class PriorityQueue<T> {
    private heap: HeapEntry<T>[] = [];

    get size(): number {
        return this.heap.length;
    }

    push(item: T, priority: number): void {
        this.heap.push({ item, priority });
        this._bubbleUp(this.heap.length - 1);
    }

    pop(): T | undefined {
        if (this.heap.length === 0) return undefined;
        const top = this.heap[0];
        const last = this.heap.pop()!;
        if (this.heap.length > 0) {
            this.heap[0] = last;
            this._sinkDown(0);
        }
        return top.item;
    }

    peek(): T | undefined {
        return this.heap[0]?.item;
    }

    peekPriority(): number {
        return this.heap[0]?.priority ?? -Infinity;
    }

    private _bubbleUp(i: number): void {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.heap[parent].priority >= this.heap[i].priority) break;
            [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
            i = parent;
        }
    }

    private _sinkDown(i: number): void {
        const n = this.heap.length;
        while (true) {
            let largest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < n && this.heap[left].priority > this.heap[largest].priority) largest = left;
            if (right < n && this.heap[right].priority > this.heap[largest].priority) largest = right;
            if (largest === i) break;
            [this.heap[largest], this.heap[i]] = [this.heap[i], this.heap[largest]];
            i = largest;
        }
    }
}
