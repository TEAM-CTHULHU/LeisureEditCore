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
    } = LeisureEditCore = window.LeisureEditCore

    orgEditing = null
    plainEditing = null
    data = null

    class OrgData extends DataStore
      load: (changes)->
        super changes
        cur = @blocks[@first]
        while cur
          if l = @links.nextSibling[cur._id] then cur.nextSibling = l
          if l = @links.previousSibling[cur._id] then cur.previousSibling = l
          cur = @blocks[cur.next]
      parseBlocks: (text)->
        if text == '' then []
        else orgDoc parseOrgMode text.replace /\r\n/g, '\n'

makeChange({removes, sets, first, oldBlocks, newBlocks}): at this point, brute-force recompute all links

      makeChange: (changes)->
        siblings = new MFSet()
        for id of changes.removes
          @mergeChain siblings, id, @links.previousSibling[id], @links.nextSibling[id]
        @verifyMerge "Merge siblings", siblings
        result = super changes
        @links = new Links @first, @blocks
        result
      mergeChain: (chain, id, prev, next)->
        chain.add id, {prev: prev, next: next}
        chain.merge prev, id, (s1, s2)-> prev: s1.prev, next: s2.next
        chain.merge id, next, (s1, s2)-> prev: s1.prev, next: s2.next
      verifyMerge: (label, merges)->
        for id, value of merges.elements when typeof value == 'object'
          console.log "#{label}: [ #{value.prev} -> #{value.next} ]"
        null
      parent: (thing)-> @links.getParent thing
      firstChild: (thing)-> @links.getFirstChild thing
      lastChild: (thing)-> @links.getLastChild thing
      nextSibling: (thing)-> @links.getNextSibling thing
      previousSibling: (thing)-> @links.getPreviousSibling thing
      children: (thing)-> @links.getChildren thing

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

    class Links
      constructor: (first, @blocks, @overlay = {})->
        @nextSibling = {}
        @previousSibling = {}
        parentStack = ['TOP']
        siblingStack = [[]]
        cur = @getBlock first
        while cur
          curParent = @getBlock last parentStack
          if cur.type == 'headline'
            while curParent && cur.level <= curParent.level
              parentStack.pop()
              siblingStack.pop()
              curParent = @getBlock last parentStack
          if previousSibling = last(last(siblingStack))
            @nextSibling[previousSibling] = cur._id
            @previousSibling[cur._id] = previousSibling
          last(siblingStack).push cur._id
          if cur.type == 'headline'
            parentStack.push cur._id
            siblingStack.push []
          cur = @getBlock cur.next
      getBlock: (id)-> @overlay[id] ? @blocks[id]
      getPreviousSibling: (thing)-> @getBlock @previousSibling[getId thing]
      getNextSibling: (thing)-> @getBlock @nextSibling[getId thing]
      getFirstSibling: (thing)->
        id = getId thing
        while p = @previousSibling[id]
          id = p
        @getBlock id
      getLastSibling: (thing)->
        n = @getBlock getId thing
        while n && c = @getNextSibling n
          n = c
        n
      getParent: (thing)-> @getBlock @getFirstSibling(thing)?.prev
      getFirstChild: (thing)->
        if (block = @getBlock getId thing) && (n = @getBlock block.next) && !@previousSibling[block.next]
          @getBlock block.next
      getLastChild: (thing)-> @getLastSibling @getFirstChild thing
      getChildren: (thing)->
        c = []
        child = @getFirstChild thing
        while child
          c.push child
          child = @getNextSibling child
        c

    class OrgEditing extends DataStoreEditingOptions
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

    class PlainEditing extends OrgEditing
      nodeForId: (id)-> $("#plain-#{id}")
      idForNode: (node)-> node.id.match(/^plain-(.*)$/)?[1]
      parseBlocks: (text)-> @data.parseBlocks text
      renderBlock: (block)-> ["<span id='plain-#{block._id}' data-block>#{escapeHtml block.text}</span>", block.next]
      updateStatus: (line)-> $("#plainStatus").html line

    class FancyEditing extends OrgEditing
      changed: (changes)->
        new RenderingComputer(changes, this).renderChanges()
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

    class RenderingComputer
      constructor: (@changes, @options)->
        @links = new Links @changes.oldFirst, @options.data.blocks, @changes.old
        @moves = {}
        changedParent = {}
        
        for id of @changes.updates
          oldBlock = @changes.old[id]
          newBlock = @options.getBlock id
          if oldBlock.type == newBlock.type == 'headline'
            if newBlock.level != oldBlock.level
              oldChildren = {}
              newChildren = {}
              added = {}
              removed = {}
              for child in @links.getChildren oldBlock
                oldChildren[child._id] = child
              for child in @links.getChildren newBlock
                if !oldChildren[child._id] then added[child._id] = true
              for childId of oldChildren
                if !newChildren[childId] then removed[childId] = true
      renderChanges: -> @options.editor.node.html @options.renderBlocks()
      promoteChildren: (headlineId)->
        
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
      while cur
        if !data.links.previousSibling[cur._id]
          p = cur
          while p = data.links.getParent p
            level++
        info += "#{('   ' for i in [0...level]).join ''}#{cur._id}: #{JSON.stringify cur.text}\n"
        if !data.links.nextSibling[cur._id] then level = 0
        cur = data.getBlock cur.next
      $("#blocks").html info

    $(document).ready ->
      data = new OrgData()
      data.on 'change', (changes)-> displayStructure data
      window.ED = editor = new LeisureEditCore $("#fancyEditor"), new FancyEditing data
      window.ED2 = new LeisureEditCore $("#plainEditor"), new PlainEditing data
      setTimeout (->editor.loadURL "example.lorg"), 1
