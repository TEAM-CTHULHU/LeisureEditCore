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
        @findParents()
        @findChildren()
        result
      findParents: ->
        parents = @parents = {}
        @findStructure @first, (parent, child)-> parents[child._id] = parent?._id
      findChildren: ->
        children = @children = {}
        for block in @blockList()
          block.previousSibling = block.nextSibling = null
        @findStructure @first, (parent, child)=>
          parentId = if parent then parent._id else 'TOP'
          childList = (children[parentId] ? (children[parentId] = []))
          prev = @blocks[last childList]
          childList.push child._id
          if prev
            child.previousSibling = prev._id
            prev.nextSibling = child._id
      findStructure: (blockId, func, all)->
        original = @blocks[blockId]
        if original.type == 'headline'
          ancestors = []
          while blockId && block = @getBlock blockId
            parent = last ancestors
            if block.type == 'headline'
              if !parent || block.level > parent.level then ancestors.push block
              else
                while block.level <= parent.level
                  ancestors.pop()
                  parent = last ancestors
                ancestors.push block
              parent = if ancestors.length > 1 then ancestors[ancestors.length - 2]
            func parent, block
            blockId = block.next
        else func null, original

    class PlainEditing extends DataStoreEditingOptions
      nodeForId: (id)-> $("#plain-#{id}")
      idForNode: (node)-> node.id.match(/^plain-(.*)$/)?[1]
      parseBlocks: (text)-> @data.parseBlocks text
      renderBlock: (block)-> ["<span id='plain-#{block._id}' data-block>#{escapeHtml block.text}</span>", block.next]
      setEditor: (@editor)->
        @editor.on 'moved', =>
          {blockId, offset} = @editor.getBlockLocation()
          if blockId
            text = blockText(@blockList()).substring(0, offset)
            lines = text.split('\n')
            line = lines.length
            $("#plainStatus").html "Line: #{numSpan line} col: #{numSpan last(lines)?.length ? 0}"
            return
          $("#plainStatus").html "No selection"

    class OrgEditing extends DataStoreEditingOptions
      nodeForId: (id)-> $("#fancy-#{id}")
      idForNode: (node)-> node.id.match(/^fancy-(.*)$/)?[1]
      parseBlocks: (text)-> @data.parseBlocks text
      renderBlock: (block)->
        html = if block.type == 'headline'
          "<div #{blockAttrs block} contenteditable='false'>#{blockLabel block}<div contenteditable='true'>#{contentSpan block.text, 'text'}#{(@renderBlock(@getBlock childId)[0] for childId in @data.children[block._id] ? []).join ''}</div></div>"
        else if block.type == 'code'
          "<span #{blockAttrs block}>#{blockLabel block}#{escapeHtml block.text}</span>"
        else "<span #{blockAttrs block}>#{blockLabel block}#{escapeHtml block.text}</span>"
        [html, block.nextSibling]
      setEditor: (@editor)->
        @editor.on 'moved', =>
          {blockId, offset} = @editor.getBlockLocation()
          if blockId
            block = @getBlock blockId
            text = block.text.substring(0, offset)
            lines = text.split('\n')
            line = lines.length
            cur = blockId
            while block.prev
              block = @getBlock block.prev
              line += block.text.split('\n').length - 1
            $("#orgStatus").html "Block: #{blockId}#{numSpan ''} line: #{numSpan line} col: #{numSpan last(lines)?.length ? 0} block line: #{numSpan lines.length}"
            return
          $("#orgStatus").html "No selection"

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
