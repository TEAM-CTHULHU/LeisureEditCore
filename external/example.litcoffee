OrgData example editor (based on Leisure)
=========================================
This extends Data store and pushes parsing into the store instead of keeping
it in the editing options and options delegate it to the store.

    {
      parseOrgMode
      orgDoc
      Source
      Results
      Headline
      SimpleMarkup
      Fragment
    } = window.Org
    {
      last
      DataStore
      DataStoreEditingOptions
      blockText
      posFor
      escapeHtml
      copy
    } = LeisureEditCore = window.LeisureEditCore

    orgEditing = null
    plainEditing = null
    data = null

    class OrgData extends DataStore
      getBlock: (thing)-> if typeof thing == 'string' then super thing else thing
      load: (first, blocks)->
        if first then linkAllSiblings first, blocks
        super first, blocks
      parseBlocks: (text)->
        if text == '' then []
        else orgDoc parseOrgMode text.replace /\r\n/g, '\n'

makeChange({removes, sets, first, oldBlocks, newBlocks}): at this point, brute-force recompute all links

      #makeChange: (changes)->
      #  for block, i in changes.newBlocks
      #    @linkPrevSibling block, changes
      #  @linkPrevSibling @getChanged(last(changes.newBlocks).next, changes), changes
      #  #siblings = new MFSet()
      #  #for id of changes.removes
      #  #  @mergeChain siblings, id, @links.previousSibling[id], @links.nextSibling[id]
      #  #@verifyMerge "Merge siblings", siblings
      #  super changes
      makeChange: (changes)->
        super changes
        linkAllSiblings @first, @blocks
      mergeChain: (chain, id, prev, next)->
        chain.add id, {prev: prev, next: next}
        chain.merge prev, id, (s1, s2)-> prev: s1.prev, next: s2.next
        chain.merge id, next, (s1, s2)-> prev: s1.prev, next: s2.next
      verifyMerge: (label, merges)->
        for id, value of merges.elements when typeof value == 'object'
          console.log "#{label}: [ #{value.prev} -> #{value.next} ]"
        null
      nextSibling: (thing)-> @getBlock @getBlock(thing).nextSibling
      previousSibling: (thing)-> @getBlock @getBlock(thing).previousSibling
      firstSibling: (thing)->
        id = getId thing
        while id && p = @getBlock(id)?.previousSibling
          id = p
        @getBlock id
      lastSibling: (thing)->
        id = @getBlock thing
        while id && c = @getBlock(id).nextSibling
          id = c
        @getBlock id
      parent: (thing)-> @getBlock @firstSibling(thing)?.prev
      firstChild: (thing)->
        if (block = @getBlock thing) && (n = @getBlock block.next) && !n.previousSibling
          n
      lastChild: (thing)-> @lastSibling @firstChild thing
      children: (thing)->
        c = []
        child = @firstChild thing
        while child
          c.push child
          child = @nextSibling child
        c

    getId = (thing)-> if typeof thing == 'string' then thing else thing._id

Merge-find set with path compression

    class MFSet
      constructor: ->
        @elements = {} # id -> id | object
      add: (id, setObj)-> @elements[id] = setObj
      find: (id)->
        if @elements[id]
          path = []
          while typeof (s = @elements[id]) == 'string'
            path.push s
          lastId = path.pop()
          for id in path
            @elements[id] = lastId
          lastId

`merge(id1, id2, mergeFunc(set1, set2))` mergeFunc takes the current sets
and returns an object representing the new set

      merge: (id1, id2, mergeFunc)->
        if (s1 = @find id1) && (s2 = @find id2)
          @elements[s2] = mergeFunc @elements[s1], @elements[s2]
          @elements[s1] = s2

    linkAllSiblings = (first, blocks)->
      parentStack = ['TOP']
      siblingStack = [[]]
      cur = blocks[first]
      while cur
        delete cur.nextSibling
        delete cur.previousSibling
        curParent = blocks[last parentStack]
        if cur.type == 'headline'
          while curParent && cur.level <= curParent.level
            parentStack.pop()
            siblingStack.pop()
            curParent = blocks[last parentStack]
        if previousSibling = last(last(siblingStack))
          blocks[previousSibling].nextSibling = cur._id
          blocks[cur._id].previousSibling = previousSibling
        last(siblingStack).push cur._id
        if cur.type == 'headline'
          parentStack.push cur._id
          siblingStack.push []
        cur = blocks[cur.next]

    class OrgEditing extends DataStoreEditingOptions
      constructor: (data)->
        super data
        data.on 'load', => @editor.node.html @renderBlocks()
      blockLineFor: (node, offset)->
        {block, offset} = @editor.blockOffset node, offset
        @blockLine block, offset
      blockLine: (block, offset)->
        text = block.text.substring(0, offset)
        lines = text.split('\n')
        line: lines.length
        col: last(lines).length
      lineInfo: (block, offset)->
        if block
          {line, col} = @blockLine block, offset
          startBlock = block
          docLine = line
          while block.prev
            block = @getBlock block.prev
            docLine += block.text.split('\n').length - 1
          holder = @nodeForId startBlock._id
          p = posFor @editor.domCursorForTextPosition(holder, offset)
          line: docLine
          col: col
          blockLine: line
          top: Math.round(p.top)
          left: Math.round(p.left)
        else {}
      setEditor: (@editor)->
        @editor.on 'moved', =>
          {block, offset} = @editor.getSelectedBlockRange()
          if block
            {line, col, blockLine, top, left} = @lineInfo block, offset
            if line
              return @updateStatus "line: #{numSpan line} col: #{numSpan col} block: #{block._id}:#{numSpan blockLine} top: #{numSpan top} left: #{numSpan left}"
          @updateStatus "No selection"
      newChangesFor: (first, oldBlocks, newBlocks)->
        changes = super first, oldBlocks, newBlocks
        changes.stumps = []
        changes.backStumps = []
        changes.lastChildren = {}
        changes.parents = {}
        for block in newBlocks
          @spliceBack block, changes
        while block = @getChanged changes.stumps.pop(), changes
          @spliceBack block, changes
        for blockId in changes.backStumps
          oldBlock = @getBlock blockId
          block = @getChanged blockId, changes
          if oldBlock.nextSibling == block.nextSibling then @spliceForward block, changes
        changes

SpliceBack requires correct previousSibling links before block.

      spliceBack: (block, changes)->
        if oldSibling = @getBlock(block._id).previousSibling
          changes.backStumps.unshift oldSibling
        prev = @getChanged block.prev, changes
        while prev
          if (isSibling = siblings(prev, block)) || parent(prev, block)
            if block.previousSibling != (if isSibling then prev._id)
              if prev.nextSibling != (nextId = if isSibling then block._id)
                if !changes.sets[prev._id]
                  prev = @changeBlock prev, changes
                if prev.nextSibling then changes.stumps.push prev.nextSibling
                prev.nextSibling = nextId
              block.previousSibling = if isSibling then prev._id
            return
          prev = @getChangedParent prev, changes

SpliceForward searches forward for the true next sibling of a block in a 

      spliceForward: (block, changes)->
        parentStack = []
        prev = next = block
        while next
          if curPar = last parentStack
            if parent curPar, next
              changed.lastChildren[curParent._id] = next._id
              next = @getChanged next.next, changes
            else parentStack.pop()
          else if parent prev, next
            parentStack.push prev
            prev = @getChanged (changed.lastChildren[prev._id] || next), changes
            next = @getChanged prev.next, changes
          else if parent next, prev then next = null
          else break
        if block.nextSibling != next?._id
          @changeBlock(block, changes).nextSibling = next?._id
        block
      getChanged: (id, changes)-> id && (changes.sets[id] || @getBlock id)
      changeBlock: (block, changes)->
        changes.sets[block._id] || (changes.sets[block._id] = copy block)
      getChangedParent: (block, changes)->
        if parent = changes.parents[block._id] then return @getChanged parent._id, changes
        found = []
        first = block
        while block
          found.push block._id
          prev = block
          block = @getChanged block.previousSibling, changes
        for id in found
          changes.parents[id] = prev._id
        changes.lastChildren[prev._id] = first._id
        prev

    parent = (prev, next)->
      prev.type == 'headline' && (next.type != 'headline' || prev.level < next.level)

    siblings = (prev, next)->
      (prev.type != 'headline' && next.type != 'headline') || (prev.type == next.type == 'headline' && prev.level == next.level)

    class PlainEditing extends OrgEditing
      nodeForId: (id)-> $("#plain-#{id}")
      idForNode: (node)-> node.id.match(/^plain-(.*)$/)?[1]
      parseBlocks: (text)-> @data.parseBlocks text
      renderBlock: (block)-> ["<span id='plain-#{block._id}' data-block>#{escapeHtml block.text}</span>", block.next]
      updateStatus: (line)-> $("#plainStatus").html line

    class FancyEditing extends OrgEditing
      changed: (changes)->
        #new RenderingComputer(changes, this).renderChanges()
        @editor.node.html @renderBlocks()
      nodeForId: (id)-> $("#fancy-#{id}")
      idForNode: (node)-> node.id.match(/^fancy-(.*)$/)?[1]
      parseBlocks: (text)-> @data.parseBlocks text
      renderBlock: (block)->
        html = if block.type == 'headline'
          "<div #{blockAttrs block} contenteditable='false'>#{blockLabel block}<div contenteditable='true'>#{contentSpan block.text, 'text'}#{(@renderBlock(child)[0] for child in @data.children(block) ? []).join ''}</div></div>"
        else if block.type == 'code'
          "<span #{blockAttrs block}>#{blockLabel block}#{escapeHtml block.text}</span>"
        else "<span #{blockAttrs block}>#{blockLabel block}#{escapeHtml block.text}</span>"
        [html, @data.nextSibling(block)?._id || !@data.firstChild(block) && block.next]
      updateStatus: (line)-> $("#orgStatus").html line

RenderingComputer: at this point, brute-force recompute old links

    #class RenderingComputer
    #  constructor: (@changes, @options)->
    #    @links = new Links @changes.oldFirst, @options.data.blocks, @changes.old
    #    @moves = {}
    #    changedParent = {}
    #    
    #    for id of @changes.updates
    #      oldBlock = @changes.old[id]
    #      newBlock = @options.getBlock id
    #      if oldBlock.type == newBlock.type == 'headline'
    #        if newBlock.level != oldBlock.level
    #          oldChildren = {}
    #          newChildren = {}
    #          added = {}
    #          removed = {}
    #          for child in @links.getChildren oldBlock
    #            oldChildren[child._id] = child
    #          for child in @links.getChildren newBlock
    #            if !oldChildren[child._id] then added[child._id] = true
    #          for childId of oldChildren
    #            if !newChildren[childId] then removed[childId] = true
    #  renderChanges: -> @options.editor.node.html @options.renderBlocks()
    #  promoteChildren: (headlineId)->
    #    
    #differences = (oldItems, newItems)->
    #  oldMap = {}
    #  newMap = {}
    #  added = []
    #  removed = []
    #  for item in oldItems
    #    oldMap[item] = true
    #  else oldMap = oldItems
    #  for item in newItems
    #    newMap[item] = true
    #    if !oldMap[item] then added.push item
    #  for item in oldItems
    #    if !newMap[item] then removed.push item
    #  {added, removed}

    numSpan = (n)-> "<span class='status-num'>#{n}</span>"

    blockLabel = (block)->
      "<span class='blockLabel' contenteditable='false' data-noncontent>[#{block.type} #{block._id}]</span>"

    blockAttrs = (block)->
      extra = ''
      if block.type == 'headline' then extra += " data-headline='#{escapeAttr block.level}'"
      "id='fancy-#{escapeAttr block._id}' data-block='#{escapeAttr block._id}' data-type='#{escapeAttr block.type}'#{extra}"

    contentSpan = (str, type)->
      str = escapeHtml str
      if str then "<span#{if type then " data-org-type='#{escapeAttr type}'" else ''}>#{str}</span>" else ''

    escapeAttr = (str)->
      if typeof str == 'string' then str.replace /['"&]/g, (c)->
        switch c
          when '"' then '&quot;'
          when "'" then '&#39;'
          when '&' then '&amp;'
      else str

    displayStructure = (data)->
      parentStack = []
      info = ""
      level = 0
      cur = data.getBlock data.first
      prevParent = null
      checks = nextSibling: {}, previousSibling: {}, prev: {}
      check = cur
      prev = null
      while check
        checks.nextSibling[check.previousSibling] = check._id
        checks.previousSibling[check.nextSibling] = check._id
        checks.prev[check.next] = check._id
        prev = check
        check = data.getBlock check.next
      while cur
        bad = []
        if cur.nextSibling != checks.nextSibling[cur._id] then bad.push 'nextSibling'
        if cur.previousSibling != checks.previousSibling[cur._id] then bad.push 'previousSibling'
        if cur.prev != checks.prev[cur._id] then bad.push 'prev'
        if !cur.previousSibling
          p = cur
          while p = data.parent p
            level++
        info += "#{('   ' for i in [0...level]).join ''}#{cur._id}#{checkStructure cur, bad}: #{JSON.stringify cur.text}\n"
        if !cur.nextSibling then level = 0
        cur = data.getBlock cur.next
      $("#blocks").html info

    checkStructure = (block, bad)->
      if bad.length
        ' <span class="err">[' + ("#{err}: #{block[err]}" for err in bad).join(', ') + ']</span>'
      else ''

    $(document).ready ->
      window.DATA = data = new OrgData()
      data
        .on 'change', (changes)-> displayStructure data
        .on 'load', -> displayStructure data
      window.ED = editor = new LeisureEditCore $("#fancyEditor"), new FancyEditing data
      window.ED2 = new LeisureEditCore $("#plainEditor"), new PlainEditing data
      setTimeout (->editor.loadURL "example.lorg"), 1
