// Generated by CoffeeScript 1.10.0
(function() {
  var extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  (function(root, factory) {
    if (typeof define === 'function' && define.amd) {
      return define([], factory);
    } else if (typeof exports === 'object') {
      return module.exports = factory();
    } else {
      return root.FingerTree = factory();
    }
  })(this, function() {
    'use strict';
    var Deep, DelayedFingerTree, Digit, Empty, FingerTree, Node, Single, Split, app3, append, create, deepLeft, deepRight, fromArray, makeNodeMeasurer, nodes, notImplemented, prepend;
    create = Object.create || function(o) {
      var F;
      F = function() {};
      F.prototype = o;
      return new F();
    };
    notImplemented = function() {
      throw new Error('Not Implemented');
    };
    Split = (function() {
      function Split(left1, mid1, right1) {
        this.left = left1;
        this.mid = mid1;
        this.right = right1;
      }

      return Split;

    })();
    Digit = (function() {
      function Digit(measurer1, items) {
        var item, j, len, m, ref;
        this.measurer = measurer1;
        this.items = items;
        this.length = this.items.length;
        m = this.measurer.identity();
        ref = this.items;
        for (j = 0, len = ref.length; j < len; j++) {
          item = ref[j];
          m = this.measurer.sum(m, this.measurer.measure(item, this));
        }
        this.measure_ = m;
      }

      Digit.prototype.measure = function() {
        return this.measure_;
      };

      Digit.prototype.peekFirst = function() {
        return this.items[0];
      };

      Digit.prototype.peekLast = function() {
        return this.items[this.items.length - 1];
      };

      Digit.prototype.removeFirst = function() {
        return this.slice(1);
      };

      Digit.prototype.removeLast = function() {
        return this.slice(0, this.length - 1);
      };

      Digit.prototype.slice = function(start, end) {
        if (end == null) {
          end = this.length;
        }
        return new Digit(this.measurer, this.items.slice(start, end));
      };

      Digit.prototype.split = function(predicate, initial) {
        var i, item, j, len, measure, ref;
        measure = initial;
        i = null;
        if (this.items.length === 1) {
          return new Split([], this.items[0], []);
        } else {
          ref = this.items;
          for (i = j = 0, len = ref.length; j < len; i = ++j) {
            item = ref[i];
            measure = this.measurer.sum(measure, this.measurer.measure(item));
            if (predicate(measure)) {
              break;
            }
          }
          return new Split(this.items.slice(0, i), item, this.items.slice(i + 1));
        }
      };

      Digit.prototype.toJSON = function() {
        return {
          type: 'digit',
          items: this.items,
          measure: this.measure()
        };
      };

      return Digit;

    })();
    Node = (function() {
      function Node(measurer1, items) {
        var item, j, len, m, ref;
        this.measurer = measurer1;
        this.items = items;
        m = this.measurer.identity();
        ref = this.items;
        for (j = 0, len = ref.length; j < len; j++) {
          item = ref[j];
          m = this.measurer.sum(m, this.measurer.measure(item));
        }
        this.measure_ = m;
      }

      Node.prototype.measure = function() {
        return this.measure_;
      };

      Node.prototype.toDigit = function() {
        return new Digit(this.measurer, this.items);
      };

      Node.prototype.toJSON = function() {
        return {
          type: 'node',
          items: this.items,
          measure: this.measure()
        };
      };

      return Node;

    })();
    FingerTree = (function() {
      function FingerTree() {}

      FingerTree.measure = notImplemented;

      FingerTree.prototype.force = function() {
        return this;
      };

      FingerTree.prototype.isEmpty = notImplemented;

      FingerTree.prototype.addFirst = notImplemented;

      FingerTree.prototype.addLast = notImplemented;

      FingerTree.prototype.removeFirst = notImplemented;

      FingerTree.prototype.removeLast = notImplemented;

      FingerTree.prototype.peekFirst = notImplemented;

      FingerTree.prototype.peekLast = notImplemented;

      FingerTree.prototype.concat = notImplemented;

      FingerTree.prototype.split = notImplemented;

      FingerTree.prototype.takeUntil = function(predicate) {
        return this.split(predicate)[0];
      };

      FingerTree.prototype.dropUntil = function(predicate) {
        return this.split(predicate)[1];
      };

      FingerTree.prototype.toJSON = notImplemented;

      FingerTree.prototype.each = function(func) {
        var results, t;
        t = this;
        results = [];
        while (!t.isEmpty()) {
          func(t.peekFirst());
          results.push(t = t.removeFirst());
        }
        return results;
      };

      FingerTree.prototype.eachReverse = function(func) {
        var results, t;
        t = this;
        results = [];
        while (!t.isEmpty()) {
          func(t.peekLast());
          results.push(t = t.removeLast());
        }
        return results;
      };

      FingerTree.prototype.toArray = function() {
        var a;
        a = [];
        this.each(function(n) {
          return a.push(n);
        });
        return a;
      };

      return FingerTree;

    })();
    Empty = (function(superClass) {
      extend(Empty, superClass);

      function Empty(measurer1) {
        this.measurer = measurer1;
        this.measure_ = this.measurer.identity();
      }

      Empty.prototype.measure = function() {
        return this.measure_;
      };

      Empty.prototype.addFirst = function(v) {
        return new Single(this.measurer, v);
      };

      Empty.prototype.addLast = function(v) {
        return new Single(this.measurer, v);
      };

      Empty.prototype.peekFirst = function() {
        return null;
      };

      Empty.prototype.peekLast = function() {
        return null;
      };

      Empty.prototype.isEmpty = function() {
        return true;
      };

      Empty.prototype.concat = function(other) {
        return other;
      };

      Empty.prototype.split = function(predicate) {
        return [this, this];
      };

      Empty.prototype.toJSON = function() {
        return {
          type: 'empty',
          measure: this.measure()
        };
      };

      return Empty;

    })(FingerTree);
    Single = (function(superClass) {
      extend(Single, superClass);

      function Single(measurer1, value) {
        this.measurer = measurer1;
        this.value = value;
        this.measure_ = this.measurer.measure(this.value);
      }

      Single.prototype.measure = function() {
        return this.measure_;
      };

      Single.prototype.addFirst = function(v) {
        return new Deep(this.measurer, new Digit(this.measurer, [v]), new Empty(makeNodeMeasurer(this.measurer)), new Digit(this.measurer, [this.value]));
      };

      Single.prototype.addLast = function(v) {
        return new Deep(this.measurer, new Digit(this.measurer, [this.value]), new Empty(makeNodeMeasurer(this.measurer)), new Digit(this.measurer, [v]));
      };

      Single.prototype.removeFirst = function() {
        return new Empty(this.measurer);
      };

      Single.prototype.removeLast = function() {
        return new Empty(this.measurer);
      };

      Single.prototype.peekFirst = function() {
        return this.value;
      };

      Single.prototype.peekLast = function() {
        return this.value;
      };

      Single.prototype.isEmpty = function() {
        return false;
      };

      Single.prototype.concat = function(other) {
        return other.addFirst(this.value);
      };

      Single.prototype.splitTree = function(predicate, initial) {
        return new Split(new Empty(this.measurer), this.value, new Empty(this.measurer));
      };

      Single.prototype.split = function(predicate) {
        if (predicate(this.measure())) {
          return [new Empty(this.measurer), this];
        } else {
          return [this, new Empty(this.measurer)];
        }
      };

      Single.prototype.toJSON = function() {
        return {
          type: 'single',
          value: this.value,
          measure: this.measure()
        };
      };

      return Single;

    })(FingerTree);
    Deep = (function(superClass) {
      extend(Deep, superClass);

      function Deep(measurer1, left1, mid1, right1) {
        this.measurer = measurer1;
        this.left = left1;
        this.mid = mid1;
        this.right = right1;
        this.measure_ = null;
      }

      Deep.prototype.measure = function() {
        if (this.measure_ === null) {
          this.measure_ = this.measurer.sum(this.measurer.sum(this.left.measure(), this.mid.measure()), this.right.measure());
        }
        return this.measure_;
      };

      Deep.prototype.addFirst = function(v) {
        var leftItems;
        leftItems = this.left.items;
        if (this.left.length === 4) {
          return new Deep(this.measurer, new Digit(this.measurer, [v, leftItems[0]]), this.mid.addFirst(new Node(this.measurer, [leftItems[1], leftItems[2], leftItems[3]])), this.right);
        } else {
          return new Deep(this.measurer, new Digit(this.measurer, [v].concat(leftItems)), this.mid, this.right);
        }
      };

      Deep.prototype.addLast = function(v) {
        var rightItems;
        rightItems = this.right.items;
        if (this.right.length === 4) {
          return new Deep(this.measurer, this.left, this.mid.addLast(new Node(this.measurer, [rightItems[0], rightItems[1], rightItems[2]])), new Digit(this.measurer, [rightItems[3], v]));
        } else {
          return new Deep(this.measurer, this.left, this.mid, new Digit(this.measurer, rightItems.concat([v])));
        }
      };

      Deep.prototype.removeFirst = function() {
        var newMid;
        if (this.left.length > 1) {
          return new Deep(this.measurer, this.left.removeFirst(), this.mid, this.right);
        } else if (!this.mid.isEmpty()) {
          newMid = new DelayedFingerTree((function(_this) {
            return function() {
              return _this.mid.removeFirst();
            };
          })(this));
          return new Deep(this.measurer, this.mid.peekFirst().toDigit(), newMid, this.right);
        } else if (this.right.length === 1) {
          return new Single(this.measurer, this.right.items[0]);
        } else {
          return new Deep(this.measurer, this.right.slice(0, 1), this.mid, this.right.slice(1));
        }
      };

      Deep.prototype.removeLast = function() {
        var newMid;
        if (this.right.length > 1) {
          return new Deep(this.measurer, this.left, this.mid, this.right.removeLast());
        } else if (!this.mid.isEmpty()) {
          newMid = new DelayedFingerTree((function(_this) {
            return function() {
              return _this.mid.removeLast();
            };
          })(this));
          return new Deep(this.measurer, this.left, newMid, this.mid.peekLast().toDigit());
        } else if (this.left.length === 1) {
          return new Single(this.measurer, this.left.items[0]);
        } else {
          return new Deep(this.measurer, this.left.slice(0, -1), this.mid, this.left.slice(-1));
        }
      };

      Deep.prototype.peekFirst = function() {
        return this.left.peekFirst();
      };

      Deep.prototype.peekLast = function() {
        return this.right.peekLast();
      };

      Deep.prototype.isEmpty = function() {
        return false;
      };

      Deep.prototype.concat = function(other) {
        other = other.force();
        if (other instanceof Empty) {
          return this;
        } else if (other instanceof Single) {
          return this.addLast(other.value);
        } else {
          return app3(this, [], other);
        }
      };

      Deep.prototype.splitTree = function(predicate, initial) {
        var leftMeasure, midMeasure, midSplit, split;
        leftMeasure = this.measurer.sum(initial, this.left.measure());
        if (predicate(leftMeasure)) {
          split = this.left.split(predicate, initial);
          return new Split(fromArray(split.left, this.measurer), split.mid, deepLeft(this.measurer, split.right, this.mid, this.right));
        } else {
          midMeasure = this.measurer.sum(leftMeasure, this.mid.measure());
          if (predicate(midMeasure)) {
            midSplit = this.mid.splitTree(predicate, leftMeasure);
            split = midSplit.mid.toDigit().split(predicate, this.measurer.sum(leftMeasure, midSplit.left.measure()));
            return new Split(deepRight(this.measurer, this.left, midSplit.left, split.left), split.mid, deepLeft(this.measurer, split.right, midSplit.right, this.right));
          } else {
            split = this.right.split(predicate, midMeasure);
            return new Split(deepRight(this.measurer, this.left, this.mid, split.left), split.mid, fromArray(split.right, this.measurer));
          }
        }
      };

      Deep.prototype.split = function(predicate) {
        var split;
        if (predicate(this.measure())) {
          split = this.splitTree(predicate, this.measurer.identity());
          return [split.left, split.right.addFirst(split.mid)];
        } else {
          return [this, new Empty(this.measurer)];
        }
      };

      Deep.prototype.toJSON = function() {
        return {
          type: 'deep',
          left: this.left,
          mid: this.mid,
          right: this.right,
          measure: this.measure()
        };
      };

      return Deep;

    })(FingerTree);
    DelayedFingerTree = (function() {
      function DelayedFingerTree(thunk) {
        this.thunk = thunk;
        this.tree = null;
      }

      DelayedFingerTree.prototype.force = function() {
        if (this.tree === null) {
          this.tree = this.thunk();
        }
        return this.tree;
      };

      DelayedFingerTree.prototype.isEmpty = function(v) {
        return this.force().isEmpty();
      };

      DelayedFingerTree.prototype.measure = function() {
        return this.force().measure();
      };

      DelayedFingerTree.prototype.peekFirst = function() {
        return this.force().peekFirst();
      };

      DelayedFingerTree.prototype.peekLast = function() {
        return this.force().peekLast();
      };

      DelayedFingerTree.prototype.addFirst = function(v) {
        return this.force().addFirst(v);
      };

      DelayedFingerTree.prototype.addLast = function(v) {
        return this.force().addLast(v);
      };

      DelayedFingerTree.prototype.removeFirst = function() {
        return this.force().removeFirst();
      };

      DelayedFingerTree.prototype.removeLast = function() {
        return this.force().removeLast();
      };

      DelayedFingerTree.prototype.concat = function(other) {
        return this.force().concat(other);
      };

      DelayedFingerTree.prototype.splitTree = function(predicate, initial) {
        return this.force().splitTree(predicate, initial);
      };

      DelayedFingerTree.prototype.split = function(predicate) {
        return this.force().split(predicate);
      };

      DelayedFingerTree.prototype.takeUntil = function(predicate) {
        return this.force().takeUntil(other);
      };

      DelayedFingerTree.prototype.dropUntil = function(predicate) {
        return this.force().dropUntil(other);
      };

      DelayedFingerTree.prototype.toJSON = function() {
        return this.force().toJSON();
      };

      DelayedFingerTree.prototype.toArray = function() {
        return this.force().toArray();
      };

      return DelayedFingerTree;

    })();
    deepLeft = function(measurer, left, mid, right) {
      if (!left.length) {
        if (mid.isEmpty()) {
          return fromArray(right.items, measurer);
        } else {
          return new DelayedFingerTree(function() {
            return new Deep(measurer, mid.peekFirst().toDigit(), mid.removeFirst(), right);
          });
        }
      } else {
        return new Deep(measurer, new Digit(measurer, left), mid, right);
      }
    };
    deepRight = function(measurer, left, mid, right) {
      if (!right.length) {
        if (mid.isEmpty()) {
          return fromArray(left.items, measurer);
        } else {
          return new DelayedFingerTree(function() {
            return new Deep(measurer, left, mid.removeLast(), mid.peekLast().toDigit());
          });
        }
      } else {
        return new Deep(measurer, left, mid, new Digit(measurer, right));
      }
    };
    app3 = function(t1, ts, t2) {
      t1 = t1.force();
      t2 = t2.force();
      if (t1 instanceof Empty) {
        return prepend(t2, ts);
      } else if (t2 instanceof Empty) {
        return append(t1, ts);
      } else if (t1 instanceof Single) {
        return prepend(t2, ts).addFirst(t1.value);
      } else if (t2 instanceof Single) {
        return append(t1, ts).addLast(t2.value);
      } else {
        return new Deep(t1.measurer, t1.left, new DelayedFingerTree(function() {
          return app3(t1.mid, nodes(t1.measurer, t1.right.items.concat(ts).concat(t2.left.items)), t2.mid);
        }), t2.right);
      }
    };
    nodes = function(m, xs, res) {
      res = res != null ? res : [];
      switch (xs.length) {
        case 2:
          res.push(new Node(m, xs));
          break;
        case 3:
          res.push(new Node(m, xs));
          break;
        case 4:
          res.push(new Node(m, [xs[0], xs[1]]), new Node(m, [xs[2], xs[3]]));
          break;
        default:
          res.push(new Node(m, [xs[0], xs[1], xs[2]]));
          nodes(m, xs.slice(3), res);
      }
      return res;
    };
    makeNodeMeasurer = function(measurer) {
      return {
        identity: measurer.identity,
        measure: function(n) {
          return n.measure();
        },
        sum: measurer.sum
      };
    };
    prepend = function(tree, xs) {
      var i, j, ref;
      for (i = j = ref = xs.length - 1; j >= 0; i = j += -1) {
        tree = tree.addFirst(xs[i]);
      }
      return tree;
    };
    append = function(tree, xs) {
      var j, len, x;
      for (j = 0, len = xs.length; j < len; j++) {
        x = xs[j];
        tree = tree.addLast(x);
      }
      return tree;
    };
    fromArray = function(xs, measurer) {
      measurer = measurer || {
        identity: function() {
          return 0;
        },
        measure: function(v) {
          return 1;
        },
        sum: function(a, b) {
          return a + b;
        }
      };
      return prepend(new Empty(measurer), xs);
    };
    FingerTree.fromArray = fromArray;
    return FingerTree;
  });

}).call(this);

//# sourceMappingURL=fingertree.js.map