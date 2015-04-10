// Generated by CoffeeScript 1.9.1
(function() {
  var DataStore, DataStoreEditingOptions, FancyEditing, Fragment, Headline, LeisureEditCore, Links, MFSet, OrgData, OrgEditing, PlainEditing, RenderingComputer, Results, SimpleMarkup, Source, blockAttrs, blockLabel, blockText, contentSpan, data, displayStructure, escapeAttr, escapeHtml, getId, last, numSpan, orgDoc, orgEditing, parseOrgMode, plainEditing, posFor, ref, ref1,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  ref = window.Org, parseOrgMode = ref.parseOrgMode, orgDoc = ref.orgDoc, Source = ref.Source, Results = ref.Results, Headline = ref.Headline, SimpleMarkup = ref.SimpleMarkup, Fragment = ref.Fragment;

  ref1 = LeisureEditCore = window.LeisureEditCore, last = ref1.last, DataStore = ref1.DataStore, DataStoreEditingOptions = ref1.DataStoreEditingOptions, blockText = ref1.blockText, posFor = ref1.posFor;

  orgEditing = null;

  plainEditing = null;

  data = null;

  OrgData = (function(superClass) {
    extend(OrgData, superClass);

    function OrgData() {
      return OrgData.__super__.constructor.apply(this, arguments);
    }

    OrgData.prototype.load = function(changes) {
      var cur, l, results;
      OrgData.__super__.load.call(this, changes);
      cur = this.blocks[this.first];
      results = [];
      while (cur) {
        if (l = this.links.nextSibling[cur._id]) {
          cur.nextSibling = l;
        }
        if (l = this.links.previousSibling[cur._id]) {
          cur.previousSibling = l;
        }
        results.push(cur = this.blocks[cur.next]);
      }
      return results;
    };

    OrgData.prototype.parseBlocks = function(text) {
      if (text === '') {
        return [];
      } else {
        return orgDoc(parseOrgMode(text.replace(/\r\n/g, '\n')));
      }
    };

    OrgData.prototype.makeChange = function(changes) {
      var id, result, siblings;
      siblings = new MFSet();
      for (id in changes.removes) {
        this.mergeChain(siblings, id, this.links.previousSibling[id], this.links.nextSibling[id]);
      }
      this.verifyMerge("Merge siblings", siblings);
      result = OrgData.__super__.makeChange.call(this, changes);
      this.links = new Links(this.first, this.blocks);
      return result;
    };

    OrgData.prototype.mergeChain = function(chain, id, prev, next) {
      chain.add(id, {
        prev: prev,
        next: next
      });
      chain.merge(prev, id, function(s1, s2) {
        return {
          prev: s1.prev,
          next: s2.next
        };
      });
      return chain.merge(id, next, function(s1, s2) {
        return {
          prev: s1.prev,
          next: s2.next
        };
      });
    };

    OrgData.prototype.verifyMerge = function(label, merges) {
      var id, ref2, value;
      ref2 = merges.elements;
      for (id in ref2) {
        value = ref2[id];
        if (typeof value === 'object') {
          console.log(label + ": [ " + value.prev + " -> " + value.next + " ]");
        }
      }
      return null;
    };

    OrgData.prototype.parent = function(thing) {
      return this.links.getParent(thing);
    };

    OrgData.prototype.firstChild = function(thing) {
      return this.links.getFirstChild(thing);
    };

    OrgData.prototype.lastChild = function(thing) {
      return this.links.getLastChild(thing);
    };

    OrgData.prototype.nextSibling = function(thing) {
      return this.links.getNextSibling(thing);
    };

    OrgData.prototype.previousSibling = function(thing) {
      return this.links.getPreviousSibling(thing);
    };

    OrgData.prototype.children = function(thing) {
      return this.links.getChildren(thing);
    };

    return OrgData;

  })(DataStore);

  getId = function(thing) {
    if (typeof thing === 'string') {
      return thing;
    } else {
      return thing._id;
    }
  };

  MFSet = (function() {
    function MFSet() {
      this.elements = {};
    }

    MFSet.prototype.add = function(id, setObj) {
      return this.elements[id] = setObj;
    };

    MFSet.prototype.find = function(id) {
      var j, lastId, len, path, s;
      if (this.elements[id]) {
        path = [];
        while (typeof (s = this.elements[id]) === 'string') {
          path.push(s);
        }
        lastId = path.pop();
        for (j = 0, len = path.length; j < len; j++) {
          id = path[j];
          this.elements[id] = lastId;
        }
        return lastId;
      }
    };

    MFSet.prototype.merge = function(id1, id2, mergeFunc) {
      var s1, s2;
      if ((s1 = this.find(id1)) && (s2 = this.find(id2))) {
        this.elements[s2] = mergeFunc(this.elements[s1], this.elements[s2]);
        return this.elements[s1] = s2;
      }
    };

    return MFSet;

  })();

  Links = (function() {
    function Links(first, blocks, overlay) {
      var cur, curParent, parentStack, previousSibling, siblingStack;
      this.blocks = blocks;
      this.overlay = overlay != null ? overlay : {};
      this.nextSibling = {};
      this.previousSibling = {};
      parentStack = ['TOP'];
      siblingStack = [[]];
      cur = this.getBlock(first);
      while (cur) {
        curParent = this.getBlock(last(parentStack));
        if (cur.type === 'headline') {
          while (curParent && cur.level <= curParent.level) {
            parentStack.pop();
            siblingStack.pop();
            curParent = this.getBlock(last(parentStack));
          }
        }
        if (previousSibling = last(last(siblingStack))) {
          this.nextSibling[previousSibling] = cur._id;
          this.previousSibling[cur._id] = previousSibling;
        }
        last(siblingStack).push(cur._id);
        if (cur.type === 'headline') {
          parentStack.push(cur._id);
          siblingStack.push([]);
        }
        cur = this.getBlock(cur.next);
      }
    }

    Links.prototype.getBlock = function(id) {
      var ref2;
      return (ref2 = this.overlay[id]) != null ? ref2 : this.blocks[id];
    };

    Links.prototype.getPreviousSibling = function(thing) {
      return this.getBlock(this.previousSibling[getId(thing)]);
    };

    Links.prototype.getNextSibling = function(thing) {
      return this.getBlock(this.nextSibling[getId(thing)]);
    };

    Links.prototype.getFirstSibling = function(thing) {
      var id, p;
      id = getId(thing);
      while (p = this.previousSibling[id]) {
        id = p;
      }
      return this.getBlock(id);
    };

    Links.prototype.getLastSibling = function(thing) {
      var c, n;
      n = this.getBlock(getId(thing));
      while (n && (c = this.getNextSibling(n))) {
        n = c;
      }
      return n;
    };

    Links.prototype.getParent = function(thing) {
      var ref2;
      return this.getBlock((ref2 = this.getFirstSibling(thing)) != null ? ref2.prev : void 0);
    };

    Links.prototype.getFirstChild = function(thing) {
      var block, n;
      if ((block = this.getBlock(getId(thing))) && (n = this.getBlock(block.next)) && !this.previousSibling[block.next]) {
        return this.getBlock(block.next);
      }
    };

    Links.prototype.getLastChild = function(thing) {
      return this.getLastSibling(this.getFirstChild(thing));
    };

    Links.prototype.getChildren = function(thing) {
      var c, child;
      c = [];
      child = this.getFirstChild(thing);
      while (child) {
        c.push(child);
        child = this.getNextSibling(child);
      }
      return c;
    };

    return Links;

  })();

  OrgEditing = (function(superClass) {
    extend(OrgEditing, superClass);

    function OrgEditing() {
      return OrgEditing.__super__.constructor.apply(this, arguments);
    }

    OrgEditing.prototype.blockLineFor = function(node, offset) {
      var block, ref2;
      ref2 = this.editor.blockOffset(node, offset), block = ref2.block, offset = ref2.offset;
      return this.blockLine(block, offset);
    };

    OrgEditing.prototype.blockLine = function(block, offset) {
      var lines, text;
      text = block.text.substring(0, offset);
      lines = text.split('\n');
      return {
        line: lines.length,
        col: last(lines).length
      };
    };

    OrgEditing.prototype.lineInfo = function(block, offset) {
      var col, docLine, holder, line, p, ref2, startBlock;
      if (block) {
        ref2 = this.blockLine(block, offset), line = ref2.line, col = ref2.col;
        startBlock = block;
        docLine = line;
        while (block.prev) {
          block = this.getBlock(block.prev);
          docLine += block.text.split('\n').length - 1;
        }
        holder = this.nodeForId(startBlock._id);
        p = posFor(this.editor.domCursorForTextPosition(holder, offset));
        return {
          line: docLine,
          col: col,
          blockLine: line,
          top: Math.round(p.top),
          left: Math.round(p.left)
        };
      } else {
        return {};
      }
    };

    OrgEditing.prototype.setEditor = function(editor1) {
      this.editor = editor1;
      return this.editor.on('moved', (function(_this) {
        return function() {
          var block, blockLine, col, left, line, offset, ref2, ref3, top;
          ref2 = _this.editor.getSelectedBlockRange(), block = ref2.block, offset = ref2.offset;
          if (block) {
            ref3 = _this.lineInfo(block, offset), line = ref3.line, col = ref3.col, blockLine = ref3.blockLine, top = ref3.top, left = ref3.left;
            if (line) {
              return _this.updateStatus("line: " + (numSpan(line)) + " col: " + (numSpan(col)) + " block: " + block._id + ":" + (numSpan(blockLine)) + " top: " + (numSpan(top)) + " left: " + (numSpan(left)));
            }
          }
          return _this.updateStatus("No selection");
        };
      })(this));
    };

    return OrgEditing;

  })(DataStoreEditingOptions);

  PlainEditing = (function(superClass) {
    extend(PlainEditing, superClass);

    function PlainEditing() {
      return PlainEditing.__super__.constructor.apply(this, arguments);
    }

    PlainEditing.prototype.nodeForId = function(id) {
      return $("#plain-" + id);
    };

    PlainEditing.prototype.idForNode = function(node) {
      var ref2;
      return (ref2 = node.id.match(/^plain-(.*)$/)) != null ? ref2[1] : void 0;
    };

    PlainEditing.prototype.parseBlocks = function(text) {
      return this.data.parseBlocks(text);
    };

    PlainEditing.prototype.renderBlock = function(block) {
      return ["<span id='plain-" + block._id + "' data-block>" + (escapeHtml(block.text)) + "</span>", block.next];
    };

    PlainEditing.prototype.updateStatus = function(line) {
      return $("#plainStatus").html(line);
    };

    return PlainEditing;

  })(OrgEditing);

  FancyEditing = (function(superClass) {
    extend(FancyEditing, superClass);

    function FancyEditing() {
      return FancyEditing.__super__.constructor.apply(this, arguments);
    }

    FancyEditing.prototype.changed = function(changes) {
      return new RenderingComputer(changes, this).renderChanges();
    };

    FancyEditing.prototype.nodeForId = function(id) {
      return $("#fancy-" + id);
    };

    FancyEditing.prototype.idForNode = function(node) {
      var ref2;
      return (ref2 = node.id.match(/^fancy-(.*)$/)) != null ? ref2[1] : void 0;
    };

    FancyEditing.prototype.parseBlocks = function(text) {
      return this.data.parseBlocks(text);
    };

    FancyEditing.prototype.renderBlock = function(block) {
      var child, html, ref2;
      html = block.type === 'headline' ? "<div " + (blockAttrs(block)) + " contenteditable='false'>" + (blockLabel(block)) + "<div contenteditable='true'>" + (contentSpan(block.text, 'text')) + (((function() {
        var j, len, ref2, ref3, results;
        ref3 = (ref2 = this.data.children(block)) != null ? ref2 : [];
        results = [];
        for (j = 0, len = ref3.length; j < len; j++) {
          child = ref3[j];
          results.push(this.renderBlock(child)[0]);
        }
        return results;
      }).call(this)).join('')) + "</div></div>" : block.type === 'code' ? "<span " + (blockAttrs(block)) + ">" + (blockLabel(block)) + (escapeHtml(block.text)) + "</span>" : "<span " + (blockAttrs(block)) + ">" + (blockLabel(block)) + (escapeHtml(block.text)) + "</span>";
      return [html, ((ref2 = this.data.nextSibling(block)) != null ? ref2._id : void 0) || !this.data.firstChild(block) && block.next];
    };

    FancyEditing.prototype.updateStatus = function(line) {
      return $("#orgStatus").html(line);
    };

    return FancyEditing;

  })(OrgEditing);

  RenderingComputer = (function() {
    function RenderingComputer(changes1, options) {
      var added, changedParent, child, childId, id, j, k, len, len1, newBlock, newChildren, oldBlock, oldChildren, ref2, ref3, ref4, removed;
      this.changes = changes1;
      this.options = options;
      this.links = new Links(this.changes.oldFirst, this.options.data.blocks, this.changes.old);
      this.moves = {};
      changedParent = {};
      for (id in this.changes.updates) {
        oldBlock = this.changes.old[id];
        newBlock = this.options.getBlock(id);
        if ((oldBlock.type === (ref2 = newBlock.type) && ref2 === 'headline')) {
          if (newBlock.level !== oldBlock.level) {
            oldChildren = {};
            newChildren = {};
            added = {};
            removed = {};
            ref3 = this.links.getChildren(oldBlock);
            for (j = 0, len = ref3.length; j < len; j++) {
              child = ref3[j];
              oldChildren[child._id] = child;
            }
            ref4 = this.links.getChildren(newBlock);
            for (k = 0, len1 = ref4.length; k < len1; k++) {
              child = ref4[k];
              if (!oldChildren[child._id]) {
                added[child._id] = true;
              }
            }
            for (childId in oldChildren) {
              if (!newChildren[childId]) {
                removed[childId] = true;
              }
            }
          }
        }
      }
    }

    RenderingComputer.prototype.renderChanges = function() {
      return this.options.editor.node.html(this.options.renderBlocks());
    };

    RenderingComputer.prototype.promoteChildren = function(headlineId) {};

    return RenderingComputer;

  })();

  numSpan = function(n) {
    return "<span class='status-num'>" + n + "</span>";
  };

  blockLabel = function(block) {
    return "<span class='blockLabel' contenteditable='false' data-noncontent>[" + block.type + " " + block._id + "]</span>";
  };

  blockAttrs = function(block) {
    var extra;
    extra = '';
    if (block.type === 'headline') {
      extra += " data-headline='" + (escapeAttr(block.level)) + "'";
    }
    return "id='fancy-" + (escapeAttr(block._id)) + "' data-block='" + (escapeAttr(block._id)) + "' data-type='" + (escapeAttr(block.type)) + "'" + extra;
  };

  contentSpan = function(str, type) {
    str = escapeHtml(str);
    if (str) {
      return "<span" + (type ? " data-org-type='" + (escapeAttr(type)) + "'" : '') + ">" + str + "</span>";
    } else {
      return '';
    }
  };

  escapeHtml = function(str) {
    if (typeof str === 'string') {
      return str.replace(/[<>&]/g, function(c) {
        return replacements[c];
      });
    } else {
      return str;
    }
  };

  escapeAttr = function(str) {
    if (typeof str === 'string') {
      return str.replace(/['"&]/g, function(c) {
        switch (c) {
          case '"':
            return '&quot;';
          case "'":
            return '&#39;';
          case '&':
            return '&amp;';
        }
      });
    } else {
      return str;
    }
  };

  displayStructure = function(data) {
    var cur, i, info, level, p, parentStack, prevParent;
    parentStack = [];
    info = "";
    level = 0;
    cur = data.getBlock(data.first);
    prevParent = null;
    while (cur) {
      if (!data.links.previousSibling[cur._id]) {
        p = cur;
        while (p = data.links.getParent(p)) {
          level++;
        }
      }
      info += "" + (((function() {
        var j, ref2, results;
        results = [];
        for (i = j = 0, ref2 = level; 0 <= ref2 ? j < ref2 : j > ref2; i = 0 <= ref2 ? ++j : --j) {
          results.push('   ');
        }
        return results;
      })()).join('')) + cur._id + ": " + (JSON.stringify(cur.text)) + "\n";
      if (!data.links.nextSibling[cur._id]) {
        level = 0;
      }
      cur = data.getBlock(cur.next);
    }
    return $("#blocks").html(info);
  };

  $(document).ready(function() {
    var editor;
    data = new OrgData();
    data.on('change', function(changes) {
      return displayStructure(data);
    });
    window.ED = editor = new LeisureEditCore($("#fancyEditor"), new FancyEditing(data));
    window.ED2 = new LeisureEditCore($("#plainEditor"), new PlainEditing(data));
    return setTimeout((function() {
      return editor.loadURL("example.lorg");
    }), 1);
  });

}).call(this);

//# sourceMappingURL=example.js.map
