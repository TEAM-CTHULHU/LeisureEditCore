// DOMCursor
// =========
// Copyright (C) 2014, 2021, Bill Burdick, Roy Riggs, TEAM CTHULHU

// Licensed with ZLIB license (see "License", below).

// Filtered cursoring on DOM trees.  DOMCursors can move forwards or backwards, by node or by character, with settable filters that can seamlessly skip over parts of the DOM.

// This readme file is also the code.

// Here are some examples (I'm wrapping them in a -> to make a no-op that gets syntax highlighting in viewers that support it).

//(function() {
//  var domCursor, domCursorForCaret, getOrgText;
//  // In Leisure, I use it like this, to retrieve text from the page (scroll down to see docs on these methods, by the way):
//  DOMCursor.prototype.filterOrg = function() {
//    return this.addFilter(function(n) {
//      return !n.hasAttribute('data-nonorg') || 'skip';
//    });
//  };
//  domCursor = function(node, pos) {
//    return new DOMCursor(node, pos).filterOrg();
//  };
//  // full text for node
//  getOrgText = function(node) {
//    return domCursor(node.firstChild, 0).mutable().filterTextNodes().filterParent(node).getText();
//  };
//  // And like this for cursor movement.  Once I have the cursor, I can use forwardChar, backwardChar, forwardLine, backwardLine to move it around:
//  return domCursorForCaret = function(end) {
//    var c, parent, sel;
//    sel = getSelection();
//    c = sel.type === 'None' ? emptyDOMCursor : end ? domCursor(sel.extentNode, sel.extendOffset) : domCursor(sel.anchorNode, sel.anchorOffset);
//    if (!c.empty) {
//      parent = parentForNode(sel.focusNode);
//      c = c.mutable().filterVisibleTextNodes().filterParent(parent).firstText();
//      if (c.pos < c.node.length) {
//        c;
//      } else {
//        c.next();
//      }
//    }
//    return c;
//  };
//});

// DOMCursor Class
// ---------------

  // DOMCursors are immutable -- operations on them return new DOMCursers.
// There are two ways to get mutabile cursors, sending @mutable() or
// sending @withMutations (m)-> ...

  // A DOMCursor has a node, a position, a filter, and a type.

  // - node: like with ranges, a DOM node
// - position: like with ranges, either the index of a child, for elements, or the index of a character, for text nodes.
// - filter: a function used by @next() and @prev() to skip over portions of DOM. It returns
//   - truthy: to accept a node but its children are still filtered
//   - falsey: to reject a node but its children are still filtered
//   - 'skip': to skip a node and its children
//   - 'quit': to end to make @next() or @prev() return an empty DOMCursor
// - type: 'empty', 'text', or 'element'

  // License
// =====================
// Licensed with ZLIB license.

  // This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.

  // Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:

  // 1. The origin of this software must not be misrepresented; you must not
// claim that you wrote the original software. If you use this software
// in a product, an acknowledgment in the product documentation would be
// appreciated but is not required.

  // 2. Altered source versions must be plainly marked as such, and must not be
// misrepresented as being the original software.

  // 3. This notice may not be removed or altered from any source distribution.

/** an HTMLElement or a Text element */
type node = HTMLElement & {data?: any, length?: number}
type filter = (n: DOMCursor)=> any

// The DOMCursor class...
// ======================
export class DOMCursor {
    type: string
    node: node
    pos: number
    filter: filter
    savedTextPosition: DOMRect

    static debug = false
    static MutableDOMCursor: typeof MutableDOMCursor
    static emptyDOMCursor: EmptyDOMCursor

    static differentLines(pos1, pos2) {
        return (pos1.bottom - 4 <= pos2.top) || (pos2.bottom - 4 <= pos1.top);
    }

    static differentPosition (pos1, pos2) {
        var l1, l2, r1, r2;
        return this.differentLines(pos2, pos1) || ((pos1.right != null) && (pos2.right != null) ? (r1 = Math.floor(pos1.right), r2 = Math.floor(pos2.right), l1 = Math.floor(pos1.left), l2 = Math.floor(pos2.left), (r1 !== r2 || l1 !== l2) && (r2 < l1 || r1 < l2 || ((r1 < r2) === (l1 < l2) && (r1 > r2) === (l1 > l2)))) : Math.floor(pos1.left) !== Math.floor(pos2.left));
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
                    r = textNode.parentNode.getBoundingClientRect();
                }
            }
        } else {
            spareRange.setStart(textNode, offset);
            spareRange.collapse(true);
            r = getClientRect(spareRange);
        }
        if (!r || (r.width === 0 && r.height === 0)) {
            if (offset === 0) {
                textNode.parentNode.insertBefore(positioner, textNode);
            } else if (offset === textNode.length || textNode.splitText(offset)) {
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
        var sel;
        if (r) {
            debug("select range", r, new Error('trace').stack);
            sel = getSelection();
            if (!(sel.rangeCount === 1 && DOMCursor.sameRanges(sel.getRangeAt(0), r))) {
                return sel.setBaseAndExtent(r.startContainer, r.startOffset, r.endContainer, r.endOffset);
            }
        }
    }

    // Thanks to (rangy)[this: https://github.com/timdown/rangy] for the isCollapsed logic
    static isCollapsed (node) {
        var type;
        if (node) {
            type = node.nodeType;
            return type === 7 || type === 8 || (type === node.TEXT_NODE && (node.data === '' || DOMCursor.isCollapsed(node.parentNode))) || /^(script|style)$/i.test(node.nodeName) || (type === node.ELEMENT_NODE && !node.offsetParent);
        }
    }

    static sameRanges(r1, r2) {
        return r1.compareBoundaryPoints(Range.START_TO_START, r2) === 0 && r1.compareBoundaryPoints(Range.END_TO_END, r2) === 0;
    }

    constructor(node: node | Range, pos?: number | filter, filter?: filter) {
        if (node instanceof Range) {
            filter = pos as filter
            this.pos = node.startOffset
            this.node = node.startContainer as node
        } else {
            this.node = node as node
            this.pos = (pos || 0) as number
        }
        this.filter = filter || (()=> true)
        this.computeType()
        this.savedTextPosition = null
    }

    isCollapsed() {
        return !this.isEmpty() && DOMCursor.isCollapsed(this.node);
    }

    computeType() {
        this.type = !this.node ? 'empty' : this.node.nodeType === this.node.TEXT_NODE ? 'text' : 'element';
        return this;
    }

    equals(other) {
        return this.node === other.node && this.pos === other.pos;
    }

    newPos(node: node | Range, pos?: number) {
        if (node instanceof Range) {
            return new DOMCursor(node);
        } else {
            return new DOMCursor(node, pos, this.filter);
        }
    }

    toString() {
        return `DOMCursor(${this.type}, ${this.pos}${this.type === 'text' ? ', ' + this.posString() : ''})`
    }

    posString() {
        return this.node.data.substring(0, this.pos) + '|' + this.node.data.substring(this.pos);
    }

    textPosition() {
        var ref;
        if (this.isEmpty()) {
            return null;
        } else {
            return (ref = this.savedTextPosition) != null ? ref : (this.savedTextPosition = DOMCursor.getTextPosition(this.node, this.pos));
        }
    }

    isDomCaretTextPosition() {
        var p, r;
        p = this.textPosition();
        r = document.caretRangeFromPoint(p.left, p.top);
        return r.startContainer === this.node && r.startOffset === this.pos;
    }

    // **Character** returns the character at the position
    character() {
        var p;
        p = this.type === 'text' ? this : this.save().firstText();
        return p.node.data[p.pos];
    }

    // **isEmpty** returns true if the cursor is empty
    isEmpty() {
        return this.type === 'empty';
    }

    // **setFilter** sets the filter
    setFilter(f) {
        return new DOMCursor(this.node, this.pos, f)
    }

    // **addFilter** adds a filter
    addFilter(filt: filter) {
        var oldFilt;
        oldFilt = this.filter;
        return this.setFilter(function(n) {
            var r1, r2, ref, ref1;
            return (((ref = (r1 = oldFilt(n))) === 'quit' || ref === 'skip') && r1) || (((ref1 = (r2 = filt(n))) === 'quit' || ref1 === 'skip') && r2) || (r1 && r2);
        });
    }

    // **next** moves to the next filtered node
    next(up?: boolean): DOMCursor {
        var n, res, saved;
        saved = this.save();
        n = this.nodeAfter(up);
        while (!n.isEmpty()) {
            switch (res = this.filter(n)) {
                case 'skip':
                    n = n.nodeAfter(true);
                    continue;
                case 'quit':
                    break;
                default:
                    if (res) {
                        return n;
                    }
            }
            n = n.nodeAfter();
        }
        return this.restore(saved).emptyNext();
    }

    // **prev** moves to the next filtered node
    prev(up?: boolean): DOMCursor {
        var n, res, saved;
        saved = this.save();
        n = this.nodeBefore(up);
        while (!n.isEmpty()) {
            switch (res = this.filter(n)) {
                case 'skip':
                    n = n.nodeBefore(true);
                    continue;
                case 'quit':
                    break;
                default:
                    if (res) {
                        return n;
                    }
            }
            n = n.nodeBefore();
        }
        return this.restore(saved).emptyPrev();
    }

    // **nodes** returns all of the nodes this cursor finds
    nodes() {
        var n, results;
        n = this;
        results = [];
        while (!(n = n.next()).isEmpty()) {
            results.push(n.node);
        }
        return results;
    }

    // **moveCaret** move the document selection to the current position
    moveCaret(r) {
        if (!this.isEmpty()) {
            if (!r) {
                r = document.createRange();
            }
            r.setStart(this.node, this.pos);
            r.collapse(true);
            DOMCursor.selectRange(r);
        }
        return this;
    }

    adjustForNewline() {
        var n, s;
        if (this.isEmpty()) {
            return this;
        } else {
            s = this.save();
            n = this;
            if (this.pos === 0 && this.node.data[0] === '\n') {
                while (!n.isEmpty() && (n = n.prev()).type !== 'text') { }
                if (n.isEmpty()) {
                    return s;
                } else {
                    if (n.node.data[n.pos - 1] === '\n') {
                        return s;
                    } else {
                        return n;
                    }
                }
            } else if (this.pos === this.node.length && this.node.data[this.pos - 1] === '\n') {
                while (!n.isEmpty() && (n = n.next()).type !== 'text') { }
                if (n.node.data[n.pos] === '\n') {
                    s;
                }
                return n;
            } else {
                return this;
            }
        }
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
    firstText(backwards?: boolean) {
        var n;
        n = this;
        while (!n.isEmpty() && (n.type !== 'text' || (!backwards && n.pos === n.node.data.length))) {
            n = (backwards ? n.prev() : n.next());
        }
        return n;
    }

    // **countChars** count the characters in the filtered nodes until we get to (node, pos)

    // Include (node, 0) up to but not including (node, pos)
    countChars(node, pos) {
        var n, start, tot;
        start = this.copy();
        if (node instanceof DOMCursor) {
            pos = node.pos;
            node = node.node;
        }
        n = this;
        tot = 0;
        while (!n.isEmpty() && n.node !== node) {
            if (n.type === 'text') {
                tot += n.node.length;
            }
            n = n.next();
        }
        if (n.isEmpty() || n.node !== node) {
            return -1;
        } else if (n.type === 'text') {
            tot += pos;
            if (start.node === n.node) {
                tot -= start.pos;
            }
            return tot;
        } else {
            return tot;
        }
    }

    // **forwardChars** moves the cursor forward by count characters

    // if contain is true and the final location is 0 then go to the end of
    // the previous text node (node, node.length)
    forwardChars(count, contain) {
        var n;
        if (count === 0) {
            return this;
        }
        n = this;
        count += this.pos;
        while (!n.isEmpty() && 0 <= count) {
            if (n.type === 'text') {
                if (count < n.node.length) {
                    if (count === 0 && contain) {
                        n = n.prev();
                        while (n.type !== 'text') {
                            n = n.prev();
                        }
                        return n.newPos(n.node, n.node.length);
                    } else {
                        return n.newPos(n.node, count);
                    }
                }
                count -= n.node.length;
            }
            n = n.next();
        }
        return n.emptyNext();
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
    filterTextNodes() {
        return this.addFilter(function(n) {
            return n.type === 'text';
        });
    }

    // **filterTextNodes** adds visible text node filtering to the current filter; the cursor will only find visible text nodes
    filterVisibleTextNodes() {
        return this.filterTextNodes().addFilter(function(n) {
            return !n.isCollapsed();
        });
    }

    // **filterParent** adds parent filtering to the current filter; the cursor will only find nodes that are contained in the parent (or equal to it)
    filterParent(parent) {
        if (!parent) {
            return this.setFilter(function() {
                return 'quit';
            });
        } else {
            return this.addFilter(function(n) {
                return parent.contains(n.node) || 'quit';
            });
        }
    }

    // **filterRange** adds range filtering to the current filter; the cursor will only find nodes that are contained in the range
    filterRange(startContainer, startOffset, endContainer, endOffset) {
        var r;
        if (startOffset == null) {
            if (startContainer instanceof Range) {
                r = startContainer;
                startContainer = r.startContainer;
                startOffset = r.startOffset;
                endContainer = r.endContainer;
                endOffset = r.endOffset;
            } else {
                return this;
            }
        }
        return this.addFilter(function(n: DOMCursor) {
            var endPos, ref, startPos;
            startPos = startContainer.compareDocumentPosition(n.node);
            return (startPos === 0 ? (startOffset <= (ref = n.pos) && ref <= endOffset) : startPos & document.DOCUMENT_POSITION_FOLLOWING ? (endPos = endContainer.compareDocumentPosition(n.node), endPos === 0 ? n.pos <= endOffset : endPos & document.DOCUMENT_POSITION_PRECEDING) : 0) || 'quit';
        });
    }

    // **getText** gets all of the text at or after the cursor (useful with filtering; see above)
    getText() {
        var n, t;
        n = this.mutable().firstText();
        if (n.isEmpty()) {
            return '';
        } else {
            t = n.node.data.substring(n.pos);
            while (!(n = n.next()).isEmpty()) {
                if (n.type === 'text') {
                    t += n.node.data;
                }
            }
            if (t.length) {
                while (n.type !== 'text') {
                    n.prev();
                }
                n = n.newPos(n.node, n.node.length);
                while (n.pos > 0 && reject(n.filter(n))) {
                    n.pos--;
                }
                return t.substring(0, t.length - n.node.length + n.pos);
            } else {
                return '';
            }
        }
    }

    // **getTextTo** gets all of the text at or after the cursor (useful with filtering; see above)
    getTextTo(other) {
        var n, t;
        n = this.mutable().firstText();
        if (n.isEmpty()) {
            return '';
        } else {
            t = n.node.data.substring(n.pos);
            if (n.node !== other.node) {
                while (!(n = n.next()).isEmpty()) {
                    if (n.type === 'text') {
                        t += n.node.data;
                    }
                    if (n.node === other.node) {
                        break;
                    }
                }
            }
            if (t.length) {
                while (n.type !== 'text') {
                    n.prev();
                }
                if (n.node === other.node) {
                    n = n.newPos(n.node, other.pos);
                } else {
                    n = n.newPos(n.node, n.node.length);
                }
                while (n.pos > 0 && reject(n.filter(n))) {
                    n.pos--;
                }
                return t.substring(0, t.length - n.node.length + n.pos);
            } else {
                return '';
            }
        }
    }

    char() {
        return this.type === 'text' && this.node.data[this.pos];
    }

    // **isNL** returns whether the current character is a newline
    isNL() {
        return this.char() === '\n';
    }

    // **endsInNL** returns whether the current node ends with a newline
    endsInNL() {
        return this.type === 'text' && this.node.data[this.node.length - 1] === '\n';
    }

    // **moveToStart** moves to the beginning of the node
    moveToStart() {
        return this.newPos(this.node, 0);
    }

    // **moveToNextStart** moves to the beginning of the next node
    moveToNextStart() {
        return this.next().moveToStart();
    }

    // **moveToEnd** moves to the textual end the node (1 before the end if the node
    // ends in a newline)
    moveToEnd() {
        var end;
        end = this.node.length - (this.endsInNL() ? 1 : 0);
        return this.newPos(this.node, end);
    }

    // **moveToPrevEnd** moves to the textual end the previous node (1 before
    // the end if the node ends in a newline)
    moveToPrevEnd() {
        return this.prev().moveToEnd();
    }

    // **forwardWhile** moves forward until the given function is false or 'found',
    // returning the previous position if the function is false or the current
    // position if the function is 'found'
    forwardWhile(test) {
        var n, prev, t;
        prev = n = this.immutable();
        while (n = n.forwardChar()) {
            if (n.isEmpty() || !(t = test(n))) {
                return prev;
            }
            if (t === 'found') {
                return n;
            }
            prev = n;
        }
    }

    // **checkToEndOfLine** checks whether a condition is true until the EOL
    checkToEndOfLine(test) {
        var n, tp;
        n = this.immutable();
        tp = n.textPosition();
        while (!n.isEmpty() && (test(n))) {
            if (DOMCursor.differentLines(tp, n.textPosition())) {
                return true;
            }
            n = n.forwardChar();
        }
        return n.isEmpty();
    }

    // **checkToStartOfLine** checks whether a condition is true until the EOL
    checkToStartOfLine(test) {
        var n, tp;
        n = this.immutable();
        tp = n.textPosition();
        while (!n.isEmpty() && (test(n))) {
            if (DOMCursor.differentLines(tp, n.textPosition())) {
                return true;
            }
            n = n.backwardChar();
        }
        return n.isEmpty();
    }

    // **endOfLine** moves to the end of the current line
    endOfLine() {
        var tp;
        tp = this.textPosition();
        return this.forwardWhile(function(n) {
            return !DOMCursor.differentLines(tp, n.textPosition());
        });
    }

    // **forwardLine** moves to the next line, trying to keep the current screen pixel column.  Optionally takes a goalFunc that takes the position's screen pixel column as input and returns -1, 0, or 1 from comparing the input to the an goal column
    forwardLine(goalFunc) {
        var line, tp;
        if (!goalFunc) {
            goalFunc = function() {
                return -1;
            };
        }
        line = 0;
        tp = this.textPosition();
        return this.forwardWhile(function(n) {
            var pos;
            pos = n.textPosition();
            if (DOMCursor.differentLines(tp, pos)) {
                tp = pos;
                line++;
            }
            if (line === 1 && goalFunc(pos.left + 2) > -1) {
                return 'found';
            } else {
                return line !== 2;
            }
        });
    }

    // **backwardWhile** moves backward until the given function is false or 'found',
    // returning the previous position if the function is false or the current
    // position if the function is 'found'
    backwardWhile(test) {
        var n, prev, t;
        prev = n = this.immutable();
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
        var tp;
        tp = this.textPosition();
        return this.backwardWhile(function(n) {
            return !DOMCursor.differentLines(tp, n.textPosition());
        });
    }

    differentPosition(c) {
        return DOMCursor.differentPosition(this.textPosition(), c.textPosition());
    }

    differentLines(c) {
        return DOMCursor.differentLines(this.textPosition(), c.textPosition());
    }

    // **backwardLine** moves to the previous line, trying to keep the current screen pixel column.  Optionally takes a goalFunc that takes the position's screen pixel column as input and returns -1, 0, or 1 from comparing the input to an internal goal column
    backwardLine(goalFunc) {
        var line, tp;
        if (!goalFunc) {
            goalFunc = function() {
                return -1;
            };
        }
        tp = this.textPosition();
        line = 0;
        return (this.backwardWhile(function(n) {
            var pos, ref;
            pos = n.textPosition();
            if (DOMCursor.differentLines(tp, pos)) {
                tp = pos;
                line++;
            }
            if (line === 1 && ((ref = goalFunc(n.textPosition().left - 2)) === (-1) || ref === 0)) {
                return 'found';
            } else {
                return line !== 2;
            }
        })).adjustBackward();
    }

    adjustBackward() {
        var p;
        p = this.textPosition();
        return this.backwardWhile(function(n) {
            return !DOMCursor.differentPosition(p, n.textPosition());
        });
    }

    forwardChar() {
        var n;
        if (this.pos + 1 <= this.node.length) {
            return this.newPos(this.node, this.pos + 1);
        } else {
            n = this;
            while (!(n = n.next()).isEmpty()) {
                if (n.node.length !== 0) {
                    break;
                }
            }
            return n;
        }
    }

    boundedForwardChar() {
        var n;
        n = this.save().forwardChar();
        if (n.isEmpty()) {
            return n.prev();
        } else {
            return n;
        }
    }

    backwardChar() {
        var oldNode, p;
        p = this;
        oldNode = this.node;
        while (!p.isEmpty() && p.pos === 0) {
            p = p.prev();
        }
        if (!p.isEmpty()) {
            return p.newPos(p.node, (p.node !== oldNode ? p.pos : p.pos - 1));
        } else {
            return p;
        }
    }

    boundedBackwardChar() {
        var n;
        n = this.save().backwardChar();
        if (n.isEmpty()) {
            return n.next();
        } else {
            return n;
        }
    }

    // **show** scroll the position into view.  Optionally takes a rectangle representing a toolbar at the top of the page (sorry, this is a bit limited at the moment)
    show(topRect) {
        var p, top;
        if (p = this.textPosition()) {
            top = (topRect != null ? topRect.width : void 0) && topRect.top === 0 ? topRect.bottom : 0;
            if (p.bottom > window.innerHeight) {
                window.scrollBy(0, p.bottom - window.innerHeight);
            } else if (p.top < top) {
                window.scrollBy(0, p.top - top);
            }
        }
        return this;
    }

    // **immutable** return an immutable version of this cursor
    immutable(): DOMCursor {return this}

    // **withMutations** call a function with a mutable version of this cursor
    withMutations(func) {return func(this.copy().mutable())}

    // **mutable** return a mutable version of this cursor
    mutable(): DOMCursor {return new MutableDOMCursor(this.node, this.pos, this.filter)}

    // **save** generate a memento which can be used to restore the state (used by mutable cursors)
    save(): DOMCursor {return this}

    // **restore** restore the state from a memento (used by mutable cursors)
    restore(n: DOMCursor) {
        return n.immutable();
    }

    // **copy** return a copy of this cursor
    copy(): DOMCursor {return this}

    // **nodeAfter** low level method that moves to the unfiltered node after the current one
    nodeAfter(up?: boolean) {
        var node = this.node
        while (node) {
            if (node.nodeType === node.ELEMENT_NODE && !up && node.childNodes.length) {
                return this.newPos(node.childNodes[0] as HTMLElement, 0)
            } else if (node.nextSibling) {
                return this.newPos(node.nextSibling as HTMLElement, 0)
            } else {
                up = true
                node = node.parentNode as HTMLElement
            }
        }
        return this.emptyNext()
    }

    // **emptyNext** returns an empty cursor whose prev is the current node
    emptyNext(): DOMCursor {
        const p = new EmptyDOMCursor()

        // return an empty next node where
        //   prev returns this node
        //   next returns the same empty node
        p.filter =  this.filter,
        p.prev = (up?: boolean)=> up ? this.prev(up) : this
        p.nodeBefore = (up?: boolean)=> up ? this.nodeBefore(up) : this as DOMCursor
        return p
    }

    // **nodeBefore** low level method that moves to the unfiltered node before the current one
    nodeBefore(up): DOMCursor {
        var newNode, node;
        node = this.node;
        while (node) {
            if (node.nodeType === node.ELEMENT_NODE && !up && node.childNodes.length) {
                newNode = node.childNodes[node.childNodes.length - 1];
            } else if (node.previousSibling) {
                newNode = node.previousSibling;
            } else {
                up = true;
                node = node.parentNode;
                continue;
            }
            return this.newPos(newNode, newNode.length);
        }
        return this.emptyPrev();
    }

    // **emptyPrev** returns an empty cursor whose next is the current node
    emptyPrev(): DOMCursor {
        const p = new EmptyDOMCursor()

        p.filter = this.filter
        p.next = (up?: boolean)=> up ? this.next(up) : this
        p.nodeAfter = (up?: boolean)=> up ? this.nodeAfter(up) : this
        return p
    }
}

// EmptyDOMCursor Class
// --------------------

  // An empty cursor
class EmptyDOMCursor extends DOMCursor {
    constructor() {super(null)}
    moveCaret() {return this}
    show() {return this}
    nodeAfter(up?: boolean): DOMCursor {return this}
    nodeBefore(up?: boolean): DOMCursor {return this}
    next(): DOMCursor {return this}
    prev(): DOMCursor {return this}
}

// MutableDOMCursor Class
// ----------------------

  // A mutable cursor -- cursor movement, filter changes, etc. change the cursor instead of returning a new one.
class MutableDOMCursor extends DOMCursor {
    setFilter(filter1) {
        this.filter = filter1
        return this as DOMCursor
    }

    newPos(node1, pos3) {
        this.node = node1;
        this.pos = pos3;
        this.savedTextPosition = null;
        return this.computeType();
    }

    copy() {return new MutableDOMCursor(this.node, this.pos, this.filter)}

    mutable() {return this}

    immutable() {return new DOMCursor(this.node, this.pos, this.filter)}

    save() {return this.immutable()}

    restore(np) {
        this.node = np.node;
        this.pos = np.pos;
        this.filter = np.filter;
        return this;
    }

    emptyPrev(): DOMCursor {
        this.type = 'empty';
        this.next = function(up) {
            this.revertEmpty();
            if (up) {
                return this.next(up);
            } else {
                return this;
            }
        };
        this.nodeAfter = function(up) {
            this.computeType();
            if (up) {
                return this.nodeAfter(up);
            } else {
                return this;
            }
        };
        this.prev = function() {
            return this;
        };
        this.nodeBefore = function() {
            return this;
        };
        return this;
    }

    revertEmpty() {
        this.computeType()
        delete this.next
        delete this.prev
        delete this.nodeAfter
        delete this.nodeBefore
        return this
    }

    /** truncates the range after this node */
    emptyNext() {
        this.type = 'empty'
        this.prev = (up)=> {
            this.revertEmpty()
            return up ? this.prev(up) : this
        };
        this.nodeBefore = (up)=> {
            this.computeType()
            return up ? this.nodeBefore(up) : this
        };
        this.next = ()=> this
        this.nodeAfter = ()=> this
        return this
    }

}

// Utility functions
// -----------------

// These are available as properties on DOMCursor.

function debug(...args) {
  if (DOMCursor.debug) {
    return console.log(...args);
  }
};

function reject(filterResult) {
  return !filterResult || (filterResult === 'quit' || filterResult === 'skip');
};

// Node location routines
// ----------------------
let positioner = document.createElement('DIV');

positioner.setAttribute('style', 'display: inline-block');

positioner.innerHTML = 'x';

let spareRange = document.createRange();

let emptyRect = {
  width: 0,
  height: 0
};

function chooseUpper(r1, r2) {
  return r1.top < r2.top;
};

function chooseLower(r1, r2) {
  return r1.top > r2.top;
};

function getClientRect(r) {
  var comp, i, len, rect, rects, result;
  rects = r.getClientRects();
  if (rects.length === 1) {
    return rects[0];
  } else if (rects.length === 2) {
    result = rects[0];
    //comp = if r.startContainer.data[r.startOffset] == '\n' then chooseUpper
    comp = r.startContainer.data[r.startOffset] === '\n' && r.startOffset > 0 && r.startContainer.data[r.startOffset] !== '\n' ? chooseUpper : chooseLower;
    for (i = 0, len = rects.length; i < len; i++) {
      rect = rects[i];
      if (comp(rect, result)) {
        result = rect;
      }
    }
    return result;
  } else {
    return emptyRect;
  }
};

DOMCursor.MutableDOMCursor = MutableDOMCursor

DOMCursor.emptyDOMCursor = new EmptyDOMCursor()

DOMCursor.debug = false
