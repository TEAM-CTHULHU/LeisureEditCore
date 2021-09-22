OrgData example editor (based on Leisure)
=========================================
This extends Data store and pushes parsing into the store instead of keeping
it in the editing options and options delegate it to the store.

    import * as Org from './org.js'
    import * as DocOrg from './docOrg.js'
    import * as Editor from './editor.js'

    export {Editor, Org, DocOrg}

    {
      parseOrgMode
      orgDoc
      Source
      Results
      Headline
      SimpleMarkup
      Fragment
    } = Org
    {
      orgDoc
      getCodeItems
      blockSource
      blockOrg: docBlockOrg
      ParsedCodeBlock
      parseYaml
    } = DocOrg
    {
      last
      DataStore
      DataStoreEditingOptions
      blockText
      posFor
      escapeHtml
      copyBlock
      LeisureEditCore
      set$
    } = Editor

    $ = Editor.$
    #set$ $, (o)-> o instanceof $

    orgEditing = null
    plainEditing = null
    data = null

    export class OrgData extends DataStore
      getBlock: (thing, changes)->
        if typeof thing == 'object' then thing
        else changes?.sets[thing] ? super(thing)
      changesFor: (first, oldBlocks, newBlocks)->
        changes = super first, oldBlocks, newBlocks
        @linkAllSiblings changes
        changes
      load: (name, text)->
        @makeChanges =>
          @suppressTriggers => super name, text
          @linkAllSiblings {first: @first, sets: @blocks, oldBlocks: [], newBlocks: @blockList()}
          @trigger 'load'
      parseBlocks: (text)-> parseOrgDoc text
      nextSibling: (thing, changes)-> @getBlock @getBlock(thing, changes)?.nextSibling, changes
      previousSibling: (thing, changes)-> @getBlock @getBlock(thing, changes).previousSibling, changes
      reducePreviousSiblings: (thing, changes, func, arg)->
        greduce @getBlock(thing, changes), changes, func, arg, (b)=> @getBlock b.previousSibling, changes
      reduceNextSiblings: (thing, changes, func, arg)->
        greduce @getBlock(thing, changes), changes, func, arg, (b)=> @getBlock b.nextSibling, changes
      lastSibling: (thing, changes)-> @reduceNextSiblings thing, changes, ((x, y)-> y), null
      firstSibling: (thing, changes)-> @reducePreviousSiblings thing, changes, ((x, y)-> y), null
      parent: (thing, changes)-> @getBlock @firstSibling(thing, changes)?.prev, changes
      properties: (thing)->
        props = {}
        bl = @getBlock thing
        if bl.type != 'headline'
          if bl.type == 'code'
            _.defaults props, bl.codeAttributes
            _.defaults props, bl.properties
          else if bl.type == 'chunk' then _.defaults props, bl.properties
          bl = @parent bl
        while bl
          @scrapePropertiesInto bl, props
          bl = @parent bl
        props
      scrapePropertiesInto: (block, props)->
        for child in @children block
          if child.type == 'chunk' && child.properties && !_.isEmpty child.properties
            _.defaults props, child.properties
      firstChild: (thing, changes)->
        if (block = @getBlock thing, changes) && (n = @getBlock block.next, changes) && !n.previousSibling
          n
      lastChild: (thing, changes)-> @lastSibling @firstChild(thing, changes), changes
      children: (thing, changes)->
        c = []
        @reduceNextSiblings @firstChild(thing, changes), changes, ((x, y)-> c.push y), null
        c

`nextRight` returns the next thing in the tree after this subtree, which is just the
next sibling if there is one, otherwise it's the closest "right uncle" of this node

      nextRight: (thing, changes)->
        while thing
          if sib = @nextSibling thing, changes then return sib
          thing = @parent thing, changes
        null

`linkAllSiblings` -- modify changes so that the sibling links will be correct when the changes are applied.

      linkAllSiblings: (changes)->
        stack = []
        parent = null
        sibling = null
        emptyNexts = {}
        cur = @getBlock changes.first, changes
        while cur
          if cur.nextSibling then emptyNexts[cur._id] = cur
          if cur.type == 'headline'
            while parent && cur.level <= parent.level
              [parent, sibling] = stack.pop()
          else if cur.type == 'chunk' && cur.properties? && parent && !_(parent.propertiesBlocks).includes cur._id
            if !parent.propertiesBlocks
              parent.propertiesBlocks = []
            parent.propertiesBlocks.push cur._id
          if sibling
            delete emptyNexts[sibling._id]
            if sibling.nextSibling != cur._id
              addChange(sibling, changes).nextSibling = cur._id
            if cur.previousSibling != sibling._id
              addChange(cur, changes).previousSibling = sibling._id
          else if cur.previousSibling
            delete addChange(cur, changes).previousSibling
          sibling = cur
          if cur.type == 'headline'
            stack.push [parent, sibling]
            parent = cur
            sibling = null
          cur = @getBlock cur.next, changes
        for id, block of emptyNexts
          delete addChange(block, changes).nextSibling

    parseOrgDoc = (text)->
      if text == '' then []
      else orgDoc parseOrgMode(text.replace /\r\n/g, '\n'), true

    addChange = (block, changes)->
      if !changes.sets[block._id]
        changes.oldBlocks.push block
        changes.newBlocks.push changes.sets[block._id] = copyBlock block
      changes.sets[block._id]

    greduce = (thing, changes, func, arg, next)->
      if typeof changes == 'function'
        next = arg
        arg = func
        func = changes
      if thing && typeof arg == 'undefined'
        arg = thing
        thing = next thing
      while thing
        arg = func arg, thing
        thing = next thing
      arg

    getId = (thing)-> if typeof thing == 'string' then thing else thing._id

    class OrgEditing extends DataStoreEditingOptions
      constructor: (data)->
        super data
        data.on 'load', => @editor.setHtml @editor.node[0], @renderBlocks()
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
          content = node.children().filter('[data-content]')
          if block.type != old?.type || block.nextSibling != old?.nextSibling || block.previousSibling != old?.previousSibling || block.prev != old?.prev
            if block.type != 'headline' && old.type == 'headline'
              content.children().filter('[data-block]').insertAfter(node)
            @insertUpdateNode block, node
          if block.text != old?.text
            if node.is '[data-headline]'
              content.children().filter('[data-block]').insertAfter(node)
            [html] = @renderBlock block, true
            node = $(@editor.setHtml node[0], html, true)
            content = node.children().filter('[data-content]')
            if block.type == 'headline'
              for child in @data.children block
                content.append @nodeForId child._id
        else
          node = $("<div></div>")
          @insertUpdateNode block, node
          [html] = @renderBlock block, true
          @editor.setHtml node[0], html, true
      insertUpdateNode: (block, node)->
        if (prev = @nodeForId @data.previousSibling block)?.length then prev.after node
        else if !block.prev then @editor.node.prepend(node)
        else if !block.previousSibling && (parentNode = @nodeForId(block.prev))?.is("[data-headline]")
          parentNode.children().filter("[data-content]").children().first().after node
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
