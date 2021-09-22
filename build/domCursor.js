// DOMCursor
// =========
// Copyright (C) 2014, 2021, Bill Burdick, Roy Riggs, TEAM CTHULHU
if (!('CaretPosition' in window))
    window.CaretPosition = (class {
    });
const mozdocument = document;
const webkitdocument = document;
export class DOMCursor {
    constructor(node, pos, filter) {
        if (pos instanceof Function)
            filter = pos;
        if (node instanceof Range) {
            if (typeof pos !== 'number')
                pos = node.startOffset;
            node = node.startContainer;
        }
        else if (node instanceof CaretPosition) {
            if (typeof pos !== 'number')
                pos = node.offset;
            node = node.offsetNode;
        }
        this.node = node;
        this.pos = (pos || 0);
        this.filter = filter || (() => true);
        this.computeType();
        this.savedTextPosition = null;
    }
    static differentLines(pos1, pos2) {
        return (pos1.bottom - 4 <= pos2.top) || (pos2.bottom - 4 <= pos1.top);
    }
    static differentPosition(pos1, pos2) {
        if (this.differentLines(pos2, pos1))
            return true;
        if (pos1.right == null)
            return false;
        if (pos2.right == null)
            return Math.floor(pos1.left) !== Math.floor(pos2.left);
        const r1 = Math.floor(pos1.right);
        const r2 = Math.floor(pos2.right);
        const l1 = Math.floor(pos1.left);
        const l2 = Math.floor(pos2.left);
        return (r1 !== r2 || l1 !== l2) && (r2 < l1 || r1 < l2 || ((r1 < r2) === (l1 < l2) && (r1 > r2) === (l1 > l2)));
    }
    static getBoundingRect(node) {
        if (node instanceof HTMLElement)
            return node.getBoundingClientRect();
        spareRange.selectNode(node);
        return spareRange.getBoundingClientRect();
    }
    static getTextPosition(textNode, offset) {
        var r;
        if (offset < textNode.length) {
            spareRange.setStart(textNode, offset);
            spareRange.setEnd(textNode, offset + 1);
            r = getClientRect(spareRange);
            if (!r || (r.width === 0 && r.height === 0)) {
                spareRange.selectNodeContents(textNode.parentNode);
                if (spareRange.getClientRects().length === 0) {
                    r = DOMCursor.getBoundingRect(textNode);
                }
            }
        }
        else {
            spareRange.setStart(textNode, offset);
            spareRange.collapse(true);
            r = getClientRect(spareRange);
        }
        if (!r || (r.width === 0 && r.height === 0)) {
            if (offset === 0) {
                textNode.parentNode.insertBefore(positioner, textNode);
            }
            else if (offset === textNode.length || textNode.splitText(offset)) {
                textNode.parentNode.insertBefore(positioner, textNode.nextSibling);
            }
            spareRange.selectNode(positioner);
            r = spareRange.getBoundingClientRect();
            positioner.parentNode.removeChild(positioner);
            textNode.parentNode.normalize();
        }
        return r;
    }
    static selectRange(r) {
        if (!r)
            return;
        const sel = getSelection();
        debug("select range", r, new Error('trace').stack);
        if (!(sel.rangeCount === 1 && DOMCursor.sameRanges(sel.getRangeAt(0), r))) {
            return sel.setBaseAndExtent(r.startContainer, r.startOffset, r.endContainer, r.endOffset);
        }
    }
    // Thanks to (rangy)[this: https://github.com/timdown/rangy] for the isCollapsed logic
    static isCollapsed(node) {
        var type;
        if (node) {
            type = node.nodeType;
            return type === 7 || type === 8 || (type === node.TEXT_NODE && (node.data === '' || DOMCursor.isCollapsed(node.parentNode))) || /^(script|style)$/i.test(node.nodeName) || (type === node.ELEMENT_NODE && !node.offsetParent);
        }
    }
    static sameRanges(r1, r2) {
        return r1.compareBoundaryPoints(Range.START_TO_START, r2) === 0 && r1.compareBoundaryPoints(Range.END_TO_END, r2) === 0;
    }
    isCollapsed() { return !this.isEmpty() && DOMCursor.isCollapsed(this.node); }
    computeType() {
        this.type = !this.node ? 'empty'
            : this.node.nodeType === this.node.TEXT_NODE ? 'text'
                : 'element';
        return this;
    }
    equals(other) {
        return other instanceof DOMCursor && this.node === other.node && this.pos === other.pos;
    }
    newPos(node, pos) {
        if (node instanceof Range) {
            return new DOMCursor(node);
        }
        else {
            return new DOMCursor(node, pos, this.filter);
        }
    }
    toString() {
        return `DOMCursor(${this.type}, ${this.pos}${this.type === 'text' ? ', ' + this.posString() : ''})`;
    }
    posString() { return this.node.data.substring(0, this.pos) + '|' + this.node.data.substring(this.pos); }
    textPosition() {
        var pos;
        if (this.isEmpty()) {
            return null;
        }
        else {
            return (pos = this.savedTextPosition) != null ? pos : (this.savedTextPosition = DOMCursor.getTextPosition(this.node, this.pos));
        }
    }
    isDomCaretTextPosition() {
        const p = this.textPosition();
        const { node, offset } = DOMCursor.caretPos(p.left, p.top);
        return node === this.node && offset === this.pos;
    }
    // **Character** returns the character at the position
    character() {
        const p = this.type === 'text' ? this : this.save().firstText();
        return p.node.data[p.pos];
    }
    // **isEmpty** returns true if the cursor is empty
    isEmpty() { return this.type === 'empty'; }
    // **setFilter** sets the filter
    setFilter(f) { return new DOMCursor(this.node, this.pos, f); }
    // **addFilter** adds a filter
    addFilter(filt) {
        const oldFilt = this.filter;
        return this.setFilter(n => {
            const oldF = oldFilt(n);
            const f = filt(n);
            if (oldF === 'quit' || f === 'quit')
                return 'quit';
            if (oldF === 'skip' || f === 'skip')
                return 'skip';
            return oldF && f;
        });
    }
    // **next** moves to the next filtered node
    next(up) {
        const saved = this.save();
        let n = this.nodeAfter(up);
        let res;
        while (!n.isEmpty()) {
            switch (res = this.filter(n)) {
                case 'skip':
                    n = n.nodeAfter(true);
                    continue;
                case 'quit':
                    break;
                default:
                    if (res)
                        return n;
            }
            n = n.nodeAfter();
        }
        return this.restore(saved).emptyNext();
    }
    // **prev** moves to the next filtered node
    prev(up) {
        const saved = this.save();
        let n = this.nodeBefore(up);
        while (!n.isEmpty()) {
            const res = this.filter(n);
            switch (res) {
                case 'skip':
                    n = n.nodeBefore(true);
                    continue;
                case 'quit':
                    break;
                default:
                    if (res)
                        return n;
            }
            n = n.nodeBefore();
        }
        return this.restore(saved).emptyPrev();
    }
    // **nodes** returns all of the nodes this cursor finds
    nodes() {
        const results = [];
        let n = this;
        while (!(n = n.next()).isEmpty()) {
            results.push(n.node);
        }
        return results;
    }
    // **moveCaret** move the document selection to the current position
    moveCaret(r) {
        if (!this.isEmpty()) {
            if (!r)
                r = document.createRange();
            r.setStart(this.node, this.pos);
            r.collapse(true);
            DOMCursor.selectRange(r);
        }
        return this;
    }
    adjustForNewline() {
        if (this.isEmpty())
            return this;
        const s = this.save();
        let n = this;
        if (this.pos === 0 && this.node.data[0] === '\n') {
            while (!n.isEmpty() && (n = n.prev()).type !== 'text') { }
            if (n.isEmpty())
                return s;
            if (n.node.data[n.pos - 1] === '\n')
                return s;
            return n;
        }
        else if (this.pos === this.node.length && this.node.data[this.pos - 1] === '\n') {
            while (!n.isEmpty() && (n = n.next()).type !== 'text') { }
            if (n.node.data[n.pos] === '\n')
                return s;
            return n;
        }
        return this;
    }
    // **range** create a range between two positions
    range(other, r) {
        if (!r) {
            r = document.createRange();
        }
        if (other == null) {
            other = this;
        }
        r.setStart(this.node, this.pos);
        r.setEnd(other.node, other.pos);
        return r;
    }
    // **firstText** find the first text node (the 'backwards' argument is optional and if true,
    // indicates to find the first text node behind the cursor).
    firstText(backwards) {
        let n = this;
        while (!n.isEmpty() && (n.type !== 'text' || (!backwards && n.pos === n.node.data.length))) {
            n = (backwards ? n.prev() : n.next());
        }
        return n;
    }
    // **countChars** count the characters in the filtered nodes until we get to (node, pos)
    // Include (node, 0) up to but not including (node, pos)
    countChars(node, pos) {
        const start = this.copy();
        let n = this;
        let tot = 0;
        if (node instanceof DOMCursor) {
            pos = node.pos;
            node = node.node;
        }
        while (!n.isEmpty() && n.node !== node) {
            if (n.type === 'text')
                tot += n.node.length;
            n = n.next();
        }
        if (n.isEmpty() || n.node !== node)
            return -1;
        if (n.type === 'text') {
            tot += pos;
            if (start.node === n.node)
                tot -= start.pos;
            return tot;
        }
        return tot;
    }
    // **forwardChars** moves the cursor forward by count characters
    // if contain is true and the final location is 0 then go to the end of
    // the previous text node (node, node.length)
    forwardChars(count, contain) {
        if (count === 0)
            return this;
        let dc = this;
        count += this.pos;
        while (!dc.isEmpty() && 0 <= count) {
            if (dc.type === 'text') {
                if (count < dc.node.length) {
                    if (count === 0 && contain) {
                        dc = dc.prev();
                        while (dc.type !== 'text')
                            dc = dc.prev();
                        return dc.newPos(dc.node, dc.node.length);
                    }
                    return dc.newPos(dc.node, count);
                }
                count -= dc.node.length;
            }
            dc = dc.next();
        }
        return dc.emptyNext();
    }
    // **hasAttribute** returns true if the node is an element and has the attribute or if it is a text node and its parent has the attribute
    hasAttribute(a) {
        return (this.node != null) && this.node.nodeType === this.node.ELEMENT_NODE && this.node.hasAttribute(a);
    }
    // **getAttribute** returns the attribute if the node is an element and has the attribute
    getAttribute(a) {
        return (this.node != null) && this.node.nodeType === this.node.ELEMENT_NODE && this.node.getAttribute(a);
    }
    // **filterTextNodes** adds text node filtering to the current filter; the cursor will only find text nodes
    filterTextNodes() { return this.addFilter((n) => n.type === 'text'); }
    // **filterTextNodes** adds visible text node filtering to the current filter; the cursor will only find visible text nodes
    filterVisibleTextNodes() { return this.filterTextNodes().addFilter((n) => !n.isCollapsed()); }
    // **filterParent** adds parent filtering to the current filter; the cursor will only find nodes that are contained in the parent (or equal to it)
    filterParent(parent) {
        if (!parent)
            return this.setFilter(() => 'quit');
        return this.addFilter((n) => parent.contains(n.node) || 'quit');
    }
    // **filterRange** adds range filtering to the current filter; the cursor will only find nodes that are contained in the range
    filterRange(sc, startOffset, endContainer, endOffset) {
        const startContainer = sc instanceof Range ? sc.startContainer : sc;
        if (sc instanceof Range) {
            if (startOffset === null || startOffset === undefined)
                return this;
            startOffset = sc.startOffset;
            endContainer = sc.endContainer;
            endOffset = sc.endOffset;
        }
        return this.addFilter((n) => {
            const pos = n.pos;
            const startPos = startContainer.compareDocumentPosition(n.node);
            if (startPos === 0)
                return (startOffset <= pos && pos <= endOffset) || 'quit';
            if (startPos & document.DOCUMENT_POSITION_FOLLOWING) {
                const endPos = endContainer.compareDocumentPosition(n.node);
                if (endPos === 0)
                    return n.pos <= endOffset || 'quit';
                return endPos & document.DOCUMENT_POSITION_PRECEDING || 'quit';
            }
            return 'quit';
            //return (startPos === 0 ? (startOffset <= (ref = n.pos) && ref <= endOffset)
            //    : startPos & document.DOCUMENT_POSITION_FOLLOWING ? (endPos = endContainer.compareDocumentPosition(n.node), endPos === 0 ? n.pos <= endOffset
            //        : endPos & document.DOCUMENT_POSITION_PRECEDING)
            //    : 0)
            //    || 'quit';
        });
    }
    // **getText** gets all of the text at or after the cursor (useful with filtering; see above)
    getText() {
        let t;
        let n = this.mutable().firstText();
        if (n.isEmpty())
            return '';
        t = n.node.data.substring(n.pos);
        while (!(n = n.next()).isEmpty()) {
            if (n.type === 'text')
                t += n.node.data;
        }
        if (t.length) {
            while (n.type !== 'text')
                n.prev();
            n = n.newPos(n.node, n.node.length);
            while (n.pos > 0 && reject(n.filter(n)))
                n.pos--;
            return t.substring(0, t.length - n.node.length + n.pos);
        }
        return '';
    }
    // **getTextTo** gets all of the text at or after the cursor (useful with filtering; see above)
    getTextTo(other) {
        let t;
        let n = this.mutable().firstText();
        if (n.isEmpty())
            return '';
        t = n.node.data.substring(n.pos);
        if (n.node !== other.node) {
            while (!(n = n.next()).isEmpty()) {
                if (n.type === 'text')
                    t += n.node.data;
                if (n.node === other.node)
                    break;
            }
        }
        if (t.length) {
            while (n.type !== 'text')
                n.prev();
            if (n.node === other.node) {
                n = n.newPos(n.node, other.pos);
            }
            else {
                n = n.newPos(n.node, n.node.length);
            }
            while (n.pos > 0 && reject(n.filter(n)))
                n.pos--;
            return t.substring(0, t.length - n.node.length + n.pos);
        }
        return '';
    }
    char() { return this.type === 'text' && this.node.data[this.pos]; }
    // **isNL** returns whether the current character is a newline
    isNL() { return this.char() === '\n'; }
    // **endsInNL** returns whether the current node ends with a newline
    endsInNL() { return this.type === 'text' && this.node.data[this.node.length - 1] === '\n'; }
    // **moveToStart** moves to the beginning of the node
    moveToStart() { return this.newPos(this.node, 0); }
    // **moveToNextStart** moves to the beginning of the next node
    moveToNextStart() { return this.next().moveToStart(); }
    // **moveToEnd** moves to the textual end the node (1 before the end if the node
    // ends in a newline)
    moveToEnd() { return this.newPos(this.node, this.node.length - (this.endsInNL() ? 1 : 0)); }
    // **moveToPrevEnd** moves to the textual end the previous node (1 before
    // the end if the node ends in a newline)
    moveToPrevEnd() { return this.prev().moveToEnd(); }
    /** moves forward until the given function returns false or 'found'.
     *    if false, return the previous position
     *    if 'found', return the current position
     */
    forwardWhile(test) {
        var t;
        let dc = this.immutable();
        let prev = dc;
        while (dc = dc.forwardChar()) {
            if (dc.isEmpty() || !(t = test(dc)))
                return prev;
            if (t === 'found')
                return dc;
            prev = dc;
        }
    }
    /** checks whether a condition is true until the EOL */
    checkToEndOfLine(test) {
        let dc = this.immutable();
        const tp = dc.textPosition();
        while (!dc.isEmpty() && (test(dc))) {
            if (DOMCursor.differentLines(tp, dc.textPosition()))
                return true;
            dc = dc.forwardChar();
        }
        return dc.isEmpty();
    }
    // **checkToStartOfLine** checks whether a condition is true until the EOL
    checkToStartOfLine(test) {
        let dc = this.immutable();
        const tp = dc.textPosition();
        while (!dc.isEmpty() && (test(dc))) {
            if (DOMCursor.differentLines(tp, dc.textPosition()))
                return true;
            dc = dc.backwardChar();
        }
        return dc.isEmpty();
    }
    // **endOfLine** moves to the end of the current line
    endOfLine() {
        const tp = this.textPosition();
        return this.forwardWhile(n => !DOMCursor.differentLines(tp, n.textPosition()));
    }
    // **forwardLine** moves to the next line, trying to keep the current screen pixel column.  Optionally takes a goalFunc that takes the position's screen pixel column as input and returns -1, 0, or 1 from comparing the input to the an goal column
    forwardLine(goalFunc) {
        let line = 0;
        let tp = this.textPosition();
        if (!goalFunc)
            goalFunc = _n => -1;
        return this.forwardWhile(n => {
            const pos = n.textPosition();
            if (DOMCursor.differentLines(tp, pos)) {
                tp = pos;
                line++;
            }
            if (line === 1 && goalFunc(pos.left + 2) > -1)
                return 'found';
            return line !== 2;
        });
    }
    // **backwardWhile** moves backward until the given function is false or 'found',
    // returning the previous position if the function is false or the current
    // position if the function is 'found'
    backwardWhile(test) {
        let t;
        let n = this.immutable();
        let prev = n;
        while (n = n.backwardChar()) {
            if (n.isEmpty() || !(t = test(n))) {
                return prev;
            }
            if (t === 'found') {
                return n;
            }
            prev = n;
        }
    }
    // **endOfLine** moves to the end of the current line
    startOfLine() {
        const tp = this.textPosition();
        return this.backwardWhile(n => !DOMCursor.differentLines(tp, n.textPosition()));
    }
    differentPosition(c) {
        return DOMCursor.differentPosition(this.textPosition(), c.textPosition());
    }
    differentLines(c) {
        return DOMCursor.differentLines(this.textPosition(), c.textPosition());
    }
    // **backwardLine** moves to the previous line, trying to keep the current screen pixel column.  Optionally takes a goalFunc that takes the position's screen pixel column as input and returns -1, 0, or 1 from comparing the input to an internal goal column
    backwardLine(goalFunc) {
        let tp = this.textPosition();
        let line = 0;
        if (!goalFunc)
            goalFunc = _n => -1;
        return (this.backwardWhile(n => {
            const pos = n.textPosition();
            let goal;
            if (DOMCursor.differentLines(tp, pos)) {
                tp = pos;
                line++;
            }
            if (line === 1 && ((goal = goalFunc(n.textPosition().left - 2)) === (-1) || goal === 0)) {
                return 'found';
            }
            return line !== 2;
        })).adjustBackward();
    }
    adjustBackward() {
        const p = this.textPosition();
        return this.backwardWhile(n => !DOMCursor.differentPosition(p, n.textPosition()));
    }
    forwardChar() {
        let n = this;
        if (this.pos + 1 <= this.node.length)
            return this.newPos(this.node, this.pos + 1);
        while (!(n = n.next()).isEmpty()) {
            if (n.node.length !== 0)
                break;
        }
        return n;
    }
    boundedForwardChar() {
        const n = this.save().forwardChar();
        return n.isEmpty() ? n.prev() : n;
    }
    backwardChar() {
        const oldNode = this.node;
        let p = this;
        while (!p.isEmpty() && p.pos === 0)
            p = p.prev();
        return p.isEmpty() ? p
            : p.newPos(p.node, p.node !== oldNode ? p.pos : p.pos - 1);
    }
    boundedBackwardChar() {
        const n = this.save().backwardChar();
        return n.isEmpty() ? n.next() : n;
    }
    // **show** scroll the position into view.  Optionally takes a rectangle representing a toolbar at the top of the page (sorry, this is a bit limited at the moment)
    show(topRect) {
        const p = this.textPosition();
        if (p) {
            const top = (topRect != null ? topRect.width : 0) && topRect.top === 0 ? topRect.bottom : 0;
            if (p.bottom > window.innerHeight) {
                window.scrollBy(0, p.bottom - window.innerHeight);
            }
            else if (p.top < top) {
                window.scrollBy(0, p.top - top);
            }
        }
        return this;
    }
    // **immutable** return an immutable version of this cursor
    immutable() { return this; }
    /** call a function with a mutable version of this cursor and return the cursor afterwards */
    withMutations(func) {
        const dc = this.copy().mutable();
        func(dc);
        return dc;
    }
    // **mutable** return a mutable version of this cursor
    mutable() { return new MutableDOMCursor(this.node, this.pos, this.filter); }
    // **save** generate a memento which can be used to restore the state (used by mutable cursors)
    save() { return this; }
    // **restore** restore the state from a memento (used by mutable cursors)
    restore(n) { return n.immutable(); }
    // **copy** return a copy of this cursor
    copy() { return this; }
    // **nodeAfter** low level method that moves to the unfiltered node after the current one
    nodeAfter(up) {
        var node = this.node;
        while (node) {
            if (node.nodeType === node.ELEMENT_NODE && !up && node.childNodes.length) {
                return this.newPos(node.childNodes[0], 0);
            }
            else if (node.nextSibling) {
                return this.newPos(node.nextSibling, 0);
            }
            else {
                up = true;
                node = node.parentNode;
            }
        }
        return this.emptyNext();
    }
    // **emptyNext** returns an empty cursor whose prev is the current node
    emptyNext() {
        const p = new EmptyDOMCursor();
        // return an empty next node where
        //   prev returns this node
        //   next returns the same empty node
        p.filter = this.filter,
            p.prev = (up) => up ? this.prev(up) : this;
        p.nodeBefore = (up) => up ? this.nodeBefore(up) : this;
        return p;
    }
    // **nodeBefore** low level method that moves to the unfiltered node before the current one
    nodeBefore(up) {
        var newNode;
        let node = this.node;
        while (node) {
            if (node.nodeType === node.ELEMENT_NODE && !up && node.childNodes.length) {
                newNode = node.childNodes[node.childNodes.length - 1];
            }
            else if (node.previousSibling) {
                newNode = node.previousSibling;
            }
            else {
                up = true;
                node = node.parentNode;
                continue;
            }
            return this.newPos(newNode, newNode.length);
        }
        return this.emptyPrev();
    }
    // **emptyPrev** returns an empty cursor whose next is the current node
    emptyPrev() {
        const p = new EmptyDOMCursor();
        p.filter = this.filter;
        p.next = (up) => up ? this.next(up) : this;
        p.nodeAfter = (up) => up ? this.nodeAfter(up) : this;
        return p;
    }
}
DOMCursor.debug = false;
DOMCursor.caretPos = mozdocument.caretPositionFromPoint
    ? (x, y) => {
        const pos = mozdocument.caretPositionFromPoint(x, y);
        return { node: pos.offsetNode, offset: pos.offset };
    } : (x, y) => {
    const pos = webkitdocument.caretRangeFromPoint(x, y);
    return { node: pos.startContainer, offset: pos.startOffset };
};
class EmptyDOMCursor extends DOMCursor {
    constructor() { super(null); }
    moveCaret() { return this; }
    show() { return this; }
    nodeAfter(_up) { return this; }
    nodeBefore(_up) { return this; }
    next() { return this; }
    prev() { return this; }
}
/** Mutable cursor methods change the cursor instead of returning new cursors */
class MutableDOMCursor extends DOMCursor {
    setFilter(filter) {
        this.filter = filter;
        return this;
    }
    newPos(node, pos) {
        if (node instanceof Range) {
            pos = pos || node.startOffset;
            node = node.startContainer;
        }
        this.node = node;
        this.pos = pos;
        this.savedTextPosition = null;
        return this.computeType();
    }
    copy() { return new MutableDOMCursor(this.node, this.pos, this.filter); }
    mutable() { return this; }
    immutable() { return new DOMCursor(this.node, this.pos, this.filter); }
    save() { return this.immutable(); }
    restore(dc) {
        this.node = dc.node;
        this.pos = dc.pos;
        this.filter = dc.filter;
        return this;
    }
    emptyPrev() {
        this.type = 'empty';
        this.next = function (up) {
            this.revertEmpty();
            if (up) {
                return this.next(up);
            }
            else {
                return this;
            }
        };
        this.nodeAfter = function (up) {
            this.computeType();
            if (up) {
                return this.nodeAfter(up);
            }
            else {
                return this;
            }
        };
        this.prev = function () {
            return this;
        };
        this.nodeBefore = function () {
            return this;
        };
        return this;
    }
    revertEmpty() {
        this.computeType();
        delete this.next;
        delete this.prev;
        delete this.nodeAfter;
        delete this.nodeBefore;
        return this;
    }
    /** truncates the range after this node */
    emptyNext() {
        this.type = 'empty';
        this.prev = (up) => {
            this.revertEmpty();
            return up ? this.prev(up) : this;
        };
        this.nodeBefore = (up) => {
            this.computeType();
            return up ? this.nodeBefore(up) : this;
        };
        this.next = () => this;
        this.nodeAfter = () => this;
        return this;
    }
}
// Utility functions
function debug(...args) { DOMCursor.debug && console.log(...args); }
function reject(filterResult) {
    return !filterResult || (filterResult === 'quit' || filterResult === 'skip');
}
;
// Node location routines
let positioner = document.createElement('DIV');
positioner.setAttribute('style', 'display: inline-block');
positioner.innerHTML = 'x';
let spareRange = document.createRange();
let emptyRect = {
    width: 0,
    height: 0
};
function chooseUpper(r1, r2) { return r1.top < r2.top; }
function chooseLower(r1, r2) { return r1.top > r2.top; }
function getClientRect(r) {
    var comp, i, len, rect, result;
    const rects = r.getClientRects();
    if (rects.length === 1)
        return rects[0];
    if (rects.length === 2) {
        result = rects[0];
        //comp = if r.startContainer.data[r.startOffset] == '\n' then chooseUpper
        comp = r.startContainer.data[r.startOffset] === '\n'
            && r.startOffset > 0
            && r.startContainer.data[r.startOffset] !== '\n' ? chooseUpper
            : chooseLower;
        for (i = 0, len = rects.length; i < len; i++) {
            rect = rects[i];
            if (comp(rect, result))
                result = rect;
        }
        return result;
    }
    return emptyRect;
}
DOMCursor.MutableDOMCursor = MutableDOMCursor;
DOMCursor.emptyDOMCursor = new EmptyDOMCursor();
DOMCursor.debug = false;
//# sourceMappingURL=domCursor.js.map