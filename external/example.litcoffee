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
    } = DecentEditor = window.DecentEditor

    class OrgEditing extends BasicOptions
      constructor: ->
        super()
        @clearChanges()
      moved: (editor)->
        {blockId, offset} = editor.getBlockLocation()
        if blockId
          text = @blocks[blockId].text.substring(0, offset)
          lines = text.split('\n')
          $("#status").html "Block: #{blockId}, line: #{lines.length}, col: #{last(lines).length}"
        return
        cur = @first
        lines = 0
        while cur && curBlock = @blocks[cur]
          if cur._id == block._id
            $("#status").html "Line: #{pos.line}, col: #{pos.column}"
            break
          cur = curBlock.next
      newChanges: -> this
      clearChanges: ->
        @updates = null
        @removes = null
        @rerender = {}
        @parents = null
        @newParents = null
      parseBlocks: (text)-> orgDoc parseOrgMode text.replace /\r\n/g, '\n'
      load: (el, text)->
        idCounter = 0
        @newBlocks @parseBlocks text
        @findParents()
        @findChildren()
        el.html @renderBlock @blocks[@first]
      isMergeable: (newBlock, oldBlock, neighbor)->
        newBlock.type == 'chunk' && oldBlock.type != 'chunk' && neighbor?.type == 'chunk'
      edit: (func)->
        {@removes, @updates} = @changes = func()
        newFirst = @blocks[@first]
        while @removes[newFirst._id]
          newFirst = newFirst.next && @blocks[newFirst.next]
        if newFirst then while p = newFirst.prev
          newFirst = @getChangedBlock p
        for id of @removes
          $("##{id}").remove()
        @changes.applyChanges()
        @oldParents = @parents
        @findParents()
        @findChildren()
        for id, block of @updates
          @setUpdateRerender block
        for id of @rerender
          @rerenderBlock @blocks[id]
        @clearChanges()
      setRemoveRerender: (id)->
        while @removes[id]
          id = @parents[id]
        if id then @rerender[id] = true
      setUpdateRerender: (newBlock)->
        oldBlock = @getOldBlock newBlock._id
        if !oldBlock then @rerender[newBlock._id] = true
        else if (np = @parents[newBlock._id]) != (op = @oldParents[oldBlock._id])
          @setUpdateRerender @blocks[np]
        else @rerender[newBlock._id] = true
      getChangedBlock: (id)-> @changes.getChangedBlock id
      getOldBlock: (id)-> @changes.getOldBlock id
      findParents: ->
        parents = @parents = {}
        @findStructure @first, (parent, child)-> parents[child._id] = parent?._id
      findChildren: ->
        children = @children = {}
        @findStructure @first, (parent, child)-> if parent
          childList = (children[parent._id] ? (children[parent._id] = []))
          childList.push child._id
      findStructure: (first, func)->
        original = @blocks[first]
        if original.type == 'headline'
          ancestors = []
          while first && block = @blocks[first]
            parent = last ancestors
            if block.type == 'headline'
              if block != original && block.level <= original.level ? 0 then break
              if block.level == parent?.level then ancestors.pop()
              if !parent || block.level >= parent.level then ancestors.push block
              else
                while block.level < parent.level
                  ancestors.pop()
                  parent = last ancestors
                ancestors.push block
              parent = if ancestors.length > 1 then ancestors[ancestors.length - 2]
            func parent, block
            first = block.next
      rerenderBlock: (block)->
        if (node = $("##{block._id}")).length
          node.replaceWith @renderBlock block
        else if block.next && (next = $("##{block.next}")).length
          next.before @renderBlock block
        else if block.prev && (prev = $("##{block.prev}")).length
          prev.after @renderBlock block
      renderBlock: (block)->
        if block.type == 'headline'
          "<div #{blockAttrs block}>#{blockLabel block}#{contentSpan block.text, 'text'}#{(@renderBlock @blocks[childId], null, true for childId in @children[block._id]).join ''}</div>"
        else "<span #{blockAttrs block}>#{blockLabel block}#{escapeHtml block.text}</span>"

    blockLabel = (block)->
      "<span class='blockLabel' contenteditable='false' data-noncontent>[#{block.type}]</span>"

    blockAttrs = (block)->
      extra = ''
      if block.type == 'headline' then extra += " data-headline='#{escapeAttr block.level}'"
      "id='#{escapeAttr block._id}' data-type='#{escapeAttr block.type}'#{extra}"

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
      editor = new DecentEditor $("#editor"), new OrgEditing()
      editor.loadURL "example.lorg"
      window.ED = editor
