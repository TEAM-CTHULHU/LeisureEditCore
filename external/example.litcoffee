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
    } = LeisureEditCore = window.LeisureEditCore

    orgEditing = null
    plainEditing = null
    data = null

    class OrgData extends DataStore
      parseBlocks: (text)->
        if text == '' then []
        else orgDoc parseOrgMode text.replace /\r\n/g, '\n'
      makeChange: (changes)->
        result = super changes
        @links = computeLinks @first, @blocks
        result
      parent: (thing)-> @blocks[@links.parent[getId thing]]
      firstChild: (thing)-> @blocks[@links.firstChild[getId thing]]
      lastChild: (thing)-> @blocks[@links.lastChild[getId thing]]
      children: (thing)->
        c = []
        child = @firstChild thing
        while child
          c.push child
          child = @nextSibling child
        c
      nextSibling: (thing)-> @blocks[@links.nextSibling[getId thing]]
      previousSibling: (thing)-> @blocks[@links.previousSibling[getId thing]]

    getId = (thing)-> if typeof thing == 'string' then thing else thing._id

    computeLinks = (first, blocks, overlay = {})->
      getBlock = (id)-> overlay[id] ? blocks[id]
      parent = {}
      firstChild = {}
      lastChild = {}
      nextSibling = {}
      previousSibling = {}
      parentStack = ['TOP']
      siblingStack = [[]]
      cur = getBlock first
      while cur
        curParent = getBlock last parentStack
        if cur.type == 'headline'
          while curParent && cur.level <= curParent.level
            lastChild[curParent._id] = last(last siblingStack)._id
            parentStack.pop()
            siblingStack.pop()
            curParent = getBlock last parentStack
        parent[cur._id] = last parentStack
        if previousSibling = last(last(siblingStack))
          nextSibling[previousSibling] = cur._id
          previousSibling[cur._id] = previousSibling
        else firstChild[last parentStack] = cur._id
        last(siblingStack).push cur._id
        if cur.type == 'headline'
          parentStack.push cur._id
          siblingStack.push []
        cur = getBlock cur.next
      {parent, firstChild, lastChild, nextSibling, previousSibling}

    class PlainEditing extends DataStoreEditingOptions
      nodeForId: (id)-> $("#plain-#{id}")
      idForNode: (node)-> node.id.match(/^plain-(.*)$/)?[1]
      parseBlocks: (text)-> @data.parseBlocks text
      renderBlock: (block)-> ["<span id='plain-#{block._id}' data-block>#{escapeHtml block.text}</span>", block.next]
      setEditor: (@editor)->
        @editor.on 'moved', =>
          {startBlock, startOffset} = @editor.getSelectedBlockRange()
          if startBlock
            cur = @getBlock @getFirst()
            offset = startOffset
            while cur != startBlock
              offset += cur.text.length
              cur = @getBlock cur.next
            text = blockText(@blockList()).substring(0, offset)
            lines = text.split('\n')
            line = lines.length
            $("#plainStatus").html "Line: #{numSpan line} col: #{numSpan last(lines)?.length ? 0}"
            return
          $("#plainStatus").html "No selection"

    class OrgEditing extends DataStoreEditingOptions
      changed: (changes)->
        for id, block of changes.adds
          console.log "add", block
        for id of changes.removes
          console.log "remove", changes.old[id]
        for id of changes.updates
          console.log "update", changes.old[id], "->", @getBlock(id)
        super changes
      nodeForId: (id)-> $("#fancy-#{id}")
      idForNode: (node)-> node.id.match(/^fancy-(.*)$/)?[1]
      parseBlocks: (text)-> @data.parseBlocks text
      renderBlock: (block)->
        html = if block.type == 'headline'
          "<div #{blockAttrs block} contenteditable='false'>#{blockLabel block}<div contenteditable='true'>#{contentSpan block.text, 'text'}#{(@renderBlock(child)[0] for child in @data.children(block) ? []).join ''}</div></div>"
        else if block.type == 'code'
          "<span #{blockAttrs block}>#{blockLabel block}#{escapeHtml block.text}</span>"
        else "<span #{blockAttrs block}>#{blockLabel block}#{escapeHtml block.text}</span>"
        [html, @data.nextSibling(block)?._id || block.next]
      setEditor: (@editor)->
        @editor.on 'moved', =>
          {startBlock, startOffset} = @editor.getSelectedBlockRange()
          if startBlock
            text = startBlock.text.substring(0, startOffset)
            lines = text.split('\n')
            line = lines.length
            block = startBlock
            while block.prev
              block = @getBlock block.prev
              line += block.text.split('\n').length - 1
            $("#orgStatus").html "Block: #{startBlock._id}#{numSpan ''} line: #{numSpan line} col: #{numSpan last(lines)?.length ? 0} block line: #{numSpan lines.length}"
            return
          $("#orgStatus").html "No selection"

    class RenderingComputer
      constructor: (@changes, @options)->
      renderChanges: ->
      promoteChildren: (headlineId)->
        

    numSpan = (n)-> "<span class='status-num'>#{n}</span>"

    blockLabel = (block)->
      "<span class='blockLabel' contenteditable='false' data-noncontent>[#{block.type}]</span>"

    blockAttrs = (block)->
      extra = ''
      if block.type == 'headline' then extra += " data-headline='#{escapeAttr block.level}'"
      "id='fancy-#{escapeAttr block._id}' data-block='#{escapeAttr block._id}' data-type='#{escapeAttr block.type}'#{extra}"

    contentSpan = (str, type)->
      str = escapeHtml str
      if str then "<span#{if type then " data-org-type='#{escapeAttr type}'" else ''}>#{str}</span>" else ''

    escapeHtml = (str)->
      if typeof str == 'string' then str.replace /[<>&]/g, (c)-> replacements[c]
      else str

    escapeAttr = (str)->
      if typeof str == 'string' then str.replace /['"&]/g, (c)->
        switch c
          when '"' then '&quot;'
          when "'" then '&#39;'
          when '&' then '&amp;'
      else str

    $(document).ready ->
      data = new OrgData()
      editor = new LeisureEditCore $("#orgEditor"), orgEditing = new OrgEditing data
      new LeisureEditCore $("#source"), plainEditing = new PlainEditing data
      window.ED = editor
      setTimeout (->editor.loadURL "example.lorg"), 1
