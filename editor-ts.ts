import {DOMCursor, node} from './domCursor.js'
import type {CaretPosition} from './domCursor.js'
import {useEvent, Editor, defaultBindings, last, preserveSelection} from './dist/editor.js'
import {FingerTree} from './dist/fingertree.js'
import {Set} from 'immutable'

declare const _: any

type callback = (...args: any[])=> any
type block = object & {_id: string, next: string, prev?: string, text?: string}
type replacement = {start: number, end: number, text: string, source?: string}
type blockOffset = {offset: number, block: string}
type dataMeasure = {length: number, ids: Set<string>}
type blockValue = {id: string, length: number}

/** id number for next created block */
let idCounter = 0

//let activating = false

let readyPromise = new Promise(function(accept, reject) {
  if (document.readyState === 'interactive') {
    return accept(null);
  } else {
    return document.onreadystatechange = function() {
      if (document.readyState === 'interactive') {
        return accept(null);
      }
    };
  }
})

interface BlockAccess {
    getBlock(id: string): block
    parseBlocks(text: string): block[]
}

export class Observable {
    listeners: {[type: string]: callback[]}
    suppressingTriggers: boolean

    constructor() {
        this.listeners = {}
        this.suppressingTriggers = false
    }
    on(type: string, callback: callback) {
        if (typeof type == 'object') {
            for (const [t, callback] of Object.entries(type) as [string, callback][]) {
                this.on(t, callback)
            }
        } else {
            if (!this.listeners[type]) this.listeners[type] = []
            this.listeners[type].push(callback)
        }
        return this
    }
    off(type: string, callback: callback) {
        if (typeof type == 'object') {
            for (const [callbackType, callback] of Object.entries(type) as [string, callback][]) {
                this.off(callbackType, callback)
            }
        } else {
            if (this.listeners[type]) {
                this.listeners[type] = this.listeners[type].filter((l)=> l != callback)
            }
        }
        return this
    }
    trigger(type: string, ...args: any[]) {
        if (!this.suppressingTriggers) {
            for (const listener of this.listeners[type] || []) {
                listener(...args)
            }
        }
    }
    suppressTriggers(func: ()=> any) {
        const oldSuppress = this.suppressingTriggers

        this.suppressingTriggers = true
        try {
          func()
        } finally {
            this.suppressingTriggers = oldSuppress
        }
    }
}

/**
 * BasicEditingOptions class
 * =========================
 * BasicEditingOptions is an the options base class.
 * 
 * Events:
 *   `load`: new text was loaded into the editor
 * 
 * Hook methods (required)
 * -----------------------
 * 
 * `renderBlock(block) -> [html, next]`: render a block (and potentially its children) and return the HTML and the next blockId if there is one
 * 
 *   * Block DOM (DOM for a block) must be a single element with the same id as the block.
 *   * Block DOM may contain nested block DOM.
 *   * each block's DOM should have the same id as the block and have a data-block attribute
 *   * non-editable parts of the DOM should have contenteditable=false
 *   * completely skipped parts should be non-editable and have a data-noncontent attribute
 * 
 * Properties of BasicEditingOptions
 * ---------------------------------
 * * `blocks {id -> block}`: block table
 * * `first`: id of first block
 * * `bindings {keys -> binding(editor, event, selectionRange)}`: a map of bindings (can use LeisureEditCore.defaultBindings)
 * 
 * Methods of BasicEditingOptions
 * ------------------------------
 * * `getBlock(id) -> block?`: get the current block for id
 * * `getContainer(node) -> Node?`: get block DOM node containing for a node
 * * `getFirst() -> blockId`: get the first block id
 * * `domCursor(node, pos) -> DOMCursor`: return a domCursor that skips over non-content
 * * `keyUp(editor) -> void`: handle keyup after-actions
 * * `topRect() -> rect?`: returns null or the rectangle of a toolbar at the page top
 * * `blockColumn(pos) -> colNum`: returns the start column on the page for the current block
 * * `load(el, text) -> void`: parse text into blocks and replace el's contents with rendered DOM
 */

export class BasicEditingOptionsNew extends Observable {
    changeContext: object
    blocks: {[id: string]: block}
    first: string
    editor: Editor
    data: DataStore
    /** a map of bindings (can use LeisureEditCore.defaultBindings) */
    bindings = defaultBindings

    /** return [HTML, nextId], the rendered HTML and the id of the next block to render */
    renderBlock(_block: object): [string, string] {
        throw new Error("options.renderBlock(block) is not implemented")
    }

    /**
     * Hook methods (optional)
     * -----------------------
     */

    /** The editor calls this when the user hits backspace or delete on selected text. */
    simulateCut(_data: {html: string, text: string}) {}

    /**
     * alter the drag-enter behavior.  If you want to cancel the drag, for
     * instance, call event.preventDefault() and set the dropEffect to 'none'
     */
    dragEnter(event: DragEvent) {
        if (!event.dataTransfer.getData) {
            useEvent(event)
            event.dataTransfer.dropEffect = 'none'
        }
    }

    /**
     * alter the drag-enter behavior.  If you want to cancel the drag, for
     * instance, call event.preventDefault() and set the dropEffect to 'none'
     */
    dragOver(event: DragEvent) {
        if (!event.dataTransfer.getData) {
            useEvent(event)
            event.dataTransfer.dropEffect = 'none'
        }
    }

    /**
     * Main code
     * ---------
     */

    /** */
    constructor() {
        super()
        this.changeContext = null
        this.initData()
    }

    setDiagEnabled(_flag: boolean) {
        //#changeAdvice this, flag,
        //#  renderBlocks: diag: wrapDiag
        //#  changed: diag: wrapDiag
        //#if flag then @diag()
    }

    diag() {this.trigger('diag', this.editor.verifyAllNodes())}

    initData() {
        this.blocks = {}
        this.first = null
    }

    /** get the first block id */
    getFirst() {return this.first}

    nodeForId(id: string) {return $(`#${id}`)}

    idForNode(node: HTMLElement) {return $(node).prop('id')}

    setEditor(editor) {this.editor = editor}

    newId() {return this.data.newId()}

    /** Compute blocks affected by transforming oldBlocks into newText */
    changeStructure(oldBlocks: block[], newText: string) {
        return computeNewStructure(this, oldBlocks, newText)
    }

    mergeChangeContext(obj: object) {
        this.changeContext = Object.assign({}, this.changeContext || {}, obj)
    }

    clearChangeContext() {this.changeContext = null}

    /** get the current block for id */
    getBlock(id: string) {return this.blocks[id]}

    /** parse text into array of blocks -- DO NOT provide _id, prev, or next, they may be overwritten! */
    parseBlocks(text: string): block[] {throw new Error("options.parseBlocks(text) is not implemented")}

    /** return the start column on the page for the current block */
    blockColumn(pos) {return pos.textPosition().left}

    /** return null or the rectangle of a toolbar at the page top */
    topRect() {return null}

    /** handle keyup after-actions */
    keyUp() {}

    /** return a domCursor that skips over non-content */
    domCursor(node: node | Range | CaretPosition, pos) {
        return new DOMCursor(node, pos).addFilter((n)=> (n.hasAttribute('data-noncontent') && 'skip') || true)
    }

    /** get block DOM node containing for a node */
    getContainer(node: node) {
        if (this.editor.node[0].compareDocumentPosition(node) & document.DOCUMENT_POSITION_CONTAINED_BY) {
            return $(node).closest('[data-block]')[0]
        }
    }

    replaceText(repl: replacement) {this.data.replaceText(repl)}

    /** parse text into blocks and trigger a 'load' event */
    load(_name: string, text: string) {
        this.suppressTriggers(()=> {
            this.data.suppressTriggers(()=> {
                this.replaceText({start: 0, end: this.getLength(), text, source: 'edit'})
            })
        })
        this.rerenderAll()
        this.trigger('load')
    }

    rerenderAll() {
        this.editor.setHtml(this.editor.node[0], this.renderBlocks())
    }

    blockCount() {return Object.keys(this.blocks).length}

    blockList() {
        const blocks = []
        let next = this.getFirst()

        while (next) {
            const bl = this.getBlock(next)
            next = bl.next
            blocks.push(bl)
        }
        return blocks
    }

    docOffsetForBlockOffset(bOff: blockOffset | string, offset?: number) {
        return this.data.docOffsetForBlockOffset(bOff, offset)
    }

    blockOffsetForDocOffset(dOff: number) {return this.data.blockOffsetForDocOffset(dOff)}

    getPositionForBlock(block: block) {
        let cur = this.getBlock(this.getFirst())
        let offset = 0

        while (cur._id != block._id) {
            offset += cur.text.length
            cur = this.getBlock(cur.next)
        }
        return offset
    }

    //TODO remove this
    getBlockOffsetForPosition(pos: number) {
        //let cur = this.getBlock(this.getFirst())

        //while (pos >= cur.text.length) {
        //    pos -= cur.text.length
        //    cur = this.getBlock(cur.next)
        //}
        //return {block: cur, offset: pos}
        return this.blockOffsetForDocOffset(pos)
    }

    renderBlocks() {
        let result = ''
        let next = this.getFirst()
        let html: string
        let render: [string, string]

        while (next && (render = this.renderBlock(this.getBlock(next)))) {
            [html, next] = render
            result += html
        }
        return result
    }

    getText() {
        let text = ''
        let block = this.data.getBlock(this.data.getFirst())

        while (block) {
            text += block.text
            block = this.data.getBlock(block.next)
        }
        return text
    }

    getLength() {
        let len = 0
        let block = this.data.getBlock(this.data.getFirst())

        while (block) {
            len += block.text.length
            block = this.data.getBlock(block.next)
        }
        return len
    }

    isValidDocOffset(offset: number) {return 0 <= offset && offset <= this.getLength()}

    validatePositions() {
        let block = this.data.getBlock(this.data.getFirst())

        while (block) {
            const node = this.nodeForId(block._id)[0]

            if (node) {
                let cursor = this.domCursor(node, 0).mutable().firstText()

                for (let offset = 0; offset < block.text.length; offset++) {
                    if (cursor.isEmpty() || !sameCharacter(cursor.character(), block.text[offset])) {
                        return {block, offset}
                    }
                    cursor.forwardChar()
                }
            }
            block = this.data.getBlock(block.next)
        }
    }
}

export const spaces = String.fromCharCode(32, 160)

export function sameCharacter(c1: string, c2: string) {
    return c1 == c2 || (spaces.includes(c1) && spaces.includes(c2))
}

export function computeNewStructure(access: BlockAccess, oldBlocks: block[], newText: string) {
    let prev = oldBlocks[0]?.prev ?? '0'
    let oldText = null
    let offset = 0
    let next: block
    let newBlocks: block[]

    oldBlocks = oldBlocks.slice()
    if (oldBlocks.length) {
        while (oldText != newText && (oldBlocks[0].prev || last(oldBlocks).next)) {
            const prevBlk = access.getBlock(oldBlocks[0].prev)

            oldText = newText
            if (prevBlk) {
                oldBlocks.unshift(prevBlk)
                newText = prevBlk.text + newText
                offset += prevBlk.text.length
            }
            if (next = access.getBlock(last(oldBlocks).next)) {
                oldBlocks.push(next)
                newText += next.text
            }
            newBlocks = access.parseBlocks(newText)
            if ((!prevBlk || prevBlk.text == newBlocks[0].text) && (!next || next.text == last(newBlocks).text)) {
                break
            }
        }
    }
    if (!newBlocks) newBlocks = access.parseBlocks(newText)
    while (oldBlocks.length && newBlocks.length && oldBlocks[0].text == newBlocks[0].text) {
        offset -= oldBlocks[0].text.length
        prev = oldBlocks[0]._id
        oldBlocks.shift()
        newBlocks.shift()
    }
    while (oldBlocks.length && newBlocks.length && last(oldBlocks).text == last(newBlocks).text) {
        oldBlocks.pop()
        newBlocks.pop()
    }
    return {oldBlocks: oldBlocks, newBlocks: newBlocks, offset: offset, prev: prev}
}

export function copyBlock(block) {return !block ? null : Object.assign({}, block)}

/**
 * DataStore
 * =========
 * An efficient block storage mechanism used by DataStoreEditingOptions
 *
 * Hook methods -- you must define these in your subclass
 * ------------------------------------------------------
 * * `parseBlocks(text) -> blocks`: parse text into array of blocks -- DO NOT provide _id, prev, or next, they may be overwritten!
 *
 * Events
 * ------
 * Data objects support the Observable protocol and emit change events in response to data changes
 *
 * `change {adds, updates, removes, oldFirst, old}`
 *
 *   * `oldFirst id`: the previous first (might be the same as the current)
 *   * `adds {id->true}`: added items
 *   * `updates {id->true}`: updated items
 *   * `removes {id->true}`: removed items
 *   * `old {id->old block}`: the old items from updates and removes
 *
 * Internal API -- provide/override these if you want to change how the store accesses data
 * ----------------------------------------------------------------------------------------
 *
 * * `getFirst()`
 * * `setFirst(firstId)`
 * * `getBlock(id)`
 * * `setBlock(id, block)`
 * * `deleteBlock(id)`
 * * `eachBlock(func(block [, id]))` -- iterate with func (exit if func returns false)
 * * `load(first, blocks)` -- should trigger 'load'
 *
 * External API -- used from outside; alternative data objects must support these methods.
 * ---------------------------------------------------------------------------------------
 *
 * In addition to the methods below, data objects must support the Observable protocol and emit
 * change events in response to data changes
 *
 * * `getFirst() -> id`: id of the first block
 * * `getBlock(id) -> block`: the block for id
 * * `load(name, text)`: replace the current document
 * * `newId()`:
 * * `docOffsetForBlockOffset(args...) -> offset`: args can be a blockOffset or block, offset
 * * `blockOffsetForDocOffset(offset) -> blockOffset`: the block offset for a position in the document
 * * `suppressTriggers(func) -> func's return value`: suppress triggers while executing func (inherited from Observable)
 */

export class DataStore extends Observable {
    blocks: {[id: string]: block}
    blockIndex: FingerTree<dataMeasure, blockValue>
    changeCount: number
    markNames: {[name: string]: boolean}
    marks: FingerTree<{names: Set<string>, length: number}, {name: string}>
    first: string

    constructor() {
        super();
        this.blocks = {};
        this.blockIndex = this.newBlockIndex();
        this.changeCount = 0;
        this.clearMarks();
        this.markNames = {};
    }

    load(name, text) {
        var block, blockMap, i, j, len, newBlocks, prev, ref;
        blockMap = {};
        newBlocks = this.parseBlocks(text);
        for (i = j = 0, len = newBlocks.length; j < len; i = ++j) {
            block = newBlocks[i];
            block._id = this.newId();
            blockMap[block._id] = block;
            if (prev = newBlocks[i - 1]) {
                prev.next = block._id;
                block.prev = prev._id;
            }
        }
        this.first = (ref = newBlocks[0]) != null ? ref._id : '0';
        this.blocks = blockMap;
        return this.makeChanges(() => {
            this.indexBlocks();
            return this.trigger('load');
        });
    }

    // `parseBlocks(text) -> blocks`: parse text into array of blocks -- DO NOT provide _id, prev, or next, they may be overwritten!
    parseBlocks(text: string): block[] {
        throw new Error("options.parseBlocks(text) is not implemented");
    }

    newBlockIndex(contents?: blockValue[]) {
        return FingerTree.fromArray<dataMeasure, blockValue>(contents != null ? contents : [], {
            identity: function() {
                return {
                    ids: Set<string>(),
                    length: 0
                }
            },
            measure: function(v) {
                return {
                    ids: Set([v.id]),
                    length: v.length
                };
            },
            sum: function(a, b) {
                return {
                    ids: a.ids.union(b.ids),
                    length: a.length + b.length
                };
            }
        });
    }

    newId() {
        return `block${idCounter++}`;
    }

    setDiagEnabled(flag) { }

    /** `getLength() -> number`: the length of the entire document */
    getLength() {
        return this.blockIndex.measure().length;
    }

    makeChanges(func) {
        this.changeCount++;
        try {
            return func();
        } finally {
            this.changeCount--;
        }
    }

    clearMarks() {
        return this.marks = FingerTree.fromArray([], {
            identity: function() {
                return {
                    names: Set(),
                    length: 0
                };
            },
            measure: function(n) {
                return {
                    names: Set([n.name]),
                    length: n.offset
                };
            },
            sum: function(a, b) {
                return {
                    names: a.names.union(b.names),
                    length: a.length + b.length
                };
            }
        });
    }

    addMark(name, offset) {
        var first, l, n, rest;
        if (this.markNames[name]) {
            this.removeMark(name);
        }
        this.markNames[name] = true;
        [first, rest] = this.marks.split(function(m) {
            return m.length >= offset;
        });
        l = first.measure().length;
        if (!rest.isEmpty()) {
            n = rest.peekFirst();
            rest = rest.removeFirst().addFirst({
                offset: l + n.offset - offset,
                name: n.name
            });
        }
        return this.marks = first.concat(rest.addFirst({
            offset: offset - l,
            name: name
        }));
    }

    removeMark(name) {
        var first, n, removed, rest;
        if (this.markNames[name]) {
            delete this.markNames[name];
            [first, rest] = this.marks.split(function(m) {
                return m.names.contains(name);
            });
            if (!rest.isEmpty()) {
                removed = rest.peekFirst();
                rest = rest.removeFirst();
                if (!rest.isEmpty()) {
                    n = rest.peekFirst();
                    rest = rest.removeFirst().addFirst({
                        offset: removed.offset + n.offset,
                        name: n.name
                    });
                }
            }
            return this.marks = first.concat(rest);
        }
    }

    listMarks() {
        var m, n, t;
        m = [];
        t = this.marks;
        while (!t.isEmpty()) {
            n = t.peekFirst();
            m.push(_.defaults({
                location: this.getMarkLocation(n.name)
            }, n));
            t = t.removeFirst();
        }
        return m;
    }

    getMarkLocation(name) {
        var first, rest;
        if (this.markNames[name]) {
            [first, rest] = this.marks.split(function(m) {
                return m.names.contains(name);
            });
            if (!rest.isEmpty()) {
                return first.measure().length + rest.peekFirst().offset;
            }
        }
    }

    blockOffsetForMark(name) {
        var offset;
        if (offset = this.getMarkLocation(name)) {
            return this.blockOffsetForDocOffset(offset);
        }
    }

    floatMarks(start, end, newLength) {
        var first, n, oldLength, rest;
        if (newLength !== (oldLength = end - start)) {
            [first, rest] = this.marks.split(function(m) {
                return m.length > start;
            });
            if (!rest.isEmpty()) {
                n = rest.peekFirst();
                return this.marks = first.concat(rest.removeFirst().addFirst({
                    name: n.name,
                    offset: n.offset + newLength - oldLength
                }));
            }
        }
    }

    replaceText({ start, end, text }) {
        var newBlocks, oldBlocks, prev;
        ({ prev, oldBlocks, newBlocks } = this.changesForReplacement(start, end, text));
        if (oldBlocks) {
            this.change(this.changesFor(prev, oldBlocks.slice(), newBlocks.slice()));
            return this.floatMarks(start, end, text.length);
        }
    }

    changesForReplacement(start, end, text) {
        var blocks, change, newBlocks, newText, offset, oldBlocks, prev;
        ({ blocks, newText } = this.blockOverlapsForReplacement(start, end, text));
        ({ oldBlocks, newBlocks, offset, prev } = change = computeNewStructure(this, blocks, newText));
        if (oldBlocks.length || newBlocks.length) {
            return change;
        } else {
            return {};
        }
    }

    computeRemovesAndNewBlockIds(oldBlocks, newBlocks, newBlockMap, removes) {
        var i, j, len, len1, newBlock, o, oldBlock, prev, ref;
        ref = oldBlocks.slice(newBlocks.length, oldBlocks.length);
        for (j = 0, len = ref.length; j < len; j++) {
            oldBlock = ref[j];
            removes[oldBlock._id] = oldBlock;
        }
        prev = null;
        for (i = o = 0, len1 = newBlocks.length; o < len1; i = ++o) {
            newBlock = newBlocks[i];
            if (oldBlock = oldBlocks[i]) {
                newBlock._id = oldBlock._id;
                newBlock.prev = oldBlock.prev;
                newBlock.next = oldBlock.next;
            } else {
                newBlock._id = this.newId();
                if (prev) {
                    link(prev, newBlock);
                }
            }
            prev = newBlockMap[newBlock._id] = newBlock;
        }
        return prev;
    }

    patchNewBlocks(first, oldBlocks, newBlocks, changes, newBlockMap, removes, prev) {
        var lastBlock, next, oldNext, oldPrev;
        if (!oldBlocks.length && (first = this.getBlock(first))) {
            oldNext = this.getBlock(first.next);
            oldBlocks.unshift(first);
            first = newBlockMap[first._id] = copyBlock(first);
            link(first, newBlocks[0]);
            newBlocks.unshift(first);
            if (oldNext) {
                oldBlocks.push(oldNext);
                oldNext = newBlockMap[oldNext._id] = copyBlock(oldNext);
                link(last(newBlocks), oldNext);
                return newBlocks.push(oldNext);
            }
        } else if (oldBlocks.length !== newBlocks.length) {
            if (!prev && (prev = copyBlock(oldPrev = this.getBlock(oldBlocks[0].prev)))) {
                oldBlocks.unshift(oldPrev);
                newBlocks.unshift(prev);
                newBlockMap[prev._id] = prev;
            }
            lastBlock = last(oldBlocks);
            if (next = copyBlock(oldNext = this.getBlock((lastBlock ? lastBlock.next : this.getFirst())))) {
                oldBlocks.push(oldNext);
                newBlocks.push(next);
                newBlockMap[next._id] = next;
                if (!(next.prev = prev != null ? prev._id : void 0)) {
                    changes.first = next._id;
                }
            }
            if (prev) {
                if (!first && ((newBlocks.length && !newBlocks[0].prev) || !oldBlocks.length || !this.getFirst() || removes[this.getFirst()])) {
                    changes.first = newBlocks[0]._id;
                }
                return prev.next = next != null ? next._id : void 0;
            }
        }
    }

    changesFor(first, oldBlocks, newBlocks) {
        var changes, newBlockMap, prev, removes;
        newBlockMap = {};
        removes = {};
        changes = {
            removes,
            sets: newBlockMap,
            first: this.getFirst(),
            oldBlocks,
            newBlocks
        };
        prev = this.computeRemovesAndNewBlockIds(oldBlocks, newBlocks, newBlockMap, removes);
        this.patchNewBlocks(first, oldBlocks, newBlocks, changes, newBlockMap, removes, prev);
        this.removeDuplicateChanges(newBlockMap);
        return changes;
    }

    removeDuplicateChanges(newBlockMap) {
        var block, oldBlock, results1;
        let dups = [];

        for (const id in newBlockMap) {
            block = newBlockMap[id];
            if ((oldBlock = this.getBlock(id)) && block.text === oldBlock.text && block.next === oldBlock.next && block.prev === oldBlock.prev) {
                dups.push(id);
            }
        }
        results1 = [];
        for (const id of dups) results1.push(delete newBlockMap[id])
        return results1;
    }

    checkChanges() {
        if (this.changeCount === 0) {
            throw new Error("Attempt to make a change outside of makeChanges");
        }
    }

    setIndex(i) {
        this.checkChanges();
        return this.blockIndex = i;
    }

    getFirst() {
        return this.first;
    }

    setFirst(firstId) {
        return this.first = firstId;
    }

    getBlock(id) {
        return this.blocks[id];
    }

    setBlock(id, block) {
        this.checkChanges();
        this.blocks[id] = block;
        return this.indexBlock(block);
    }

    deleteBlock(id) {
        this.checkChanges();
        delete this.blocks[id];
        return this.unindexBlock(id);
    }

    eachBlock(func) {
        var block;
        block = this.getBlock(this.getFirst());
        while (block && func(block, block._id) !== false) {
            block = this.getBlock(block.next);
        }
        return null;
    }

    indexBlocks() {
        var items;
        this.checkChanges();
        items = [];
        this.eachBlock((block) => {
            return items.push(indexNode(block));
        });
        return this.setIndex(this.newBlockIndex(items));
    }

    splitBlockIndexOnId(id) {
        return this.blockIndex.split(function(m) {
            return m.ids.contains(id);
        });
    }

    splitBlockIndexOnOffset(offset) {
        return this.blockIndex.split(function(m) {
            return m.length > offset;
        });
    }

    indexBlock(block) {
        var first, next, rest, split;
        if (block) {
            this.checkChanges();
            // if the block is indexed, it might be an easy case, otherwise unindex it
            [first, rest] = this.splitBlockIndexOnId(block._id);
            if (!rest.isEmpty() && rest.peekFirst().id === block._id && (next = rest.removeFirst()) && (next.isEmpty() ? !block.next : next.peekFirst().id === block.next) && (first.isEmpty() ? !block.prev : first.peekLast().id === block.prev)) {
                return this.setIndex(first.addLast(indexNode(block)).concat(next));
            }
            if (!rest.isEmpty()) {
                this.unindexBlock(block._id);
            }
            // if next is followed by prev, just insert the block in between
            if ((split = this.fingerNodeOrder(block.prev, block.next)) && _.isArray(split)) {
                [first, rest] = split;
                return this.setIndex(first.addLast(indexNode(block)).concat(rest));
            }
            // repair as much of the index as possible and insert the block
            return this.insertAndRepairIndex(block);
        }
    }

    fingerNode(id) {
        var node;
        return id && (node = this.splitBlockIndexOnId(id)[1].peekFirst()) && node.id === id && node;
    }

    fingerNodeOrder(a, b) {
        var first, ref, ref1, rest, split;
        return !(a || b) || (!a && b ? this.fingerNode(b) : !b && a ? this.fingerNode(a) : ([first, rest] = split = this.splitBlockIndexOnId(b), !first.isEmpty() && !rest.isEmpty() && ((ref = rest.peekFirst()) != null ? ref.id : void 0) === b && ((ref1 = first.peekLast()) != null ? ref1.id : void 0) === a && split));
    }

    /**
     * insert block into the index
     * then trace forwards and backwards, repairing along the way
     */
    insertAndRepairIndex(block) {
        var cur, first, mark, node, prev, rest, results1;
        console.warn("REPAIR");
        node = indexNode(block);
        if (block.next) {
            prev = this.getBlock(block.prev);
            if (!block.prev) {
                this.setIndex(this.blockIndex.addFirst(indexNode(block)));
            } else {
                [first, rest] = this.splitBlockIndexOnId(block.next);
                this.setIndex(first.addLast(node).concat(rest));
            }
        } else if (block.prev) {
            [first, rest] = this.splitBlockIndexOnId(block.prev);
            this.setIndex(first.addLast(node).concat(rest));
        } else {
            this.setIndex(this.newBlockIndex([node]));
        }
        mark = block;
        cur = this.getBlock(block.next);
        while (cur && !this.fingerNodeOrder(mark._id, cur._id)) {
            this.unindexBlock(cur._id);
            [first, rest] = this.splitBlockIndexOnId(mark._id);
            this.setIndex(insertAfterSplit(first, indexNode(cur), rest));
            mark = cur;
            cur = this.getBlock(cur.next);
        }
        mark = block;
        cur = this.getBlock(block.prev);
        results1 = [];
        while (cur && !this.fingerNodeOrder(cur._id, mark._id)) {
            this.unindexBlock(cur._id);
            [first, rest] = this.splitBlockIndexOnId(mark._id);
            this.setIndex(insertInSplit(first, indexNode(cur), rest));
            mark = cur;
            results1.push(cur = this.getBlock(cur.prev));
        }
        return results1;
    }

    unindexBlock(id) {
        var first, ref, rest;
        this.checkChanges();
        if (id) {
            [first, rest] = this.splitBlockIndexOnId(id);
            if (((ref = rest.peekFirst()) != null ? ref.id : void 0) === id) {
                return this.setIndex(first.concat(rest.removeFirst()));
            }
        }
    }

    /** args can be a blockOffset or block, offset */
    docOffsetForBlockOffset(block, offset) {
        if (typeof block === 'object') {
            offset = block.offset;
            block = block.block;
        }
        return this.offsetForBlock(block) + offset;
    }

    blockOffsetForDocOffset(offset) {
        var results;
        results = this.splitBlockIndexOnOffset(offset);
        if (!results[1].isEmpty()) {
            return {
                block: results[1].peekFirst().id,
                offset: offset - results[0].measure().length
            };
        } else {
            return {
                block: results[0].peekLast().id,
                offset: results[0].removeLast().measure().length
            };
        }
    }

    offsetForBlock(blockOrId) {
        var id;
        id = typeof blockOrId === 'string' ? blockOrId : blockOrId._id;
        if (this.getBlock(id)) {
            return this.splitBlockIndexOnId(id)[0].measure().length;
        } else {
            return 0;
        }
    }

    blockForOffset(offset) {
        var ref, ref1, results;
        results = this.splitBlockIndexOnOffset(offset);
        return ((ref = (ref1 = results[1]) != null ? ref1.peekFirst() : void 0) != null ? ref : results[0].peekLast).id;
    }

    getDocLength() {
        return this.blockIndex.measure().length;
    }

    getDocSubstring(start, end) {
        var block, endOffset, startOffset, text;
        startOffset = this.blockOffsetForDocOffset(start);
        endOffset = this.blockOffsetForDocOffset(end);
        block = this.getBlock(startOffset.block);
        text = '';
        while (block._id !== endOffset.block) {
            text += block.text;
            block = this.getBlock(block.next);
        }
        if (startOffset.block === endOffset.block) {
            return block.text.substring(startOffset.offset, endOffset.offset);
        } else {
            return text.substring(startOffset.offset) + block.text.substring(0, endOffset.offset);
        }
    }

    /** the text for the entire document */
    getText() {
        var text;
        text = '';
        this.eachBlock(function(block) {
            return text += block.text;
        });
        return text;
    }

    check() {
        var bl, first, lastBlock, next, oldBl, prev, seen;
        seen = {};
        first = next = this.getFirst();
        prev = null;
        while (next) {
            prev = next;
            if (seen[next]) {
                throw new Error("cycle in next links");
            }
            seen[next] = true;
            oldBl = bl;
            bl = this.getBlock(next);
            if (!bl) {
                throw new Error(`Next of ${oldBl._id} doesn't exist`);
            }
            next = bl.next;
        }
        this.eachBlock(function(block) {
            if (block._id !== first && !seen[block._id]) {
                throw new Error(`${block._id} not in next chain`);
            }
        });
        seen = {};
        lastBlock = prev;
        while (prev) {
            if (seen[prev]) {
                throw new Error("cycle in prev links");
            }
            seen[prev] = true;
            oldBl = bl;
            bl = this.getBlock(prev);
            if (!bl) {
                throw new Error(`Prev of ${oldBl._id} doesn't exist`);
            }
            prev = bl.prev;
        }
        this.eachBlock(function(block) {
            if (block._id !== lastBlock && !seen[block._id]) {
                throw new Error(`${block._id} not in prev chain`);
            }
        });
        return null;
    }

    blockList() {
        var bl, next, results1;
        next = this.getFirst();
        results1 = [];
        while (next) {
            bl = this.getBlock(next);
            next = bl.next;
            results1.push(bl);
        }
        return results1;
    }

    change(changes) {
        return this.trigger('change', this.makeChange(changes));
    }

    makeChange({ first, sets, removes, oldBlocks, newBlocks }) {
        return this.makeChanges(() => {
            var adds, bl, block, err, id, old, result, updates;
            ({ adds, updates, old } = result = {
                adds: {},
                updates: {},
                removes,
                old: {},
                sets,
                oldFirst: this.getFirst(),
                first: first,
                oldBlocks,
                newBlocks
            });
            this.setFirst(first);
            for (const id in removes) {
                if (bl = this.getBlock(id)) {
                    old[id] = bl;
                    this.deleteBlock(id);
                }
            }
            for (const id in sets) {
                block = sets[id];
                if (bl = this.getBlock(id)) {
                    old[id] = bl;
                    updates[id] = block;
                } else {
                    adds[id] = block;
                }
                this.setBlock(id, block);
            }
            try {
                this.check();
            } catch (error) {
                err = error;
                console.log(err);
            }
            return result;
        });
    }

    indexArray() {
        return treeToArray(this.blockIndex);
    }

    blockArray() {
        var block, blocks;
        blocks = [];
        block = this.getBlock(this.getFirst());
        while (block) {
            blocks.push(block);
            block = this.getBlock(block.next);
        }
        return blocks;
    }

    diag() {return this.trigger('diag', this.verifyIndex())}

    verifyIndex() {
        var bArray, blockIds, errs, iArray, j, last, len, node, offset, ref, treeIds;
        iArray = this.indexArray();
        treeIds = _.map(iArray, _.property('id'));
        bArray = this.blockArray();
        blockIds = _.map(bArray, _.property('_id'));
        if (!_.isEqual(treeIds, blockIds)) {
            console.warn(`INDEX ERROR:\nEXPECTED: ${JSON.stringify(blockIds)}\nBUT GOT: ${JSON.stringify(treeIds)}`);
        }
        last = null;
        errs = new BlockErrors();
        for (j = 0, len = iArray.length; j < len; j++) {
            node = iArray[j];
            if (node.length !== ((ref = this.getBlock(node.id)) != null ? ref.text.length : void 0)) {
                errs.badId(node.id, 'bad index length');
            }
        }
        offset = 0;
        this.eachBlock((block) => {
            last = block;
            if (!this.fingerNodeOrder(block.prev, block._id)) {
                errs.badId(block._id, 'bad order');
                console.warn(`NODE ORDER WRONG FOR ${block.prev}, ${block._id}`);
            }
            if (offset !== this.offsetForBlock(block._id)) {
                errs.badId(block._id, "offset");
            }
            if (block.prev && this.blockForOffset(offset - 1) !== block.prev) {
                errs.badId(block._id, "prev");
            }
            if (block.next && this.blockForOffset(offset + block.text.length) !== block.next) {
                errs.badId(block._id, "next");
            }
            return offset += block.text.length;
        });
        return errs.errors();
    }

    blockOverlapsForReplacement(start, end, text) {
        var blocks, cur, endBlock, fullText, offset, startBlock;
        startBlock = this.getBlock(this.blockForOffset(start));
        if (!startBlock && start) {
            startBlock = this.getBlock(this.blockForOffset(start - 1));
        }
        endBlock = this.getBlock(this.blockForOffset(end));
        if (!endBlock && end) {
            endBlock = this.getBlock(this.blockForOffset(end - 1));
        }
        blocks = [startBlock];
        cur = startBlock;
        while (cur !== endBlock && cur.next) {
            blocks.push(cur = this.getBlock(cur.next));
        }
        fullText = blockText(blocks);
        offset = this.offsetForBlock(blocks[0]);
        return {
            blocks: blocks,
            blockText: fullText,
            newText: fullText.substring(0, start - offset) + text + (fullText.substring(end - offset))
        };
    }
}

class BlockErrors {
    order: string[]
    ids: {[id: string]: string}

    constructor() {
        this.order = [];
        this.ids = {};
    }

    isEmpty() {return !this.order.length}

    badId(id, msg) {
        if (!this.ids[id]) {
            this.order.push(id);
            return this.ids[id] = msg;
        }
        return this.ids[id] += `, ${msg}`;
    }

    errors() {
        var id, j, len, ref, results1;
        if (!this.isEmpty()) {
            ref = this.order;
            results1 = [];
            for (j = 0, len = ref.length; j < len; j++) {
                id = ref[j];
                results1.push([id, `(${this.ids[id]})`]);
            }
            return results1;
        }
    }
}

export function link(prev, next) {
    prev.next = next._id
    next.prev = prev._id
}

export function blockText(blocks) {
    let result = ''

    for (const block of blocks) result += block.text
    return result
}

function indexNode(block) {return {id: block._id, length: block.text.length}}

function insertInSplit(first, middle, rest) {
  if (first.isEmpty()) {
    return rest.addFirst(middle);
  } else if (rest.isEmpty()) {
    return first.addLast(middle);
  } else {
    return first.addLast(middle).concat(rest);
  }
};

function insertAfterSplit(first, afterMiddle, rest) {
  var next;
  next = rest.removeFirst().addFirst(afterMiddle);
  if (first.isEmpty()) {
    return next.addFirst(rest.peekFirst());
  } else {
    return first.addLast(rest.peekFirst()).concat(next);
  }
};

export function treeToArray<Measure, Data>(tree: FingerTree<Measure, Data>) {
    let nodes: Data[] = [];

    while (!tree.isEmpty()) {
        nodes.push(tree.peekFirst());
        tree = tree.removeFirst();
    }
    return nodes;
};

let FJQData = new WeakMap();

function getNodeData(node, create = false) {
    if (create && !FJQData.has(node)) FJQData.set(node, {})
    return FJQData.get(node);
};

function getDataProperty(node, prop, create) {
    let d = getNodeData(node, create)

    if (!d) return null
    if (!d[prop]) d[prop] = {}
    return d[prop];
};

function getUserData(node, create) {return node && getDataProperty(node, 'userData', create)}

function getEvents(node, create = false) {return node && getDataProperty(node, 'events', create)}

type jqFunc = ((...args)=> any) & {
    ready: typeof FeatherJQ.ready,
    ajax: typeof FeatherJQ.ajax,
    get: typeof FeatherJQ.get,
}

export let $func: jqFunc

export let is$: (f: Function)=> boolean

export let $: jqFunc

const $$$ = (...args)=> {return $func(...args)}
$$$.ready = (func)=> $func.ready(func)
$$$.ajax = (req: {url, success, data?: any})=> $func.ajax(req)
$$$.get = (url, success)=> $func.get(url, success)

function f$(spec?: any, context: Node = document) {return new FeatherJQ(spec, context)}

function isFeather(obj) {return obj instanceof FeatherJQ || (obj.prop && obj.attr)}

export function set$(new$: jqFunc, is$Func: (f: Function)=> boolean) {
    $func = new$
    is$ = is$Func
}

/**
 * FeatherJQ class
 * ===============
 * A featherweight JQuery replacement.  Users can use set$ to make it use
 * the real jQuery, like this: `set$($, (obj)-> obj instanceof $)`
 */
export class FeatherJQ {
    context: Node
    length = 0

    static ajax(req: {url, success, data?: any}) {
        const {url, success, data} = req
        let xhr = new XMLHttpRequest();

        xhr.onreadystatechange = function() {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                return success(xhr.responseText);
            }
        };
        xhr.open((data ? 'POST' : 'GET'), url, true);
        return xhr.send(data);
    }

    static get(url, success) {return FeatherJQ.ajax({url, success})}

    static ready(func) {return readyPromise.then(func)}

    constructor(spec: any = [], context: Node = document) {
        this.context = context
        for (const item of featherItem(context, spec)) {
            this.push(item)
        }
    }

    find(sel) {
        var j, l, len, len1, node, ref, ref1, result, results;
        results = f$();
        ref = this;
        for (j = 0, len = ref.length; j < len; j++) {
            node = ref[j];
            if (node.querySelectorAll != null) {
                ref1 = node.querySelectorAll(sel);
                for (l = 0, len1 = ref1.length; l < len1; l++) {
                    result = ref1[l];
                    results.push(result);
                }
            }
        }
        return results;
    }

    attr(name, value?) {
        if (value != undefined) {
            for (const node of this) {
                node.setAttribute(name, value);
            }
            return this;
        }
        return this[0] && this[0].getAttribute && this[0].getAttribute(name)
    }

    prop(name, value?) {
        var j, len, node, ref, ref1;
        if (value != undefined) {
            ref = this;
            for (j = 0, len = ref.length; j < len; j++) {
                node = ref[j];
                node[name] = value;
            }
            return this;
        }
        return (ref1 = this[0]) != null ? ref1[name] : void 0;
    }

    closest(sel) {
        const result = f$();

        for (const node of this) {
            const n = (node.closest ? node : node.parentNode as Element).closest(sel)

            if (n) result.push(n)
        }
        return result;
    }

    is(sel) {
        for (let j = 0, len = this.length; j < len; j++) {
            const node = this[j];
            if (typeof node.matches === "function" && node.matches(sel)) return true
        }
        return false;
    }

    push(...items: any) {
        for (const item of items) this[this.length++] = item
        return this
    }

    parent() {
        const result = f$();

        for (let j = 0, len = this.length; j < len; j++) {
            const p = this[j]?.parentNode

            if (p) result.push(p)
        }
        return result;
    }

    data(key, value) {
        if (!key) return getUserData(this[0], true)
        const d = getUserData(this[0], true)
        if (value == undefined) return d[key]
        for (let j = 0, len = this.length; j < len; j++) d[key] = value
        return this;
    }

    on(evtType, func) {
        for (const node of this) {
            const evt = getEvents(node);

            if (!evt[evtType]) evt[evtType] = []
            node.addEventListener(evtType, func);
            evt[evtType].push(func)
        }
        return this;
    }

    off(evtType, func) {
        for (const node of this) {
            const allEvents = getEvents(node)
            const evts = allEvents && allEvents[evtType]
            const remaining = []

            if (!evts) continue
            for (const evtFunc of evts) {
                if (func && evtFunc !== func) remaining.push(evtFunc)
                else node.removeEventListener(evtType, evtFunc)
            }
            if (remaining.length) allEvents[evtType] = remaining
            else delete allEvents[evtType]
        }
        return this
    }

    ready(func) {return FeatherJQ.ready(func)}

    html(newHtml) {
        for (let j = 0, len = this.length; j < len; j++) this[j].innerHTML = newHtml
        return this
    }

    children(sel?: string) {
        const result = f$()

        for (const node of this) {
            for (const child of node.children as any as Element[]) {
                if (!sel || (child.matches && child.matches(sel))) result.push(child)
            }
        }
        return result
    }

    filter(criterion, thisArg?) {
        const pred: (el: Element)=> any =
            typeof criterion === 'string' ? (item)=> item.matches(criterion)
            : Array.isArray(criterion) ? (item)=> criterion.includes(item)
            : criterion instanceof Function ? criterion
            : (_item)=> false

        // call super method with computed pred and convert result to FeatherJQ
        return new FeatherJQ(Array.prototype.filter.call(this, pred), this.context)
    }

    insertAfter(sel: any) {
        const targets = featherItem(this.context, sel) as Element[]
        let items = this as any as Node[]
        let clone = false

        for (const target of targets) {
            if (clone) items = items.map(i=> i.cloneNode(true))
            for (const item of items) target.after(item)
            clone = true
        }
        return this
    }

    append(sel: any) {
        let children = featherItem(this.context, sel) as Node[]
        let clone = false

        for (const parent of this) {
            if (clone) children = children.map(i=> i.cloneNode(true))
            for (const child of children) parent.append(child)
            clone = true
        }
        return this
    }

    remove() {
        for (const node of this) node.remove()
        return this
    }

    first() {return this[0] ? f$(this[0]) : f$()}

    after(content: any, content2?: any) {
        if (content instanceof Function) {
            for (let i = 0; i < this.length; i++) {
                const parent = this[i]
                const item = content.length === 1 ? content.call(parent, i)
                    : content.call(parent, i, parent.outerHTML)

                parent.after(item)
            }
        } else {
            let children = featherItem(this.context, content)
            let clone = false

            if (content2) {
                children = children.concat(content2.flatMap(item=> featherItem(this.context, item)))
            }
            for (const parent of this) {
                if (clone) children = children.map(i=> i.cloneNode(true))
                for (const child of children) parent.after(child)
                clone = true
            }
        }
        return this
    }

    [Symbol.iterator](): {next: (()=> {value?: Element, done: boolean})} {
        let index = 0

        return {
            next: ()=> index < this.length ? {done: false, value: this[index++]} : {done: true}
        }
    }
}

declare const jQuery: any

function checkFJQValue(expected, actual) {
    if (expected !== actual) {
        if (expected instanceof Element && actual instanceof Element
            && !expected.isConnected
            && expected.outerHTML == actual.outerHTML) return
        throw new Error('bad FeatherJQ result')
    }
}

function checkFJQ(expected, actual) {
    if (!(expected instanceof jQuery)) return checkFJQValue(expected, actual)
    checkFJQValue(expected.length, actual.length)
    for (let i = 0; i < expected.length; i++) {
        checkFJQValue(expected[i], actual[i])
    }
}

/**
 * proxy wrapper for featherJQ that varifies it against jQuery
 */
function vFeatherJQ(args: any, context: Node = document) {
    if (args.vfProxyValue) args = args.vfProxyValue
    const jq = jQuery(args instanceof FeatherJQ ? [...args] : args, context)
    const fjq = f$(args, context)

    return new Proxy(f$(args, context), {
        get(_target, prop, _receiver) {
            if (prop === Symbol.iterator) return fjq[Symbol.iterator]
            if (prop === 'vfProxyValue') return fjq
            if (['ready', 'data', 'context'].includes(prop as string)) return fjq[prop]
            if (!(jq[prop] instanceof Function)) {
                checkFJQ(jq[prop], fjq[prop])
                return fjq[prop]
            }
            return (...args: any[])=> {
                args = args.map(unproxy)
                if (['on', 'off'].includes(prop as string)) {
                    return vFeatherJQ(fjq[prop](...args), fjq.context)
                }
                const expected = jq[prop](...args)
                const result = fjq[prop](...args)

                checkFJQ(expected, result)
                if (!(expected instanceof jQuery)) return result
                return vFeatherJQ(result, fjq.context)
            }
        }
    })
}

vFeatherJQ.ajax = FeatherJQ.ajax
vFeatherJQ.get = FeatherJQ.get
vFeatherJQ.ready = FeatherJQ.ready

function unproxy(item) {
    return typeof item === 'object' && item.vfProxyValue ? item.vfProxyValue : item
}

function featherItem(context: Node, spec: any): Node[] {
    if (typeof spec === 'object' && spec.vfProxyValue) return [...spec.vfProxyValue]
    if (spec instanceof FeatherJQ) return [...spec]
    if (Array.isArray(spec)) return spec
    if (spec instanceof Node) return [spec]
    if (typeof spec !== 'string') return []
    try {
        return [...((context as any).querySelectorAll(spec) as any)]
    } catch (error) {
        const err = error;
        const div = document.createElement('div')

        div.innerHTML = spec
        return [...(div.children as any)]
    }
}

f$.ready = FeatherJQ.ready
f$.ajax = FeatherJQ.ajax
f$.get = FeatherJQ.get

if ('$' in window) {
    $ = window['$']
    is$ = (x=> x === $)
} else {
    $ = $$$
    set$(f$, isFeather)
    //set$(vFeatherJQ, isFeather)
}
