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
      setHtml
    } = LeisureEditCore = window.LeisureEditCore

    orgEditing = null
    plainEditing = null
    data = null

    class OrgData extends DataStore
      getBlock: (thing)-> if typeof thing == 'string' then super thing else thing
      load: (first, blocks)->
        if first then linkAllSiblings first, blocks, sets: {}, old: {}
        super first, blocks
      parseBlocks: (text)->
        if text == '' then []
        else orgDoc parseOrgMode text.replace /\r\n/g, '\n'
      nextSibling: (thing)-> @getBlock @getBlock(thing).nextSibling
      previousSibling: (thing)-> @getBlock @getBlock(thing).previousSibling
      reducePreviousSiblings: (thing, func, arg)->
        greduce @getBlock(thing), func, arg, (b)=> @getBlock b.previousSibling
      reduceNextSiblings: (thing, func, arg)->
        greduce @getBlock(thing), func, arg, (b)=> @getBlock b.nextSibling
      lastSibling: (thing)-> @reduceNextSiblings thing, ((x, y)-> y), null
      firstSibling: (thing)-> @reducePreviousSiblings thing, ((x, y)-> y), null
      parent: (thing)-> @getBlock @firstSibling(thing)?.prev
      firstChild: (thing)->
        if (block = @getBlock thing) && (n = @getBlock block.next) && !n.previousSibling
          n
      lastChild: (thing)-> @lastSibling @firstChild thing
      children: (thing)->
        c = []
        @reduceNextSiblings @firstChild(thing), ((x, y)-> c.push y), null
        c

makeChange({removes, sets, first, oldBlocks, newBlocks}): at this point, brute-force recompute all links.  This does compute the minimal block changes, but linkAllSiblings traverses all of the blocks to do it.  Needs to do less work to handle a massive amount of nodes.

      makeChange: (changes)->
        changes = super changes
        linkAllSiblings @first, @blocks, changes
        changes

    greduce = (thing, func, arg, next)->
      if thing && typeof arg == 'undefined'
        arg = thing
        thing = next thing
      while thing
        arg = func arg, thing
        thing = next thing
      arg

    getId = (thing)-> if typeof thing == 'string' then thing else thing._id

    linkAllSiblings = (first, blocks, changes)->
      change = (block)->
        if !changes.old[block._id] then changes.old[block._id] = copy block
        changes.sets[block._id] = block
      parentStack = ['TOP']
      siblingStack = [null]
      emptyNexts = {}
      cur = blocks[first]
      while cur
        if cur.nextSibling then emptyNexts[cur._id] = cur
        curParent = blocks[last parentStack]
        if cur.type == 'headline'
          while curParent && cur.level <= curParent.level
            parentStack.pop()
            siblingStack.pop()
            curParent = blocks[last parentStack]
        if previousSibling = last siblingStack
          delete emptyNexts[previousSibling]
          if (prev = blocks[previousSibling]).nextSibling != cur._id
            change(prev).nextSibling = cur._id
          if cur.previousSibling != previousSibling
            change(cur).previousSibling = previousSibling
        else if cur.previousSibling
          delete change(cur).previousSibling
        siblingStack[siblingStack.length - 1] = cur._id
        if cur.type == 'headline'
          parentStack.push cur._id
          siblingStack.push null
        cur = blocks[cur.next]
      for id, block of emptyNexts
        delete change(block).nextSibling

    class OrgEditing extends DataStoreEditingOptions
      constructor: (data)->
        super data
        data.on 'load', => setHtml @editor.node[0], @renderBlocks()
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
        rendered = {}
        for id, block of changes.removes
          @removeBlock block
        for block in changes.newBlocks
          rendered[block._id] = true
          @updateBlock block, changes.old[block._id]
        for id, block of changes.sets
          if !rendered[id] then @updateBlock block, changes.old[block._id]
      nodeForId: (id)-> id && $("#fancy-#{getId id}")
      idForNode: (node)-> node.id.match(/^fancy-(.*)$/)?[1]
      parseBlocks: (text)-> @data.parseBlocks text
      removeBlock: (block)->
        if (node = @nodeForId block._id).length
          if block.type == 'headline'
            content = node.children().filter('[data-content]')
            content.children().filter('[data-block]').insertAfter(node)
          node.remove()
      updateBlock: (block, old)->
        if (node = @nodeForId block._id).length
          if block.type != old?.type || block.nextSibling != old?.nextSibling || block.previousSibling != old?.previousSibling || block.prev != old?.prev
            @insertUpdateNode block, node
          if block.text != old?.text
            if node.is '[data-headline]'
              content = node.children().filter('[data-content]')
              content.children().filter('[data-block]').insertAfter(node)
            [html] = @renderBlock block, true
            node = $(setHtml node[0], html, true)
            content = node.children().filter('[data-content]')
            if block.type == 'headline'
              for child in @data.children block
                content.append @nodeForId child._id
        else
          node = $("<div></div>")
          @insertUpdateNode block, node
          [html] = @renderBlock block, true
          setHtml node[0], html, true
      insertUpdateNode: (block, node)->
        if (prev = @nodeForId @data.previousSibling block)?.length then prev.after node
        else if !block.prev then @editor.node.prepend(node)
        else if (parentNode = @nodeForId(block.prev))?.is("[data-headline]")
          parentNode.children().filter("[data-content]").append node
        else if (next = @nodeForId @data.nextSibling block)?.length then next.before node
        else @editor.node.append(node)
      renderBlock: (block, skipChildren)->
        html = if block.type == 'headline'
          "<div #{blockAttrs block} contenteditable='false'>#{blockLabel block}<div contenteditable='true' data-content>#{contentSpan block.text, 'text'}#{if !skipChildren then (@renderBlock(child)[0] for child in @data.children(block) ? []).join '' else ''}</div></div>"
        else if block.type == 'code'
          "<span #{blockAttrs block}>#{blockLabel block}#{escapeHtml block.text}</span>"
        else "<span #{blockAttrs block}>#{blockLabel block}#{escapeHtml block.text}</span>"
        [html, @data.nextSibling(block)?._id || !@data.firstChild(block) && block.next]
      updateStatus: (line)-> $("#orgStatus").html line

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
