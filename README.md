LeisureEditCore
========
Copyright (C) 2015, Bill Burdick, Roy Riggs, TEAM CTHULHU

Licensed with ZLIB license (see "License", below).

Welcome to LeisureEditCore, a tiny library for HTML5 that you can use to make
your own editors.  You can find it on
[Github](https://github.com/zot/LeisureEditCore).  LeisureEditCore what
[Leisure's](https://github.com/zot/Leisure) editor, extracted out into
a small HTML5 library.  LeisureEditCore is pluggable with an options object
that contains customization hooks.  Code and examples are in
Coffeescript (a JS build is provided as a convenience).

Here's an editing principle we use:
-----------------------------------
You should only be able to edit what you can see,
i.e. backspace/delete/cut/replace should not delete hidden text.

Basic Idea
==========
LeisureEditCore edits a doubly-linked list of "blocks" that can render as DOM nodes.

The rendered DOM tree contains the full text of the backing structure, along with
ids from it.  Some of the text may not be visible and there may be a lot of items
in the rendered DOM that are not in the backing structure.

When the user makes a change, the editor:

1. maps the cursor location in the DOM to the corresponding location in the backing structure
2. changes backing structure text, regenerating part of the backing structure
3. rerenders the corrsponding DOM
4. replaces the new DOM into the page

Using/Installing LeisureEditCore
===================
Make sure your webpage loads the javascript files in the `build` directory.  Follow
the instructions below to use it.

LeisureEditCore
===============
Create a LeisureEditCore object like this: `new LeisureEditCore element, options`.

`element` is the HTML element that you want to contain editable code.

`options` is an object that tells LeisureEditCore things like how to convert text
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
When you make a LeisureEditCore instance, you must provide an options
object.  BasicEditingOptions is the base options class and
DataStoreEditingOptions is more deluxe and connects to an
observable data store (you can use an instance of DataStore or
adapt one of your own).

Hooks you must define for BasicEditingOptions objects
-----------------------------------------------------
Here are the hook methods you need to provide:

* `parseBlocks(text) -> blocks`: parse text into array of blocks -- DO NOT provide _id, prev, or next, they may be overwritten!
* `renderBlock(block) -> [html, next]`: render a block (and potentially its children) and return the HTML and the next blockId if there is one
  * Block DOM (DOM for a block) must be a single element with the same id as the block.
  * Block DOM may contain nested block DOM.
  * each block's DOM should have the same id as the block and have a data-block attribute
  * non-editable parts of the DOM should have contenteditable=false
  * completely skipped parts should be non-editable and have a data-noncontent attribute
* `edit(oldBlocks, newBlocks) -> any`: The editor calls this after the user has attempted an edit.  It should make the requested change (probably by calling `replaceBlocks`) and rerender the appropriate DOM.

After that, you must render the changes into HTML and replace them into the element.

Properties of BasicEditingOptions
---------------------------------
* `blocks {id -> block}`: block table
* `first`: id of first block
* `bindings {keys -> binding(editor, event, selectionRange)}`: a map of bindings (can use LeisureEditCore.defaultBindings)

Methods of BasicEditingOptions
------------------------------
* `getBlock(id) -> block?`: get the current block for id
* `getContainer(node) -> Node?`: get block DOM node containing for a node
* `getFirst() -> blockId`: get the first block id
* `domCursor(node, pos) -> DOMCursor`: return a domCursor that skips over non-content
* `keyUp(editor) -> void`: handle keyup after-actions
* `topRect() -> rect?`: returns null or the rectangle of a toolbar at the page top
* `blockColumn(pos) -> colNum`: returns the start column on the page for the current block
* `load(el, text) -> void`: parse text into blocks and replace el's contents with rendered DOM
* `replaceBlocks(oldBlocks, newBlocks) -> removedBlocks`: override this if you need to link up the blocks, etc., like so that `renderBlock()` can return the proper next id, for instance.

Packages we use
===============
- [jQuery](http://jquery.com/), for DOM slicing and dicing
- [DOMCursor](https://github.com/zot/DOMCursor) (included), for finding text locations in DOM trees

Building
========
If you modify LeisureEditCore and want to build it, you can use the Cakefile.  It needs the
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
Here is the code for [LeisureEditCore](https://github.com/zot/LeisureEditCore).

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
      'C-Z': -> alert 'UNDO not supported yet'
      'C-S-Z': -> alert 'REDO not supported yet'
      'C-Y': -> alert 'REDO not supported yet'
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

`idCounter`: id number for next created block

    idCounter = 0

Observable class
================

    class Observable
      constructor: ->
        @listeners = {}
      on: (type, callback)->
        if !@listeners[type] then @listeners[type] = []
        @listeners[type].push callback
      trigger: (type, args...)->
        for listener in @listeners[type] || []
          listener.apply null, args

LeisureEditCore class
=====================
Events:
  `moved`: the cursor moved

    class LeisureEditCore extends Observable
      constructor: (@node, @options)->
        super()
        @node
          .attr 'contenteditable', 'true'
          .attr 'spellcheck', 'false'
        @curKeyBinding = @prevKeybinding = null
        @bind()
        @lastKeys = []
        @modCancelled = false
        @clipboardKey = null
        @ignoreModCheck = 0
        @movementGoal = null
        @options.setEditor this
      getCopy: (id)->
        if old = @options.getBlock id
          bl = {}
          for k,v of old
            bl[k] = v
          bl
      getBlockLocation: ->
        s = getSelection()
        if s.type != 'None' && holder = @options.getContainer s.anchorNode
          blockId: @options.idForNode holder
          offset: @getTextPosition holder, s.anchorNode, s.anchorOffset
        else {}
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
      loadURL: (url)-> $.get url, (text)=> @options.load text
      handleInsert: (e, s, text)->
        e.preventDefault()
        if s.type == 'Caret'
          holder = @options.getContainer(s.anchorNode)
          block = @getCopy @options.idForNode holder
          blocks = [block]
          pos = @getTextPosition holder, s.anchorNode, s.anchorOffset
          @editBlocks [block], pos, pos, (text ? getEventChar e), pos + 1
        else setTimeout (->alert 'Selection not supported yet'), 1
      backspace: (event, sel, r)->
        holderId = @options.idForNode @options.getContainer(sel.anchorNode)
        @currentBlockIds = [(@getCopy holderId)._id]
        @handleDelete event, sel, false, (text, pos)-> true
      del: (event, sel, r)->
        holderId = @options.idForNode @options.getContainer(sel.anchorNode)
        @currentBlockIds = [(@getCopy holderId)._id]
        @handleDelete event, sel, true, (text, pos)-> true
      handleDelete: (e, s, forward, delFunc)->
        e.preventDefault()
        if s.type == 'Caret'
          c = @domCursorForCaret().firstText()
          cont = @options.getContainer(c.node)
          block = @getCopy @options.idForNode cont
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
              if block.prev
                blocks.push bl = @getCopy block.prev
                pos += bl.text.length
                stop += bl.text.length
              else return
            else blocks.push block
            @editBlocks blocks, pos, stop, '', pos
        else setTimeout (->alert 'Selection not supported yet'), 1

editBlocks: at this point, just place the cursor after the newContent, later
on it can select if start and end are different

      editBlocks: (blocks, start, end, newContent)->
        caret = start + newContent.length
        oldText = (block.text for block in blocks).join ''
        newText = oldText.substring(0, start) + newContent + oldText.substring end
        {oldBlocks, newBlocks, newText} = @changeStructure blocks, newText
        if oldBlocks.length
          for oldBlock in oldBlocks
            if oldBlock._id == blocks[0]._id then break
            if oldBlock._id != blocks[0]._id
              caret += oldBlock.text.length
          if prevBlock = @options.getBlock oldBlocks[0].prev
            caret += prevBlock.text.length
        @options.edit oldBlocks, newBlocks
        holder = if prevBlock then @options.nodeForId prevBlock._id else @node[0]
        @domCursorForTextPosition(holder, caret).moveCaret()

`changeStructure(oldBlocks, newText)`: Compute blocks affected by transforming oldBlocks into newText

      changeStructure: (oldBlocks, newText)->
        oldBlocks = oldBlocks.slice()
        oldText = null
        while oldText != newText
          oldText = newText
          newBlocks = @options.parseBlocks newText
          {prev:prevId, text:firstText} = oldBlocks[0]
          if prevId && firstText != newBlocks[0].text
            oldBlocks.unshift prev = @options.getBlock prevId
            newText = prev.text + newText
          {next:nextId, text:lastText} = last oldBlocks
          if nextId && lastText != last(newBlocks).text
            oldBlocks.push next = @options.getBlock nextId
            newText += next.text
        while oldBlocks[0].text == newBlocks[0].text
          oldBlocks.shift()
          newBlocks.shift()
        while last(oldBlocks).text == last(newBlocks).text
          oldBlocks.pop()
          newBlocks.pop()
        oldBlocks: oldBlocks, newBlocks: newBlocks, newText: newText
      bind: ->
        @node.on 'dragenter', (e)=>
          e.preventDefault()
          #setTimeout (->alert 'DROP not supported yet'), 1
          false
        @node.on 'dragover', (e)=>
          e.preventDefault()
          false
        @node.on 'dragleave', (e)=>
          e.preventDefault()
          false
        @node.on 'drop', (e)=>
          e.preventDefault()
          setTimeout (->alert 'DROP not supported yet'), 1
          false
        @node.on 'cut', (e)=>
          e.preventDefault()
          alert 'CUT not supported yet'
        @node.on 'copy', (e)=>
          e.preventDefault()
          alert 'COPY not supported yet'
        @node.on 'paste', (e)=>
          e.preventDefault()
          alert 'PASTE not supported yet'
        @node.on 'mousedown', (e)=>
          @trigger 'moved', this
          @setCurKeyBinding null
        @node.on 'mouseup', (e)=>
          @adjustSelection e
          @trigger 'moved', this
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
            [@options.idForNode cont]
          else []
          if !r?.collapsed
            cur = blocks[0]
            end = @options.idForNode @options.getContainer(r.endContainer)
            while cur && cur != end
              if cur = (@getCopy cur).next
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
          @options.keyUp()
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
      showCaret: (pos)->
        if pos.isEmpty() then pos = pos.prev()
        pos = @domCursorForCaret()
        pos.moveCaret()
        pos.show @options.topRect()
        @trigger 'moved', this
      moveForward: ->
        start = pos = @domCursorForCaret().firstText().save()
        while !pos.isEmpty() && @domCursorForCaret().firstText().equals start
          pos = pos.forwardChar()
          pos.moveCaret()
        pos
      moveBackward: ->
        start = pos = @domCursorForCaret().firstText().save()
        while !pos.isEmpty() && @domCursorForCaret().firstText().equals start
          pos = pos.backwardChar()
          pos.moveCaret()
        pos
      moveDown: ->
        linePos = prev = pos = @domCursorForCaret().save()
        if !(@prevKeybinding in [keyFuncs.nextLine, keyFuncs.previousLine]) then @movementGoal = @options.blockColumn pos
        line = 0
        while !(pos = @moveForward()).isEmpty()
          if linePos.differentLines pos
            line++
            linePos = pos
          if line == 2 then return prev.moveCaret()
          if line == 1 && @options.blockColumn(pos) >= @movementGoal
            return @moveToBestPosition pos, prev, linePos
          prev = pos
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
        pos

`moveToBestPosition(pos, prev, linePos)` tries to move the caret to the best position in the HTML text.  If pos is closer to the goal, return it, otherwise move to prev and return prev.

      moveToBestPosition: (pos, prev, linePos)->
        if linePos == pos || Math.abs(@options.blockColumn(pos) - @movementGoal) < Math.abs(@options.blockColumn(prev) - @movementGoal)
          pos
        else prev.moveCaret()

BasicEditingOptions class
=========================
BasicEditingOptions is an the options base class.

Events:
  `load`: new text loaded into the editor

    class BasicEditingOptions extends Observable

Hook methods (required)
-----------------------

`parseBlocks(text) -> blocks`: parse text into array of blocks -- DO NOT provide _id, prev, or next, they may be overwritten!

      parseBlocks: (text)-> throw new Error "options.parseBlocks(text) is not implemented"

`renderBlock(block) -> [html, next]`: render a block (and potentially its children) and return the HTML and the next blockId if there is one
* Block DOM (DOM for a block) must be a single element with the same id as the block.
* Block DOM may contain nested block DOM.

      renderBlock: (block)-> throw new Error "options.renderBlock(block) is not implemented"

`edit(oldBlocks, newBlocks)`: The editor calls this after the user has attempted an edit.  It should make the requested change (probably by calling `replaceBlocks`, below) and rerender the appropriate DOM.

      edit: (oldBlocks, newBlocks)-> throw new Error "options.edit(func) is not implemented"

Main code
---------

      constructor: ->

        super()

`blocks {id -> block}`: block table

        @blocks = {}

`first`: id of first block

        @first = null

`getFirst() -> blockId`: get the first block id

      getFirst: -> @first
      nodeForId: (id)-> $("##{id}")
      idForNode: (node)-> $(node).prop(id)
      setEditor: (@editor)->
      newId: -> "block#{idCounter++}"

      copyBlock: (block)->
        bl = {}
        for k,v of block
          bl[k] = v
        bl

`replaceBlocks(oldBlocks, newBlocks) -> removedBlocks`: override this if you need to link up the blocks, etc., like so that `renderBlock()` can return the proper next id, for instance.

      replaceBlocks: (oldBlocks, newBlocks)->
        newBlockMap = {}
        changes = removes: removes = {}, sets: newBlockMap
        spliceNext = if oldBlocks.length then last(oldBlocks).next else @getFirst()
        for oldBlock in oldBlocks[newBlocks.length...oldBlocks.length]
          removes[oldBlock._id] = true
        for newBlock, i in newBlocks
          if i < oldBlocks.length
            oldBlock = oldBlocks[i]
            newBlock._id = oldBlock._id
            newBlock.prev = oldBlock.prev
            newBlock.next = oldBlock.next
          else
            newBlock._id = @newId()
            if i > 0 then link newBlocks[i - 1], newBlock
          newBlockMap[newBlock._id] = newBlock
        changes.first = if !oldBlocks.length then newBlocks[0]._id else @getFirst()
        if (oldBlocks.length != newBlocks.length) && spliceNext
          next = @copyBlock @getBlock spliceNext
          newBlockMap[next._id] = next
          link last(newBlocks), next
        @change changes
        changes
      change: ({first, removes, sets})->
        if first then @first = first
        for id in removes
          delete @blocks[id]
        for id, block of sets
          @blocks[id] = block

`getBlock(id) -> block?`: get the current block for id

      getBlock: (id)-> @blocks[id]

`bindings {keys -> binding(editor, event, selectionRange)}`: a map of bindings (can use LeisureEditCore.defaultBindings)

      bindings: defaultBindings

`blockColumn(pos) -> colNum`: returns the start column on the page for the current block

      blockColumn: (pos)-> pos.textPosition().left

`topRect() -> rect?`: returns null or the rectangle of a toolbar at the page top

      topRect: -> null

`keyUp(editor) -> void`: handle keyup after-actions

      keyUp: ->

`domCursor(node, pos) -> DOMCursor`: return a domCursor that skips over non-content

      domCursor: (node, pos)->
        new DOMCursor(node, pos).addFilter (n)-> (n.hasAttribute('data-noncontent') && 'skip') || isEditable(n.node)

`getContainer(node) -> Node?`: get block DOM node containing for a node

      getContainer: (node)->
        if @editor.node[0].compareDocumentPosition(node) & Element.DOCUMENT_POSITION_CONTAINED_BY
          $(node).closest('[data-block]')[0]

`load(el, text) -> void`: parse text into blocks and replace el's contents with rendered DOM

      load: (text)->
        @replaceBlocks @blockList(), @parseBlocks text
        @editor.node.html @renderBlocks()
        @trigger 'load'
      blockCount: ->
        c = 0
        for b of @blocks
          c++
        c
      blockList: ->
        next = @getFirst()
        while next
          bl = @getBlock next
          next = bl.next
          bl
      renderBlocks: ->
        result = ''
        next = @getFirst()
        while next && [html, next] = @renderBlock @getBlock next
          result += html
        result

DataStore
=========
Events:
  `change {adds, updates, removes, oldFirst}`: data changed

    class DataStore extends Observable
      constructor: ->
        super()
        @blocks = {}
      getBlock: (id)-> @blocks[id]
      blockList: ->
        next = @first
        while next
          bl = @blocks[next]
          next = bl.next
          bl
      change: (changes)-> @triggerChange @makeChange changes
      makeChange: ({first, removes, sets})->
        old = {}
        newBlocks = {}
        removed = []
        oldFirst = first
        @first = first
        for id of removes
          if bl = @blocks[id]
            removed.push bl
            delete @blocks[id]
        for id, block of sets
          if @blocks[id] then old[id] = block
          else newBlocks[id] = block
          @blocks[id] = block
        adds: newBlocks, updates: old, removes: removed, oldFirst: first
      triggerChange: (changes)-> @trigger 'change', changes

DataStoreEditingOptions
=======================

    class DataStoreEditingOptions extends BasicEditingOptions
      constructor: (@data)->
        super()
        @data.on 'change', (change)=> @changed change
      edit: (oldBlocks, newBlocks)-> @replaceBlocks oldBlocks, newBlocks
      getBlock: (id)-> @data.getBlock id
      getFirst: (first)-> @data.first
      change: (changes)-> @data.change changes
      changed: (change)-> @editor.node.html @renderBlocks()

Utilities
=========

    isEditable = (n)->
      n = if n.nodeType == n.TEXT_NODE then n.parentNode else n
      n.isContentEditable

    link = (prev, next)->
      prev.next = next._id
      next.prev = prev._id

    blockText = (blocks)-> (block.text for block in blocks).join ''

getEventChar(e)
--------------
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

    root = LeisureEditCore
    root.Observable = Observable
    root.BasicEditingOptions = BasicEditingOptions
    root.DataStore = DataStore
    root.DataStoreEditingOptions = DataStoreEditingOptions
    root.defaultBindings = defaultBindings
    root.last = last
    root.link = link
    root.blockText = blockText

    if window? then window.LeisureEditCore = root else module.exports = root
