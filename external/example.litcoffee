    {
      parseOrgMode,
      orgDoc,
      Source,
      Results,
      Headline,
      SimpleMarkup,
      Fragment,
    } = window.Org
    {
      last,
      BasicOptions,
    } = EditCore = window.EditCore

    class OrgEditing extends BasicOptions
      constructor: ->
        super()
        @rerender = {}
      moved: (editor)->
        {blockId, offset} = editor.getBlockLocation()
        if blockId
          block = @blocks[blockId]
          text = block.text.substring(0, offset)
          lines = text.split('\n')
          line = lines.length
          cur = blockId
          while block.prev
            block = @blocks[block.prev]
            line += block.text.split('\n').length - 1
          $("#status").html "Block: #{blockId}#{numSpan ''} line: #{numSpan line} col: #{numSpan last(lines)?.length ? 0} block line: #{numSpan lines.length}"
          return
        $("#status").html "No selection"
        #cur = @first
        #lines = 0
        #while cur && curBlock = @blocks[cur]
        #  if cur._id == blockId
        #    $("#status").html "Line: #{pos.line}, col: #{pos.column}"
        #    break
        #  cur = curBlock.next
      parseBlocks: (text)-> orgDoc parseOrgMode text.replace /\r\n/g, '\n'
      replaceBlocks: (startId, count, newBlocks)->
        super startId, count, newBlocks
        @findParents()
        @findChildren()
      edit: (startId, count, newBlocks)->
        removed = @replaceBlocks startId, count, newBlocks, true
        #for block in removed
        #  $("##{block._id}").remove()
        @editor.node.html @renderBlocks()
        $("#source").html escapeHtml (block.text for block in @blockList()).join ''
      setRemoveRerender: (id)->
        while @removes[id]
          id = @parents[id]
        if id then @rerender[id] = true
      setUpdateRerender: (newBlock)->
        oldBlock = @getOldBlock newBlock._id
        if !oldBlock then @rerender[newBlock._id] = true
        else
          np = @parents[newBlock._id]
          op = @oldParents[oldBlock._id]
          if np == op then @rerender[newBlock._id] = true
          else
            $("##{newBlock._id}").remove()
            if np then @rerender[np] = true
            else @rerender[newBlock._id] = true
            if op then @rerender[op] = true
      getChangedBlock: (id)-> @changes.getChangedBlock id
      getOldBlock: (id)-> @changes.getOldBlock id
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
          prev = @getBlock last childList
          childList.push child._id
          if prev
            child.previousSibling = prev._id
            prev.nextSibling = child._id
      findStructure: (blockId, func, all)->
        original = @blocks[blockId]
        if original.type == 'headline'
          ancestors = []
          while blockId && block = @blocks[blockId]
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
      rerenderBlock: (block)->
        if block
          [html] = @renderBlock block
          if (node = $("##{block._id}")).length
            node.replaceWith html
          else if block.nextSibling && (next = $("##{block.nextSibling}")).length
            next.before html
          else if block.previousSibling && (prev = $("##{block.previousSibling}")).length
            prev.after html
          else $(@editor.node).append html
      renderBlock: (block)->
        html = if block.type == 'headline'
          "<div #{blockAttrs block}>#{blockLabel block}#{contentSpan block.text, 'text'}#{(@renderBlock(@blocks[childId])[0] for childId in @children[block._id] ? []).join ''}</div>"
        else "<span #{blockAttrs block}>#{blockLabel block}#{escapeHtml block.text}</span>"
        [html, block.nextSibling]
      load: (el, text)->
        super el, text
        $("#source").html escapeHtml (block.text for block in @blockList()).join ''

    numSpan = (n)-> "<span class='status-num'>#{n}</span>"

    blockLabel = (block)->
      "<span class='blockLabel' contenteditable='false'>[#{block.type}]</span>"

    blockAttrs = (block)->
      extra = ''
      if block.type == 'headline' then extra += " data-headline='#{escapeAttr block.level}'"
      "id='#{escapeAttr block._id}' data-block='#{escapeAttr block._id}' data-type='#{escapeAttr block.type}'#{extra}"

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
      #debugger
      editor = new EditCore $("#editor"), new OrgEditing()
      editor.loadURL "example.lorg"
      window.ED = editor
