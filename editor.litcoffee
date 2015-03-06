EditCore
========
Copyright (C) 2015, Bill Burdick, Roy Riggs, TEAM CTHULHU

Licensed with ZLIB license (see "License", below).

Welcome to EditCore, a tiny library for HTML5 that you can use to make
your own editors.  You can find it on
[Github](https://github.com/zot/EditCore).  EditCore what
[Leisure's](https://github.com/zot/Leisure) editor, extracted out into
a small HTML5 library.  EditCore is pluggable with an options object
that contains customization hooks.  Code and examples are in
Coffeescript (a JS build is provided as a convenience).

Here's an editing principle we use:
-----------------------------------
You should only be able to edit what you can see,
i.e. backspace/delete/cut/replace should not delete hidden text.

Basic Idea
==========
EditCore edits a doubly-linked list of "blocks" that can render as DOM nodes.

The rendered DOM tree contains the full text of the backing structure, along with
ids from it.  Some of the text may not be visible and there may be a lot of items
in the rendered DOM that are not in the backing structure.

When the user makes a change, the editor:

1. maps the cursor location in the DOM to the corresponding location in the backing structure
2. changes backing structure text, regenerating part of the backing structure
3. rerenders the corrsponding DOM
4. replaces the new DOM into the page

Using/Installing EditCore
===================
Make sure your webpage loads the javascript files in the `build` directory.  Follow
the instructions below to use it.

EditCore
========
Create an EditCore object like this: `new EditCore element, options`.

`element` is the HTML element that you want to contain editable code.

`options` is an object that tells EditCore things like how to convert text
to a list of block objects (see below).

Blocks
======
* `_id`: the block id
* `type`: the type of block as a string (examples: 'text', 'code')
* `prev`: the id of the previous block (optional)
* `next`: the id of the next block (optional)
* `text`: the text of the block
* EXTRA STUFF: you can store other things in your blocks

Options
=======
When you make an EditCore instance, you pass in an options object.  The easiest
way to make options is to inherit from BasicOptions.  BasicOptions is an opinionated
options class.

Hooks you must define for BasicOptions objects
----------------------------------------------
Here are the hook methods you need to provide:

* `parseBlocks(text)`: parse text into blocks
* `renderBlock(block)`: render a block (and potentially its children) into HTML.
  Block DOM (DOM for a block) must be a single element with the same id as the block.
  Block DOM may contain nested block DOM.
* `isMergeable(newBlock, neighbor, oldBlock)`: return whether it is desirable to
  merge newBlock and neighbor
* `edit(func)`: This must run func which performs the actual editing and returns {removes: (map of id->true), updates: (map of id->block)}

After that, you must render the changes into HTML and replace them into the element.

Behavior BasicOptions Provides
------------------------------
* `getBlock(id)`: get the current block for id
* `domCursor(node, pos)`: return a domCursor that skips over non-content
* `getContainer(node)`: get block DOM node containing for a node
* `keyUp(editor)`: handle keyup after-actions
* `bindings`: a map of bindings (can use EditCore.defaultBindings)
  each binding takes args (editor, event, selectionRange)
* `topRect()`: returns null or the rectangle of a toolbar at the page top
* `blockColumn(pos)`: returns the start column on the page for the current block
* `load(el, text)`: parse text into blocks and replace el's contents with rendered DOM
* `getFirst()`: get the first block id

Packages we use
===============
- [DOMCursor](https://github.com/zot/DOMCursor), for finding text locations in DOM trees
- [adiff](https://github.com/dominictarr/adiff), for finding differences between JS arrays

Building
========
If you modify EditCore and want to build it, you can use the Cakefile.  It needs the
`which` npm package (`npm install which`).

License
=====================
Licensed with ZLIB license.

This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
claim that you wrote the original software. If you use this software
in a product, an acknowledgment in the product documentation would be
appreciated but is not required.

2. Altered source versions must be plainly marked as such, and must not be
misrepresented as being the original software.

3. This notice may not be removed or altered from any source distribution.

Code
====
Here is the code for [EditCore](https://github.com/zot/EditCore).

    {
      selectRange,
    } = window.DOMCursor
    maxLastKeys = 4
    BS = 8
    ENTER = 13
    DEL = 46
    TAB = 9
    LEFT = 37
    UP = 38
    RIGHT = 39
    DOWN = 40
    HOME = 36
    END = 35
    PAGEUP = 33
    PAGEDOWN = 34
    specialKeys = {}
    specialKeys[TAB] = 'TAB'
    specialKeys[ENTER] = 'ENTER'
    specialKeys[BS] = 'BS'
    specialKeys[DEL] = 'DEL'
    specialKeys[LEFT] = 'LEFT'
    specialKeys[RIGHT] = 'RIGHT'
    specialKeys[UP] = 'UP'
    specialKeys[DOWN] = 'DOWN'
    specialKeys[PAGEUP] = 'PAGEUP'
    specialKeys[PAGEDOWN] = 'PAGEDOWN'
    specialKeys[HOME] = 'HOME'
    specialKeys[END] = 'END'
    keyFuncs =
      backwardChar: (editor, e, r)->
        e.preventDefault()
        editor.moveSelectionBackward r
        false
      forwardChar: (editor, e, r)->
        e.preventDefault()
        editor.moveSelectionForward r
        false
      previousLine: (editor, e, r)->
        e.preventDefault()
        editor.moveSelectionUp r
        false
      nextLine: (editor, e, r)->
        e.preventDefault()
        editor.moveSelectionDown r
        false
    defaultBindings =
      #'C-S': keyFuncs.save
      'UP': keyFuncs.previousLine
      'DOWN': keyFuncs.nextLine
      'LEFT': keyFuncs.backwardChar
      'RIGHT': keyFuncs.forwardChar
      #'TAB': keyFuncs.expandTemplate
      #'C-C C-C': keyFuncs.swapMarkup
      #'M-C': keyFuncs.execute
      #'C-F': keyFuncs.forwardChar
      #'C-B': keyFuncs.backwardChar
      #'C-P': keyFuncs.previousLine
      #'C-N': keyFuncs.nextLine
      #'C-X C-F': keyFuncs.save

EditCore class
==============

    class EditCore
      constructor: (@node, @options)->
        @node.attr 'contenteditable', 'true'
        @curKeyBinding = @prevKeybinding = null
        @bind()
        @lastKeys = []
        @modCancelled = false
        @clipboardKey = null
        @ignoreModCheck = 0
        @movementGoal = null
        @options.setEditor this
      getBlockLocation: ->
        s = getSelection()
        if s.type != 'None' && holder = @options.getContainer s.anchorNode
          blockId: holder.id
          offset: @getTextPosition holder, s.anchorNode, s.anchorOffset
        else {}
      getBlock: (id)->
        bl = {}
        for k,v of @options.getBlock id
          bl[k] = v
        bl
      domCursor: (node, pos)->
        if node instanceof jQuery
          node = node[0]
          pos = pos ? 0
        @options.domCursor(node, pos)
      domCursorForText: (node, pos, parent)->
        c = @domCursor node, pos
          .filterTextNodes()
          .firstText()
        if parent? then c.filterParent parent else c
      domCursorForTextPosition: (parent, pos, contain)->
        @domCursorForText parent, 0, (if contain then parent)
          .mutable()
          .forwardChars pos, contain
          .adjustForNewline()
      domCursorForCaret: ->
        sel = getSelection()
        n = @domCursor sel.focusNode, sel.focusOffset
          .mutable()
          .filterVisibleTextNodes()
          .filterParent @node[0]
          .firstText()
        if n.isEmpty() || n.pos <= n.node.length then n else n.next()
      getTextPosition: (parent, target, pos)->
        if parent
          targ = @domCursorForText target, pos
          if !@options.getContainer(targ.node) then targ = targ.prev()
          @domCursorForText parent, 0, parent
            .mutable()
            .countChars targ.node, targ.pos
        else -1
      loadURL: (url)-> $.get url, (text)=> @options.load @node, text
      handleInsert: (e, s, text)->
        if s.type == 'Caret'
          e.preventDefault()
          holder = @options.getContainer(s.anchorNode)
          block = @getBlock holder.id
          blocks = [block]
          pos = @getTextPosition holder, s.anchorNode, s.anchorOffset
          if pos == block.text.length && block.next then blocks.push @getBlock block.next
          @ignoreModCheck = @ignoreModCheck || 1
          @editBlock blocks, pos, pos, (text ? getEventChar e), pos + 1
      backspace: (event, sel, r)->
        holderId = @options.getContainer(sel.anchorNode).id
        @currentBlockIds = [(@getBlock holderId)._id]
        @handleDelete event, sel, false, (text, pos)-> true
      del: (event, sel, r)->
        holderId = @options.getContainer(sel.anchorNode).id
        @currentBlockIds = [(@getBlock holderId)._id]
        @handleDelete event, sel, true, (text, pos)-> true
      handleDelete: (e, s, forward, delFunc)->
        e.preventDefault()
        if s.type == 'Caret'
          c = @domCursorForCaret().firstText()
          cont = @options.getContainer(c.node)
          block = @getBlock cont.id
          pos = @getTextPosition cont, c.node, c.pos
          result = delFunc block.text, pos
          blocks = []
          if !result then @ignoreModCheck = @ignoreModCheck || 1
          else
            if result instanceof Array
              [pos, stop] = result
            else
              pos += if forward then 0 else -1
              stop = pos + 1
            if pos < 0
              if blocks.prev
                blocks.push bl = @getBlock block.prev
                pos += bl.text.length
                stop += bl.text.length
              else return
            blocks.push block
            if pos == block.text.length - 1 && block.text[block.text.length - 1] == '\n'
              if block.next then blocks.push @getBlock block.next
              else return
            @editBlock blocks, pos, stop, '', pos
      editBlock: (blocks, start, end, newContent, caret)->
        oldText = (block.text for block in blocks).join ''
        newText = oldText.substring(0, start) + newContent + oldText.substring end
        if caret?
          bl = blocks.slice()
          prev = bl[0]
          for i in [0...2]
            if newPrev = @getBlock prev.prev
              prev = newPrev
              caret += prev.text.length
          prevHolder = $("##{prev._id}")[0]
          saveC = @domCursor(prevHolder, 0).firstText()
          save = @getTextPosition(prevHolder, saveC.node, saveC.pos) + caret
        @options.edit => @changeStructure blocks, newText
        @changes = null
        if caret?
          if prevHolder.ownerDocument.compareDocumentPosition(prevHolder) & Element.DOCUMENT_POSITION_DISCONNECTED
            prevHolder = $("##{prev._id}")[0]
          return @domCursorForTextPosition(prevHolder, save).moveCaret()

Change oldBlocks into newBlocks and rerender the changed parts of the doc

      changeStructure: (oldBlocks, newText)->
        @changes = new Changes @options
        newBlocks = @options.parseBlocks newText
        @checkMerge(fo = oldBlocks[0], newBlocks[0], @getBlock(fo.prev), (aux)->
          aux + newBlocks.shift().text)
        if newBlocks.length
          @checkMerge(lo = last(oldBlocks), last(newBlocks), @getBlock(lo.next), (aux)->
            newBlocks.pop().text + aux)
        @remapBlocks oldBlocks, newBlocks
        @changes

`checkMerge` checks whether to merge the new text with the preceding/following old text.

It returns the id of the old block if merge, otherwise the id of the new block.

      checkMerge: (oldBlock, newBlock, neighbor, func)->
        if @options.isMergeable newBlock, neighbor, oldBlock
          #console.log "update item: #{auxBlock._id}"
          neighbor.text = func neighbor.text
          @changes.updateBlock neighbor
          neighbor._id
        else oldBlock._id

`remapBlocks` tries to find the best fit for the new blocks using [Adiff](https://github.com/dominictarr/adiff), a diff implementation for arrays.

Adiff results are like splice calls [offset, count, item, item, item]

      remapBlocks: (oldBlocks, newBlocks)->
        oldTypes = (block.type for block in oldBlocks)
        newTypes = (block.type for block in newBlocks)
        prevId = oldBlocks[0].prev
        oldBlocks.reverse()
        newBlocks.reverse()
        offset = 0
        diffs = Adiff.diff oldTypes, newTypes
        #if diffs.length then console.log "Old Structure: [#{oldTypes.join ', '}], new: [#{newTypes.join ', '}]"
        for diff in diffs
          if diff[0] > offset
            #console.log "Update-1 #{diff[0] - offset} items: #{(bl._id for bl in oldBlocks).join ', '}"
            prevId = @changes.updateBlocks diff[0] - offset, oldBlocks, newBlocks, prevId
          offset = diff[0] + diff[1]
          insertCount = diff.length - 2
          deleteCount = diff[1]
          updateCount = Math.min deleteCount, insertCount
          insertCount -= updateCount
          deleteCount -= updateCount
          if updateCount > 0
            #console.log "Update-2 #{updateCount} items: #{(bl._id for bl in oldBlocks).join ', '}"
            prevId = @changes.updateBlocks updateCount, oldBlocks, newBlocks, prevId
          #if deleteCount > 0 then console.log "Delete #{deleteCount} items: #{("#{block._id}: #{block.text}" for block in Lazy(oldBlocks).reverse().take(deleteCount).toArray()).join ', '}"
          for i in [0 ... deleteCount]
            @changes.removeBlock oldBlocks.pop()
          #if insertCount > 0 then console.log "Insert-1 #{insertCount} items: #{("#{bl._id}: #{bl.text}" for bl in Lazy(newBlocks).reverse().take(insertCount).toArray()).join ', '}"
          for i in [0 ... insertCount]
            prevId = @changes.insertBlock newBlocks.pop(), prevId
        #
        # should just be a list of new/old items to update now
        # new/old lists should be the same size
        #
        if oldBlocks.length != newBlocks.length then console.log "WARNING -- inconsistent block count after diff processing"
        prevId = @changes.updateBlocks newBlocks.length, oldBlocks, newBlocks, prevId
      bind: ->
        @node.on 'mousedown', (e)=>
          @options.moved this
          @setCurKeyBinding null
        @node.on 'mouseup', (e)=>
          @adjustSelection e
          @options.moved this
        @node.on 'keyup', (e)=> @handleKeyup e
        @node.on 'keydown', (e)=>
          @modCancelled = false
          c = (e.charCode || e.keyCode || e.which)
          if !@addKeyPress e, c then return
          s = getSelection()
          r = s.rangeCount > 0 && s.getRangeAt(0)
          @currentBlockIds = @blockIdsForSelection s, r
          [bound, checkMod] = @findKeyBinding e, r
          if bound then @modCancelled = !checkMod
          else
            @modCancelled = false
            if c == ENTER then @handleInsert e, s, '\n'
            else if c == BS then @backspace e, s, r
            else if c == DEL then @del e, s, r
            else if modifyingKey c, e then @handleInsert e, s
      blockIdsForSelection: (sel, r)->
        if !sel then sel = getSelection()
        if sel.rangeCount == 1
          if !r then r = sel.getRangeAt 0
          blocks = if cont = @options.getContainer(r.startContainer)
            [cont.id]
          else []
          if !r?.collapsed
            cur = blocks[0]
            end = @options.getContainer(r.endContainer).id
            while cur && cur != end
              if cur = (@getBlock cur).next
                blocks.push cur
          blocks
      setCurKeyBinding: (f)->
        @prevKeybinding = @curKeyBinding
        @curKeyBinding = f
      addKeyPress: (e, c)->
        if notShift = !shiftKey c
          e.DE_editorShiftkey = true
          @lastKeys.push modifiers(e, c)
          while @lastKeys.length > maxLastKeys
            @lastKeys.shift()
          @keyCombos = new Array maxLastKeys
          for i in [0...Math.min(@lastKeys.length, maxLastKeys)]
            @keyCombos[i] = @lastKeys[@lastKeys.length - i - 1 ... @lastKeys.length].join ' '
          @keyCombos.reverse()
        notShift
      findKeyBinding: (e, r)->
        for k in @keyCombos
          if f = @options.bindings[k]
            @lastKeys = []
            @keyCombos = []
            @setCurKeyBinding f
            return [true, f this, e, r]
        @setCurKeyBinding null
        [false]
      handleKeyup: (e)->
        if @ignoreModCheck = @ignoreModCheck then @ignoreModCheck--
        if @clipboardKey || (!e.DE_shiftkey && !@modCancelled && modifyingKey((e.charCode || e.keyCode || e.which), e))
          @options.keyUp this
          @clipboardKey = null
      adjustSelection: (e)->
        if e.detail == 1 then return
        s = getSelection()
        if s.type == 'Range'
          r = s.getRangeAt 0
          pos = @domCursor r.endContainer, r.endOffset
            .mutable()
            .filterVisibleTextNodes()
            .firstText()
          while pos.node != r.startContainer && pos.node.data.trim() == ''
            pos == pos.prev()
          while pos.pos > 0 && pos.node.data[pos.pos - 1] == ' '
            pos.pos--
          if (pos.node != r.startContainer || pos.pos > r.startOffset) && (pos.node != r.endContainer || pos.pos < r.endOffset)
            r.setEnd pos.node, pos.pos
            selectRange r
      moveSelectionForward: -> @showCaret @moveForward()
      moveSelectionDown: -> @showCaret @moveDown()
      moveSelectionBackward: -> @showCaret @moveBackward()
      moveSelectionUp: -> @showCaret @moveUp()
      showCaret: (pos)-> pos.show @options.topRect()
      moveForward: ->
        start = pos = @domCursorForCaret().firstText().save()
        while !pos.isEmpty() && @domCursorForCaret().firstText().equals start
          pos = pos.forwardChar()
          pos.moveCaret()
        @options.moved this
        pos
      moveBackward: ->
        start = pos = @domCursorForCaret().firstText().save()
        while !pos.isEmpty() && @domCursorForCaret().firstText().equals start
          pos = pos.backwardChar()
          pos.moveCaret()
        @options.moved this
        pos
      moveDown: ->
        linePos = prev = pos = @domCursorForCaret().save()
        if !(@prevKeybinding in [keyFuncs.nextLine, keyFuncs.previousLine]) then @movementGoal = @options.blockColumn pos
        line = 0
        while !(pos = @moveSelectionForward()).isEmpty()
          if linePos.differentLines pos
            line++
            linePos = pos
          if line == 2 then return prev.moveCaret()
          if line == 1 && @options.blockColumn(pos) >= @movementGoal
            return @moveToBestPosition pos, prev, linePos
          prev = pos
        @options.moved this
        pos
      moveUp: ->
        linePos = prev = pos = @domCursorForCaret().save()
        if !(@prevKeybinding in [keyFuncs.nextLine, keyFuncs.previousLine]) then @movementGoal = @options.blockColumn pos
        line = 0
        while !(pos = @moveBackward()).isEmpty()
          if linePos.differentLines pos
            line++
            linePos = pos
          if line == 2 then return prev.moveCaret()
          if line == 1 && @options.blockColumn(pos) <= @movementGoal
            return @moveToBestPosition pos, prev, linePos
          prev = pos
        @options.moved this
        pos

`moveToBestPosition(pos, prev, linePos)` tries to move to the best position in the HTML text.  If pos is closer to the goal, return it, otherwise move to prev and return prev.

      moveToBestPosition: (pos, prev, linePos)->
        if linePos == pos || Math.abs(@options.blockColumn(pos) - @movementGoal) < Math.abs(@options.blockColumn(prev) - @movementGoal)
          pos
        else prev.moveCaret()

Changes class
=============
EditCore uses this to manage block changes for an edit.  The user may replace a selection with another selection, so changes could be complex.

    class Changes
      constructor: (@options)->
        @first = @options.getFirst()
        @updates = {}
        @removes = {}
        @oldBlocks = {}
      getCopy: (id)->
        if old = @options.getBlock id
          bl = {}
          for k,v of old
            bl[k] = v
          bl
      getChangedBlock: (id)-> @updates[id] ? @options.getBlock id
      getUpdateBlock: (id)-> @updates[id] ? (@updates[id] = @getCopy id)
      getOldBlock: (id)-> @oldBlocks[id] ? @options.getBlock id
      insertBlock: (newBlock, prevId)->
        if !newBlock._id then newBlock._id = @options.newId()
        @updates[newBlock._id] = newBlock
        if !prevId
          newBlock.next = @first
          @first = newBlock._id
          if next = getChangedBlock @first
            if !@updates[next._id]
              next = @updates[next._id] = @getCopy next._id
            next.prev = newBlock._id
        newBlock._id
      removeBlock: (block)->
        id = block._id
        item = @getChangedBlock id
        prev = @getUpdateBlock block.prev
        next = @getUpdateBlock block.next
        if !prev
          if @first != id then console.log "Error, removing item with non prev, but it is not the head"
          else @first = item.next
        delete @updates[id]
        @removes[id] = true
        if prev && prev.next == id
          prev.next = item.next
        if next && next.prev == id
          next.prev = item.prev
      updateBlock: (block, link)->
        if link
          old = @getChangedBlock block._id
          block.prev = old.prev
          block.next = old.next
        @updates[block._id] = block
      updateBlocks: (num, oldBlocks, newBlocks, prevId)->
        for i in [0 ... num]
          b = oldBlocks.pop()
          n = newBlocks.pop()
          prevId = n._id = b._id
          if n.text != b.text then @updateBlock n, true
        prevId
      applyChanges: ->
        for id of @removes
          $("##{id}").remove()
          if @saveBlock id
            delete @options.blocks[id]
        for id, block of @updates
          @saveBlock id
          @options.blocks[id] = block
        @options.first = @first
      saveBlock: (id)->
        if @options.getBlock(id)?
          @oldBlocks[id] = @options.getBlock(id)
          true
        false

BasicOptions class
==================
BasicOptions is an opinionated default options class that encourages using a "data-type" attribute to mark blocks in the DOM and a "data-noncontent" attribute to mark items that are not part of the content.

    class BasicOptions
      constructor: ->
        @blocks = {}
        @first = null
        @idCounter = 0
        @removes = {}
        @updates = {}
      setEditor: (@editor)->
      newId: -> "block-#{@idCounter++}"
      newBlocks: (blockList)->
        @blocks = {}
        prev = null
        for block in blockList
          block._id = @newId()
          if prev
            block.prev = prev._id
            prev.next = block._id
          prev = block
          @blocks[block._id] = block
        @first = blockList[0]._id
      mousedown: (e)->
      getFirst: -> @first
      getBlock: (id)-> @blocks[id]
      bindings: defaultBindings
      blockColumn: (pos)-> pos.textPosition().left
      topRect: -> null
      keyUp: (editor)->
      domCursor: (node, pos)->
        new DOMCursor(node, pos).addFilter (n)-> !n.hasAttribute('data-noncontent') || 'skip'
      getContainer: (node)-> $(node).closest('[data-type]')[0]
      load: (el, text)->
        idCounter = 0
        @newBlocks @parseBlocks text
        el.html @renderBlock @blocks[@first]
      isMergeable: (newBlock, neighbor, oldBlock)-> throw new Error "options.isMergeable(newBlock, oldBlock, neighbor) is not implemented"
      parseBlocks: (text)-> throw new Error "options.parseBlocks(text) is not implemented"
      renderBlock: (block)-> throw new Error "options.renderBlock(block) is not implemented"
      edit: (func)-> throw new Error "options.edit(func) is not implemented"

getEventChar(e)
===============
adapted from Vega on [StackOverflow](http://stackoverflow.com/a/13127566/1026782)

    _to_ascii =
      '188': '44'
      '109': '45'
      '190': '46'
      '191': '47'
      '192': '96'
      '220': '92'
      '222': '39'
      '221': '93'
      '219': '91'
      '173': '45'
      '187': '61' #IE Key codes
      '186': '59' #IE Key codes
      '189': '45' #IE Key codes

    shiftUps =
      "96": "~"
      "49": "!"
      "50": "@"
      "51": "#"
      "52": "$"
      "53": "%"
      "54": "^"
      "55": "&"
      "56": "*"
      "57": "("
      "48": ")"
      "45": "_"
      "61": "+"
      "91": "{"
      "93": "}"
      "92": "|"
      "59": ":"
      "39": "\""
      "44": "<"
      "46": ">"
      "47": "?"

    getEventChar = (e)->
      c = (e.charCode || e.keyCode || e.which)
      # normalize keyCode
      if _to_ascii.hasOwnProperty(c) then c = _to_ascii[c]
      if !e.shiftKey && (c >= 65 && c <= 90) then c = String.fromCharCode(c + 32)
      else if e.shiftKey && shiftUps.hasOwnProperty(c)
        # get shifted keyCode value
        c = shiftUps[c]
      else c = String.fromCharCode(c)
      c

Utilities
=========

    shiftKey = (c)-> 15 < c < 19

    modifiers = (e, c)->
      res = specialKeys[c] || String.fromCharCode(c)
      if e.altKey then res = "M-" + res
      if e.ctrlKey then res = "C-" + res
      if e.shiftKey then res = "S-" + res
      res

    modifyingKey = (c, e)-> !e.altKey && !e.ctrlKey && (
      (47 < c < 58)          || # number keys
      c == 32 || c == ENTER  || # spacebar and enter
      c == BS || c == DEL    || # backspace and delete
      (64 < c < 91)          || # letter keys
      (95 < c < 112)         || # numpad keys
      (185 < c < 193)        || # ;=,-./` (in order)
      (218 < c < 223)          # [\]' (in order)
      )

    last = (array)-> array.length && array[array.length - 1]

Exports
=======

    root = EditCore
    root.BasicOptions = BasicOptions
    root.defaultBindings = defaultBindings
    root.last = last

    if window? then window.EditCore = root else module.exports = root
