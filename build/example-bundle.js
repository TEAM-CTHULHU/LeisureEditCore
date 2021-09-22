/*
 * @name Lazy.js
 *
 * @fileOverview
 * Lazy.js is a lazy evaluation library for JavaScript.
 *
 * This has been done before. For examples see:
 *
 * - [wu.js](http://fitzgen.github.io/wu.js/)
 * - [Linq.js](http://linqjs.codeplex.com/)
 * - [from.js](https://github.com/suckgamoni/fromjs/)
 * - [IxJS](http://rx.codeplex.com/)
 * - [sloth.js](http://rfw.name/sloth.js/)
 *
 * However, at least at present, Lazy.js is faster (on average) than any of
 * those libraries. It is also more complete, with nearly all of the
 * functionality of [Underscore](http://underscorejs.org/) and
 * [Lo-Dash](http://lodash.com/).
 *
 * Finding your way around the code
 * --------------------------------
 *
 * At the heart of Lazy.js is the {@link Sequence} object. You create an initial
 * sequence using {@link Lazy}, which can accept an array, object, or string.
 * You can then "chain" together methods from this sequence, creating a new
 * sequence with each call.
 *
 * Here's an example:
 *
 *     var data = getReallyBigArray();
 *
 *     var statistics = Lazy(data)
 *       .map(transform)
 *       .filter(validate)
 *       .reduce(aggregate);
 *
 * {@link Sequence} is the foundation of other, more specific sequence types.
 *
 * An {@link ArrayLikeSequence} provides indexed access to its elements.
 *
 * An {@link ObjectLikeSequence} consists of key/value pairs.
 *
 * A {@link StringLikeSequence} is like a string (duh): actually, it is an
 * {@link ArrayLikeSequence} whose elements happen to be characters.
 *
 * An {@link AsyncSequence} is special: it iterates over its elements
 * asynchronously (so calling `each` generally begins an asynchronous loop and
 * returns immediately).
 *
 * For more information
 * --------------------
 *
 * I wrote a blog post that explains a little bit more about Lazy.js, which you
 * can read [here](http://philosopherdeveloper.com/posts/introducing-lazy-js.html).
 *
 * You can also [create an issue on GitHub](https://github.com/dtao/lazy.js/issues)
 * if you have any issues with the library. I work through them eventually.
 *
 * [@dtao](https://github.com/dtao)
 */

  /**
   * Wraps an object and returns a {@link Sequence}. For `null` or `undefined`,
   * simply returns an empty sequence (see {@link Lazy.strict} for a stricter
   * implementation).
   *
   * - For **arrays**, Lazy will create a sequence comprising the elements in
   *   the array (an {@link ArrayLikeSequence}).
   * - For **objects**, Lazy will create a sequence of key/value pairs
   *   (an {@link ObjectLikeSequence}).
   * - For **strings**, Lazy will create a sequence of characters (a
   *   {@link StringLikeSequence}).
   *
   * @public
   * @param {Array|Object|string} source An array, object, or string to wrap.
   * @returns {Sequence} The wrapped lazy object.
   *
   * @exampleHelpers
   * // Utility functions to provide to all examples
   * function increment(x) { return x + 1; }
   * function isEven(x) { return x % 2 === 0; }
   * function isPositive(x) { return x > 0; }
   * function isNegative(x) { return x < 0; }
   *
   * @examples
   * Lazy([1, 2, 4])       // instanceof Lazy.ArrayLikeSequence
   * Lazy({ foo: "bar" })  // instanceof Lazy.ObjectLikeSequence
   * Lazy("hello, world!") // instanceof Lazy.StringLikeSequence
   * Lazy()                // sequence: []
   * Lazy(null)            // sequence: []
   */
  function Lazy(source) {
    if (source instanceof Array) {
      return new ArrayWrapper(source);
    } else if (typeof source === "string") {
      return new StringWrapper(source);
    } else if (source instanceof Sequence) {
      return source;
    }

    if (Lazy.extensions) {
      var extensions = Lazy.extensions, length = extensions.length, result;
      while (!result && length--) {
        result = extensions[length](source);
      }
      if (result) {
        return result;
      }
    }

    return new ObjectWrapper(source);
  }

  Lazy.VERSION = '0.3.2';

  /*** Utility methods of questionable value ***/

  Lazy.noop = function noop() {};
  Lazy.identity = function identity(x) { return x; };

  /**
   * Provides a stricter version of {@link Lazy} which throws an error when
   * attempting to wrap `null`, `undefined`, or numeric or boolean values as a
   * sequence.
   *
   * @public
   * @returns {Function} A stricter version of the {@link Lazy} helper function.
   *
   * @examples
   * var Strict = Lazy.strict();
   *
   * Strict()                  // throws
   * Strict(null)              // throws
   * Strict(true)              // throws
   * Strict(5)                 // throws
   * Strict([1, 2, 3])         // instanceof Lazy.ArrayLikeSequence
   * Strict({ foo: "bar" })    // instanceof Lazy.ObjectLikeSequence
   * Strict("hello, world!")   // instanceof Lazy.StringLikeSequence
   *
   * // Let's also ensure the static functions are still there.
   * Strict.range(3)           // sequence: [0, 1, 2]
   * Strict.generate(Date.now) // instanceof Lazy.GeneratedSequence
   */
  Lazy.strict = function strict() {
    function StrictLazy(source) {
      if (source == null) {
        throw "You cannot wrap null or undefined using Lazy.";
      }

      if (typeof source === "number" || typeof source === "boolean") {
        throw "You cannot wrap primitive values using Lazy.";
      }

      return Lazy(source);
    }
    Lazy(Lazy).each(function(property, name) {
      StrictLazy[name] = property;
    });

    return StrictLazy;
  };

  /**
   * The `Sequence` object provides a unified API encapsulating the notion of
   * zero or more consecutive elements in a collection, stream, etc.
   *
   * Lazy evaluation
   * ---------------
   *
   * Generally speaking, creating a sequence should not be an expensive operation,
   * and should not iterate over an underlying source or trigger any side effects.
   * This means that chaining together methods that return sequences incurs only
   * the cost of creating the `Sequence` objects themselves and not the cost of
   * iterating an underlying data source multiple times.
   *
   * The following code, for example, creates 4 sequences and does nothing with
   * `source`:
   *
   *     var seq = Lazy(source) // 1st sequence
   *       .map(func)           // 2nd
   *       .filter(pred)        // 3rd
   *       .reverse();          // 4th
   *
   * Lazy's convention is to hold off on iterating or otherwise *doing* anything
   * (aside from creating `Sequence` objects) until you call `each`:
   *
   *     seq.each(function(x) { console.log(x); });
   *
   * Defining custom sequences
   * -------------------------
   *
   * Defining your own type of sequence is relatively simple:
   *
   * 1. Pass a *method name* and an object containing *function overrides* to
   *    {@link Sequence.define}. If the object includes a function called `init`,
   *    this function will be called upon initialization.
   * 2. The object should include at least either a `getIterator` method or an
   *    `each` method. The former supports both asynchronous and synchronous
   *    iteration, but is slightly more cumbersome to implement. The latter
   *    supports synchronous iteration and can be automatically implemented in
   *    terms of the former. You can also implement both if you want, e.g. to
   *    optimize performance. For more info, see {@link Iterator} and
   *    {@link AsyncSequence}.
   *
   * As a trivial example, the following code defines a new method, `sample`,
   * which randomly may or may not include each element from its parent.
   *
   *     Lazy.Sequence.define("sample", {
   *       each: function(fn) {
   *         return this.parent.each(function(e) {
   *           // 50/50 chance of including this element.
   *           if (Math.random() > 0.5) {
   *             return fn(e);
   *           }
   *         });
   *       }
   *     });
   *
   * (Of course, the above could also easily have been implemented using
   * {@link #filter} instead of creating a custom sequence. But I *did* say this
   * was a trivial example, to be fair.)
   *
   * Now it will be possible to create this type of sequence from any parent
   * sequence by calling the method name you specified. In other words, you can
   * now do this:
   *
   *     Lazy(arr).sample();
   *     Lazy(arr).map(func).sample();
   *     Lazy(arr).map(func).filter(pred).sample();
   *
   * Etc., etc.
   *
   * @public
   * @constructor
   */
  function Sequence() {}

  /**
   * Create a new constructor function for a type inheriting from `Sequence`.
   *
   * @public
   * @param {string|Array.<string>} methodName The name(s) of the method(s) to be
   *     used for constructing the new sequence. The method will be attached to
   *     the `Sequence` prototype so that it can be chained with any other
   *     sequence methods, like {@link #map}, {@link #filter}, etc.
   * @param {Object} overrides An object containing function overrides for this
   *     new sequence type. **Must** include either `getIterator` or `each` (or
   *     both). *May* include an `init` method as well. For these overrides,
   *     `this` will be the new sequence, and `this.parent` will be the base
   *     sequence from which the new sequence was constructed.
   * @returns {Function} A constructor for a new type inheriting from `Sequence`.
   *
   * @examples
   * // This sequence type logs every element to the specified logger as it
   * // iterates over it.
   * Lazy.Sequence.define("verbose", {
   *   init: function(logger) {
   *     this.logger = logger;
   *   },
   *
   *   each: function(fn) {
   *     var logger = this.logger;
   *     return this.parent.each(function(e, i) {
   *       logger(e);
   *       return fn(e, i);
   *     });
   *   }
   * });
   *
   * Lazy([1, 2, 3]).verbose(logger).each(Lazy.noop) // calls logger 3 times
   */
  Sequence.define = function define(methodName, overrides) {
    if (!overrides || (!overrides.getIterator && !overrides.each)) {
      throw "A custom sequence must implement *at least* getIterator or each!";
    }

    return defineSequenceType(Sequence, methodName, overrides);
  };

  /**
   * Gets the number of elements in the sequence. In some cases, this may
   * require eagerly evaluating the sequence.
   *
   * @public
   * @returns {number} The number of elements in the sequence.
   *
   * @examples
   * Lazy([1, 2, 3]).size();                 // => 3
   * Lazy([1, 2]).map(Lazy.identity).size(); // => 2
   * Lazy([1, 2, 3]).reject(isEven).size();  // => 2
   * Lazy([1, 2, 3]).take(1).size();         // => 1
   * Lazy({ foo: 1, bar: 2 }).size();        // => 2
   * Lazy('hello').size();                   // => 5
   */
  Sequence.prototype.size = function size() {
    return this.getIndex().length();
  };

  /**
   * Creates an {@link Iterator} object with two methods, `moveNext` -- returning
   * true or false -- and `current` -- returning the current value.
   *
   * This method is used when asynchronously iterating over sequences. Any type
   * inheriting from `Sequence` must implement this method or it can't support
   * asynchronous iteration.
   *
   * Note that **this method is not intended to be used directly by application
   * code.** Rather, it is intended as a means for implementors to potentially
   * define custom sequence types that support either synchronous or
   * asynchronous iteration.
   *
   * @public
   * @returns {Iterator} An iterator object.
   *
   * @examples
   * var iterator = Lazy([1, 2]).getIterator();
   *
   * iterator.moveNext(); // => true
   * iterator.current();  // => 1
   * iterator.moveNext(); // => true
   * iterator.current();  // => 2
   * iterator.moveNext(); // => false
   */
  Sequence.prototype.getIterator = function getIterator() {
    return new Iterator$1(this);
  };

  /**
   * Gets the root sequence underlying the current chain of sequences.
   */
  Sequence.prototype.root = function root() {
    return this.parent.root();
  };

  /**
   * Evaluates the sequence and produces an appropriate value (an array in most
   * cases, an object for {@link ObjectLikeSequence}s or a string for
   * {@link StringLikeSequence}s).
   */
  Sequence.prototype.value = function value() {
    return this.toArray();
  };

  /**
   * Applies the current transformation chain to a given source.
   *
   * @examples
   * var sequence = Lazy([])
   *   .map(function(x) { return x * -1; })
   *   .filter(function(x) { return x % 2 === 0; });
   *
   * sequence.apply([1, 2, 3, 4]); // => [-2, -4]
   */
  Sequence.prototype.apply = function apply(source) {
    var root = this.root(),
        previousSource = root.source,
        result;

    try {
      root.source = source;
      result = this.value();
    } finally {
      root.source = previousSource;
    }

    return result;
  };

  /**
   * The Iterator object provides an API for iterating over a sequence.
   *
   * The purpose of the `Iterator` type is mainly to offer an agnostic way of
   * iterating over a sequence -- either synchronous (i.e. with a `while` loop)
   * or asynchronously (with recursive calls to either `setTimeout` or --- if
   * available --- `setImmediate`). It is not intended to be used directly by
   * application code.
   *
   * @public
   * @constructor
   * @param {Sequence} sequence The sequence to iterate over.
   */
  function Iterator$1(sequence) {
    this.sequence = sequence;
    this.index    = -1;
  }

  /**
   * Gets the current item this iterator is pointing to.
   *
   * @public
   * @returns {*} The current item.
   */
  Iterator$1.prototype.current = function current() {
    return this.cachedIndex && this.cachedIndex.get(this.index);
  };

  /**
   * Moves the iterator to the next item in a sequence, if possible.
   *
   * @public
   * @returns {boolean} True if the iterator is able to move to a new item, or else
   *     false.
   */
  Iterator$1.prototype.moveNext = function moveNext() {
    var cachedIndex = this.cachedIndex;

    if (!cachedIndex) {
      cachedIndex = this.cachedIndex = this.sequence.getIndex();
    }

    if (this.index >= cachedIndex.length() - 1) {
      return false;
    }

    ++this.index;
    return true;
  };

  /**
   * Creates an array snapshot of a sequence.
   *
   * Note that for indefinite sequences, this method may raise an exception or
   * (worse) cause the environment to hang.
   *
   * @public
   * @returns {Array} An array containing the current contents of the sequence.
   *
   * @examples
   * Lazy([1, 2, 3]).toArray() // => [1, 2, 3]
   */
  Sequence.prototype.toArray = function toArray() {
    return this.reduce(function(arr, element) {
      arr.push(element);
      return arr;
    }, []);
  };

  /**
   * Provides an indexed view into the sequence.
   *
   * For sequences that are already indexed, this will simply return the
   * sequence. For non-indexed sequences, this will eagerly evaluate the
   * sequence and cache the result (so subsequent calls will not create
   * additional arrays).
   *
   * @returns {ArrayLikeSequence} A sequence containing the current contents of
   *     the sequence.
   *
   * @examples
   * Lazy([1, 2, 3]).filter(isEven)            // instanceof Lazy.Sequence
   * Lazy([1, 2, 3]).filter(isEven).getIndex() // instanceof Lazy.ArrayLikeSequence
   */
  Sequence.prototype.getIndex = function getIndex() {
    if (!this.cachedIndex) {
      this.cachedIndex = new ArrayWrapper(this.toArray());
    }
    return this.cachedIndex;
  };

  /**
   * Provides an indexed, memoized view into the sequence. This will cache the
   * result whenever the sequence is first iterated, so that subsequent
   * iterations will access the same element objects.
   *
   * @public
   * @returns {ArrayLikeSequence} An indexed, memoized sequence containing this
   *     sequence's elements, cached after the first iteration.
   *
   * @example
   * function createObject() { return new Object(); }
   *
   * var plain    = Lazy.generate(createObject, 10),
   *     memoized = Lazy.generate(createObject, 10).memoize();
   *
   * plain.toArray()[0] === plain.toArray()[0];       // => false
   * memoized.toArray()[0] === memoized.toArray()[0]; // => true
   */
  Sequence.prototype.memoize = function memoize() {
    return new MemoizedSequence(this);
  };

  /**
   * @constructor
   */
  function MemoizedSequence(parent) {
    this.parent = parent;
  }

  // MemoizedSequence needs to have its prototype set up after ArrayLikeSequence

  /**
   * Creates an object from a sequence of key/value pairs.
   *
   * @public
   * @returns {Object} An object with keys and values corresponding to the pairs
   *     of elements in the sequence.
   *
   * @examples
   * var details = [
   *   ["first", "Dan"],
   *   ["last", "Tao"],
   *   ["age", 29]
   * ];
   *
   * Lazy(details).toObject() // => { first: "Dan", last: "Tao", age: 29 }
   */
  Sequence.prototype.toObject = function toObject() {
    return this.reduce(function(object, pair) {
      object[pair[0]] = pair[1];
      return object;
    }, {});
  };

  /**
   * Iterates over this sequence and executes a function for every element.
   *
   * @public
   * @aka forEach
   * @param {Function} fn The function to call on each element in the sequence.
   *     Return false from the function to end the iteration.
   *
   * @examples
   * Lazy([1, 2, 3, 4]).each(fn) // calls fn 4 times
   */
  Sequence.prototype.each = function each(fn) {
    var iterator = this.getIterator(),
        i = -1;

    while (iterator.moveNext()) {
      if (fn(iterator.current(), ++i) === false) {
        return false;
      }
    }

    return true;
  };

  Sequence.prototype.forEach = function forEach(fn) {
    return this.each(fn);
  };

  /**
   * Creates a new sequence whose values are calculated by passing this sequence's
   * elements through some mapping function.
   *
   * @public
   * @aka collect
   * @param {Function} mapFn The mapping function used to project this sequence's
   *     elements onto a new sequence.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * Lazy([]).map(increment)        // sequence: []
   * Lazy([1, 2, 3]).map(increment) // sequence: [2, 3, 4]
   *
   * @benchmarks
   * function increment(x) { return x + 1; }
   *
   * var smArr = Lazy.range(10).toArray(),
   *     lgArr = Lazy.range(100).toArray();
   *
   * Lazy(smArr).map(increment).each(Lazy.noop) // lazy - 10 elements
   * Lazy(lgArr).map(increment).each(Lazy.noop) // lazy - 100 elements
   * _.each(_.map(smArr, increment), _.noop)    // lodash - 10 elements
   * _.each(_.map(lgArr, increment), _.noop)    // lodash - 100 elements
   */
  Sequence.prototype.map = function map(mapFn) {
    return new MappedSequence(this, createCallback(mapFn));
  };

  Sequence.prototype.collect = function collect(mapFn) {
    return this.map(mapFn);
  };

  /**
   * @constructor
   */
  function MappedSequence(parent, mapFn) {
    this.parent = parent;
    this.mapFn  = mapFn;
  }

  MappedSequence.prototype = new Sequence();

  MappedSequence.prototype.getIterator = function getIterator() {
    return new MappingIterator(this.parent, this.mapFn);
  };

  MappedSequence.prototype.each = function each(fn) {
    var mapFn = this.mapFn;
    return this.parent.each(function(e, i) {
      return fn(mapFn(e, i), i);
    });
  };

  /**
   * @constructor
   */
  function MappingIterator(sequence, mapFn) {
    this.iterator = sequence.getIterator();
    this.mapFn    = mapFn;
    this.index    = -1;
  }

  MappingIterator.prototype.current = function current() {
    return this.mapFn(this.iterator.current(), this.index);
  };

  MappingIterator.prototype.moveNext = function moveNext() {
    if (this.iterator.moveNext()) {
      ++this.index;
      return true;
    }

    return false;
  };

  /**
   * Creates a new sequence whose values are calculated by accessing the specified
   * property from each element in this sequence.
   *
   * @public
   * @param {string} propertyName The name of the property to access for every
   *     element in this sequence.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * var people = [
   *   { first: "Dan", last: "Tao" },
   *   { first: "Bob", last: "Smith" }
   * ];
   *
   * Lazy(people).pluck("last") // sequence: ["Tao", "Smith"]
   */
  Sequence.prototype.pluck = function pluck(property) {
    return this.map(property);
  };

  /**
   * Creates a new sequence whose values are calculated by invoking the specified
   * function on each element in this sequence.
   *
   * @public
   * @param {string} methodName The name of the method to invoke for every element
   *     in this sequence.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * function Person(first, last) {
   *   this.fullName = function fullName() {
   *     return first + " " + last;
   *   };
   * }
   *
   * var people = [
   *   new Person("Dan", "Tao"),
   *   new Person("Bob", "Smith")
   * ];
   *
   * Lazy(people).invoke("fullName") // sequence: ["Dan Tao", "Bob Smith"]
   */
  Sequence.prototype.invoke = function invoke(methodName) {
    return this.map(function(e) {
      return e[methodName]();
    });
  };

  /**
   * Creates a new sequence whose values are the elements of this sequence which
   * satisfy the specified predicate.
   *
   * @public
   * @aka select
   * @param {Function} filterFn The predicate to call on each element in this
   *     sequence, which returns true if the element should be included.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * var numbers = [1, 2, 3, 4, 5, 6];
   *
   * Lazy(numbers).filter(isEven) // sequence: [2, 4, 6]
   *
   * @benchmarks
   * function isEven(x) { return x % 2 === 0; }
   *
   * var smArr = Lazy.range(10).toArray(),
   *     lgArr = Lazy.range(100).toArray();
   *
   * Lazy(smArr).filter(isEven).each(Lazy.noop) // lazy - 10 elements
   * Lazy(lgArr).filter(isEven).each(Lazy.noop) // lazy - 100 elements
   * _.each(_.filter(smArr, isEven), _.noop)    // lodash - 10 elements
   * _.each(_.filter(lgArr, isEven), _.noop)    // lodash - 100 elements
   */
  Sequence.prototype.filter = function filter(filterFn) {
    return new FilteredSequence(this, createCallback(filterFn));
  };

  Sequence.prototype.select = function select(filterFn) {
    return this.filter(filterFn);
  };

  /**
   * @constructor
   */
  function FilteredSequence(parent, filterFn) {
    this.parent   = parent;
    this.filterFn = filterFn;
  }

  FilteredSequence.prototype = new Sequence();

  FilteredSequence.prototype.getIterator = function getIterator() {
    return new FilteringIterator(this.parent, this.filterFn);
  };

  FilteredSequence.prototype.each = function each(fn) {
    var filterFn = this.filterFn;

    return this.parent.each(function(e, i) {
      if (filterFn(e, i)) {
        return fn(e, i);
      }
    });
  };

  FilteredSequence.prototype.reverse = function reverse() {
    return this.parent.reverse().filter(this.filterFn);
  };

  /**
   * @constructor
   */
  function FilteringIterator(sequence, filterFn) {
    this.iterator = sequence.getIterator();
    this.filterFn = filterFn;
    this.index    = 0;
  }

  FilteringIterator.prototype.current = function current() {
    return this.value;
  };

  FilteringIterator.prototype.moveNext = function moveNext() {
    var iterator = this.iterator,
        filterFn = this.filterFn,
        value;

    while (iterator.moveNext()) {
      value = iterator.current();
      if (filterFn(value, this.index++)) {
        this.value = value;
        return true;
      }
    }

    this.value = undefined;
    return false;
  };

  /**
   * Creates a new sequence whose values exclude the elements of this sequence
   * identified by the specified predicate.
   *
   * @public
   * @param {Function} rejectFn The predicate to call on each element in this
   *     sequence, which returns true if the element should be omitted.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * Lazy([1, 2, 3, 4, 5]).reject(isEven)              // sequence: [1, 3, 5]
   * Lazy([{ foo: 1 }, { bar: 2 }]).reject('foo')      // sequence: [{ bar: 2 }]
   * Lazy([{ foo: 1 }, { foo: 2 }]).reject({ foo: 2 }) // sequence: [{ foo: 1 }]
   */
  Sequence.prototype.reject = function reject(rejectFn) {
    rejectFn = createCallback(rejectFn);
    return this.filter(function(e) { return !rejectFn(e); });
  };

  /**
   * Creates a new sequence whose values have the specified type, as determined
   * by the `typeof` operator.
   *
   * @public
   * @param {string} type The type of elements to include from the underlying
   *     sequence, i.e. where `typeof [element] === [type]`.
   * @returns {Sequence} The new sequence, comprising elements of the specified
   *     type.
   *
   * @examples
   * Lazy([1, 2, 'foo', 'bar']).ofType('number')  // sequence: [1, 2]
   * Lazy([1, 2, 'foo', 'bar']).ofType('string')  // sequence: ['foo', 'bar']
   * Lazy([1, 2, 'foo', 'bar']).ofType('boolean') // sequence: []
   */
  Sequence.prototype.ofType = function ofType(type) {
    return this.filter(function(e) { return typeof e === type; });
  };

  /**
   * Creates a new sequence whose values are the elements of this sequence with
   * property names and values matching those of the specified object.
   *
   * @public
   * @param {Object} properties The properties that should be found on every
   *     element that is to be included in this sequence.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * var people = [
   *   { first: "Dan", last: "Tao" },
   *   { first: "Bob", last: "Smith" }
   * ];
   *
   * Lazy(people).where({ first: "Dan" }) // sequence: [{ first: "Dan", last: "Tao" }]
   *
   * @benchmarks
   * var animals = ["dog", "cat", "mouse", "horse", "pig", "snake"];
   *
   * Lazy(animals).where({ length: 3 }).each(Lazy.noop) // lazy
   * _.each(_.where(animals, { length: 3 }), _.noop)    // lodash
   */
  Sequence.prototype.where = function where(properties) {
    return this.filter(properties);
  };

  /**
   * Creates a new sequence with the same elements as this one, but to be iterated
   * in the opposite order.
   *
   * Note that in some (but not all) cases, the only way to create such a sequence
   * may require iterating the entire underlying source when `each` is called.
   *
   * @public
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * Lazy([1, 2, 3]).reverse() // sequence: [3, 2, 1]
   * Lazy([]).reverse()        // sequence: []
   */
  Sequence.prototype.reverse = function reverse() {
    return new ReversedSequence(this);
  };

  /**
   * @constructor
   */
  function ReversedSequence(parent) {
    this.parent = parent;
  }

  ReversedSequence.prototype = new Sequence();

  ReversedSequence.prototype.getIterator = function getIterator() {
    return new ReversedIterator(this.parent);
  };

  /**
   * @constuctor
   */
  function ReversedIterator(sequence) {
    this.sequence = sequence;
  }

  ReversedIterator.prototype.current = function current() {
    return this.sequence.getIndex().get(this.index);
  };

  ReversedIterator.prototype.moveNext = function moveNext() {
    var indexed = this.sequence.getIndex(),
        length  = indexed.length();

    if (typeof this.index === "undefined") {
      this.index = length;
    }

    return (--this.index >= 0);
  };

  /**
   * Creates a new sequence with all of the elements of this one, plus those of
   * the given array(s).
   *
   * @public
   * @param {...*} var_args One or more values (or arrays of values) to use for
   *     additional items after this sequence.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * var left  = [1, 2, 3];
   * var right = [4, 5, 6];
   *
   * Lazy(left).concat(right)         // sequence: [1, 2, 3, 4, 5, 6]
   * Lazy(left).concat(Lazy(right))   // sequence: [1, 2, 3, 4, 5, 6]
   * Lazy(left).concat(right, [7, 8]) // sequence: [1, 2, 3, 4, 5, 6, 7, 8]
   */
  Sequence.prototype.concat = function concat(var_args) {
    return new ConcatenatedSequence(this, arraySlice.call(arguments, 0));
  };

  /**
   * @constructor
   */
  function ConcatenatedSequence(parent, arrays) {
    this.parent = parent;
    this.arrays = arrays;
  }

  ConcatenatedSequence.prototype = new Sequence();

  ConcatenatedSequence.prototype.each = function each(fn) {
    var done = false,
        i = 0;

    this.parent.each(function(e) {
      if (fn(e, i++) === false) {
        done = true;
        return false;
      }
    });

    if (!done) {
      Lazy(this.arrays).flatten().each(function(e) {
        if (fn(e, i++) === false) {
          return false;
        }
      });
    }
  };

  /**
   * Creates a new sequence comprising the first N elements from this sequence, OR
   * (if N is `undefined`) simply returns the first element of this sequence.
   *
   * @public
   * @aka head, take
   * @param {number=} count The number of elements to take from this sequence. If
   *     this value exceeds the length of the sequence, the resulting sequence
   *     will be essentially the same as this one.
   * @returns {*} The new sequence (or the first element from this sequence if
   *     no count was given).
   *
   * @examples
   * function powerOfTwo(exp) {
   *   return Math.pow(2, exp);
   * }
   *
   * Lazy.generate(powerOfTwo).first()          // => 1
   * Lazy.generate(powerOfTwo).first(5)         // sequence: [1, 2, 4, 8, 16]
   * Lazy.generate(powerOfTwo).skip(2).first()  // => 4
   * Lazy.generate(powerOfTwo).skip(2).first(2) // sequence: [4, 8]
   */
  Sequence.prototype.first = function first(count) {
    if (typeof count === "undefined") {
      return getFirst(this);
    }
    return new TakeSequence(this, count);
  };

  Sequence.prototype.head =
  Sequence.prototype.take = function (count) {
    return this.first(count);
  };

  /**
   * @constructor
   */
  function TakeSequence(parent, count) {
    this.parent = parent;
    this.count  = count;
  }

  TakeSequence.prototype = new Sequence();

  TakeSequence.prototype.getIterator = function getIterator() {
    return new TakeIterator(this.parent, this.count);
  };

  TakeSequence.prototype.each = function each(fn) {
    var count = this.count,
        i     = 0;

    this.parent.each(function(e) {
      var result;
      if (i < count) { result = fn(e, i); }
      if (++i >= count) { return false; }
      return result;
    });
  };

  /**
   * @constructor
   */
  function TakeIterator(sequence, count) {
    this.iterator = sequence.getIterator();
    this.count    = count;
  }

  TakeIterator.prototype.current = function current() {
    return this.iterator.current();
  };

  TakeIterator.prototype.moveNext = function moveNext() {
    return ((--this.count >= 0) && this.iterator.moveNext());
  };

  /**
   * Creates a new sequence comprising the elements from the head of this sequence
   * that satisfy some predicate. Once an element is encountered that doesn't
   * satisfy the predicate, iteration will stop.
   *
   * @public
   * @param {Function} predicate
   * @returns {Sequence} The new sequence
   *
   * @examples
   * function lessThan(x) {
   *   return function(y) {
   *     return y < x;
   *   };
   * }
   *
   * Lazy([1, 2, 3, 4]).takeWhile(lessThan(3)) // sequence: [1, 2]
   * Lazy([1, 2, 3, 4]).takeWhile(lessThan(0)) // sequence: []
   */
  Sequence.prototype.takeWhile = function takeWhile(predicate) {
    return new TakeWhileSequence(this, predicate);
  };

  /**
   * @constructor
   */
  function TakeWhileSequence(parent, predicate) {
    this.parent    = parent;
    this.predicate = predicate;
  }

  TakeWhileSequence.prototype = new Sequence();

  TakeWhileSequence.prototype.each = function each(fn) {
    var predicate = this.predicate;

    this.parent.each(function(e) {
      return predicate(e) && fn(e);
    });
  };

  /**
   * Creates a new sequence comprising all but the last N elements of this
   * sequence.
   *
   * @public
   * @param {number=} count The number of items to omit from the end of the
   *     sequence (defaults to 1).
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * Lazy([1, 2, 3, 4]).initial()                    // sequence: [1, 2, 3]
   * Lazy([1, 2, 3, 4]).initial(2)                   // sequence: [1, 2]
   * Lazy([1, 2, 3]).filter(Lazy.identity).initial() // sequence: [1, 2]
   */
  Sequence.prototype.initial = function initial(count) {
    if (typeof count === "undefined") {
      count = 1;
    }
    return this.take(this.getIndex().length() - count);
  };

  /**
   * Creates a new sequence comprising the last N elements of this sequence, OR
   * (if N is `undefined`) simply returns the last element of this sequence.
   *
   * @public
   * @param {number=} count The number of items to take from the end of the
   *     sequence.
   * @returns {*} The new sequence (or the last element from this sequence
   *     if no count was given).
   *
   * @examples
   * Lazy([1, 2, 3]).last()                 // => 3
   * Lazy([1, 2, 3]).last(2)                // sequence: [2, 3]
   * Lazy([1, 2, 3]).filter(isEven).last(2) // sequence: [2]
   */
  Sequence.prototype.last = function last(count) {
    if (typeof count === "undefined") {
      return this.reverse().first();
    }
    return this.reverse().take(count).reverse();
  };

  /**
   * Returns the first element in this sequence with property names and values
   * matching those of the specified object.
   *
   * @public
   * @param {Object} properties The properties that should be found on some
   *     element in this sequence.
   * @returns {*} The found element, or `undefined` if none exists in this
   *     sequence.
   *
   * @examples
   * var words = ["foo", "bar"];
   *
   * Lazy(words).findWhere({ 0: "f" }); // => "foo"
   * Lazy(words).findWhere({ 0: "z" }); // => undefined
   */
  Sequence.prototype.findWhere = function findWhere(properties) {
    return this.where(properties).first();
  };

  /**
   * Creates a new sequence comprising all but the first N elements of this
   * sequence.
   *
   * @public
   * @aka skip, tail, rest
   * @param {number=} count The number of items to omit from the beginning of the
   *     sequence (defaults to 1).
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * Lazy([1, 2, 3, 4]).rest()  // sequence: [2, 3, 4]
   * Lazy([1, 2, 3, 4]).rest(0) // sequence: [1, 2, 3, 4]
   * Lazy([1, 2, 3, 4]).rest(2) // sequence: [3, 4]
   * Lazy([1, 2, 3, 4]).rest(5) // sequence: []
   */
  Sequence.prototype.rest = function rest(count) {
    return new DropSequence(this, count);
  };

  Sequence.prototype.skip =
  Sequence.prototype.tail =
  Sequence.prototype.drop = function drop(count) {
    return this.rest(count);
  };

  /**
   * @constructor
   */
  function DropSequence(parent, count) {
    this.parent = parent;
    this.count  = typeof count === "number" ? count : 1;
  }

  DropSequence.prototype = new Sequence();

  DropSequence.prototype.each = function each(fn) {
    var count   = this.count,
        dropped = 0,
        i       = 0;

    this.parent.each(function(e) {
      if (dropped++ < count) { return; }
      return fn(e, i++);
    });
  };

  /**
   * Creates a new sequence comprising the elements from this sequence *after*
   * those that satisfy some predicate. The sequence starts with the first
   * element that does not match the predicate.
   *
   * @public
   * @aka skipWhile
   * @param {Function} predicate
   * @returns {Sequence} The new sequence
   */
  Sequence.prototype.dropWhile = function dropWhile(predicate) {
    return new DropWhileSequence(this, predicate);
  };

  Sequence.prototype.skipWhile = function skipWhile(predicate) {
    return this.dropWhile(predicate);
  };

  /**
   * @constructor
   */
  function DropWhileSequence(parent, predicate) {
    this.parent    = parent;
    this.predicate = predicate;
  }

  DropWhileSequence.prototype = new Sequence();

  DropWhileSequence.prototype.each = function each(fn) {
    var predicate = this.predicate,
        done      = false;

    this.parent.each(function(e) {
      if (!done) {
        if (predicate(e)) {
          return;
        }

        done = true;
      }

      return fn(e);
    });
  };

  /**
   * Creates a new sequence with the same elements as this one, but ordered
   * according to the values returned by the specified function.
   *
   * @public
   * @param {Function} sortFn The function to call on the elements in this
   *     sequence, in order to sort them.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * function population(country) {
   *   return country.pop;
   * }
   *
   * function area(country) {
   *   return country.sqkm;
   * }
   *
   * var countries = [
   *   { name: "USA", pop: 320000000, sqkm: 9600000 },
   *   { name: "Brazil", pop: 194000000, sqkm: 8500000 },
   *   { name: "Nigeria", pop: 174000000, sqkm: 924000 },
   *   { name: "China", pop: 1350000000, sqkm: 9700000 },
   *   { name: "Russia", pop: 143000000, sqkm: 17000000 },
   *   { name: "Australia", pop: 23000000, sqkm: 7700000 }
   * ];
   *
   * Lazy(countries).sortBy(population).last(3).pluck('name') // sequence: ["Brazil", "USA", "China"]
   * Lazy(countries).sortBy(area).last(3).pluck('name')       // sequence: ["USA", "China", "Russia"]
   *
   * @benchmarks
   * var randoms = Lazy.generate(Math.random).take(100).toArray();
   *
   * Lazy(randoms).sortBy(Lazy.identity).each(Lazy.noop) // lazy
   * _.each(_.sortBy(randoms, Lazy.identity), _.noop)    // lodash
   */
  Sequence.prototype.sortBy = function sortBy(sortFn) {
    return new SortedSequence(this, sortFn);
  };

  /**
   * @constructor
   */
  function SortedSequence(parent, sortFn) {
    this.parent = parent;
    this.sortFn = sortFn;
  }

  SortedSequence.prototype = new Sequence();

  SortedSequence.prototype.each = function each(fn) {
    var sortFn = createCallback(this.sortFn),
        sorted = this.parent.toArray();

    sorted.sort(function(x, y) { return compare(x, y, sortFn); });

    return forEach(sorted, fn);
  };

  /**
   * Creates a new {@link ObjectLikeSequence} comprising the elements in this
   * one, grouped together according to some key. The value associated with each
   * key in the resulting object-like sequence is an array containing all of
   * the elements in this sequence with that key.
   *
   * @public
   * @param {Function|string} keyFn The function to call on the elements in this
   *     sequence to obtain a key by which to group them, or a string representing
   *     a parameter to read from all the elements in this sequence.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * function oddOrEven(x) {
   *   return x % 2 === 0 ? 'even' : 'odd';
   * }
   *
   * var numbers = [1, 2, 3, 4, 5];
   *
   * Lazy(numbers).groupBy(oddOrEven)            // sequence: { odd: [1, 3, 5], even: [2, 4] }
   * Lazy(numbers).groupBy(oddOrEven).get("odd") // => [1, 3, 5]
   * Lazy(numbers).groupBy(oddOrEven).get("foo") // => undefined
   */
  Sequence.prototype.groupBy = function groupBy(keyFn) {
    return new GroupedSequence(this, keyFn);
  };

  /**
   * @constructor
   */
  function GroupedSequence(parent, keyFn) {
    this.parent = parent;
    this.keyFn  = keyFn;
  }

  // GroupedSequence must have its prototype set after ObjectLikeSequence has
  // been fully initialized.

  /**
   * Creates a new {@link ObjectLikeSequence} containing the unique keys of all
   * the elements in this sequence, each paired with the number of elements
   * in this sequence having that key.
   *
   * @public
   * @param {Function|string} keyFn The function to call on the elements in this
   *     sequence to obtain a key by which to count them, or a string representing
   *     a parameter to read from all the elements in this sequence.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * function oddOrEven(x) {
   *   return x % 2 === 0 ? 'even' : 'odd';
   * }
   *
   * var numbers = [1, 2, 3, 4, 5];
   *
   * Lazy(numbers).countBy(oddOrEven)            // sequence: { odd: 3, even: 2 }
   * Lazy(numbers).countBy(oddOrEven).get("odd") // => 3
   * Lazy(numbers).countBy(oddOrEven).get("foo") // => undefined
   */
  Sequence.prototype.countBy = function countBy(keyFn) {
    return new CountedSequence(this, keyFn);
  };

  /**
   * @constructor
   */
  function CountedSequence(parent, keyFn) {
    this.parent = parent;
    this.keyFn  = keyFn;
  }

  // CountedSequence, like GroupedSequence, must have its prototype set after
  // ObjectLikeSequence has been fully initialized.

  /**
   * Creates a new sequence with every unique element from this one appearing
   * exactly once (i.e., with duplicates removed).
   *
   * @public
   * @aka unique
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * Lazy([1, 2, 2, 3, 3, 3]).uniq() // sequence: [1, 2, 3]
   *
   * @benchmarks
   * function randomOf(array) {
   *   return function() {
   *     return array[Math.floor(Math.random() * array.length)];
   *   };
   * }
   *
   * var mostUnique = Lazy.generate(randomOf(_.range(100)), 100).toArray(),
   *     someUnique = Lazy.generate(randomOf(_.range(50)), 100).toArray(),
   *     mostDupes  = Lazy.generate(randomOf(_.range(5)), 100).toArray();
   *
   * Lazy(mostUnique).uniq().each(Lazy.noop) // lazy - mostly unique elements
   * Lazy(someUnique).uniq().each(Lazy.noop) // lazy - some unique elements
   * Lazy(mostDupes).uniq().each(Lazy.noop)  // lazy - mostly duplicate elements
   * _.each(_.uniq(mostUnique), _.noop)      // lodash - mostly unique elements
   * _.each(_.uniq(someUnique), _.noop)      // lodash - some unique elements
   * _.each(_.uniq(mostDupes), _.noop)       // lodash - mostly duplicate elements
   */
  Sequence.prototype.uniq = function uniq(keyFn) {
    return new UniqueSequence(this, keyFn);
  };

  Sequence.prototype.unique = function unique(keyFn) {
    return this.uniq(keyFn);
  };

  /**
   * @constructor
   */
  function UniqueSequence(parent, keyFn) {
    this.parent = parent;
    this.keyFn  = keyFn;
  }

  UniqueSequence.prototype = new Sequence();

  UniqueSequence.prototype.each = function each(fn) {
    var cache = new Set$1(),
        keyFn = this.keyFn,
        i     = 0;

    if (keyFn) {
      keyFn = createCallback(keyFn);
      return this.parent.each(function(e) {
        if (cache.add(keyFn(e))) {
          return fn(e, i++);
        }
      });

    } else {
      return this.parent.each(function(e) {
        if (cache.add(e)) {
          return fn(e, i++);
        }
      });
    }
  };

  /**
   * Creates a new sequence by combining the elements from this sequence with
   * corresponding elements from the specified array(s).
   *
   * @public
   * @param {...Array} var_args One or more arrays of elements to combine with
   *     those of this sequence.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * Lazy([1, 2]).zip([3, 4]) // sequence: [[1, 3], [2, 4]]
   *
   * @benchmarks
   * var smArrL = Lazy.range(10).toArray(),
   *     smArrR = Lazy.range(10, 20).toArray(),
   *     lgArrL = Lazy.range(100).toArray(),
   *     lgArrR = Lazy.range(100, 200).toArray();
   *
   * Lazy(smArrL).zip(smArrR).each(Lazy.noop) // lazy - zipping 10-element arrays
   * Lazy(lgArrL).zip(lgArrR).each(Lazy.noop) // lazy - zipping 100-element arrays
   * _.each(_.zip(smArrL, smArrR), _.noop)    // lodash - zipping 10-element arrays
   * _.each(_.zip(lgArrL, lgArrR), _.noop)    // lodash - zipping 100-element arrays
   */
  Sequence.prototype.zip = function zip(var_args) {
    if (arguments.length === 1) {
      return new SimpleZippedSequence(this, (/** @type {Array} */ var_args));
    } else {
      return new ZippedSequence(this, arraySlice.call(arguments, 0));
    }
  };

  /**
   * @constructor
   */
  function ZippedSequence(parent, arrays) {
    this.parent = parent;
    this.arrays = arrays;
  }

  ZippedSequence.prototype = new Sequence();

  ZippedSequence.prototype.each = function each(fn) {
    var arrays = this.arrays,
        i = 0;
    this.parent.each(function(e) {
      var group = [e];
      for (var j = 0; j < arrays.length; ++j) {
        if (arrays[j].length > i) {
          group.push(arrays[j][i]);
        }
      }
      return fn(group, i++);
    });
  };

  /**
   * Creates a new sequence with the same elements as this one, in a randomized
   * order.
   *
   * @public
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * Lazy([1, 2, 3, 4, 5]).shuffle() // the values [1, 2, 3, 4, 5] in any order
   */
  Sequence.prototype.shuffle = function shuffle() {
    return new ShuffledSequence(this);
  };

  /**
   * @constructor
   */
  function ShuffledSequence(parent) {
    this.parent = parent;
  }

  ShuffledSequence.prototype = new Sequence();

  ShuffledSequence.prototype.each = function each(fn) {
    var shuffled = this.parent.toArray(),
        floor = Math.floor,
        random = Math.random,
        j = 0;

    for (var i = shuffled.length - 1; i > 0; --i) {
      swap(shuffled, i, floor(random() * i) + 1);
      if (fn(shuffled[i], j++) === false) {
        return;
      }
    }
    fn(shuffled[0], j);
  };

  /**
   * Creates a new sequence with every element from this sequence, and with arrays
   * exploded so that a sequence of arrays (of arrays) becomes a flat sequence of
   * values.
   *
   * @public
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * Lazy([1, [2, 3], [4, [5]]]).flatten() // sequence: [1, 2, 3, 4, 5]
   * Lazy([1, Lazy([2, 3])]).flatten()     // sequence: [1, 2, 3]
   */
  Sequence.prototype.flatten = function flatten() {
    return new FlattenedSequence(this);
  };

  /**
   * @constructor
   */
  function FlattenedSequence(parent) {
    this.parent = parent;
  }

  FlattenedSequence.prototype = new Sequence();

  FlattenedSequence.prototype.each = function each(fn) {
    var index = 0;

    return this.parent.each(function recurseVisitor(e) {
      if (e instanceof Array) {
        return forEach(e, recurseVisitor);
      }

      if (e instanceof Sequence) {
        return e.each(recurseVisitor);
      }

      return fn(e, index++);
    });
  };

  /**
   * Creates a new sequence with the same elements as this one, except for all
   * falsy values (`false`, `0`, `""`, `null`, and `undefined`).
   *
   * @public
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * Lazy(["foo", null, "bar", undefined]).compact() // sequence: ["foo", "bar"]
   */
  Sequence.prototype.compact = function compact() {
    return this.filter(function(e) { return !!e; });
  };

  /**
   * Creates a new sequence with all the elements of this sequence that are not
   * also among the specified arguments.
   *
   * @public
   * @aka difference
   * @param {...*} var_args The values, or array(s) of values, to be excluded from the
   *     resulting sequence.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * Lazy([1, 2, 3, 4, 5]).without(2, 3)   // sequence: [1, 4, 5]
   * Lazy([1, 2, 3, 4, 5]).without([4, 5]) // sequence: [1, 2, 3]
   */
  Sequence.prototype.without = function without(var_args) {
    return new WithoutSequence(this, arraySlice.call(arguments, 0));
  };

  Sequence.prototype.difference = function difference(var_args) {
    return this.without.apply(this, arguments);
  };

  /**
   * @constructor
   */
  function WithoutSequence(parent, values) {
    this.parent = parent;
    this.values = values;
  }

  WithoutSequence.prototype = new Sequence();

  WithoutSequence.prototype.each = function each(fn) {
    var set = createSet(this.values),
        i = 0;
    return this.parent.each(function(e) {
      if (!set.contains(e)) {
        return fn(e, i++);
      }
    });
  };

  /**
   * Creates a new sequence with all the unique elements either in this sequence
   * or among the specified arguments.
   *
   * @public
   * @param {...*} var_args The values, or array(s) of values, to be additionally
   *     included in the resulting sequence.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * Lazy(["foo", "bar"]).union([])             // sequence: ["foo", "bar"]
   * Lazy(["foo", "bar"]).union(["bar", "baz"]) // sequence: ["foo", "bar", "baz"]
   */
  Sequence.prototype.union = function union(var_args) {
    return this.concat(var_args).uniq();
  };

  /**
   * Creates a new sequence with all the elements of this sequence that also
   * appear among the specified arguments.
   *
   * @public
   * @param {...*} var_args The values, or array(s) of values, in which elements
   *     from this sequence must also be included to end up in the resulting sequence.
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * Lazy(["foo", "bar"]).intersection([])             // sequence: []
   * Lazy(["foo", "bar"]).intersection(["bar", "baz"]) // sequence: ["bar"]
   */
  Sequence.prototype.intersection = function intersection(var_args) {
    if (arguments.length === 1 && arguments[0] instanceof Array) {
      return new SimpleIntersectionSequence(this, (/** @type {Array} */ var_args));
    } else {
      return new IntersectionSequence(this, arraySlice.call(arguments, 0));
    }
  };

  /**
   * @constructor
   */
  function IntersectionSequence(parent, arrays) {
    this.parent = parent;
    this.arrays = arrays;
  }

  IntersectionSequence.prototype = new Sequence();

  IntersectionSequence.prototype.each = function each(fn) {
    var sets = Lazy(this.arrays).map(function(values) {
      return new UniqueMemoizer(Lazy(values).getIterator());
    });

    var setIterator = new UniqueMemoizer(sets.getIterator()),
        i = 0;

    return this.parent.each(function(e) {
      var includedInAll = true;
      setIterator.each(function(set) {
        if (!set.contains(e)) {
          includedInAll = false;
          return false;
        }
      });

      if (includedInAll) {
        return fn(e, i++);
      }
    });
  };

  /**
   * @constructor
   */
  function UniqueMemoizer(iterator) {
    this.iterator     = iterator;
    this.set          = new Set$1();
    this.memo         = [];
    this.currentValue = undefined;
  }

  UniqueMemoizer.prototype.current = function current() {
    return this.currentValue;
  };

  UniqueMemoizer.prototype.moveNext = function moveNext() {
    var iterator = this.iterator,
        set = this.set,
        memo = this.memo,
        current;

    while (iterator.moveNext()) {
      current = iterator.current();
      if (set.add(current)) {
        memo.push(current);
        this.currentValue = current;
        return true;
      }
    }
    return false;
  };

  UniqueMemoizer.prototype.each = function each(fn) {
    var memo = this.memo,
        length = memo.length,
        i = -1;

    while (++i < length) {
      if (fn(memo[i], i) === false) {
        return false;
      }
    }

    while (this.moveNext()) {
      if (fn(this.currentValue, i++) === false) {
        break;
      }
    }
  };

  UniqueMemoizer.prototype.contains = function contains(e) {
    if (this.set.contains(e)) {
      return true;
    }

    while (this.moveNext()) {
      if (this.currentValue === e) {
        return true;
      }
    }

    return false;
  };

  /**
   * Checks whether every element in this sequence satisfies a given predicate.
   *
   * @public
   * @aka all
   * @param {Function} predicate A function to call on (potentially) every element
   *     in this sequence.
   * @returns {boolean} True if `predicate` returns true for every element in the
   *     sequence (or the sequence is empty). False if `predicate` returns false
   *     for at least one element.
   *
   * @examples
   * var numbers = [1, 2, 3, 4, 5];
   *
   * var objects = [{ foo: true }, { foo: false, bar: true }];
   *
   * Lazy(numbers).every(isEven)     // => false
   * Lazy(numbers).every(isPositive) // => true
   * Lazy(objects).all('foo')        // => false
   * Lazy(objects).all('bar')        // => false
   */
  Sequence.prototype.every = function every(predicate) {
    predicate = createCallback(predicate);

    return this.each(function(e, i) {
      return !!predicate(e, i);
    });
  };

  Sequence.prototype.all = function all(predicate) {
    return this.every(predicate);
  };

  /**
   * Checks whether at least one element in this sequence satisfies a given
   * predicate (or, if no predicate is specified, whether the sequence contains at
   * least one element).
   *
   * @public
   * @aka any
   * @param {Function=} predicate A function to call on (potentially) every element
   *     in this sequence.
   * @returns {boolean} True if `predicate` returns true for at least one element
   *     in the sequence. False if `predicate` returns false for every element (or
   *     the sequence is empty).
   *
   * @examples
   * var numbers = [1, 2, 3, 4, 5];
   *
   * Lazy(numbers).some()           // => true
   * Lazy(numbers).some(isEven)     // => true
   * Lazy(numbers).some(isNegative) // => false
   * Lazy([]).some()                // => false
   */
  Sequence.prototype.some = function some(predicate) {
    predicate = createCallback(predicate, true);

    var success = false;
    this.each(function(e) {
      if (predicate(e)) {
        success = true;
        return false;
      }
    });
    return success;
  };

  Sequence.prototype.any = function any(predicate) {
    return this.some(predicate);
  };

  /**
   * Checks whether NO elements in this sequence satisfy the given predicate
   * (the opposite of {@link Sequence#all}, basically).
   *
   * @public
   * @param {Function=} predicate A function to call on (potentially) every element
   *     in this sequence.
   * @returns {boolean} True if `predicate` does not return true for any element
   *     in the sequence. False if `predicate` returns true for at least one
   *     element.
   *
   * @examples
   * var numbers = [1, 2, 3, 4, 5];
   *
   * Lazy(numbers).none()           // => false
   * Lazy(numbers).none(isEven)     // => false
   * Lazy(numbers).none(isNegative) // => true
   * Lazy([]).none(isEven)          // => true
   * Lazy([]).none(isNegative)      // => true
   * Lazy([]).none()                // => true
   */
  Sequence.prototype.none = function none(predicate) {
    return !this.any(predicate);
  };

  /**
   * Checks whether the sequence has no elements.
   *
   * @public
   * @returns {boolean} True if the sequence is empty, false if it contains at
   *     least one element.
   *
   * @examples
   * Lazy([]).isEmpty()        // => true
   * Lazy([1, 2, 3]).isEmpty() // => false
   */
  Sequence.prototype.isEmpty = function isEmpty() {
    return !this.any();
  };

  /**
   * Performs (at worst) a linear search from the head of this sequence,
   * returning the first index at which the specified value is found.
   *
   * @public
   * @param {*} value The element to search for in the sequence.
   * @returns {number} The index within this sequence where the given value is
   *     located, or -1 if the sequence doesn't contain the value.
   *
   * @examples
   * function reciprocal(x) { return 1 / x; }
   *
   * Lazy(["foo", "bar", "baz"]).indexOf("bar")   // => 1
   * Lazy([1, 2, 3]).indexOf(4)                   // => -1
   * Lazy([1, 2, 3]).map(reciprocal).indexOf(0.5) // => 1
   */
  Sequence.prototype.indexOf = function indexOf(value) {
    var foundIndex = -1;
    this.each(function(e, i) {
      if (e === value) {
        foundIndex = i;
        return false;
      }
    });
    return foundIndex;
  };

  /**
   * Performs (at worst) a linear search from the tail of this sequence,
   * returning the last index at which the specified value is found.
   *
   * @public
   * @param {*} value The element to search for in the sequence.
   * @returns {number} The last index within this sequence where the given value
   *     is located, or -1 if the sequence doesn't contain the value.
   *
   * @examples
   * Lazy(["a", "b", "c", "b", "a"]).lastIndexOf("b")    // => 3
   * Lazy([1, 2, 3]).lastIndexOf(0)                      // => -1
   * Lazy([2, 2, 1, 2, 4]).filter(isEven).lastIndexOf(2) // 2
   */
  Sequence.prototype.lastIndexOf = function lastIndexOf(value) {
    var index = this.reverse().indexOf(value);
    if (index !== -1) {
      index = this.getIndex().length() - index - 1;
    }
    return index;
  };

  /**
   * Performs a binary search of this sequence, returning the lowest index where
   * the given value is either found, or where it belongs (if it is not already
   * in the sequence).
   *
   * This method assumes the sequence is in sorted order and will fail otherwise.
   *
   * @public
   * @param {*} value The element to search for in the sequence.
   * @returns {number} An index within this sequence where the given value is
   *     located, or where it belongs in sorted order.
   *
   * @examples
   * Lazy([1, 3, 6, 9]).sortedIndex(3)                    // => 1
   * Lazy([1, 3, 6, 9]).sortedIndex(7)                    // => 3
   * Lazy([5, 10, 15, 20]).filter(isEven).sortedIndex(10) // => 0
   * Lazy([5, 10, 15, 20]).filter(isEven).sortedIndex(12) // => 1
   */
  Sequence.prototype.sortedIndex = function sortedIndex(value) {
    var indexed = this.getIndex(),
        lower   = 0,
        upper   = indexed.length(),
        i;

    while (lower < upper) {
      i = (lower + upper) >>> 1;
      if (compare(indexed.get(i), value) === -1) {
        lower = i + 1;
      } else {
        upper = i;
      }
    }
    return lower;
  };

  /**
   * Checks whether the given value is in this sequence.
   *
   * @public
   * @param {*} value The element to search for in the sequence.
   * @returns {boolean} True if the sequence contains the value, false if not.
   *
   * @examples
   * var numbers = [5, 10, 15, 20];
   *
   * Lazy(numbers).contains(15) // => true
   * Lazy(numbers).contains(13) // => false
   */
  Sequence.prototype.contains = function contains(value) {
    return this.indexOf(value) !== -1;
  };

  /**
   * Aggregates a sequence into a single value according to some accumulator
   * function.
   *
   * @public
   * @aka inject, foldl
   * @param {Function} aggregator The function through which to pass every element
   *     in the sequence. For every element, the function will be passed the total
   *     aggregated result thus far and the element itself, and should return a
   *     new aggregated result.
   * @param {*=} memo The starting value to use for the aggregated result
   *     (defaults to the first element in the sequence).
   * @returns {*} The result of the aggregation.
   *
   * @examples
   * function multiply(x, y) { return x * y; }
   *
   * var numbers = [1, 2, 3, 4];
   *
   * Lazy(numbers).reduce(multiply)    // => 24
   * Lazy(numbers).reduce(multiply, 5) // => 120
   */
  Sequence.prototype.reduce = function reduce(aggregator, memo) {
    if (arguments.length < 2) {
      return this.tail().reduce(aggregator, this.head());
    }
    this.each(function(e, i) {
      memo = aggregator(memo, e, i);
    });
    return memo;
  };

  Sequence.prototype.inject =
  Sequence.prototype.foldl = function foldl(aggregator, memo) {
    return this.reduce(aggregator, memo);
  };

  /**
   * Aggregates a sequence, from the tail, into a single value according to some
   * accumulator function.
   *
   * @public
   * @aka foldr
   * @param {Function} aggregator The function through which to pass every element
   *     in the sequence. For every element, the function will be passed the total
   *     aggregated result thus far and the element itself, and should return a
   *     new aggregated result.
   * @param {*} memo The starting value to use for the aggregated result.
   * @returns {*} The result of the aggregation.
   *
   * @examples
   * function append(s1, s2) {
   *   return s1 + s2;
   * }
   *
   * function isVowel(str) {
   *   return "aeiou".indexOf(str) !== -1;
   * }
   *
   * Lazy("abcde").reduceRight(append)                 // => "edcba"
   * Lazy("abcde").filter(isVowel).reduceRight(append) // => "ea"
   */
  Sequence.prototype.reduceRight = function reduceRight(aggregator, memo) {
    if (arguments.length < 2) {
      return this.initial(1).reduceRight(aggregator, this.last());
    }

    // This bothers me... but frankly, calling reverse().reduce() is potentially
    // going to eagerly evaluate the sequence anyway; so it's really not an issue.
    var i = this.getIndex().length() - 1;
    return this.reverse().reduce(function(m, e) {
      return aggregator(m, e, i--);
    }, memo);
  };

  Sequence.prototype.foldr = function foldr(aggregator, memo) {
    return this.reduceRight(aggregator, memo);
  };

  /**
   * Groups this sequence into consecutive (overlapping) segments of a specified
   * length. If the underlying sequence has fewer elements than the specfied
   * length, then this sequence will be empty.
   *
   * @public
   * @param {number} length The length of each consecutive segment.
   * @returns {Sequence} The resulting sequence of consecutive segments.
   *
   * @examples
   * Lazy([]).consecutive(2)        // => sequence: []
   * Lazy([1]).consecutive(2)       // => sequence: []
   * Lazy([1, 2]).consecutive(2)    // => sequence: [[1, 2]]
   * Lazy([1, 2, 3]).consecutive(2) // => sequence: [[1, 2], [2, 3]]
   * Lazy([1, 2, 3]).consecutive(0) // => sequence: [[]]
   * Lazy([1, 2, 3]).consecutive(1) // => sequence: [[1], [2], [3]]
   */
  Sequence.prototype.consecutive = function consecutive(count) {
    var queue    = new Queue(count);
    var segments = this.map(function(element) {
      if (queue.add(element).count === count) {
        return queue.toArray();
      }
    });
    return segments.compact();
  };

  /**
   * Breaks this sequence into chunks (arrays) of a specified length.
   *
   * @public
   * @param {number} size The size of each chunk.
   * @returns {Sequence} The resulting sequence of chunks.
   *
   * @examples
   * Lazy([]).chunk(2)        // sequence: []
   * Lazy([1, 2, 3]).chunk(2) // sequence: [[1, 2], [3]]
   * Lazy([1, 2, 3]).chunk(1) // sequence: [[1], [2], [3]]
   * Lazy([1, 2, 3]).chunk(4) // sequence: [[1, 2, 3]]
   * Lazy([1, 2, 3]).chunk(0) // throws
   */
  Sequence.prototype.chunk = function chunk(size) {
    if (size < 1) {
      throw "You must specify a positive chunk size.";
    }

    return new ChunkedSequence(this, size);
  };

  /**
   * @constructor
   */
  function ChunkedSequence(parent, size) {
    this.parent    = parent;
    this.chunkSize = size;
  }

  ChunkedSequence.prototype = new Sequence();

  ChunkedSequence.prototype.getIterator = function getIterator() {
    return new ChunkedIterator(this.parent, this.chunkSize);
  };

  /**
   * @constructor
   */
  function ChunkedIterator(sequence, size) {
    this.iterator = sequence.getIterator();
    this.size     = size;
  }

  ChunkedIterator.prototype.current = function current() {
    return this.currentChunk;
  };

  ChunkedIterator.prototype.moveNext = function moveNext() {
    var iterator  = this.iterator,
        chunkSize = this.size,
        chunk     = [];

    while (chunk.length < chunkSize && iterator.moveNext()) {
      chunk.push(iterator.current());
    }

    if (chunk.length === 0) {
      return false;
    }

    this.currentChunk = chunk;
    return true;
  };

  /**
   * Passes each element in the sequence to the specified callback during
   * iteration. This is like {@link Sequence#each}, except that it can be
   * inserted anywhere in the middle of a chain of methods to "intercept" the
   * values in the sequence at that point.
   *
   * @public
   * @param {Function} callback A function to call on every element in the
   *     sequence during iteration. The return value of this function does not
   *     matter.
   * @returns {Sequence} A sequence comprising the same elements as this one.
   *
   * @examples
   * Lazy([1, 2, 3]).tap(fn).each(Lazy.noop); // calls fn 3 times
   */
  Sequence.prototype.tap = function tap(callback) {
    return new TappedSequence(this, callback);
  };

  /**
   * @constructor
   */
  function TappedSequence(parent, callback) {
    this.parent = parent;
    this.callback = callback;
  }

  TappedSequence.prototype = new Sequence();

  TappedSequence.prototype.each = function each(fn) {
    var callback = this.callback;
    return this.parent.each(function(e, i) {
      callback(e, i);
      return fn(e, i);
    });
  };

  /**
   * Seaches for the first element in the sequence satisfying a given predicate.
   *
   * @public
   * @aka detect
   * @param {Function} predicate A function to call on (potentially) every element
   *     in the sequence.
   * @returns {*} The first element in the sequence for which `predicate` returns
   *     `true`, or `undefined` if no such element is found.
   *
   * @examples
   * function divisibleBy3(x) {
   *   return x % 3 === 0;
   * }
   *
   * var numbers = [5, 6, 7, 8, 9, 10];
   *
   * Lazy(numbers).find(divisibleBy3) // => 6
   * Lazy(numbers).find(isNegative)   // => undefined
   */
  Sequence.prototype.find = function find(predicate) {
    return this.filter(predicate).first();
  };

  Sequence.prototype.detect = function detect(predicate) {
    return this.find(predicate);
  };

  /**
   * Gets the minimum value in the sequence.
   *
   * @public
   * @param {Function=} valueFn The function by which the value for comparison is
   *     calculated for each element in the sequence.
   * @returns {*} The element with the lowest value in the sequence, or
   *     `Infinity` if the sequence is empty.
   *
   * @examples
   * function negate(x) { return x * -1; }
   *
   * Lazy([]).min()                       // => Infinity
   * Lazy([6, 18, 2, 49, 34]).min()       // => 2
   * Lazy([6, 18, 2, 49, 34]).min(negate) // => 49
   */
  Sequence.prototype.min = function min(valueFn) {
    if (typeof valueFn !== "undefined") {
      return this.minBy(valueFn);
    }

    return this.reduce(function(x, y) { return y < x ? y : x; }, Infinity);
  };

  Sequence.prototype.minBy = function minBy(valueFn) {
    valueFn = createCallback(valueFn);
    return this.reduce(function(x, y) { return valueFn(y) < valueFn(x) ? y : x; });
  };

  /**
   * Gets the maximum value in the sequence.
   *
   * @public
   * @param {Function=} valueFn The function by which the value for comparison is
   *     calculated for each element in the sequence.
   * @returns {*} The element with the highest value in the sequence, or
   *     `-Infinity` if the sequence is empty.
   *
   * @examples
   * function reverseDigits(x) {
   *   return Number(String(x).split('').reverse().join(''));
   * }
   *
   * Lazy([]).max()                              // => -Infinity
   * Lazy([6, 18, 2, 48, 29]).max()              // => 48
   * Lazy([6, 18, 2, 48, 29]).max(reverseDigits) // => 29
   */
  Sequence.prototype.max = function max(valueFn) {
    if (typeof valueFn !== "undefined") {
      return this.maxBy(valueFn);
    }

    return this.reduce(function(x, y) { return y > x ? y : x; }, -Infinity);
  };

  Sequence.prototype.maxBy = function maxBy(valueFn) {
    valueFn = createCallback(valueFn);
    return this.reduce(function(x, y) { return valueFn(y) > valueFn(x) ? y : x; });
  };

  /**
   * Gets the sum of the values in the sequence.
   *
   * @public
   * @param {Function=} valueFn The function used to select the values that will
   *     be summed up.
   * @returns {*} The sum.
   *
   * @examples
   * Lazy([]).sum()                     // => 0
   * Lazy([1, 2, 3, 4]).sum()           // => 10
   * Lazy([1.2, 3.4]).sum(Math.floor)   // => 4
   * Lazy(['foo', 'bar']).sum('length') // => 6
   */
  Sequence.prototype.sum = function sum(valueFn) {
    if (typeof valueFn !== "undefined") {
      return this.sumBy(valueFn);
    }

    return this.reduce(function(x, y) { return x + y; }, 0);
  };

  Sequence.prototype.sumBy = function sumBy(valueFn) {
    valueFn = createCallback(valueFn);
    return this.reduce(function(x, y) { return x + valueFn(y); }, 0);
  };

  /**
   * Creates a string from joining together all of the elements in this sequence,
   * separated by the given delimiter.
   *
   * @public
   * @aka toString
   * @param {string=} delimiter The separator to insert between every element from
   *     this sequence in the resulting string (defaults to `","`).
   * @returns {string} The delimited string.
   *
   * @examples
   * Lazy([6, 29, 1984]).join("/")  // => "6/29/1984"
   * Lazy(["a", "b", "c"]).join()   // => "a,b,c"
   * Lazy(["a", "b", "c"]).join("") // => "abc"
   * Lazy([1, 2, 3]).join()         // => "1,2,3"
   * Lazy([1, 2, 3]).join("")       // => "123"
   */
  Sequence.prototype.join = function join(delimiter) {
    delimiter = typeof delimiter === "string" ? delimiter : ",";

    return this.reduce(function(str, e) {
      if (str.length > 0) {
        str += delimiter;
      }
      return str + e;
    }, "");
  };

  Sequence.prototype.toString = function toString(delimiter) {
    return this.join(delimiter);
  };

  /**
   * Creates a sequence, with the same elements as this one, that will be iterated
   * over asynchronously when calling `each`.
   *
   * @public
   * @param {number=} interval The approximate period, in milliseconds, that
   *     should elapse between each element in the resulting sequence. Omitting
   *     this argument will result in the fastest possible asynchronous iteration.
   * @returns {AsyncSequence} The new asynchronous sequence.
   *
   * @examples
   * Lazy([1, 2, 3]).async(100).each(fn) // calls fn 3 times asynchronously
   */
  Sequence.prototype.async = function async(interval) {
    return new AsyncSequence(this, interval);
  };

  /**
   * @constructor
   */
  function SimpleIntersectionSequence(parent, array) {
    this.parent = parent;
    this.array  = array;
    this.each   = getEachForIntersection(array);
  }

  SimpleIntersectionSequence.prototype = new Sequence();

  SimpleIntersectionSequence.prototype.eachMemoizerCache = function eachMemoizerCache(fn) {
    var iterator = new UniqueMemoizer(Lazy(this.array).getIterator()),
        i = 0;

    return this.parent.each(function(e) {
      if (iterator.contains(e)) {
        return fn(e, i++);
      }
    });
  };

  SimpleIntersectionSequence.prototype.eachArrayCache = function eachArrayCache(fn) {
    var array = this.array,
        find  = arrayContains,
        i = 0;

    return this.parent.each(function(e) {
      if (find(array, e)) {
        return fn(e, i++);
      }
    });
  };

  function getEachForIntersection(source) {
    if (source.length < 40) {
      return SimpleIntersectionSequence.prototype.eachArrayCache;
    } else {
      return SimpleIntersectionSequence.prototype.eachMemoizerCache;
    }
  }

  /**
   * An optimized version of {@link ZippedSequence}, when zipping a sequence with
   * only one array.
   *
   * @param {Sequence} parent The underlying sequence.
   * @param {Array} array The array with which to zip the sequence.
   * @constructor
   */
  function SimpleZippedSequence(parent, array) {
    this.parent = parent;
    this.array  = array;
  }

  SimpleZippedSequence.prototype = new Sequence();

  SimpleZippedSequence.prototype.each = function each(fn) {
    var array = this.array;
    return this.parent.each(function(e, i) {
      return fn([e, array[i]], i);
    });
  };

  /**
   * An `ArrayLikeSequence` is a {@link Sequence} that provides random access to
   * its elements. This extends the API for iterating with the additional methods
   * {@link #get} and {@link #length}, allowing a sequence to act as a "view" into
   * a collection or other indexed data source.
   *
   * The initial sequence created by wrapping an array with `Lazy(array)` is an
   * `ArrayLikeSequence`.
   *
   * All methods of `ArrayLikeSequence` that conceptually should return
   * something like a array (with indexed access) return another
   * `ArrayLikeSequence`.
   *
   * Defining custom array-like sequences
   * ------------------------------------
   *
   * Creating a custom `ArrayLikeSequence` is essentially the same as creating a
   * custom {@link Sequence}. You just have a couple more methods you need to
   * implement: `get` and (optionally) `length`.
   *
   * Here's an example. Let's define a sequence type called `OffsetSequence` that
   * offsets each of its parent's elements by a set distance, and circles back to
   * the beginning after reaching the end. **Remember**: the initialization
   * function you pass to {@link #define} should always accept a `parent` as its
   * first parameter.
   *
   *     ArrayLikeSequence.define("offset", {
   *       init: function(parent, offset) {
   *         this.offset = offset;
   *       },
   *
   *       get: function(i) {
   *         return this.parent.get((i + this.offset) % this.parent.length());
   *       }
   *     });
   *
   * It's worth noting a couple of things here.
   *
   * First, Lazy's default implementation of `length` simply returns the parent's
   * length. In this case, since an `OffsetSequence` will always have the same
   * number of elements as its parent, that implementation is fine; so we don't
   * need to override it.
   *
   * Second, the default implementation of `each` uses `get` and `length` to
   * essentially create a `for` loop, which is fine here. If you want to implement
   * `each` your own way, you can do that; but in most cases (as here), you can
   * probably just stick with the default.
   *
   * So we're already done, after only implementing `get`! Pretty easy, huh?
   *
   * Now the `offset` method will be chainable from any `ArrayLikeSequence`. So
   * for example:
   *
   *     Lazy([1, 2, 3]).map(mapFn).offset(3);
   *
   * ...will work, but:
   *
   *     Lazy([1, 2, 3]).filter(mapFn).offset(3);
   *
   * ...will not (because `filter` does not return an `ArrayLikeSequence`).
   *
   * (Also, as with the example provided for defining custom {@link Sequence}
   * types, this example really could have been implemented using a function
   * already available as part of Lazy.js: in this case, {@link Sequence#map}.)
   *
   * @public
   * @constructor
   *
   * @examples
   * Lazy([1, 2, 3])                    // instanceof Lazy.ArrayLikeSequence
   * Lazy([1, 2, 3]).map(Lazy.identity) // instanceof Lazy.ArrayLikeSequence
   * Lazy([1, 2, 3]).take(2)            // instanceof Lazy.ArrayLikeSequence
   * Lazy([1, 2, 3]).drop(2)            // instanceof Lazy.ArrayLikeSequence
   * Lazy([1, 2, 3]).reverse()          // instanceof Lazy.ArrayLikeSequence
   * Lazy([1, 2, 3]).slice(1, 2)        // instanceof Lazy.ArrayLikeSequence
   */
  function ArrayLikeSequence() {}

  ArrayLikeSequence.prototype = new Sequence();

  /**
   * Create a new constructor function for a type inheriting from
   * `ArrayLikeSequence`.
   *
   * @public
   * @param {string|Array.<string>} methodName The name(s) of the method(s) to be
   *     used for constructing the new sequence. The method will be attached to
   *     the `ArrayLikeSequence` prototype so that it can be chained with any other
   *     methods that return array-like sequences.
   * @param {Object} overrides An object containing function overrides for this
   *     new sequence type. **Must** include `get`. *May* include `init`,
   *     `length`, `getIterator`, and `each`. For each function, `this` will be
   *     the new sequence and `this.parent` will be the source sequence.
   * @returns {Function} A constructor for a new type inheriting from
   *     `ArrayLikeSequence`.
   *
   * @examples
   * Lazy.ArrayLikeSequence.define("offset", {
   *   init: function(offset) {
   *     this.offset = offset;
   *   },
   *
   *   get: function(i) {
   *     return this.parent.get((i + this.offset) % this.parent.length());
   *   }
   * });
   *
   * Lazy([1, 2, 3]).offset(1) // sequence: [2, 3, 1]
   */
  ArrayLikeSequence.define = function define(methodName, overrides) {
    if (!overrides || typeof overrides.get !== 'function') {
      throw "A custom array-like sequence must implement *at least* get!";
    }

    return defineSequenceType(ArrayLikeSequence, methodName, overrides);
  };

  /**
   * Returns the element at the specified index.
   *
   * @public
   * @param {number} i The index to access.
   * @returns {*} The element.
   *
   * @examples
   * function increment(x) { return x + 1; }
   *
   * Lazy([1, 2, 3]).get(1)                // => 2
   * Lazy([1, 2, 3]).get(-1)               // => undefined
   * Lazy([1, 2, 3]).map(increment).get(1) // => 3
   */
  ArrayLikeSequence.prototype.get = function get(i) {
    return this.parent.get(i);
  };

  /**
   * Returns the length of the sequence.
   *
   * @public
   * @returns {number} The length.
   *
   * @examples
   * function increment(x) { return x + 1; }
   *
   * Lazy([]).length()                       // => 0
   * Lazy([1, 2, 3]).length()                // => 3
   * Lazy([1, 2, 3]).map(increment).length() // => 3
   */
  ArrayLikeSequence.prototype.length = function length() {
    return this.parent.length();
  };

  /**
   * Returns the current sequence (since it is already indexed).
   */
  ArrayLikeSequence.prototype.getIndex = function getIndex() {
    return this;
  };

  /**
   * An optimized version of {@link Sequence#getIterator}.
   */
  ArrayLikeSequence.prototype.getIterator = function getIterator() {
    return new IndexedIterator(this);
  };

  /**
   * An optimized version of {@link Iterator} meant to work with already-indexed
   * sequences.
   *
   * @param {ArrayLikeSequence} sequence The sequence to iterate over.
   * @constructor
   */
  function IndexedIterator(sequence) {
    this.sequence = sequence;
    this.index    = -1;
  }

  IndexedIterator.prototype.current = function current() {
    return this.sequence.get(this.index);
  };

  IndexedIterator.prototype.moveNext = function moveNext() {
    if (this.index >= this.sequence.length() - 1) {
      return false;
    }

    ++this.index;
    return true;
  };

  /**
   * An optimized version of {@link Sequence#each}.
   */
  ArrayLikeSequence.prototype.each = function each(fn) {
    var length = this.length(),
        i = -1;

    while (++i < length) {
      if (fn(this.get(i), i) === false) {
        return false;
      }
    }

    return true;
  };

  /**
   * Returns a new sequence with the same elements as this one, minus the last
   * element.
   *
   * @public
   * @returns {ArrayLikeSequence} The new array-like sequence.
   *
   * @examples
   * Lazy([1, 2, 3]).pop() // sequence: [1, 2]
   * Lazy([]).pop()        // sequence: []
   */
  ArrayLikeSequence.prototype.pop = function pop() {
    return this.initial();
  };

  /**
   * Returns a new sequence with the same elements as this one, minus the first
   * element.
   *
   * @public
   * @returns {ArrayLikeSequence} The new array-like sequence.
   *
   * @examples
   * Lazy([1, 2, 3]).shift() // sequence: [2, 3]
   * Lazy([]).shift()        // sequence: []
   */
  ArrayLikeSequence.prototype.shift = function shift() {
    return this.drop();
  };

  /**
   * Returns a new sequence comprising the portion of this sequence starting
   * from the specified starting index and continuing until the specified ending
   * index or to the end of the sequence.
   *
   * @public
   * @param {number} begin The index at which the new sequence should start.
   * @param {number=} end The index at which the new sequence should end.
   * @returns {ArrayLikeSequence} The new array-like sequence.
   *
   * @examples
   * Lazy([1, 2, 3, 4, 5]).slice(0)     // sequence: [1, 2, 3, 4, 5]
   * Lazy([1, 2, 3, 4, 5]).slice(2)     // sequence: [3, 4, 5]
   * Lazy([1, 2, 3, 4, 5]).slice(2, 4)  // sequence: [3, 4]
   * Lazy([1, 2, 3, 4, 5]).slice(-1)    // sequence: [5]
   * Lazy([1, 2, 3, 4, 5]).slice(1, -1) // sequence: [2, 3, 4]
   * Lazy([1, 2, 3, 4, 5]).slice(0, 10) // sequence: [1, 2, 3, 4, 5]
   */
  ArrayLikeSequence.prototype.slice = function slice(begin, end) {
    var length = this.length();

    if (begin < 0) {
      begin = length + begin;
    }

    var result = this.drop(begin);

    if (typeof end === "number") {
      if (end < 0) {
        end = length + end;
      }
      result = result.take(end - begin);
    }

    return result;
  };

  /**
   * An optimized version of {@link Sequence#map}, which creates an
   * {@link ArrayLikeSequence} so that the result still provides random access.
   *
   * @public
   *
   * @examples
   * Lazy([1, 2, 3]).map(Lazy.identity) // instanceof Lazy.ArrayLikeSequence
   */
  ArrayLikeSequence.prototype.map = function map(mapFn) {
    return new IndexedMappedSequence(this, createCallback(mapFn));
  };

  /**
   * @constructor
   */
  function IndexedMappedSequence(parent, mapFn) {
    this.parent = parent;
    this.mapFn  = mapFn;
  }

  IndexedMappedSequence.prototype = new ArrayLikeSequence();

  IndexedMappedSequence.prototype.get = function get(i) {
    if (i < 0 || i >= this.parent.length()) {
      return undefined;
    }

    return this.mapFn(this.parent.get(i), i);
  };

  /**
   * An optimized version of {@link Sequence#filter}.
   */
  ArrayLikeSequence.prototype.filter = function filter(filterFn) {
    return new IndexedFilteredSequence(this, createCallback(filterFn));
  };

  /**
   * @constructor
   */
  function IndexedFilteredSequence(parent, filterFn) {
    this.parent   = parent;
    this.filterFn = filterFn;
  }

  IndexedFilteredSequence.prototype = new FilteredSequence();

  IndexedFilteredSequence.prototype.each = function each(fn) {
    var parent = this.parent,
        filterFn = this.filterFn,
        length = this.parent.length(),
        i = -1,
        e;

    while (++i < length) {
      e = parent.get(i);
      if (filterFn(e, i) && fn(e, i) === false) {
        return false;
      }
    }

    return true;
  };

  /**
   * An optimized version of {@link Sequence#reverse}, which creates an
   * {@link ArrayLikeSequence} so that the result still provides random access.
   *
   * @public
   *
   * @examples
   * Lazy([1, 2, 3]).reverse() // instanceof Lazy.ArrayLikeSequence
   */
  ArrayLikeSequence.prototype.reverse = function reverse() {
    return new IndexedReversedSequence(this);
  };

  /**
   * @constructor
   */
  function IndexedReversedSequence(parent) {
    this.parent = parent;
  }

  IndexedReversedSequence.prototype = new ArrayLikeSequence();

  IndexedReversedSequence.prototype.get = function get(i) {
    return this.parent.get(this.length() - i - 1);
  };

  /**
   * An optimized version of {@link Sequence#first}, which creates an
   * {@link ArrayLikeSequence} so that the result still provides random access.
   *
   * @public
   *
   * @examples
   * Lazy([1, 2, 3]).first(2) // instanceof Lazy.ArrayLikeSequence
   */
  ArrayLikeSequence.prototype.first = function first(count) {
    if (typeof count === "undefined") {
      return this.get(0);
    }

    return new IndexedTakeSequence(this, count);
  };

  /**
   * @constructor
   */
  function IndexedTakeSequence(parent, count) {
    this.parent = parent;
    this.count  = count;
  }

  IndexedTakeSequence.prototype = new ArrayLikeSequence();

  IndexedTakeSequence.prototype.length = function length() {
    var parentLength = this.parent.length();
    return this.count <= parentLength ? this.count : parentLength;
  };

  /**
   * An optimized version of {@link Sequence#rest}, which creates an
   * {@link ArrayLikeSequence} so that the result still provides random access.
   *
   * @public
   *
   * @examples
   * Lazy([1, 2, 3]).rest() // instanceof Lazy.ArrayLikeSequence
   */
  ArrayLikeSequence.prototype.rest = function rest(count) {
    return new IndexedDropSequence(this, count);
  };

  /**
   * @constructor
   */
  function IndexedDropSequence(parent, count) {
    this.parent = parent;
    this.count  = typeof count === "number" ? count : 1;
  }

  IndexedDropSequence.prototype = new ArrayLikeSequence();

  IndexedDropSequence.prototype.get = function get(i) {
    return this.parent.get(this.count + i);
  };

  IndexedDropSequence.prototype.length = function length() {
    var parentLength = this.parent.length();
    return this.count <= parentLength ? parentLength - this.count : 0;
  };

  /**
   * An optimized version of {@link Sequence#concat} that returns another
   * {@link ArrayLikeSequence} *if* the argument is an array.
   *
   * @public
   * @param {...*} var_args
   *
   * @examples
   * Lazy([1, 2]).concat([3, 4]) // instanceof Lazy.ArrayLikeSequence
   * Lazy([1, 2]).concat([3, 4]) // sequence: [1, 2, 3, 4]
   */
  ArrayLikeSequence.prototype.concat = function concat(var_args) {
    if (arguments.length === 1 && arguments[0] instanceof Array) {
      return new IndexedConcatenatedSequence(this, (/** @type {Array} */ var_args));
    } else {
      return Sequence.prototype.concat.apply(this, arguments);
    }
  };

  /**
   * @constructor
   */
  function IndexedConcatenatedSequence(parent, other) {
    this.parent = parent;
    this.other  = other;
  }

  IndexedConcatenatedSequence.prototype = new ArrayLikeSequence();

  IndexedConcatenatedSequence.prototype.get = function get(i) {
    var parentLength = this.parent.length();
    if (i < parentLength) {
      return this.parent.get(i);
    } else {
      return this.other[i - parentLength];
    }
  };

  IndexedConcatenatedSequence.prototype.length = function length() {
    return this.parent.length() + this.other.length;
  };

  /**
   * An optimized version of {@link Sequence#uniq}.
   */
  ArrayLikeSequence.prototype.uniq = function uniq(keyFn) {
    return new IndexedUniqueSequence(this, createCallback(keyFn));
  };

  /**
   * @param {ArrayLikeSequence} parent
   * @constructor
   */
  function IndexedUniqueSequence(parent, keyFn) {
    this.parent = parent;
    this.each   = getEachForParent(parent);
    this.keyFn  = keyFn;
  }

  IndexedUniqueSequence.prototype = new Sequence();

  IndexedUniqueSequence.prototype.eachArrayCache = function eachArrayCache(fn) {
    // Basically the same implementation as w/ the set, but using an array because
    // it's cheaper for smaller sequences.
    var parent = this.parent,
        keyFn  = this.keyFn,
        length = parent.length(),
        cache  = [],
        find   = arrayContains,
        key, value,
        i = -1,
        j = 0;

    while (++i < length) {
      value = parent.get(i);
      key = keyFn(value);
      if (!find(cache, key)) {
        cache.push(key);
        if (fn(value, j++) === false) {
          return false;
        }
      }
    }
  };

  IndexedUniqueSequence.prototype.eachSetCache = UniqueSequence.prototype.each;

  function getEachForParent(parent) {
    if (parent.length() < 100) {
      return IndexedUniqueSequence.prototype.eachArrayCache;
    } else {
      return UniqueSequence.prototype.each;
    }
  }

  // Now that we've fully initialized the ArrayLikeSequence prototype, we can
  // set the prototype for MemoizedSequence.

  MemoizedSequence.prototype = new ArrayLikeSequence();

  MemoizedSequence.prototype.cache = function cache() {
    return this.cachedResult || (this.cachedResult = this.parent.toArray());
  };

  MemoizedSequence.prototype.get = function get(i) {
    return this.cache()[i];
  };

  MemoizedSequence.prototype.length = function length() {
    return this.cache().length;
  };

  MemoizedSequence.prototype.slice = function slice(begin, end) {
    return this.cache().slice(begin, end);
  };

  MemoizedSequence.prototype.toArray = function toArray() {
    return this.cache().slice(0);
  };

  /**
   * ArrayWrapper is the most basic {@link Sequence}. It directly wraps an array
   * and implements the same methods as {@link ArrayLikeSequence}, but more
   * efficiently.
   *
   * @constructor
   */
  function ArrayWrapper(source) {
    this.source = source;
  }

  ArrayWrapper.prototype = new ArrayLikeSequence();

  ArrayWrapper.prototype.root = function root() {
    return this;
  };

  /**
   * Returns the element at the specified index in the source array.
   *
   * @param {number} i The index to access.
   * @returns {*} The element.
   */
  ArrayWrapper.prototype.get = function get(i) {
    return this.source[i];
  };

  /**
   * Returns the length of the source array.
   *
   * @returns {number} The length.
   */
  ArrayWrapper.prototype.length = function length() {
    return this.source.length;
  };

  /**
   * An optimized version of {@link Sequence#each}.
   */
  ArrayWrapper.prototype.each = function each(fn) {
    return forEach(this.source, fn);
  };

  /**
   * An optimized version of {@link Sequence#map}.
   */
  ArrayWrapper.prototype.map =
  ArrayWrapper.prototype.collect = function collect(mapFn) {
    return new MappedArrayWrapper(this, createCallback(mapFn));
  };

  /**
   * An optimized version of {@link Sequence#filter}.
   */
  ArrayWrapper.prototype.filter =
  ArrayWrapper.prototype.select = function select(filterFn) {
    return new FilteredArrayWrapper(this, createCallback(filterFn));
  };

  /**
   * An optimized version of {@link Sequence#uniq}.
   */
  ArrayWrapper.prototype.uniq =
  ArrayWrapper.prototype.unique = function unique(keyFn) {
    return new UniqueArrayWrapper(this, keyFn);
  };

  /**
   * An optimized version of {@link ArrayLikeSequence#concat}.
   *
   * @param {...*} var_args
   */
  ArrayWrapper.prototype.concat = function concat(var_args) {
    if (arguments.length === 1 && arguments[0] instanceof Array) {
      return new ConcatArrayWrapper(this, (/** @type {Array} */ var_args));
    } else {
      return ArrayLikeSequence.prototype.concat.apply(this, arguments);
    }
  };

  /**
   * An optimized version of {@link Sequence#toArray}.
   */
  ArrayWrapper.prototype.toArray = function toArray() {
    return this.source.slice(0);
  };

  /**
   * @constructor
   */
  function MappedArrayWrapper(parent, mapFn) {
    this.parent = parent;
    this.mapFn  = mapFn;
  }

  MappedArrayWrapper.prototype = new ArrayLikeSequence();

  MappedArrayWrapper.prototype.get = function get(i) {
    var source = this.parent.source;

    if (i < 0 || i >= source.length) {
      return undefined;
    }

    return this.mapFn(source[i]);
  };

  MappedArrayWrapper.prototype.length = function length() {
    return this.parent.source.length;
  };

  MappedArrayWrapper.prototype.each = function each(fn) {
    var source = this.parent.source,
        length = source.length,
        mapFn  = this.mapFn,
        i = -1;

    while (++i < length) {
      if (fn(mapFn(source[i], i), i) === false) {
        return false;
      }
    }

    return true;
  };

  /**
   * @constructor
   */
  function FilteredArrayWrapper(parent, filterFn) {
    this.parent   = parent;
    this.filterFn = filterFn;
  }

  FilteredArrayWrapper.prototype = new FilteredSequence();

  FilteredArrayWrapper.prototype.each = function each(fn) {
    var source = this.parent.source,
        filterFn = this.filterFn,
        length = source.length,
        i = -1,
        e;

    while (++i < length) {
      e = source[i];
      if (filterFn(e, i) && fn(e, i) === false) {
        return false;
      }
    }

    return true;
  };

  /**
   * @constructor
   */
  function UniqueArrayWrapper(parent, keyFn) {
    this.parent = parent;
    this.each   = getEachForSource(parent.source);
    this.keyFn  = keyFn;
  }

  UniqueArrayWrapper.prototype = new Sequence();

  UniqueArrayWrapper.prototype.eachNoCache = function eachNoCache(fn) {
    var source = this.parent.source,
        keyFn  = this.keyFn,
        length = source.length,
        find   = arrayContainsBefore,
        value,

        // Yes, this is hideous.
        // Trying to get performance first, will refactor next!
        i = -1,
        k = 0;

    while (++i < length) {
      value = source[i];
      if (!find(source, value, i, keyFn) && fn(value, k++) === false) {
        return false;
      }
    }

    return true;
  };

  UniqueArrayWrapper.prototype.eachArrayCache = function eachArrayCache(fn) {
    // Basically the same implementation as w/ the set, but using an array because
    // it's cheaper for smaller sequences.
    var source = this.parent.source,
        keyFn  = this.keyFn,
        length = source.length,
        cache  = [],
        find   = arrayContains,
        key, value,
        i = -1,
        j = 0;

    if (keyFn) {
      keyFn = createCallback(keyFn);
      while (++i < length) {
        value = source[i];
        key = keyFn(value);
        if (!find(cache, key)) {
          cache.push(key);
          if (fn(value, j++) === false) {
            return false;
          }
        }
      }

    } else {
      while (++i < length) {
        value = source[i];
        if (!find(cache, value)) {
          cache.push(value);
          if (fn(value, j++) === false) {
            return false;
          }
        }
      }
    }

    return true;
  };

  UniqueArrayWrapper.prototype.eachSetCache = UniqueSequence.prototype.each;

  /**
   * My latest findings here...
   *
   * So I hadn't really given the set-based approach enough credit. The main issue
   * was that my Set implementation was totally not optimized at all. After pretty
   * heavily optimizing it (just take a look; it's a monstrosity now!), it now
   * becomes the fastest option for much smaller values of N.
   */
  function getEachForSource(source) {
    if (source.length < 40) {
      return UniqueArrayWrapper.prototype.eachNoCache;
    } else if (source.length < 100) {
      return UniqueArrayWrapper.prototype.eachArrayCache;
    } else {
      return UniqueArrayWrapper.prototype.eachSetCache;
    }
  }

  /**
   * @constructor
   */
  function ConcatArrayWrapper(parent, other) {
    this.parent = parent;
    this.other  = other;
  }

  ConcatArrayWrapper.prototype = new ArrayLikeSequence();

  ConcatArrayWrapper.prototype.get = function get(i) {
    var source = this.parent.source,
        sourceLength = source.length;

    if (i < sourceLength) {
      return source[i];
    } else {
      return this.other[i - sourceLength];
    }
  };

  ConcatArrayWrapper.prototype.length = function length() {
    return this.parent.source.length + this.other.length;
  };

  ConcatArrayWrapper.prototype.each = function each(fn) {
    var source = this.parent.source,
        sourceLength = source.length,
        other = this.other,
        otherLength = other.length,
        i = 0,
        j = -1;

    while (++j < sourceLength) {
      if (fn(source[j], i++) === false) {
        return false;
      }
    }

    j = -1;
    while (++j < otherLength) {
      if (fn(other[j], i++) === false) {
        return false;
      }
    }

    return true;
  };

  /**
   * An `ObjectLikeSequence` object represents a sequence of key/value pairs.
   *
   * The initial sequence you get by wrapping an object with `Lazy(object)` is
   * an `ObjectLikeSequence`.
   *
   * All methods of `ObjectLikeSequence` that conceptually should return
   * something like an object return another `ObjectLikeSequence`.
   *
   * @public
   * @constructor
   *
   * @examples
   * var obj = { foo: 'bar' };
   *
   * Lazy(obj).assign({ bar: 'baz' })   // instanceof Lazy.ObjectLikeSequence
   * Lazy(obj).defaults({ bar: 'baz' }) // instanceof Lazy.ObjectLikeSequence
   * Lazy(obj).invert()                 // instanceof Lazy.ObjectLikeSequence
   */
  function ObjectLikeSequence() {}

  ObjectLikeSequence.prototype = new Sequence();

  /**
   * Create a new constructor function for a type inheriting from
   * `ObjectLikeSequence`.
   *
   * @public
   * @param {string|Array.<string>} methodName The name(s) of the method(s) to be
   *     used for constructing the new sequence. The method will be attached to
   *     the `ObjectLikeSequence` prototype so that it can be chained with any other
   *     methods that return object-like sequences.
   * @param {Object} overrides An object containing function overrides for this
   *     new sequence type. **Must** include `each`. *May* include `init` and
   *     `get` (for looking up an element by key).
   * @returns {Function} A constructor for a new type inheriting from
   *     `ObjectLikeSequence`.
   *
   * @examples
   * function downcaseKey(value, key) {
   *   return [key.toLowerCase(), value];
   * }
   *
   * Lazy.ObjectLikeSequence.define("caseInsensitive", {
   *   init: function() {
   *     var downcased = this.parent
   *       .map(downcaseKey)
   *       .toObject();
   *     this.downcased = Lazy(downcased);
   *   },
   *
   *   get: function(key) {
   *     return this.downcased.get(key.toLowerCase());
   *   },
   *
   *   each: function(fn) {
   *     return this.downcased.each(fn);
   *   }
   * });
   *
   * Lazy({ Foo: 'bar' }).caseInsensitive()            // sequence: { foo: 'bar' }
   * Lazy({ FOO: 'bar' }).caseInsensitive().get('foo') // => 'bar'
   * Lazy({ FOO: 'bar' }).caseInsensitive().get('FOO') // => 'bar'
   */
  ObjectLikeSequence.define = function define(methodName, overrides) {
    if (!overrides || typeof overrides.each !== 'function') {
      throw "A custom object-like sequence must implement *at least* each!";
    }

    return defineSequenceType(ObjectLikeSequence, methodName, overrides);
  };

  ObjectLikeSequence.prototype.value = function value() {
    return this.toObject();
  };

  /**
   * Gets the element at the specified key in this sequence.
   *
   * @public
   * @param {string} key The key.
   * @returns {*} The element.
   *
   * @examples
   * Lazy({ foo: "bar" }).get("foo")                          // => "bar"
   * Lazy({ foo: "bar" }).extend({ foo: "baz" }).get("foo")   // => "baz"
   * Lazy({ foo: "bar" }).defaults({ bar: "baz" }).get("bar") // => "baz"
   * Lazy({ foo: "bar" }).invert().get("bar")                 // => "foo"
   * Lazy({ foo: 1, bar: 2 }).pick(["foo"]).get("foo")        // => 1
   * Lazy({ foo: 1, bar: 2 }).pick(["foo"]).get("bar")        // => undefined
   * Lazy({ foo: 1, bar: 2 }).omit(["foo"]).get("bar")        // => 2
   * Lazy({ foo: 1, bar: 2 }).omit(["foo"]).get("foo")        // => undefined
   */
  ObjectLikeSequence.prototype.get = function get(key) {
    var pair = this.pairs().find(function(pair) {
      return pair[0] === key;
    });

    return pair ? pair[1] : undefined;
  };

  /**
   * Returns a {@link Sequence} whose elements are the keys of this object-like
   * sequence.
   *
   * @public
   * @returns {Sequence} The sequence based on this sequence's keys.
   *
   * @examples
   * Lazy({ hello: "hola", goodbye: "hasta luego" }).keys() // sequence: ["hello", "goodbye"]
   */
  ObjectLikeSequence.prototype.keys = function keys() {
    return this.map(function(v, k) { return k; });
  };

  /**
   * Returns a {@link Sequence} whose elements are the values of this object-like
   * sequence.
   *
   * @public
   * @returns {Sequence} The sequence based on this sequence's values.
   *
   * @examples
   * Lazy({ hello: "hola", goodbye: "hasta luego" }).values() // sequence: ["hola", "hasta luego"]
   */
  ObjectLikeSequence.prototype.values = function values() {
    return this.map(function(v, k) { return v; });
  };

  /**
   * Throws an exception. Asynchronous iteration over object-like sequences is
   * not supported.
   *
   * @public
   * @examples
   * Lazy({ foo: 'bar' }).async() // throws
   */
  ObjectLikeSequence.prototype.async = function async() {
    throw 'An ObjectLikeSequence does not support asynchronous iteration.';
  };

  /**
   * Returns this same sequence. (Reversing an object-like sequence doesn't make
   * any sense.)
   */
  ObjectLikeSequence.prototype.reverse = function reverse() {
    return this;
  };

  /**
   * Returns an {@link ObjectLikeSequence} whose elements are the combination of
   * this sequence and another object. In the case of a key appearing in both this
   * sequence and the given object, the other object's value will override the
   * one in this sequence.
   *
   * @public
   * @aka extend
   * @param {Object} other The other object to assign to this sequence.
   * @returns {ObjectLikeSequence} A new sequence comprising elements from this
   *     sequence plus the contents of `other`.
   *
   * @examples
   * Lazy({ "uno": 1, "dos": 2 }).assign({ "tres": 3 }) // sequence: { uno: 1, dos: 2, tres: 3 }
   * Lazy({ foo: "bar" }).assign({ foo: "baz" });       // sequence: { foo: "baz" }
   */
  ObjectLikeSequence.prototype.assign = function assign(other) {
    return new AssignSequence(this, other);
  };

  ObjectLikeSequence.prototype.extend = function extend(other) {
    return this.assign(other);
  };

  /**
   * @constructor
   */
  function AssignSequence(parent, other) {
    this.parent = parent;
    this.other  = other;
  }

  AssignSequence.prototype = new ObjectLikeSequence();

  AssignSequence.prototype.get = function get(key) {
    return this.other[key] || this.parent.get(key);
  };

  AssignSequence.prototype.each = function each(fn) {
    var merged = new Set$1(),
        done   = false;

    Lazy(this.other).each(function(value, key) {
      if (fn(value, key) === false) {
        done = true;
        return false;
      }

      merged.add(key);
    });

    if (!done) {
      return this.parent.each(function(value, key) {
        if (!merged.contains(key) && fn(value, key) === false) {
          return false;
        }
      });
    }
  };

  /**
   * Returns an {@link ObjectLikeSequence} whose elements are the combination of
   * this sequence and a 'default' object. In the case of a key appearing in both
   * this sequence and the given object, this sequence's value will override the
   * default object's.
   *
   * @public
   * @param {Object} defaults The 'default' object to use for missing keys in this
   *     sequence.
   * @returns {ObjectLikeSequence} A new sequence comprising elements from this
   *     sequence supplemented by the contents of `defaults`.
   *
   * @examples
   * Lazy({ name: "Dan" }).defaults({ name: "User", password: "passw0rd" }) // sequence: { name: "Dan", password: "passw0rd" }
   */
  ObjectLikeSequence.prototype.defaults = function defaults(defaults) {
    return new DefaultsSequence(this, defaults);
  };

  /**
   * @constructor
   */
  function DefaultsSequence(parent, defaults) {
    this.parent   = parent;
    this.defaults = defaults;
  }

  DefaultsSequence.prototype = new ObjectLikeSequence();

  DefaultsSequence.prototype.get = function get(key) {
    return this.parent.get(key) || this.defaults[key];
  };

  DefaultsSequence.prototype.each = function each(fn) {
    var merged = new Set$1(),
        done   = false;

    this.parent.each(function(value, key) {
      if (fn(value, key) === false) {
        done = true;
        return false;
      }

      if (typeof value !== "undefined") {
        merged.add(key);
      }
    });

    if (!done) {
      Lazy(this.defaults).each(function(value, key) {
        if (!merged.contains(key) && fn(value, key) === false) {
          return false;
        }
      });
    }
  };

  /**
   * Returns an {@link ObjectLikeSequence} whose values are this sequence's keys,
   * and whose keys are this sequence's values.
   *
   * @public
   * @returns {ObjectLikeSequence} A new sequence comprising the inverted keys and
   *     values from this sequence.
   *
   * @examples
   * Lazy({ first: "Dan", last: "Tao" }).invert() // sequence: { Dan: "first", Tao: "last" }
   */
  ObjectLikeSequence.prototype.invert = function invert() {
    return new InvertedSequence(this);
  };

  /**
   * @constructor
   */
  function InvertedSequence(parent) {
    this.parent = parent;
  }

  InvertedSequence.prototype = new ObjectLikeSequence();

  InvertedSequence.prototype.each = function each(fn) {
    this.parent.each(function(value, key) {
      return fn(key, value);
    });
  };

  /**
   * Produces an {@link ObjectLikeSequence} consisting of all the recursively
   * merged values from this and the given object(s) or sequence(s).
   *
   * @public
   * @param {...Object|ObjectLikeSequence} others The other object(s) or
   *     sequence(s) whose values will be merged into this one.
   * @param {Function=} mergeFn An optional function used to customize merging
   *     behavior.
   * @returns {ObjectLikeSequence} The new sequence consisting of merged values.
   *
   * @examples
   * // These examples are completely stolen from Lo-Dash's documentation:
   * // lodash.com/docs#merge
   *
   * var names = {
   *   'characters': [
   *     { 'name': 'barney' },
   *     { 'name': 'fred' }
   *   ]
   * };
   *
   * var ages = {
   *   'characters': [
   *     { 'age': 36 },
   *     { 'age': 40 }
   *   ]
   * };
   *
   * var food = {
   *   'fruits': ['apple'],
   *   'vegetables': ['beet']
   * };
   *
   * var otherFood = {
   *   'fruits': ['banana'],
   *   'vegetables': ['carrot']
   * };
   *
   * function mergeArrays(a, b) {
   *   return Array.isArray(a) ? a.concat(b) : undefined;
   * }
   *
   * Lazy(names).merge(ages); // => sequence: { 'characters': [{ 'name': 'barney', 'age': 36 }, { 'name': 'fred', 'age': 40 }] }
   * Lazy(food).merge(otherFood, mergeArrays); // => sequence: { 'fruits': ['apple', 'banana'], 'vegetables': ['beet', 'carrot'] }
   *
   * // ----- Now for my own tests: -----
   *
   * // merges objects
   * Lazy({ foo: 1 }).merge({ foo: 2 }); // => sequence: { foo: 2 }
   * Lazy({ foo: 1 }).merge({ bar: 2 }); // => sequence: { foo: 1, bar: 2 }
   *
   * // goes deep
   * Lazy({ foo: { bar: 1 } }).merge({ foo: { bar: 2 } }); // => sequence: { foo: { bar: 2 } }
   * Lazy({ foo: { bar: 1 } }).merge({ foo: { baz: 2 } }); // => sequence: { foo: { bar: 1, baz: 2 } }
   * Lazy({ foo: { bar: 1 } }).merge({ foo: { baz: 2 } }); // => sequence: { foo: { bar: 1, baz: 2 } }
   *
   * // gives precedence to later sources
   * Lazy({ foo: 1 }).merge({ bar: 2 }, { bar: 3 }); // => sequence: { foo: 1, bar: 3 }
   *
   * // undefined gets passed over
   * Lazy({ foo: 1 }).merge({ foo: undefined }); // => sequence: { foo: 1 }
   *
   * // null doesn't get passed over
   * Lazy({ foo: 1 }).merge({ foo: null }); // => sequence: { foo: null }
   *
   * // array contents get merged as well
   * Lazy({ foo: [{ bar: 1 }] }).merge({ foo: [{ baz: 2 }] }); // => sequence: { foo: [{ bar: 1, baz: 2}] }
   */
  ObjectLikeSequence.prototype.merge = function merge(var_args) {
    var mergeFn = arguments.length > 1 && typeof arguments[arguments.length - 1] === "function" ?
      arrayPop.call(arguments) : null;
    return new MergedSequence(this, arraySlice.call(arguments, 0), mergeFn);
  };

  /**
   * @constructor
   */
  function MergedSequence(parent, others, mergeFn) {
    this.parent  = parent;
    this.others  = others;
    this.mergeFn = mergeFn;
  }

  MergedSequence.prototype = new ObjectLikeSequence();

  MergedSequence.prototype.each = function each(fn) {
    var others  = this.others,
        mergeFn = this.mergeFn || mergeObjects,
        keys    = {};

    var iteratedFullSource = this.parent.each(function(value, key) {
      var merged = value;

      forEach(others, function(other) {
        if (key in other) {
          merged = mergeFn(merged, other[key]);
        }
      });

      keys[key] = true;

      return fn(merged, key);
    });

    if (iteratedFullSource === false) {
      return false;
    }

    var remaining = {};

    forEach(others, function(other) {
      for (var k in other) {
        if (!keys[k]) {
          remaining[k] = mergeFn(remaining[k], other[k]);
        }
      }
    });

    return Lazy(remaining).each(fn);
  };

  /**
   * @private
   * @examples
   * mergeObjects({ foo: 1 }, { bar: 2 }); // => { foo: 1, bar: 2 }
   * mergeObjects({ foo: { bar: 1 } }, { foo: { baz: 2 } }); // => { foo: { bar: 1, baz: 2 } }
   * mergeObjects({ foo: { bar: 1 } }, { foo: undefined }); // => { foo: { bar: 1 } }
   * mergeObjects({ foo: { bar: 1 } }, { foo: null }); // => { foo: null }
   */
  function mergeObjects(a, b) {
    if (typeof b === 'undefined') {
      return a;
    }

    // Unless we're dealing with two objects, there's no merging to do --
    // just replace a w/ b.
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
      return b;
    }

    var merged = {}, prop;
    for (prop in a) {
      merged[prop] = mergeObjects(a[prop], b[prop]);
    }
    for (prop in b) {
      if (!merged[prop]) {
        merged[prop] = b[prop];
      }
    }
    return merged;
  }

  /**
   * Creates a {@link Sequence} consisting of the keys from this sequence whose
   *     values are functions.
   *
   * @public
   * @aka methods
   * @returns {Sequence} The new sequence.
   *
   * @examples
   * var dog = {
   *   name: "Fido",
   *   breed: "Golden Retriever",
   *   bark: function() { console.log("Woof!"); },
   *   wagTail: function() { console.log("TODO: implement robotic dog interface"); }
   * };
   *
   * Lazy(dog).functions() // sequence: ["bark", "wagTail"]
   */
  ObjectLikeSequence.prototype.functions = function functions() {
    return this
      .filter(function(v, k) { return typeof(v) === "function"; })
      .map(function(v, k) { return k; });
  };

  ObjectLikeSequence.prototype.methods = function methods() {
    return this.functions();
  };

  /**
   * Creates an {@link ObjectLikeSequence} consisting of the key/value pairs from
   * this sequence whose keys are included in the given array of property names.
   *
   * @public
   * @param {Array} properties An array of the properties to "pick" from this
   *     sequence.
   * @returns {ObjectLikeSequence} The new sequence.
   *
   * @examples
   * var players = {
   *   "who": "first",
   *   "what": "second",
   *   "i don't know": "third"
   * };
   *
   * Lazy(players).pick(["who", "what"]) // sequence: { who: "first", what: "second" }
   */
  ObjectLikeSequence.prototype.pick = function pick(properties) {
    return new PickSequence(this, properties);
  };

  /**
   * @constructor
   */
  function PickSequence(parent, properties) {
    this.parent     = parent;
    this.properties = properties;
  }

  PickSequence.prototype = new ObjectLikeSequence();

  PickSequence.prototype.get = function get(key) {
    return arrayContains(this.properties, key) ? this.parent.get(key) : undefined;
  };

  PickSequence.prototype.each = function each(fn) {
    var inArray    = arrayContains,
        properties = this.properties;

    return this.parent.each(function(value, key) {
      if (inArray(properties, key)) {
        return fn(value, key);
      }
    });
  };

  /**
   * Creates an {@link ObjectLikeSequence} consisting of the key/value pairs from
   * this sequence excluding those with the specified keys.
   *
   * @public
   * @param {Array} properties An array of the properties to *omit* from this
   *     sequence.
   * @returns {ObjectLikeSequence} The new sequence.
   *
   * @examples
   * var players = {
   *   "who": "first",
   *   "what": "second",
   *   "i don't know": "third"
   * };
   *
   * Lazy(players).omit(["who", "what"]) // sequence: { "i don't know": "third" }
   */
  ObjectLikeSequence.prototype.omit = function omit(properties) {
    return new OmitSequence(this, properties);
  };

  /**
   * @constructor
   */
  function OmitSequence(parent, properties) {
    this.parent     = parent;
    this.properties = properties;
  }

  OmitSequence.prototype = new ObjectLikeSequence();

  OmitSequence.prototype.get = function get(key) {
    return arrayContains(this.properties, key) ? undefined : this.parent.get(key);
  };

  OmitSequence.prototype.each = function each(fn) {
    var inArray    = arrayContains,
        properties = this.properties;

    return this.parent.each(function(value, key) {
      if (!inArray(properties, key)) {
        return fn(value, key);
      }
    });
  };

  /**
   * Maps the key/value pairs in this sequence to arrays.
   *
   * @public
   * @aka toArray
   * @returns {Sequence} An sequence of `[key, value]` pairs.
   *
   * @examples
   * var colorCodes = {
   *   red: "#f00",
   *   green: "#0f0",
   *   blue: "#00f"
   * };
   *
   * Lazy(colorCodes).pairs() // sequence: [["red", "#f00"], ["green", "#0f0"], ["blue", "#00f"]]
   */
  ObjectLikeSequence.prototype.pairs = function pairs() {
    return this.map(function(v, k) { return [k, v]; });
  };

  /**
   * Creates an array from the key/value pairs in this sequence.
   *
   * @public
   * @returns {Array} An array of `[key, value]` elements.
   *
   * @examples
   * var colorCodes = {
   *   red: "#f00",
   *   green: "#0f0",
   *   blue: "#00f"
   * };
   *
   * Lazy(colorCodes).toArray() // => [["red", "#f00"], ["green", "#0f0"], ["blue", "#00f"]]
   */
  ObjectLikeSequence.prototype.toArray = function toArray() {
    return this.pairs().toArray();
  };

  /**
   * Creates an object with the key/value pairs from this sequence.
   *
   * @public
   * @returns {Object} An object with the same key/value pairs as this sequence.
   *
   * @examples
   * var colorCodes = {
   *   red: "#f00",
   *   green: "#0f0",
   *   blue: "#00f"
   * };
   *
   * Lazy(colorCodes).toObject() // => { red: "#f00", green: "#0f0", blue: "#00f" }
   */
  ObjectLikeSequence.prototype.toObject = function toObject() {
    return this.reduce(function(object, value, key) {
      object[key] = value;
      return object;
    }, {});
  };

  // Now that we've fully initialized the ObjectLikeSequence prototype, we can
  // actually set the prototype for GroupedSequence and CountedSequence.

  GroupedSequence.prototype = new ObjectLikeSequence();

  GroupedSequence.prototype.each = function each(fn) {
    var keyFn   = createCallback(this.keyFn),
        grouped = {};

    this.parent.each(function(e) {
      var key = keyFn(e);
      if (!grouped[key]) {
        grouped[key] = [e];
      } else {
        grouped[key].push(e);
      }
    });

    for (var key in grouped) {
      if (fn(grouped[key], key) === false) {
        return false;
      }
    }

    return true;
  };

  CountedSequence.prototype = new ObjectLikeSequence();

  CountedSequence.prototype.each = function each(fn) {
    var keyFn   = createCallback(this.keyFn),
        counted = {};

    this.parent.each(function(e) {
      var key = keyFn(e);
      if (!counted[key]) {
        counted[key] = 1;
      } else {
        counted[key] += 1;
      }
    });

    for (var key in counted) {
      if (fn(counted[key], key) === false) {
        return false;
      }
    }

    return true;
  };

  /**
   * Watches for all changes to a specified property (or properties) of an
   * object and produces a sequence whose elements have the properties
   * `{ property, value }` indicating which property changed and what it was
   * changed to.
   *
   * Note that this method **only works on directly wrapped objects**; it will
   * *not* work on any arbitrary {@link ObjectLikeSequence}.
   *
   * @public
   * @param {(string|Array)=} propertyNames A property name or array of property
   *     names to watch. If this parameter is `undefined`, all of the object's
   *     current (enumerable) properties will be watched.
   * @returns {Sequence} A sequence comprising `{ property, value }` objects
   *     describing each change to the specified property/properties.
   *
   * @examples
   * var obj = {},
   *     changes = [];
   *
   * Lazy(obj).watch('foo').each(function(change) {
   *   changes.push(change);
   * });
   *
   * obj.foo = 1;
   * obj.bar = 2;
   * obj.foo = 3;
   *
   * obj.foo; // => 3
   * changes; // => [{ property: 'foo', value: 1 }, { property: 'foo', value: 3 }]
   */
  ObjectLikeSequence.prototype.watch = function watch(propertyNames) {
    throw 'You can only call #watch on a directly wrapped object.';
  };

  /**
   * @constructor
   */
  function ObjectWrapper(source) {
    this.source = source;
  }

  ObjectWrapper.prototype = new ObjectLikeSequence();

  ObjectWrapper.prototype.root = function root() {
    return this;
  };

  ObjectWrapper.prototype.get = function get(key) {
    return this.source[key];
  };

  ObjectWrapper.prototype.each = function each(fn) {
    var source = this.source,
        key;

    for (key in source) {
      if (fn(source[key], key) === false) {
        return false;
      }
    }

    return true;
  };

  /**
   * A `StringLikeSequence` represents a sequence of characters.
   *
   * The initial sequence you get by wrapping a string with `Lazy(string)` is a
   * `StringLikeSequence`.
   *
   * All methods of `StringLikeSequence` that conceptually should return
   * something like a string return another `StringLikeSequence`.
   *
   * @public
   * @constructor
   *
   * @examples
   * function upcase(str) { return str.toUpperCase(); }
   *
   * Lazy('foo')               // instanceof Lazy.StringLikeSequence
   * Lazy('foo').toUpperCase() // instanceof Lazy.StringLikeSequence
   * Lazy('foo').reverse()     // instanceof Lazy.StringLikeSequence
   * Lazy('foo').take(2)       // instanceof Lazy.StringLikeSequence
   * Lazy('foo').drop(1)       // instanceof Lazy.StringLikeSequence
   * Lazy('foo').substring(1)  // instanceof Lazy.StringLikeSequence
   *
   * // Note that `map` does not create a `StringLikeSequence` because there's
   * // no guarantee the mapping function will return characters. In the event
   * // you do want to map a string onto a string-like sequence, use
   * // `mapString`:
   * Lazy('foo').map(Lazy.identity)       // instanceof Lazy.ArrayLikeSequence
   * Lazy('foo').mapString(Lazy.identity) // instanceof Lazy.StringLikeSequence
   */
  function StringLikeSequence() {}

  StringLikeSequence.prototype = new ArrayLikeSequence();

  /**
   * Create a new constructor function for a type inheriting from
   * `StringLikeSequence`.
   *
   * @public
   * @param {string|Array.<string>} methodName The name(s) of the method(s) to be
   *     used for constructing the new sequence. The method will be attached to
   *     the `StringLikeSequence` prototype so that it can be chained with any other
   *     methods that return string-like sequences.
   * @param {Object} overrides An object containing function overrides for this
   *     new sequence type. Has the same requirements as
   *     {@link ArrayLikeSequence.define}.
   * @returns {Function} A constructor for a new type inheriting from
   *     `StringLikeSequence`.
   *
   * @examples
   * Lazy.StringLikeSequence.define("zomg", {
   *   length: function() {
   *     return this.parent.length() + "!!ZOMG!!!1".length;
   *   },
   *
   *   get: function(i) {
   *     if (i < this.parent.length()) {
   *       return this.parent.get(i);
   *     }
   *     return "!!ZOMG!!!1".charAt(i - this.parent.length());
   *   }
   * });
   *
   * Lazy('foo').zomg() // sequence: "foo!!ZOMG!!!1"
   */
  StringLikeSequence.define = function define(methodName, overrides) {
    if (!overrides || typeof overrides.get !== 'function') {
      throw "A custom string-like sequence must implement *at least* get!";
    }

    return defineSequenceType(StringLikeSequence, methodName, overrides);
  };

  StringLikeSequence.prototype.value = function value() {
    return this.toString();
  };

  /**
   * Returns an {@link IndexedIterator} that will step over each character in this
   * sequence one by one.
   *
   * @returns {IndexedIterator} The iterator.
   */
  StringLikeSequence.prototype.getIterator = function getIterator() {
    return new CharIterator(this);
  };

  /**
   * @constructor
   */
  function CharIterator(source) {
    this.source = Lazy(source);
    this.index = -1;
  }

  CharIterator.prototype.current = function current() {
    return this.source.charAt(this.index);
  };

  CharIterator.prototype.moveNext = function moveNext() {
    return (++this.index < this.source.length());
  };

  /**
   * Returns the character at the given index of this sequence, or the empty
   * string if the specified index lies outside the bounds of the sequence.
   *
   * @public
   * @param {number} i The index of this sequence.
   * @returns {string} The character at the specified index.
   *
   * @examples
   * Lazy("foo").charAt(0)  // => "f"
   * Lazy("foo").charAt(-1) // => ""
   * Lazy("foo").charAt(10) // => ""
   */
  StringLikeSequence.prototype.charAt = function charAt(i) {
    return this.get(i);
  };

  /**
   * Returns the character code at the given index of this sequence, or `NaN` if
   * the index lies outside the bounds of the sequence.
   *
   * @public
   * @param {number} i The index of the character whose character code you want.
   * @returns {number} The character code.
   *
   * @examples
   * Lazy("abc").charCodeAt(0)  // => 97
   * Lazy("abc").charCodeAt(-1) // => NaN
   * Lazy("abc").charCodeAt(10) // => NaN
   */
  StringLikeSequence.prototype.charCodeAt = function charCodeAt(i) {
    var char = this.charAt(i);
    if (!char) { return NaN; }

    return char.charCodeAt(0);
  };

  /**
   * Returns a {@link StringLikeSequence} comprising the characters from *this*
   * sequence starting at `start` and ending at `stop` (exclusive), or---if
   * `stop` is `undefined`, including the rest of the sequence.
   *
   * @public
   * @param {number} start The index where this sequence should begin.
   * @param {number=} stop The index (exclusive) where this sequence should end.
   * @returns {StringLikeSequence} The new sequence.
   *
   * @examples
   * Lazy("foo").substring(1)      // sequence: "oo"
   * Lazy("foo").substring(-1)     // sequence: "foo"
   * Lazy("hello").substring(1, 3) // sequence: "el"
   * Lazy("hello").substring(1, 9) // sequence: "ello"
   */
  StringLikeSequence.prototype.substring = function substring(start, stop) {
    return new StringSegment(this, start, stop);
  };

  /**
   * @constructor
   */
  function StringSegment(parent, start, stop) {
    this.parent = parent;
    this.start  = Math.max(0, start);
    this.stop   = stop;
  }

  StringSegment.prototype = new StringLikeSequence();

  StringSegment.prototype.get = function get(i) {
    return this.parent.get(i + this.start);
  };

  StringSegment.prototype.length = function length() {
    return (typeof this.stop === "number" ? this.stop : this.parent.length()) - this.start;
  };

  /**
   * An optimized version of {@link Sequence#first} that returns another
   * {@link StringLikeSequence} (or just the first character, if `count` is
   * undefined).
   *
   * @public
   * @examples
   * Lazy('foo').first()                // => 'f'
   * Lazy('fo').first(2)                // sequence: 'fo'
   * Lazy('foo').first(10)              // sequence: 'foo'
   * Lazy('foo').toUpperCase().first()  // => 'F'
   * Lazy('foo').toUpperCase().first(2) // sequence: 'FO'
   */
  StringLikeSequence.prototype.first = function first(count) {
    if (typeof count === "undefined") {
      return this.charAt(0);
    }

    return this.substring(0, count);
  };

  /**
   * An optimized version of {@link Sequence#last} that returns another
   * {@link StringLikeSequence} (or just the last character, if `count` is
   * undefined).
   *
   * @public
   * @examples
   * Lazy('foo').last()                // => 'o'
   * Lazy('foo').last(2)               // sequence: 'oo'
   * Lazy('foo').last(10)              // sequence: 'foo'
   * Lazy('foo').toUpperCase().last()  // => 'O'
   * Lazy('foo').toUpperCase().last(2) // sequence: 'OO'
   */
  StringLikeSequence.prototype.last = function last(count) {
    if (typeof count === "undefined") {
      return this.charAt(this.length() - 1);
    }

    return this.substring(this.length() - count);
  };

  StringLikeSequence.prototype.drop = function drop(count) {
    return this.substring(count);
  };

  /**
   * Finds the index of the first occurrence of the given substring within this
   * sequence, starting from the specified index (or the beginning of the
   * sequence).
   *
   * @public
   * @param {string} substring The substring to search for.
   * @param {number=} startIndex The index from which to start the search.
   * @returns {number} The first index where the given substring is found, or
   *     -1 if it isn't in the sequence.
   *
   * @examples
   * Lazy('canal').indexOf('a')    // => 1
   * Lazy('canal').indexOf('a', 2) // => 3
   * Lazy('canal').indexOf('ana')  // => 1
   * Lazy('canal').indexOf('andy') // => -1
   * Lazy('canal').indexOf('x')    // => -1
   */
  StringLikeSequence.prototype.indexOf = function indexOf(substring, startIndex) {
    return this.toString().indexOf(substring, startIndex);
  };

  /**
   * Finds the index of the last occurrence of the given substring within this
   * sequence, starting from the specified index (or the end of the sequence)
   * and working backwards.
   *
   * @public
   * @param {string} substring The substring to search for.
   * @param {number=} startIndex The index from which to start the search.
   * @returns {number} The last index where the given substring is found, or
   *     -1 if it isn't in the sequence.
   *
   * @examples
   * Lazy('canal').lastIndexOf('a')    // => 3
   * Lazy('canal').lastIndexOf('a', 2) // => 1
   * Lazy('canal').lastIndexOf('ana')  // => 1
   * Lazy('canal').lastIndexOf('andy') // => -1
   * Lazy('canal').lastIndexOf('x')    // => -1
   */
  StringLikeSequence.prototype.lastIndexOf = function lastIndexOf(substring, startIndex) {
    return this.toString().lastIndexOf(substring, startIndex);
  };

  /**
   * Checks if this sequence contains a given substring.
   *
   * @public
   * @param {string} substring The substring to check for.
   * @returns {boolean} Whether or not this sequence contains `substring`.
   *
   * @examples
   * Lazy('hello').contains('ell') // => true
   * Lazy('hello').contains('')    // => true
   * Lazy('hello').contains('abc') // => false
   */
  StringLikeSequence.prototype.contains = function contains(substring) {
    return this.indexOf(substring) !== -1;
  };

  /**
   * Checks if this sequence ends with a given suffix.
   *
   * @public
   * @param {string} suffix The suffix to check for.
   * @returns {boolean} Whether or not this sequence ends with `suffix`.
   *
   * @examples
   * Lazy('foo').endsWith('oo')  // => true
   * Lazy('foo').endsWith('')    // => true
   * Lazy('foo').endsWith('abc') // => false
   */
  StringLikeSequence.prototype.endsWith = function endsWith(suffix) {
    return this.substring(this.length() - suffix.length).toString() === suffix;
  };

  /**
   * Checks if this sequence starts with a given prefix.
   *
   * @public
   * @param {string} prefix The prefix to check for.
   * @returns {boolean} Whether or not this sequence starts with `prefix`.
   *
   * @examples
   * Lazy('foo').startsWith('fo')  // => true
   * Lazy('foo').startsWith('')    // => true
   * Lazy('foo').startsWith('abc') // => false
   */
  StringLikeSequence.prototype.startsWith = function startsWith(prefix) {
    return this.substring(0, prefix.length).toString() === prefix;
  };

  /**
   * Converts all of the characters in this string to uppercase.
   *
   * @public
   * @returns {StringLikeSequence} A new sequence with the same characters as
   *     this sequence, all uppercase.
   *
   * @examples
   * function nextLetter(a) {
   *   return String.fromCharCode(a.charCodeAt(0) + 1);
   * }
   *
   * Lazy('foo').toUpperCase()                       // sequence: 'FOO'
   * Lazy('foo').substring(1).toUpperCase()          // sequence: 'OO'
   * Lazy('abc').mapString(nextLetter).toUpperCase() // sequence: 'BCD'
   */
  StringLikeSequence.prototype.toUpperCase = function toUpperCase() {
    return this.mapString(function(char) { return char.toUpperCase(); });
  };

  /**
   * Converts all of the characters in this string to lowercase.
   *
   * @public
   * @returns {StringLikeSequence} A new sequence with the same characters as
   *     this sequence, all lowercase.
   *
   * @examples
   * function nextLetter(a) {
   *   return String.fromCharCode(a.charCodeAt(0) + 1);
   * }
   *
   * Lazy('FOO').toLowerCase()                       // sequence: 'foo'
   * Lazy('FOO').substring(1).toLowerCase()          // sequence: 'oo'
   * Lazy('ABC').mapString(nextLetter).toLowerCase() // sequence: 'bcd'
   */
  StringLikeSequence.prototype.toLowerCase = function toLowerCase() {
    return this.mapString(function(char) { return char.toLowerCase(); });
  };

  /**
   * Maps the characters of this sequence onto a new {@link StringLikeSequence}.
   *
   * @public
   * @param {Function} mapFn The function used to map characters from this
   *     sequence onto the new sequence.
   * @returns {StringLikeSequence} The new sequence.
   *
   * @examples
   * function upcase(char) { return char.toUpperCase(); }
   *
   * Lazy("foo").mapString(upcase)               // sequence: "FOO"
   * Lazy("foo").mapString(upcase).charAt(0)     // => "F"
   * Lazy("foo").mapString(upcase).charCodeAt(0) // => 70
   * Lazy("foo").mapString(upcase).substring(1)  // sequence: "OO"
   */
  StringLikeSequence.prototype.mapString = function mapString(mapFn) {
    return new MappedStringLikeSequence(this, mapFn);
  };

  /**
   * @constructor
   */
  function MappedStringLikeSequence(parent, mapFn) {
    this.parent = parent;
    this.mapFn  = mapFn;
  }

  MappedStringLikeSequence.prototype = new StringLikeSequence();
  MappedStringLikeSequence.prototype.get = IndexedMappedSequence.prototype.get;
  MappedStringLikeSequence.prototype.length = IndexedMappedSequence.prototype.length;

  /**
   * Returns a copy of this sequence that reads back to front.
   *
   * @public
   *
   * @examples
   * Lazy("abcdefg").reverse() // sequence: "gfedcba"
   */
  StringLikeSequence.prototype.reverse = function reverse() {
    return new ReversedStringLikeSequence(this);
  };

  /**
   * @constructor
   */
  function ReversedStringLikeSequence(parent) {
    this.parent = parent;
  }

  ReversedStringLikeSequence.prototype = new StringLikeSequence();
  ReversedStringLikeSequence.prototype.get = IndexedReversedSequence.prototype.get;
  ReversedStringLikeSequence.prototype.length = IndexedReversedSequence.prototype.length;

  StringLikeSequence.prototype.toString = function toString() {
    return this.join("");
  };

  /**
   * Creates a {@link Sequence} comprising all of the matches for the specified
   * pattern in the underlying string.
   *
   * @public
   * @param {RegExp} pattern The pattern to match.
   * @returns {Sequence} A sequence of all the matches.
   *
   * @examples
   * Lazy("abracadabra").match(/a[bcd]/) // sequence: ["ab", "ac", "ad", "ab"]
   * Lazy("fee fi fo fum").match(/\w+/)  // sequence: ["fee", "fi", "fo", "fum"]
   * Lazy("hello").match(/xyz/)          // sequence: []
   */
  StringLikeSequence.prototype.match = function match(pattern) {
    return new StringMatchSequence(this.source, pattern);
  };

  /**
   * @constructor
   */
  function StringMatchSequence(source, pattern) {
    this.source = source;
    this.pattern = pattern;
  }

  StringMatchSequence.prototype = new Sequence();

  StringMatchSequence.prototype.getIterator = function getIterator() {
    return new StringMatchIterator(this.source, this.pattern);
  };

  /**
   * @constructor
   */
  function StringMatchIterator(source, pattern) {
    this.source  = source;
    this.pattern = cloneRegex(pattern);
  }

  StringMatchIterator.prototype.current = function current() {
    return this.match[0];
  };

  StringMatchIterator.prototype.moveNext = function moveNext() {
    return !!(this.match = this.pattern.exec(this.source));
  };

  /**
   * Creates a {@link Sequence} comprising all of the substrings of this string
   * separated by the given delimiter, which can be either a string or a regular
   * expression.
   *
   * @public
   * @param {string|RegExp} delimiter The delimiter to use for recognizing
   *     substrings.
   * @returns {Sequence} A sequence of all the substrings separated by the given
   *     delimiter.
   *
   * @examples
   * Lazy("foo").split("")                      // sequence: ["f", "o", "o"]
   * Lazy("yo dawg").split(" ")                 // sequence: ["yo", "dawg"]
   * Lazy("bah bah\tblack  sheep").split(/\s+/) // sequence: ["bah", "bah", "black", "sheep"]
   */
  StringLikeSequence.prototype.split = function split(delimiter) {
    return new SplitStringSequence(this.source, delimiter);
  };

  /**
   * @constructor
   */
  function SplitStringSequence(source, pattern) {
    this.source = source;
    this.pattern = pattern;
  }

  SplitStringSequence.prototype = new Sequence();

  SplitStringSequence.prototype.getIterator = function getIterator() {
    if (this.pattern instanceof RegExp) {
      if (this.pattern.source === "" || this.pattern.source === "(?:)") {
        return new CharIterator(this.source);
      } else {
        return new SplitWithRegExpIterator(this.source, this.pattern);
      }
    } else if (this.pattern === "") {
      return new CharIterator(this.source);
    } else {
      return new SplitWithStringIterator(this.source, this.pattern);
    }
  };

  /**
   * @constructor
   */
  function SplitWithRegExpIterator(source, pattern) {
    this.source  = source;
    this.pattern = cloneRegex(pattern);
  }

  SplitWithRegExpIterator.prototype.current = function current() {
    return this.source.substring(this.start, this.end);
  };

  SplitWithRegExpIterator.prototype.moveNext = function moveNext() {
    if (!this.pattern) {
      return false;
    }

    var match = this.pattern.exec(this.source);

    if (match) {
      this.start = this.nextStart ? this.nextStart : 0;
      this.end = match.index;
      this.nextStart = match.index + match[0].length;
      return true;

    } else if (this.pattern) {
      this.start = this.nextStart;
      this.end = undefined;
      this.nextStart = undefined;
      this.pattern = undefined;
      return true;
    }

    return false;
  };

  /**
   * @constructor
   */
  function SplitWithStringIterator(source, delimiter) {
    this.source = source;
    this.delimiter = delimiter;
  }

  SplitWithStringIterator.prototype.current = function current() {
    return this.source.substring(this.leftIndex, this.rightIndex);
  };

  SplitWithStringIterator.prototype.moveNext = function moveNext() {
    if (!this.finished) {
      this.leftIndex = typeof this.leftIndex !== "undefined" ?
        this.rightIndex + this.delimiter.length :
        0;
      this.rightIndex = this.source.indexOf(this.delimiter, this.leftIndex);
    }

    if (this.rightIndex === -1) {
      this.finished = true;
      this.rightIndex = undefined;
      return true;
    }

    return !this.finished;
  };

  /**
   * Wraps a string exposing {@link #match} and {@link #split} methods that return
   * {@link Sequence} objects instead of arrays, improving on the efficiency of
   * JavaScript's built-in `String#split` and `String.match` methods and
   * supporting asynchronous iteration.
   *
   * @param {string} source The string to wrap.
   * @constructor
   */
  function StringWrapper(source) {
    this.source = source;
  }

  StringWrapper.prototype = new StringLikeSequence();

  StringWrapper.prototype.root = function root() {
    return this;
  };

  StringWrapper.prototype.get = function get(i) {
    return this.source.charAt(i);
  };

  StringWrapper.prototype.length = function length() {
    return this.source.length;
  };

  /**
   * A `GeneratedSequence` does not wrap an in-memory colllection but rather
   * determines its elements on-the-fly during iteration according to a generator
   * function.
   *
   * You create a `GeneratedSequence` by calling {@link Lazy.generate}.
   *
   * @public
   * @constructor
   * @param {function(number):*} generatorFn A function which accepts an index
   *     and returns a value for the element at that position in the sequence.
   * @param {number=} length The length of the sequence. If this argument is
   *     omitted, the sequence will go on forever.
   */
  function GeneratedSequence(generatorFn, length) {
    this.get = generatorFn;
    this.fixedLength = length;
  }

  GeneratedSequence.prototype = new Sequence();

  /**
   * Returns the length of this sequence.
   *
   * @public
   * @returns {number} The length, or `undefined` if this is an indefinite
   *     sequence.
   */
  GeneratedSequence.prototype.length = function length() {
    return this.fixedLength;
  };

  /**
   * Iterates over the sequence produced by invoking this sequence's generator
   * function up to its specified length, or, if length is `undefined`,
   * indefinitely (in which case the sequence will go on forever--you would need
   * to call, e.g., {@link Sequence#take} to limit iteration).
   *
   * @public
   * @param {Function} fn The function to call on each output from the generator
   *     function.
   */
  GeneratedSequence.prototype.each = function each(fn) {
    var generatorFn = this.get,
        length = this.fixedLength,
        i = 0;

    while (typeof length === "undefined" || i < length) {
      if (fn(generatorFn(i++)) === false) {
        return false;
      }
    }

    return true;
  };

  GeneratedSequence.prototype.getIterator = function getIterator() {
    return new GeneratedIterator(this);
  };

  /**
   * Iterates over a generated sequence. (This allows generated sequences to be
   * iterated asynchronously.)
   *
   * @param {GeneratedSequence} sequence The generated sequence to iterate over.
   * @constructor
   */
  function GeneratedIterator(sequence) {
    this.sequence     = sequence;
    this.index        = 0;
    this.currentValue = null;
  }

  GeneratedIterator.prototype.current = function current() {
    return this.currentValue;
  };

  GeneratedIterator.prototype.moveNext = function moveNext() {
    var sequence = this.sequence;

    if (typeof sequence.fixedLength === "number" && this.index >= sequence.fixedLength) {
      return false;
    }

    this.currentValue = sequence.get(this.index++);
    return true;
  };

  /**
   * An `AsyncSequence` iterates over its elements asynchronously when
   * {@link #each} is called.
   *
   * You get an `AsyncSequence` by calling {@link Sequence#async} on any
   * sequence. Note that some sequence types may not support asynchronous
   * iteration.
   *
   * Returning values
   * ----------------
   *
   * Because of its asynchronous nature, an `AsyncSequence` cannot be used in the
   * same way as other sequences for functions that return values directly (e.g.,
   * `reduce`, `max`, `any`, even `toArray`).
   *
   * Instead, these methods return an `AsyncHandle` whose `onComplete` method
   * accepts a callback that will be called with the final result once iteration
   * has finished.
   *
   * Defining custom asynchronous sequences
   * --------------------------------------
   *
   * There are plenty of ways to define an asynchronous sequence. Here's one.
   *
   * 1. First, implement an {@link Iterator}. This is an object whose prototype
   *    has the methods {@link Iterator#moveNext} (which returns a `boolean`) and
   *    {@link current} (which returns the current value).
   * 2. Next, create a simple wrapper that inherits from `AsyncSequence`, whose
   *    `getIterator` function returns an instance of the iterator type you just
   *    defined.
   *
   * The default implementation for {@link #each} on an `AsyncSequence` is to
   * create an iterator and then asynchronously call {@link Iterator#moveNext}
   * (using `setImmediate`, if available, otherwise `setTimeout`) until the iterator
   * can't move ahead any more.
   *
   * @public
   * @constructor
   * @param {Sequence} parent A {@link Sequence} to wrap, to expose asynchronous
   *     iteration.
   * @param {number=} interval How many milliseconds should elapse between each
   *     element when iterating over this sequence. If this argument is omitted,
   *     asynchronous iteration will be executed as fast as possible.
   */
  function AsyncSequence(parent, interval) {
    if (parent instanceof AsyncSequence) {
      throw "Sequence is already asynchronous!";
    }

    this.parent         = parent;
    this.interval       = interval;
    this.onNextCallback = getOnNextCallback(interval);
  }

  AsyncSequence.prototype = new Sequence();

  /**
   * Throws an exception. You cannot manually iterate over an asynchronous
   * sequence.
   *
   * @public
   * @example
   * Lazy([1, 2, 3]).async().getIterator() // throws
   */
  AsyncSequence.prototype.getIterator = function getIterator() {
    throw 'An AsyncSequence does not support synchronous iteration.';
  };

  /**
   * An asynchronous version of {@link Sequence#each}.
   *
   * @public
   * @param {Function} fn The function to invoke asynchronously on each element in
   *     the sequence one by one.
   * @returns {AsyncHandle} An {@link AsyncHandle} providing the ability to
   *     cancel the asynchronous iteration (by calling `cancel()`) as well as
   *     supply callback(s) for when an error is encountered (`onError`) or when
   *     iteration is complete (`onComplete`).
   */
  AsyncSequence.prototype.each = function each(fn) {
    var iterator = this.parent.getIterator(),
        onNextCallback = this.onNextCallback,
        i = 0;

    var handle = new AsyncHandle(this.interval);

    handle.id = onNextCallback(function iterate() {
      try {
        if (iterator.moveNext() && fn(iterator.current(), i++) !== false) {
          handle.id = onNextCallback(iterate);

        } else {
          handle.completeCallback();
        }

      } catch (e) {
        handle.errorCallback(e);
      }
    });

    return handle;
  };

  /**
   * An `AsyncHandle` provides control over an {@link AsyncSequence} that is
   * currently (or was) iterating over its elements asynchronously. In
   * particular it provides the ability to {@link AsyncHandle#cancel} the
   * iteration as well as execute a callback when either an error occurs or
   * iteration is complete with {@link AsyncHandle#onError} and
   * {@link AsyncHandle#onComplete}.
   *
   * @public
   * @constructor
   */
  function AsyncHandle(interval) {
    this.cancelCallback = getCancelCallback(interval);
  }

  /**
   * Cancels asynchronous iteration.
   *
   * @public
   */
  AsyncHandle.prototype.cancel = function cancel() {
    var cancelCallback = this.cancelCallback;

    if (this.id) {
      cancelCallback(this.id);
      this.id = null;
    }
  };

  /**
   * Updates the handle with a callback to execute if/when any error is
   * encountered during asynchronous iteration.
   *
   * @public
   * @param {Function} callback The function to call, with any associated error
   *     object, when an error occurs.
   */
  AsyncHandle.prototype.onError = function onError(callback) {
    this.errorCallback = callback;
  };

  AsyncHandle.prototype.errorCallback = Lazy.noop;

  /**
   * Updates the handle with a callback to execute when iteration is completed.
   *
   * @public
   * @param {Function} callback The function to call when the asynchronous
   *     iteration is completed.
   */
  AsyncHandle.prototype.onComplete = function onComplete(callback) {
    this.completeCallback = callback;
  };

  AsyncHandle.prototype.completeCallback = Lazy.noop;

  function getOnNextCallback(interval) {
    if (typeof interval === "undefined") {
      if (typeof setImmediate === "function") {
        return setImmediate;
      }
    }

    interval = interval || 0;
    return function(fn) {
      return setTimeout(fn, interval);
    };
  }

  function getCancelCallback(interval) {
    if (typeof interval === "undefined") {
      if (typeof clearImmediate === "function") {
        return clearImmediate;
      }
    }

    return clearTimeout;
  }

  /**
   * An async version of {@link Sequence#reverse}.
   */
  AsyncSequence.prototype.reverse = function reverse() {
    return this.parent.reverse().async();
  };

  /**
   * A version of {@link Sequence#reduce} which, instead of immediately
   * returning a result (which it can't, obviously, because this is an
   * asynchronous sequence), returns an {@link AsyncHandle} whose `onComplete`
   * method can be called to supply a callback to handle the final result once
   * iteration has completed.
   *
   * @public
   * @param {Function} aggregator The function through which to pass every element
   *     in the sequence. For every element, the function will be passed the total
   *     aggregated result thus far and the element itself, and should return a
   *     new aggregated result.
   * @param {*=} memo The starting value to use for the aggregated result
   *     (defaults to the first element in the sequence).
   * @returns {AsyncHandle} An {@link AsyncHandle} allowing you to cancel
   *     iteration and/or handle errors, with an added `then` method providing
   *     a promise-like thing allowing you to handle the result of aggregation.
   */
  AsyncSequence.prototype.reduce = function reduce(aggregator, memo) {
    var handle = this.each(function(e, i) {
      if (typeof memo === "undefined" && i === 0) {
        memo = e;
      } else {
        memo = aggregator(memo, e, i);
      }
    });

    handle.then = handle.onComplete = function(callback) {
      handle.completeCallback = function() {
        callback(memo);
      };
    };

    return handle;
  };

  /**
   * A version of {@link Sequence#find} which returns a promise-y
   * {@link AsyncHandle}.
   *
   * @public
   * @param {Function} predicate A function to call on (potentially) every element
   *     in the sequence.
   * @returns {AsyncHandle} An {@link AsyncHandle} allowing you to cancel
   *     iteration and/or handle errors, with an added `then` method providing
   *     a promise-like interface to handle the found element, once it is
   *     detected.
   */
  AsyncSequence.prototype.find = function find(predicate) {
    var found;

    var handle = this.each(function(e, i) {
      if (predicate(e, i)) {
        found = e;
        return false;
      }
    });

    handle.then = handle.onComplete = function(callback) {
      handle.completeCallback = function() {
        callback(found);
      };
    };

    return handle;
  };

  /**
   * A version of {@link Sequence#indexOf} which returns a promise-y
   * {@link AsyncHandle}.
   *
   * @public
   * @param {*} value The element to search for in the sequence.
   * @returns {AsyncHandle} An {@link AsyncHandle} with an added `then` method
   *     providing a promise-like interface to handle the found index, once it
   *     is detected, or -1.
   */
  AsyncSequence.prototype.indexOf = function indexOf(value) {
    var foundIndex = -1;

    var handle = this.each(function(e, i) {
      if (e === value) {
        foundIndex = i;
        return false;
      }
    });

    handle.then = handle.onComplete = function(callback) {
      handle.completeCallback = function() {
        callback(foundIndex);
      };
    };

    return handle;
  };

  /**
   * A version of {@link Sequence#contains} which returns a promise-y
   * {@link AsyncHandle}.
   *
   * @public
   * @param {*} value The element to search for in the sequence.
   * @returns {AsyncHandle} An {@link AsyncHandle} with an added `then` method
   *     providing a promise-like interface to handle the result (either `true`
   *     `false` to indicate whether the element was found).
   */
  AsyncSequence.prototype.contains = function contains(value) {
    var found = false;

    var handle = this.each(function(e) {
      if (e === value) {
        found = true;
        return false;
      }
    });

    handle.then = handle.onComplete = function(callback) {
      handle.completeCallback = function() {
        callback(found);
      };
    };

    return handle;
  };

  /**
   * Just return the same sequence for `AsyncSequence#async` (I see no harm in this).
   */
  AsyncSequence.prototype.async = function async() {
    return this;
  };

  /**
   * See {@link ObjectLikeSequence#watch} for docs.
   */
  ObjectWrapper.prototype.watch = function watch(propertyNames) {
    return new WatchedPropertySequence(this.source, propertyNames);
  };

  function WatchedPropertySequence(object, propertyNames) {
    this.listeners = [];

    if (!propertyNames) {
      propertyNames = Lazy(object).keys().toArray();
    } else if (!(propertyNames instanceof Array)) {
      propertyNames = [propertyNames];
    }

    var listeners = this.listeners,
        index     = 0;

    Lazy(propertyNames).each(function(propertyName) {
      var propertyValue = object[propertyName];

      Object.defineProperty(object, propertyName, {
        get: function() {
          return propertyValue;
        },

        set: function(value) {
          for (var i = listeners.length - 1; i >= 0; --i) {
            if (listeners[i]({ property: propertyName, value: value }, index) === false) {
              listeners.splice(i, 1);
            }
          }
          propertyValue = value;
          ++index;
        }
      });
    });
  }

  WatchedPropertySequence.prototype = new AsyncSequence();

  WatchedPropertySequence.prototype.each = function each(fn) {
    this.listeners.push(fn);
  };

  /**
   * A StreamLikeSequence comprises a sequence of 'chunks' of data, which are
   * typically multiline strings.
   *
   * @constructor
   */
  function StreamLikeSequence() {}

  StreamLikeSequence.prototype = new AsyncSequence();

  StreamLikeSequence.prototype.split = function split(delimiter) {
    return new SplitStreamSequence(this, delimiter);
  };

  /**
   * @constructor
   */
  function SplitStreamSequence(parent, delimiter) {
    this.parent    = parent;
    this.delimiter = delimiter;
  }

  SplitStreamSequence.prototype = new Sequence();

  SplitStreamSequence.prototype.each = function each(fn) {
    var delimiter = this.delimiter,
        done      = false,
        i         = 0;

    return this.parent.each(function(chunk) {
      Lazy(chunk).split(delimiter).each(function(piece) {
        if (fn(piece, i++) === false) {
          done = true;
          return false;
        }
      });

      return !done;
    });
  };

  StreamLikeSequence.prototype.lines = function lines() {
    return this.split("\n");
  };

  StreamLikeSequence.prototype.match = function match(pattern) {
    return new MatchedStreamSequence(this, pattern);
  };

  /**
   * @constructor
   */
  function MatchedStreamSequence(parent, pattern) {
    this.parent  = parent;
    this.pattern = cloneRegex(pattern);
  }

  MatchedStreamSequence.prototype = new AsyncSequence();

  MatchedStreamSequence.prototype.each = function each(fn) {
    var pattern = this.pattern,
        done      = false,
        i         = 0;

    return this.parent.each(function(chunk) {
      Lazy(chunk).match(pattern).each(function(match) {
        if (fn(match, i++) === false) {
          done = true;
          return false;
        }
      });

      return !done;
    });
  };

  /**
   * Defines a wrapper for custom {@link StreamLikeSequence}s. This is useful
   * if you want a way to handle a stream of events as a sequence, but you can't
   * use Lazy's existing interface (i.e., you're wrapping an object from a
   * library with its own custom events).
   *
   * This method defines a *factory*: that is, it produces a function that can
   * be used to wrap objects and return a {@link Sequence}. Hopefully the
   * example will make this clear.
   *
   * @public
   * @param {Function} initializer An initialization function called on objects
   *     created by this factory. `this` will be bound to the created object,
   *     which is an instance of {@link StreamLikeSequence}. Use `emit` to
   *     generate data for the sequence.
   * @returns {Function} A function that creates a new {@link StreamLikeSequence},
   *     initializes it using the specified function, and returns it.
   *
   * @example
   * var factory = Lazy.createWrapper(function(eventSource) {
   *   var sequence = this;
   *
   *   eventSource.handleEvent(function(data) {
   *     sequence.emit(data);
   *   });
   * });
   *
   * var eventEmitter = {
   *   triggerEvent: function(data) {
   *     eventEmitter.eventHandler(data);
   *   },
   *   handleEvent: function(handler) {
   *     eventEmitter.eventHandler = handler;
   *   },
   *   eventHandler: function() {}
   * };
   *
   * var events = [];
   *
   * factory(eventEmitter).each(function(e) {
   *   events.push(e);
   * });
   *
   * eventEmitter.triggerEvent('foo');
   * eventEmitter.triggerEvent('bar');
   *
   * events // => ['foo', 'bar']
   */
  Lazy.createWrapper = function createWrapper(initializer) {
    var ctor = function() {
      this.listeners = [];
    };

    ctor.prototype = new StreamLikeSequence();

    ctor.prototype.each = function(listener) {
      this.listeners.push(listener);
    };

    ctor.prototype.emit = function(data) {
      var listeners = this.listeners;

      for (var len = listeners.length, i = len - 1; i >= 0; --i) {
        if (listeners[i](data) === false) {
          listeners.splice(i, 1);
        }
      }
    };

    return function() {
      var sequence = new ctor();
      initializer.apply(sequence, arguments);
      return sequence;
    };
  };

  /**
   * Creates a {@link GeneratedSequence} using the specified generator function
   * and (optionally) length.
   *
   * @public
   * @param {function(number):*} generatorFn The function used to generate the
   *     sequence. This function accepts an index as a parameter and should return
   *     a value for that index in the resulting sequence.
   * @param {number=} length The length of the sequence, for sequences with a
   *     definite length.
   * @returns {GeneratedSequence} The generated sequence.
   *
   * @examples
   * var randomNumbers = Lazy.generate(Math.random);
   * var countingNumbers = Lazy.generate(function(i) { return i + 1; }, 5);
   *
   * randomNumbers          // instanceof Lazy.GeneratedSequence
   * randomNumbers.length() // => undefined
   * countingNumbers          // sequence: [1, 2, 3, 4, 5]
   * countingNumbers.length() // => 5
   */
  Lazy.generate = function generate(generatorFn, length) {
    return new GeneratedSequence(generatorFn, length);
  };

  /**
   * Creates a sequence from a given starting value, up to a specified stopping
   * value, incrementing by a given step.
   *
   * @public
   * @returns {GeneratedSequence} The sequence defined by the given ranges.
   *
   * @examples
   * Lazy.range(3)         // sequence: [0, 1, 2]
   * Lazy.range(1, 4)      // sequence: [1, 2, 3]
   * Lazy.range(2, 10, 2)  // sequence: [2, 4, 6, 8]
   * Lazy.range(5, 1, 2)   // sequence: []
   * Lazy.range(5, 15, -2) // sequence: []
   */
  Lazy.range = function range() {
    var start = arguments.length > 1 ? arguments[0] : 0,
        stop  = arguments.length > 1 ? arguments[1] : arguments[0],
        step  = arguments.length > 2 ? arguments[2] : 1;
    return this.generate(function(i) { return start + (step * i); })
      .take(Math.floor((stop - start) / step));
  };

  /**
   * Creates a sequence consisting of the given value repeated a specified number
   * of times.
   *
   * @public
   * @param {*} value The value to repeat.
   * @param {number=} count The number of times the value should be repeated in
   *     the sequence. If this argument is omitted, the value will repeat forever.
   * @returns {GeneratedSequence} The sequence containing the repeated value.
   *
   * @examples
   * Lazy.repeat("hi", 3)          // sequence: ["hi", "hi", "hi"]
   * Lazy.repeat("young")          // instanceof Lazy.GeneratedSequence
   * Lazy.repeat("young").length() // => undefined
   * Lazy.repeat("young").take(3)  // sequence: ["young", "young", "young"]
   */
  Lazy.repeat = function repeat(value, count) {
    return Lazy.generate(function() { return value; }, count);
  };

  Lazy.Sequence           = Sequence;
  Lazy.ArrayLikeSequence  = ArrayLikeSequence;
  Lazy.ObjectLikeSequence = ObjectLikeSequence;
  Lazy.StringLikeSequence = StringLikeSequence;
  Lazy.StreamLikeSequence = StreamLikeSequence;
  Lazy.GeneratedSequence  = GeneratedSequence;
  Lazy.AsyncSequence      = AsyncSequence;
  Lazy.AsyncHandle        = AsyncHandle;

  /*** Useful utility methods ***/

  /**
   * Marks a method as deprecated, so calling it will issue a console warning.
   */
  Lazy.deprecate = function deprecate(message, fn) {
    return function() {
      console.warn(message);
      return fn.apply(this, arguments);
    };
  };

  var arrayPop   = Array.prototype.pop,
      arraySlice = Array.prototype.slice;

  /**
   * Creates a callback... you know, Lo-Dash style.
   *
   * - for functions, just returns the function
   * - for strings, returns a pluck-style callback
   * - for objects, returns a where-style callback
   *
   * @private
   * @param {Function|string|Object} callback A function, string, or object to
   *     convert to a callback.
   * @param {*} defaultReturn If the callback is undefined, a default return
   *     value to use for the function.
   * @returns {Function} The callback function.
   *
   * @examples
   * createCallback(function() {})                  // instanceof Function
   * createCallback('foo')                          // instanceof Function
   * createCallback('foo')({ foo: 'bar'})           // => 'bar'
   * createCallback({ foo: 'bar' })({ foo: 'bar' }) // => true
   * createCallback({ foo: 'bar' })({ foo: 'baz' }) // => false
   */
  function createCallback(callback, defaultValue) {
    switch (typeof callback) {
      case "function":
        return callback;

      case "string":
        return function(e) {
          return e[callback];
        };

      case "object":
        return function(e) {
          return Lazy(callback).all(function(value, key) {
            return e[key] === value;
          });
        };

      case "undefined":
        return defaultValue ?
          function() { return defaultValue; } :
          Lazy.identity;

      default:
        throw "Don't know how to make a callback from a " + typeof callback + "!";
    }
  }

  /**
   * Creates a Set containing the specified values.
   *
   * @param {...Array} values One or more array(s) of values used to populate the
   *     set.
   * @returns {Set} A new set containing the values passed in.
   */
  function createSet(values) {
    var set = new Set$1();
    Lazy(values || []).flatten().each(function(e) {
      set.add(e);
    });
    return set;
  }

  /**
   * Compares two elements for sorting purposes.
   *
   * @private
   * @param {*} x The left element to compare.
   * @param {*} y The right element to compare.
   * @param {Function=} fn An optional function to call on each element, to get
   *     the values to compare.
   * @returns {number} 1 if x > y, -1 if x < y, or 0 if x and y are equal.
   *
   * @examples
   * compare(1, 2)     // => -1
   * compare(1, 1)     // => 0
   * compare(2, 1)     // => 1
   * compare('a', 'b') // => -1
   */
  function compare(x, y, fn) {
    if (typeof fn === "function") {
      return compare(fn(x), fn(y));
    }

    if (x === y) {
      return 0;
    }

    return x > y ? 1 : -1;
  }

  /**
   * Iterates over every element in an array.
   *
   * @param {Array} array The array.
   * @param {Function} fn The function to call on every element, which can return
   *     false to stop the iteration early.
   * @returns {boolean} True if every element in the entire sequence was iterated,
   *     otherwise false.
   */
  function forEach(array, fn) {
    var i = -1,
        len = array.length;

    while (++i < len) {
      if (fn(array[i], i) === false) {
        return false;
      }
    }

    return true;
  }

  function getFirst(sequence) {
    var result;
    sequence.each(function(e) {
      result = e;
      return false;
    });
    return result;
  }

  /**
   * Checks if an element exists in an array.
   *
   * @private
   * @param {Array} array
   * @param {*} element
   * @returns {boolean} Whether or not the element exists in the array.
   *
   * @examples
   * arrayContains([1, 2], 2)              // => true
   * arrayContains([1, 2], 3)              // => false
   * arrayContains([undefined], undefined) // => true
   * arrayContains([NaN], NaN)             // => true
   */
  function arrayContains(array, element) {
    var i = -1,
        length = array.length;

    // Special handling for NaN
    if (element !== element) {
      while (++i < length) {
        if (array[i] !== array[i]) {
          return true;
        }
      }
      return false;
    }

    while (++i < length) {
      if (array[i] === element) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if an element exists in an array before a given index.
   *
   * @private
   * @param {Array} array
   * @param {*} element
   * @param {number} index
   * @param {Function} keyFn
   * @returns {boolean}
   *
   * @examples
   * arrayContainsBefore([1, 2, 3], 3, 2) // => false
   * arrayContainsBefore([1, 2, 3], 3, 3) // => true
   */
  function arrayContainsBefore(array, element, index, keyFn) {
    var i = -1;

    if (keyFn) {
      keyFn = createCallback(keyFn);
      while (++i < index) {
        if (keyFn(array[i]) === keyFn(element)) {
          return true;
        }
      }

    } else {
      while (++i < index) {
        if (array[i] === element) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Swaps the elements at two specified positions of an array.
   *
   * @private
   * @param {Array} array
   * @param {number} i
   * @param {number} j
   *
   * @examples
   * var array = [1, 2, 3, 4, 5];
   *
   * swap(array, 2, 3) // array == [1, 2, 4, 3, 5]
   */
  function swap(array, i, j) {
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }

  /**
   * "Clones" a regular expression (but makes it always global).
   *
   * @private
   * @param {RegExp|string} pattern
   * @returns {RegExp}
   */
  function cloneRegex(pattern) {
    return eval("" + pattern + (!pattern.global ? "g" : ""));
  }
  /**
   * A collection of unique elements.
   *
   * @private
   * @constructor
   *
   * @examples
   * var set  = new Set(),
   *     obj1 = {},
   *     obj2 = {},
   *     fn1 = function fn1() {},
   *     fn2 = function fn2() {};
   *
   * set.add('foo')            // => true
   * set.add('foo')            // => false
   * set.add(1)                // => true
   * set.add(1)                // => false
   * set.add('1')              // => true
   * set.add('1')              // => false
   * set.add(obj1)             // => true
   * set.add(obj1)             // => false
   * set.add(obj2)             // => true
   * set.add(fn1)              // => true
   * set.add(fn2)              // => true
   * set.add(fn2)              // => false
   * set.contains('__proto__') // => false
   * set.add('__proto__')      // => true
   * set.add('__proto__')      // => false
   * set.contains('add')       // => false
   * set.add('add')            // => true
   * set.add('add')            // => false
   * set.contains(undefined)   // => false
   * set.add(undefined)        // => true
   * set.contains(undefined)   // => true
   * set.contains('undefined') // => false
   * set.add('undefined')      // => true
   * set.contains('undefined') // => true
   * set.contains(NaN)         // => false
   * set.add(NaN)              // => true
   * set.contains(NaN)         // => true
   * set.contains('NaN')       // => false
   * set.add('NaN')            // => true
   * set.contains('NaN')       // => true
   * set.contains('@foo')      // => false
   * set.add('@foo')           // => true
   * set.contains('@foo')      // => true
   */
  function Set$1() {
    this.table   = {};
    this.objects = [];
  }

  /**
   * Attempts to add a unique value to the set.
   *
   * @param {*} value The value to add.
   * @returns {boolean} True if the value was added to the set (meaning an equal
   *     value was not already present), or else false.
   */
  Set$1.prototype.add = function add(value) {
    var table = this.table,
        type  = typeof value,

        // only applies for objects
        objects;

    switch (type) {
      case "number":
      case "boolean":
      case "undefined":
        if (!table[value]) {
          table[value] = true;
          return true;
        }
        return false;

      case "string":
        // Essentially, escape the first character if it could possibly collide
        // with a number, boolean, or undefined (or a string that happens to start
        // with the escape character!), OR if it could override a special property
        // such as '__proto__' or 'constructor'.
        switch (value.charAt(0)) {
          case "_": // e.g., __proto__
          case "f": // for 'false'
          case "t": // for 'true'
          case "c": // for 'constructor'
          case "u": // for 'undefined'
          case "@": // escaped
          case "0":
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7":
          case "8":
          case "9":
          case "N": // for NaN
            value = "@" + value;
        }
        if (!table[value]) {
          table[value] = true;
          return true;
        }
        return false;

      default:
        // For objects and functions, we can't really do anything other than store
        // them in an array and do a linear search for reference equality.
        objects = this.objects;
        if (!arrayContains(objects, value)) {
          objects.push(value);
          return true;
        }
        return false;
    }
  };

  /**
   * Checks whether the set contains a value.
   *
   * @param {*} value The value to check for.
   * @returns {boolean} True if the set contains the value, or else false.
   */
  Set$1.prototype.contains = function contains(value) {
    var type = typeof value;

    switch (type) {
      case "number":
      case "boolean":
      case "undefined":
        return !!this.table[value];

      case "string":
        // Essentially, escape the first character if it could possibly collide
        // with a number, boolean, or undefined (or a string that happens to start
        // with the escape character!), OR if it could override a special property
        // such as '__proto__' or 'constructor'.
        switch (value.charAt(0)) {
          case "_": // e.g., __proto__
          case "f": // for 'false'
          case "t": // for 'true'
          case "c": // for 'constructor'
          case "u": // for 'undefined'
          case "@": // escaped
          case "0":
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7":
          case "8":
          case "9":
          case "N": // for NaN
            value = "@" + value;
        }
        return !!this.table[value];

      default:
        // For objects and functions, we can't really do anything other than store
        // them in an array and do a linear search for reference equality.
        return arrayContains(this.objects, value);
    }
  };

  /**
   * A "rolling" queue, with a fixed capacity. As items are added to the head,
   * excess items are dropped from the tail.
   *
   * @private
   * @constructor
   *
   * @examples
   * var queue = new Queue(3);
   *
   * queue.add(1).toArray()        // => [1]
   * queue.add(2).toArray()        // => [1, 2]
   * queue.add(3).toArray()        // => [1, 2, 3]
   * queue.add(4).toArray()        // => [2, 3, 4]
   * queue.add(5).add(6).toArray() // => [4, 5, 6]
   * queue.add(7).add(8).toArray() // => [6, 7, 8]
   *
   * // also want to check corner cases
   * new Queue(1).add('foo').add('bar').toArray() // => ['bar']
   * new Queue(0).add('foo').toArray()            // => []
   * new Queue(-1)                                // throws
   *
   * @benchmarks
   * function populateQueue(count, capacity) {
   *   var q = new Queue(capacity);
   *   for (var i = 0; i < count; ++i) {
   *     q.add(i);
   *   }
   * }
   *
   * function populateArray(count, capacity) {
   *   var arr = [];
   *   for (var i = 0; i < count; ++i) {
   *     if (arr.length === capacity) { arr.shift(); }
   *     arr.push(i);
   *   }
   * }
   *
   * populateQueue(100, 10); // populating a Queue
   * populateArray(100, 10); // populating an Array
   */
  function Queue(capacity) {
    this.contents = new Array(capacity);
    this.start    = 0;
    this.count    = 0;
  }

  /**
   * Adds an item to the queue, and returns the queue.
   */
  Queue.prototype.add = function add(element) {
    var contents = this.contents,
        capacity = contents.length,
        start    = this.start;

    if (this.count === capacity) {
      contents[start] = element;
      this.start = (start + 1) % capacity;

    } else {
      contents[this.count++] = element;
    }

    return this;
  };

  /**
   * Returns an array containing snapshot of the queue's contents.
   */
  Queue.prototype.toArray = function toArray() {
    var contents = this.contents,
        start    = this.start,
        count    = this.count;

    var snapshot = contents.slice(start, start + count);
    if (snapshot.length < count) {
      snapshot = snapshot.concat(contents.slice(0, count - snapshot.length));
    }

    return snapshot;
  };

  /**
   * Shared base method for defining new sequence types.
   */
  function defineSequenceType(base, name, overrides) {
    /** @constructor */
    var ctor = function ctor() {};

    // Make this type inherit from the specified base.
    ctor.prototype = new base();

    // Attach overrides to the new sequence type's prototype.
    for (var override in overrides) {
      ctor.prototype[override] = overrides[override];
    }

    // Define a factory method that sets the new sequence's parent to the caller
    // and (optionally) applies any additional initialization logic.
    // Expose this as a chainable method so that we can do:
    // Lazy(...).map(...).filter(...).blah(...);
    var factory = function factory() {
      var sequence = new ctor();

      // Every sequence needs a reference to its parent in order to work.
      sequence.parent = this;

      // If a custom init function was supplied, call it now.
      if (sequence.init) {
        sequence.init.apply(sequence, arguments);
      }

      return sequence;
    };

    var methodNames = typeof name === 'string' ? [name] : name;
    for (var i = 0; i < methodNames.length; ++i) {
      base.prototype[methodNames[i]] = factory;
    }

    return ctor;
  }

  /*** Exposing Lazy to the world ***/

//  // For Node.js
//  if (typeof module === "object" && module && module.exports === context) {
//    module.exports = Lazy;
//
//  // For browsers
//  } else {
//    context.Lazy = Lazy;
//  }

//if (!(typeof module === "object" && module && module.exports === this)) {
//    (typeof window != 'undefined' ? window : global).Lazy = this.Lazy;
//}
//Lazy = this.Lazy;

// Generated by CoffeeScript 2.6.0
/*
Copyright (C) 2013, 2021, Bill Burdick, Tiny Concepts: https://github.com/zot/Leisure

(licensed with ZLIB license)

This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
claim that you wrote the original software. If you use this software
in a product, an acknowledgment in the product documentation would be
appreciated but is not required.

2. Altered source versions must be plainly marked as such, and must not be
misrepresented as being the original software.

3. This notice may not be removed or altered from any source distribution.
*/
var ATTR_NAME, DRAWER_NAME, HTML_INFO, HTML_START_NAME, LINK_DESCRIPTION, LINK_HEAD, LINK_INFO, LIST_BOILERPLATE, LIST_CHECK, LIST_CHECK_VALUE, LIST_INFO, LIST_LEVEL, MeatParser, PROPERTY_KEY, PROPERTY_VALUE, RES_NAME, SRC_NAME, _$1, attrHtmlRE, buildHeadlineRE, checkMatch, declRE, endRE, exampleEndRE, exampleStartRE, fullLine, htmlEndRE, htmlStartRE, imagePathRE, inListItem, keywordPropertyRE, leisurePathRE, lineBreakPat, linkRE, listContentOffset, listRE, markupText, markupTypes, meatStart, parseAttr, parseDrawer, parseExample, parseHeadline, parseHtmlBlock, parseKeyword, parseList, parseOrgChunk, parseRestOfMeat, parseResults, parseSrcBlock, parseUnknown, propertyRE, resultsLineRE, simpleRE, srcEndRE, todoKeywords;

_$1 = Lazy;

todoKeywords = ['TODO', 'DONE'];

declRE = /^#\+.*$/m;

buildHeadlineRE = function() {
  return new RegExp(`^(\\*+( +|$))((?:${todoKeywords.join('|')}) *)?(\\[#(A|B|C)\\] *)?([^\\n]*?)(:[\\w@%#:]*: *)?$`, 'm');
};

var HL_LEVEL = 1;

var HL_TODO = 3;

var HL_PRIORITY = 5;

var HL_TEXT = 6;

var HL_TAGS = 7;

var headlineRE = buildHeadlineRE();

var KW_BOILERPLATE = 1;

var KW_NAME = 2;

var KW_INFO = 3;

var keywordRE = /^(#\+([^:\[\n]+)(?:\[.*\] *)?: *)([^\n]*)$/im;

var SRC_BOILERPLATE = 1;

SRC_NAME = 2;

var SRC_INFO = 3;

var srcStartRE = /^(#\+(BEGIN_SRC) +)([^\n]*)$/im;

srcEndRE = /^#\+(END_SRC)( *)$/im;

exampleStartRE = /^#\+BEGIN_EXAMPLE *$/im;

exampleEndRE = /^#\+END_EXAMPLE *$/im;

RES_NAME = 1;

var resultsRE = /^#\+(RESULTS)(?: *\[.*\] *)?: *$/im;

resultsLineRE = /^([:|] .*)(?:\n|$)/i;

DRAWER_NAME = 1;

var drawerRE = /^ *:([^\n:]*): *$/im;

endRE = /^ *:END: *$/im;

PROPERTY_KEY = 1;

PROPERTY_VALUE = 2;

propertyRE = /^ *:([^\n:]+): *([^\n]*)$/img;

LIST_LEVEL = 1;

LIST_BOILERPLATE = 2;

LIST_CHECK = 3;

LIST_CHECK_VALUE = 4;

LIST_INFO = 5;

listRE = /^( *)(- *)(\[( |X)\] +)?(.*)$/m;

// markup characters: * / + = ~ _
//simpleRE = /\B(\*[/+=~\w](.*?[/+=~\w])?\*|\/[*+=~\w](.*?[*+=~\w])?\/|\+[*/=~\w](.*?[*/=~\w])?\+|=[+*/~\w](.*?[+*/~\w])?=|~[=+*/\w](.*?[=+*/\w])?~)(\B|$)|\b_[^_]*\B_(\b|$)/
//simpleRE = /\B(\*[/+=~\S](.*?[/+=~\S])?\*|\/[*+=~\S](.*?[*+=~\S])?\/|\+[*/=~\S](.*?[*/=~\S])?\+|=[+*/~\S](.*?[+*/~\S])?=|~[=+*/\S](.*?[=+*/\S])?~)(\B|$)|\b_[^_]*\B_(\b|$)/
simpleRE = /\B(\*[^\s*]([^*]*[^\s*])?\*|\/[^\s\/]([^\/]*[^\s\/])?\/|\+[^\s+]([^+]*[^\s+])?\+|=[^\s=]([^=]*[^\s=])?=|~[^\s~]([^~]*[^\s~])?~)(\B|$)|\b_[^_]*\B_(\b|$)/;

LINK_HEAD = 1;

LINK_INFO = 2;

LINK_DESCRIPTION = 3;

linkRE = /(\[\[([^\]]*)\])(?:\[([^\]]*)\])?\]/;

htmlStartRE = /^#\+(BEGIN_HTML\b)(.*)$/im;

HTML_START_NAME = 1;

HTML_INFO = 2;

htmlEndRE = /^#\+END_HTML *$/im;

ATTR_NAME = 1;

attrHtmlRE = /^#\+(ATTR_HTML): *$/im;

imagePathRE = /\.(png|jpg|jpeg|gif|svg|tiff|bmp)$/i;

leisurePathRE = /^(?:lounge|leisure):([^\/]*)(?:\/([^\/]*)(?:\/([^\/]*))?)?$/;

keywordPropertyRE = /:([^ ]+)/;

var matchLine = function(txt) {
  var ref;
  if (((ref = txt.match(simpleRE)) != null ? ref.index : void 0) === 0) {
    return false;
  } else {
    return checkMatch(txt, exampleStartRE, 'exampleStart') || checkMatch(txt, exampleEndRE, 'exampleEnd') || checkMatch(txt, srcStartRE, 'srcStart') || checkMatch(txt, srcEndRE, 'srcEnd') || checkMatch(txt, resultsRE, 'results') || checkMatch(txt, attrHtmlRE, 'attr') || checkMatch(txt, keywordRE, 'keyword') || checkMatch(txt, headlineRE, function(m) {
      return `headline-${m[HL_LEVEL].trim().length}`;
    }) || checkMatch(txt, listRE, 'list') || checkMatch(txt, htmlStartRE, 'htmlStart') || checkMatch(txt, htmlEndRE, 'htmlEnd') || checkMatch(txt, declRE, 'unknownDecl');
  }
};

checkMatch = function(txt, pat, result) {
  var m;
  m = txt.match(pat);
  if ((m != null ? m.index : void 0) === 0) {
    if (typeof result === 'string') {
      return result;
    } else {
      return result(m);
    }
  } else {
    return false;
  }
};

var Node$2 = (function() {
  class Node {
    constructor(text1) {
      this.text = text1;
      this.markup = markupText(this.text);
    }

    count() {
      return 1;
    }

    length() {
      return this.text.length;
    }

    end() {
      return this.offset + this.text.length;
    }

    toJson() {
      return JSON.stringify(this.toJsonObject(), null, '  ');
    }

    toJsonObject() {
      var obj;
      obj = this.jsonDef();
      obj.nodeId = this.nodeId;
      return obj;
    }

    allText() {
      return this.text;
    }

    findNodeAt(pos) {
      if (this.offset <= pos && pos < this.offset + this.text.length) {
        return this;
      } else {
        return null;
      }
    }

    scan(func) {
      return func(this);
    }

    scanWithChildren(func) {
      var c, i, len, ref, results;
      func(this);
      ref = this.children;
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        c = ref[i];
        results.push(c.scan(func));
      }
      return results;
    }

    linkNodes() {
      return this;
    }

    linkChild(child) {
      child.linkNodes();
      return child.linkTo(this);
    }

    linkChildren() {
      var c, i, len, prev, ref;
      prev = null;
      ref = this.children;
      for (i = 0, len = ref.length; i < len; i++) {
        c = ref[i];
        if (prev) {
          prev.next = c;
        }
        this.linkChild(c);
        c.prev = prev;
        prev = c;
      }
      return this;
    }

    contains(node) {
      var ref;
      while (node) {
        if (node === this) {
          return true;
        }
        node = (ref = node.fragment) != null ? ref : node.parent;
      }
      return false;
    }

    top() {
      if (!this.parent) {
        return this;
      } else {
        return this.parent.top();
      }
    }

    toString() {
      return this.toJson();
    }

    allTags() {
      var ref, ref1;
      return (ref = (ref1 = this.parent) != null ? ref1.allTags() : void 0) != null ? ref : [];
    }

    allProperties() {
      var ref, ref1;
      return (ref = (ref1 = this.parent) != null ? ref1.allProperties() : void 0) != null ? ref : {};
    }

    linkTo(parent1) {
      this.parent = parent1;
    }

    fixOffsets(newOff) {
      this.offset = newOff;
      if (this.children) {
        return this.fixChildrenOffsets();
      } else {
        return newOff + this.allText().length;
      }
    }

    fixChildrenOffsets() {
      var child, i, len, offset, ref;
      offset = this.offset + this.text.length;
      ref = this.children;
      for (i = 0, len = ref.length; i < len; i++) {
        child = ref[i];
        offset = child.fixOffsets(offset);
      }
      return offset;
    }

    inNewMeat() {
      return false;
    }

    getRightmostDescendent() {
      var child, ref;
      child = this;
      while ((ref = child.children) != null ? ref.length : void 0) {
        child = child.children[child.children.length - 1];
      }
      return child;
    }

    getLeftmostDescendent() {
      var child, ref;
      child = this;
      while ((ref = child.children) != null ? ref.length : void 0) {
        child = child.children[0];
      }
      return child;
    }

    getPrecedingNode() {
      var parent, ref;
      if (this.prev) {
        return this.prev.getRightmostDescendent();
      } else if (parent = (ref = this.fragment) != null ? ref : this.parent) {
        if (parent.children[0] === this) {
          return parent;
        }
        return parent.children[parent.children.indexOf(this) - 1].getRightmostDescendent();
      }
    }

    getFollowingNode() {
      var parent, ref;
      if (this.next) {
        return this.next.getLeftmostDescendent();
      } else if (parent = (ref = this.fragment) != null ? ref : this.parent) {
        if (parent.children[parent.children.length - 1] === this) {
          return parent;
        }
        return parent.children[parent.children.indexOf(this) + 1].getLeftmostDescendent();
      }
    }

  }
  Node.prototype.block = false;

  Node.prototype.next = null;

  Node.prototype.prev = null;

  return Node;

}).call(undefined);

var Headline$1 = (function() {
  class Headline extends Node$2 {
    constructor(text, level1, todo1, priority1, tags1, children1, offset1) {
      super(text);
      this.level = level1;
      this.todo = todo1;
      this.priority = priority1;
      this.tags = tags1;
      this.children = children1;
      this.offset = offset1;
      this.properties = {};
    }

    count() {
      var count, i, len, node, ref;
      count = 1;
      ref = this.children;
      for (i = 0, len = ref.length; i < len; i++) {
        node = ref[i];
        count += node.count();
      }
      return count;
    }

    lowerThan(l) {
      return l < this.level;
    }

    length() {
      return this.end() - this.offset;
    }

    end() {
      var lastChild;
      if (this.children.length) {
        lastChild = this.children[this.children.length - 1];
        return lastChild.offset + lastChild.length();
      } else {
        return super.end();
      }
    }

    jsonDef() {
      var c;
      return {
        type: this.type,
        text: this.text,
        offset: this.offset,
        level: this.level,
        todo: this.todo,
        priority: this.priority,
        tags: this.tags,
        children: (function() {
          var i, len, ref, results;
          ref = this.children;
          results = [];
          for (i = 0, len = ref.length; i < len; i++) {
            c = ref[i];
            results.push(c.toJsonObject());
          }
          return results;
        }).call(this),
        properties: this.properties
      };
    }

    allText() {
      var c;
      return this.text + ((function() {
        var i, len, ref, results;
        ref = this.children;
        results = [];
        for (i = 0, len = ref.length; i < len; i++) {
          c = ref[i];
          results.push(c.allText());
        }
        return results;
      }).call(this)).join('');
    }

    findNodeAt(pos) {
      var child, i, len, ref, res;
      if (pos < this.offset || this.offset + this.length() < pos) {
        return null;
      } else if (pos < this.offset + this.text.length) {
        return this;
      } else {
        ref = this.children;
        // could binary search this
        for (i = 0, len = ref.length; i < len; i++) {
          child = ref[i];
          if (res = child.findNodeAt(pos)) {
            return res;
          }
        }
        return null;
      }
    }

    linkNodes() {
      return this.linkChildren();
    }

    addTags(set) {
      var i, len, ref, tag;
      ref = parseTags(this.tags);
      for (i = 0, len = ref.length; i < len; i++) {
        tag = ref[i];
        set[tag] = true;
      }
      return set;
    }

    addProperties(props) {
      return Object.assign(props, this.properties);
    }

    addAllTags() {
      var ref;
      return this.addTags(((ref = this.parent) != null ? ref.addAllTags() : void 0) || {});
    }

    allProperties() {
      var ref;
      return this.addProperties(((ref = this.parent) != null ? ref.allProperties() : void 0) || {});
    }

    allTags() {
      return _$1.keys(this.addAllTags());
    }

    parts() {
      var m, ref, ref1, ref2, ref3, ref4;
      m = this.text.match(headlineRE);
      return {
        level: ((ref = m[HL_LEVEL]) != null ? ref : '').trim().length,
        stars: (ref1 = m[HL_LEVEL]) != null ? ref1 : '',
        todo: (ref2 = m[HL_TODO]) != null ? ref2 : '',
        priority: (ref3 = m[HL_PRIORITY]) != null ? ref3 : '',
        text: m[HL_TEXT],
        tags: (ref4 = m[HL_TAGS]) != null ? ref4 : ''
      };
    }

    partOffsets() {
      var addPart, m, pos, ref, ref1, ref2, ref3, ret;
      m = this.text.match(headlineRE);
      pos = 0;
      ret = {};
      addPart = function(name, text) {
        ret[name] = {
          start: pos,
          end: pos + text.length
        };
        return pos += text.length;
      };
      addPart('stars', (ref = m[HL_LEVEL]) != null ? ref : '');
      addPart('todo', (ref1 = m[HL_TODO]) != null ? ref1 : '');
      addPart('priority', (ref2 = m[HL_PRIORITY]) != null ? ref2 : '');
      addPart('text', m[HL_TEXT]);
      addPart('tags', (ref3 = m[HL_TAGS]) != null ? ref3 : '');
      return ret;
    }

  }
  Headline.prototype.block = true;

  Headline.prototype.type = 'headline';

  Headline.prototype.scan = Node$2.prototype.scanWithChildren;

  return Headline;

}).call(undefined);

var Fragment$1 = (function() {
  class Fragment extends Node$2 {
    constructor(offset1, children1) {
      super('');
      this.offset = offset1;
      this.children = children1;
    }

    count() {
      var count, i, len, node, ref;
      count = 1;
      ref = this.children;
      for (i = 0, len = ref.length; i < len; i++) {
        node = ref[i];
        count += node.count();
      }
      return count;
    }

    end() {
      var lastChild;
      if (this.children.length) {
        lastChild = this.children[this.children.length - 1];
        return lastChild.offset + lastChild.length();
      } else {
        return super.end();
      }
    }

    length() {
      return this.end() - this.offset;
    }

    jsonDef() {
      var c;
      return {
        type: this.type,
        offset: this.offset,
        children: (function() {
          var i, len, ref, results;
          ref = this.children;
          results = [];
          for (i = 0, len = ref.length; i < len; i++) {
            c = ref[i];
            results.push(c.toJsonObject());
          }
          return results;
        }).call(this)
      };
    }

    allText() {
      var c;
      return this.text + ((function() {
        var i, len, ref, results;
        ref = this.children;
        results = [];
        for (i = 0, len = ref.length; i < len; i++) {
          c = ref[i];
          results.push(c.allText());
        }
        return results;
      }).call(this)).join('');
    }

    findNodeAt(pos) {
      var child, i, len, ref, res;
      if (pos < this.offset || this.offset + this.length() < pos) {
        return null;
      } else if (pos < this.offset + this.text.length) {
        return this;
      } else {
        ref = this.children;
        // could binary search this
        for (i = 0, len = ref.length; i < len; i++) {
          child = ref[i];
          if (res = child.findNodeAt(pos)) {
            return res;
          }
        }
        return null;
      }
    }

    linkNodes() {
      return this.linkChildren();
    }

    linkChild(child) {
      child.fragment = this;
      return super.linkChild(child);
    }

    linkTo(parent) {
      var c, i, len, ref, results;
      if (this.children.length) {
        this.children[0].prev = this.prev;
        this.children[this.children.length - 1].next = this.next;
        ref = this.children;
        results = [];
        for (i = 0, len = ref.length; i < len; i++) {
          c = ref[i];
          results.push(c.linkTo(parent));
        }
        return results;
      }
    }

  }
  Fragment.prototype.block = true;

  Fragment.prototype.type = 'fragment';

  return Fragment;

}).call(undefined);

var Meat = (function() {
  class Meat extends Node$2 {
    constructor(text, offset1) {
      super(text);
      this.offset = offset1;
    }

    lowerThan(l) {
      return true;
    }

    jsonDef() {
      return {
        type: this.type,
        text: this.text,
        offset: this.offset
      };
    }

    inNewMeat() {
      var cur, i, len, m, meat, t;
      meat = [];
      cur = this;
      while (cur && !(cur instanceof Headline$1 || inListItem(cur))) {
        meat.push(cur);
        cur = cur.getPrecedingNode();
      }
      meat.reverse();
      t = '';
      for (i = 0, len = meat.length; i < len; i++) {
        m = meat[i];
        t += m.allText();
      }
      return t.match(meatStart);
    }

  }
  Meat.prototype.type = 'meat';

  return Meat;

}).call(undefined);

inListItem = function(org) {
  var ref;
  return org && (org instanceof ListItem || inListItem((ref = org.fragment) != null ? ref : org.parent));
};

meatStart = /^\S|\n\n\S/;

markupTypes = {
  '*': 'bold',
  '/': 'italic',
  '_': 'underline',
  '=': 'verbatim',
  '~': 'code',
  '+': 'strikethrough'
};

var SimpleMarkup$1 = (function() {
  //* bold, / italic, _ underline, = verbatim, ~ code, + strikethrough
  class SimpleMarkup extends Meat {
    constructor(text, offset, children1) {
      super(text, offset);
      this.children = children1;
      this.markupType = markupTypes[this.text[0]];
    }

    count() {
      var count, i, len, node, ref;
      count = 1;
      ref = this.children;
      for (i = 0, len = ref.length; i < len; i++) {
        node = ref[i];
        count += node.count();
      }
      return count;
    }

    linkNodes() {
      return this.linkChildren();
    }

    jsonDef() {
      var c;
      return {
        type: this.type,
        text: this.text,
        offset: this.offset,
        markupType: this.markupType,
        children: (function() {
          var i, len, ref, results;
          ref = this.children;
          results = [];
          for (i = 0, len = ref.length; i < len; i++) {
            c = ref[i];
            results.push(c.toJsonObject());
          }
          return results;
        }).call(this)
      };
    }

  }
  SimpleMarkup.prototype.type = 'simple';

  SimpleMarkup.prototype.scan = Node$2.prototype.scanWithChildren;

  return SimpleMarkup;

}).call(undefined);

var Link = (function() {
  class Link extends Meat {
    constructor(text, offset, path, children1) {
      super(text, offset);
      this.path = path;
      this.children = children1;
    }

    count() {
      var count, i, len, node, ref;
      count = 1;
      ref = this.children;
      for (i = 0, len = ref.length; i < len; i++) {
        node = ref[i];
        count += node.count();
      }
      return count;
    }

    jsonDef() {
      var c;
      return {
        type: this.type,
        text: this.text,
        offset: this.offset,
        path: this.path,
        children: (function() {
          var i, len, ref, results;
          ref = this.children;
          results = [];
          for (i = 0, len = ref.length; i < len; i++) {
            c = ref[i];
            results.push(c.toJsonObject());
          }
          return results;
        }).call(this)
      };
    }

    isImage() {
      return this.path.match(imagePathRE);
    }

    isLeisure() {
      return this.path.match(leisurePathRE);
    }

    descriptionText() {
      var child;
      return ((function() {
        var i, len, ref, results;
        ref = this.children;
        results = [];
        for (i = 0, len = ref.length; i < len; i++) {
          child = ref[i];
          results.push(child.allText());
        }
        return results;
      }).call(this)).join(' ');
    }

  }
  Link.prototype.type = 'link';

  Link.prototype.scan = Node$2.prototype.scanWithChildren;

  return Link;

}).call(undefined);

var ListItem = (function() {
  class ListItem extends Meat {
    constructor(text, offset, level1, checked, contentOffset1, children1) {
      super(text, offset);
      this.level = level1;
      this.checked = checked;
      this.contentOffset = contentOffset1;
      this.children = children1;
    }

    count() {
      var count, i, len, node, ref;
      count = 1;
      ref = this.children;
      for (i = 0, len = ref.length; i < len; i++) {
        node = ref[i];
        count += node.count();
      }
      return count;
    }

    linkNodes() {
      return this.linkChildren();
    }

    jsonDef() {
      var child, obj;
      obj = {
        type: this.type,
        text: this.text,
        level: this.level,
        offset: this.offset,
        contentOffset: this.contentOffset,
        children: (function() {
          var i, len, ref, results;
          ref = this.children;
          results = [];
          for (i = 0, len = ref.length; i < len; i++) {
            child = ref[i];
            results.push(child.toJsonObject());
          }
          return results;
        }).call(this)
      };
      if (this.checked != null) {
        obj.checked = this.checked;
      }
      return obj;
    }

    getParent() {
      var li;
      if (this.level === 0) ;
      li = this;
      while (li = li.getPreviousListItem()) {
        if (li.level < this.level) {
          return li;
        }
      }
    }

    getPreviousListItem() {
      var cur, parent, ref;
      parent = this.fragment || this.parent;
      cur = this;
      while (cur = cur.getPrecedingNode()) {
        if (!(parent.contains(cur)) || cur.inNewMeat()) {
          return null;
        }
        if (((ref = cur.fragment) != null ? ref : cur.parent) === parent && cur instanceof ListItem) {
          return cur;
        }
      }
      return null;
    }

    getNextListItem() {
      var cur, parent, ref;
      parent = this.fragment || this.parent;
      cur = this;
      while (cur = cur.getFollowingNode()) {
        if (!(parent.contains(cur)) || cur.inNewMeat()) {
          return null;
        }
        if (((ref = cur.fragment) != null ? ref : cur.parent) === parent && cur instanceof ListItem) {
          return cur;
        }
      }
      return null;
    }

    inNewMeat() {
      return true;
    }

  }
  ListItem.prototype.type = 'list';

  ListItem.prototype.scan = Node$2.prototype.scanWithChildren;

  return ListItem;

}).call(undefined);

var Drawer = (function() {
  class Drawer extends Meat {
    constructor(text, offset, name1, contentPos1, endPos) {
      super(text, offset);
      this.name = name1;
      this.contentPos = contentPos1;
      this.endPos = endPos;
    }

    jsonDef() {
      return {
        type: this.type,
        name: this.name,
        text: this.text,
        offset: this.offset,
        contentPos: this.contentPos,
        endPos: this.endPos
      };
    }

    leading() {
      return this.text.substring(0, this.contentPos);
    }

    content() {
      return this.text.substring(this.contentPos, this.endPos);
    }

    trailing() {
      return this.text.substring(this.endPos);
    }

    isProperties() {
      return this.name.toLowerCase() === 'properties';
    }

    properties() {
      var m, props, ref;
      props = {};
      if (this.isProperties()) {
        while (m = propertyRE.exec(this.text.substring(this.contentPos, this.endPos))) {
          props[m[PROPERTY_KEY]] = ((ref = m[PROPERTY_VALUE]) != null ? ref : '').trim();
        }
      }
      return props;
    }

    //name: ->
    //  n = @leading().trim()
    //  n.substring 1, n.length - 1
    linkTo(node) {
      super.linkTo(node);
      if (this.isProperties()) {
        if (!(node instanceof Headline$1) && !(node instanceof Fragment$1)) {
          return console.log("WARNING: Drawer's parent is not a Headline'");
        } else {
          if (!node.properties) {
            node.properties = {};
          }
          return Object.assign(node.properties, this.properties());
        }
      }
    }

  }
  Drawer.prototype.type = 'drawer';

  return Drawer;

}).call(undefined);

var Example = (function() {
  class Example extends Meat {
    constructor(text, offset, contentPos1, contentLength1) {
      super(text, offset);
      this.contentPos = contentPos1;
      this.contentLength = contentLength1;
    }

    jsonDef() {
      return {
        type: this.type,
        text: this.text,
        offset: this.offset,
        contentPos: this.contentPos,
        contentLength: this.contentLength
      };
    }

    exampleText() {
      return this.text.substring(this.contentPos, this.contentPos + this.contentLength);
    }

  }
  Example.prototype.block = true;

  Example.prototype.type = 'example';

  return Example;

}).call(undefined);

var Keyword = (function() {
  class Keyword extends Meat {
    constructor(text, offset, name1, info1) {
      super(text, offset);
      this.name = name1;
      this.info = info1;
    }

    jsonDef() {
      return {
        type: this.type,
        text: this.text,
        offset: this.offset,
        name: this.name,
        info: this.info
      };
    }

    attributes() {
      return parseCodeAttributes(this.info);
    }

    lead() {
      return _$1(this.info.split(keywordPropertyRE)).first();
    }

  }
  Keyword.prototype.block = true;

  Keyword.prototype.type = 'keyword';

  return Keyword;

}).call(undefined);

var parseCodeAttributes = function(attrText) {
  var attr, i, k, len, o, ref, v;
  o = _$1(attrText.split(keywordPropertyRE)).drop(1).map(function(str) {
    return str.trim();
  });
  if (o.isEmpty()) {
    return null;
  } else {
    attr = {};
    ref = o.chunk(2).toArray();
    for (i = 0, len = ref.length; i < len; i++) {
      [k, v] = ref[i];
      if (attr[k]) {
        if (!(attr[k] instanceof Array)) {
          attr[k] = [attr[k]];
        }
        attr[k].push(v);
      } else {
        attr[k] = v;
      }
    }
    return attr;
  }
};

var Source$1 = (function() {
  class Source extends Keyword {
    constructor(text, offset, name, info, infoPos1, content, contentPos1) {
      super(text, offset, name, info);
      this.infoPos = infoPos1;
      this.content = content;
      this.contentPos = contentPos1;
    }

    getLanguage() {
      var ref;
      return (ref = this.lead()) != null ? ref.trim().toLowerCase() : void 0;
    }

    jsonDef() {
      return {
        type: this.type,
        text: this.text,
        offset: this.offset,
        name: this.name,
        info: this.info,
        infoPos: this.infoPos,
        content: this.content,
        contentPos: this.contentPos,
        contentLength: this.content.length
      };
    }

  }
  Source.prototype.type = 'source';

  return Source;

}).call(undefined);

var HTML = (function() {
  class HTML extends Keyword {
    constructor(text, offset, name, contentPos1, contentLength1, info) {
      super(text, offset, name, info);
      this.contentPos = contentPos1;
      this.contentLength = contentLength1;
    }

    leading() {
      return this.text.substring(0, this.contentPos);
    }

    trailing() {
      return this.text.substring(this.contentPos + this.contentLength);
    }

    content() {
      return this.text.substring(this.contentPos, this.contentPos + this.contentLength);
    }

    jsonDef() {
      return {
        type: this.type,
        info: this.info || '',
        text: this.text,
        offset: this.offset,
        contentPos: this.contentPos,
        contentLength: this.contentLength
      };
    }

  }
  HTML.prototype.type = 'html';

  return HTML;

}).call(undefined);

var Results$1 = (function() {
  class Results extends Keyword {
    constructor(text, offset, name, contentPos1) {
      super(text, offset, name);
      this.contentPos = contentPos1;
    }

    content() {
      return this.text.substring(this.contentPos);
    }

    jsonDef() {
      return {
        type: this.type,
        text: this.text,
        offset: this.offset,
        name: this.name,
        contentPos: this.contentPos
      };
    }

  }
  Results.prototype.type = 'results';

  return Results;

}).call(undefined);

var AttrHtml = (function() {
  class AttrHtml extends Keyword {
    constructor(text, offset, name, contentPos1) {
      super(text, offset, name);
      this.contentPos = contentPos1;
    }

    jsonDef() {
      return {
        type: this.type,
        text: this.text,
        offset: this.offset,
        name: this.name,
        contentPos: this.contentPos
      };
    }

  }
  AttrHtml.prototype.type = 'attr';

  return AttrHtml;

}).call(undefined);

var UnknownDeclaration = (function() {
  class UnknownDeclaration extends Meat {
    constructor(text, offset) {
      super(text, offset);
    }

    jsonDef() {
      return {
        type: this.type,
        text: this.text,
        offset: this.offset
      };
    }

  }
  UnknownDeclaration.prototype.type = 'unknown';

  return UnknownDeclaration;

}).call(undefined);

var nextOrgNode = function(node) {
  var up;
  up = false;
  while (node) {
    if (node.children && !up && node.children.length) {
      return node.children[0];
    } else if (node.next) {
      return node.next;
    } else {
      up = true;
      node = node.parent;
    }
  }
  return null;
};


// Parse the content of an orgmode file

var parseOrgMode$1 = function(text, offset, useFragment) {
  var res, rest;
  if (text instanceof Node$2) {
    return text;
  } else {
    [res, rest] = parseHeadline('', offset != null ? offset : 0, 0, void 0, void 0, void 0, text, text.length);
    if (rest.length) {
      throw new Error(`Text left after parsing: ${rest}`);
    }
    if (useFragment) {
      if (res.children.length === 1) {
        res = res.children[0];
      } else if (res.children.length > 1) {
        res = new Fragment$1(res.offset, res.children);
      }
    }
    return res.linkNodes();
  }
};

parseHeadline = function(text, offset, level, todo, priority, tags, rest, totalLen) {
  var child, children, oldRest, originalRest;
  children = [];
  originalRest = rest;
  while (true) {
    oldRest = rest;
    [child, rest] = parseOrgChunk(rest, originalRest.length - rest.length + offset, level);
    if (!child) {
      break;
    }
    if (child.lowerThan(level)) {
      while (child) {
        children.push(child);
        child = child.next;
      }
    } else {
      rest = oldRest;
    }
  }
  return [new Headline$1(text, level, todo, priority, tags || '', children, offset), rest];
};

var parseTags = function(text) {
  var i, len, ref, t, tagArray;
  tagArray = [];
  ref = (text ? text.split(':') : []);
  for (i = 0, len = ref.length; i < len; i++) {
    t = ref[i];
    if (t) {
      tagArray.push(t);
    }
  }
  return tagArray;
};

fullLine = function(match, text) {
  return text.substring(match.index, match.index + match[0].length + (text[match.index + match[0].length] === '\n' ? 1 : 0));
};

parseOrgChunk = function(text, offset, level) {
  var l, line, m, meat, meatLen, ref, simple;
  if (!text) {
    return [null, text];
  } else {
    m = text.match(headlineRE);
    simple = ((ref = text.match(simpleRE)) != null ? ref.index : void 0) === 0;
    if ((m != null ? m.index : void 0) === 0 && !simple) {
      if (m[HL_LEVEL].trim().length <= level) {
        return [null, text];
      } else {
        line = fullLine(m, text);
        return parseHeadline(line, offset, m[HL_LEVEL].trim().length, m[HL_TODO], m[HL_PRIORITY], m[HL_TAGS], text.substring(line.length), offset + text.length);
      }
    } else {
      if ((m != null ? m.index : void 0) === 0 && simple && (l = text.indexOf('\n')) > -1 && (m = text.substring(l).match(headlineRE))) {
        meatLen = m.index + l;
      } else {
        meatLen = m && (m.index > 0 || !simple) ? m.index : text.length;
      }
      meat = text.substring(0, meatLen);
      return parseMeat(meat, offset, text.substring(meatLen), false);
    }
  }
};

MeatParser = class MeatParser {
  constructor() {}

  checkPat(pattern, cont) {
    var line, match;
    if (!this.result && (match = this.meat.match(pattern))) {
      if (match.index === 0) {
        line = fullLine(match, this.meat);
        return this.result = cont(line, this.meat.substring(line.length) + this.rest, match);
      } else {
        return this.minLen = Math.min(this.minLen, match.index);
      }
    }
  }

  parse(meat, offset, rest, singleLine) {
    var m, meatText, newline;
    this.meat = meat;
    this.rest = rest;
    this.minLen = meat.length + offset;
    this.result = null;
    if (!this.singleLine) {
      this.checkPat(resultsRE, function(line, newRest) {
        return parseResults(line, offset, newRest);
      });
      this.checkPat(attrHtmlRE, function(line, newRest) {
        return parseAttr(line, offset, newRest);
      });
      this.checkPat(srcStartRE, function(line, newRest, srcStart) {
        return parseSrcBlock(line, offset, srcStart[SRC_INFO], srcStart[SRC_BOILERPLATE].length, newRest);
      });
      this.checkPat(htmlStartRE, function(line, newRest, html) {
        return parseHtmlBlock(line, offset, newRest, html);
      });
      this.checkPat(keywordRE, function(line, newRest, keyword) {
        return parseKeyword(keyword, line, offset, keyword[KW_NAME], keyword[KW_INFO], newRest);
      });
      this.checkPat(listRE, function(line, newRest, list) {
        var ref, ref1;
        return parseList(list, line, offset, (ref = (ref1 = list[LIST_LEVEL]) != null ? ref1.length : void 0) != null ? ref : 0, list[LIST_CHECK_VALUE], list[LIST_INFO], newRest);
      });
      this.checkPat(exampleStartRE, function(line, newRest, start) {
        var end;
        if ((end = newRest.match(declRE)) && end[0].match(exampleEndRE)) {
          return parseExample(line, offset, start, end, newRest);
        }
      });
      this.checkPat(drawerRE, function(line, newRest, drawer) {
        var end;
        if (end = newRest.match(endRE)) {
          return parseDrawer(line, drawer[DRAWER_NAME], offset, end, newRest);
        }
      });
      this.checkPat(declRE, function(line, newRest) {
        return parseUnknown(line, offset, newRest);
      });
    }
    if (this.result) {
      return this.result;
    } else {
      this.checkPat(simpleRE, function(line, newRest, simple) {
        var child, children, inside, insideOffset;
        inside = simple[0].substring(1, simple[0].length - 1);
        insideOffset = offset + 1;
        children = [];
        while (inside) {
          [child, inside] = parseMeat(inside, insideOffset, '', true);
          while (child) {
            children.push(child);
            insideOffset = child.offset + child.text.length;
            child = child.next;
          }
        }
        return new SimpleMarkup$1(simple[0], offset, children);
      });
      this.checkPat(linkRE, function(line, newRest, link) {
        var child, children, inside, insideOffset;
        inside = link[LINK_DESCRIPTION];
        insideOffset = offset + link[LINK_HEAD].length;
        children = [];
        while (inside) {
          [child, inside] = parseMeat(inside, insideOffset, '', true);
          while (child) {
            children.push(child);
            insideOffset = child.offset + child.text.length;
            child = child.next;
          }
        }
        return new Link(link[0], offset, link[LINK_INFO], children);
      });
      if (!this.result) {
        if (newline = meat.substring(0, 2) === '\n\n') {
          meatText = meat.substring(2);
        }
        meatText = meat.substring(0, this.minLen);
        if (m = meatText.match(lineBreakPat)) {
          meatText = meat.substring(0, m.index);
        }
        if (newline) {
          meatText = '\n\n' + meatText;
        }
        this.result = new Meat(meatText, offset);
      }
      return parseRestOfMeat(this.result, meat.substring(this.result.text.length), rest);
    }
  }

};

lineBreakPat = /\n\n/;

var parseMeat = function(meat, offset, rest, singleLine) {
  return new MeatParser().parse(meat, offset, rest, singleLine);
};

parseRestOfMeat = function(node, meat, rest) {
  var node2;
  if (meat && node.text[node.text.length - 1] !== '\n') {
    [node2, rest] = parseMeat(meat, node.offset + node.allText().length, rest, true);
    node.next = node2;
    return [node, rest];
  } else {
    return [node, meat + rest];
  }
};

parseResults = function(text, offset, rest) {
  var lines, m, oldRest, ref;
  oldRest = rest;
  while (m = rest.match(resultsLineRE)) {
    rest = rest.substring(m[0].length);
  }
  if (oldRest === rest && rest.length && !((ref = rest[0]) === '#' || ref === '\n')) {
    rest = rest.substring(((m = rest.match(/\n/)) ? m.index + 1 : rest.length));
  }
  lines = oldRest.substring(0, oldRest.length - rest.length);
  return [new Results$1(text + lines, offset, text.match(resultsRE)[RES_NAME], text.length), rest];
};

parseAttr = function(text, offset, rest) {
  var lines, m, oldRest;
  oldRest = rest;
  while (m = rest.match(attrHrmlLineRE)) {
    rest = rest.substring(m[0].length);
  }
  lines = oldRest.substring(0, oldRest.length - rest.length);
  return [new AttrHtml(text + lines, offset, text.match(attrHtmlRE)[ATTR_NAME], text.length), rest];
};

parseDrawer = function(text, name, offset, end, rest) {
  var pos;
  pos = end.index + (fullLine(end, rest)).length;
  return [new Drawer(text + rest.substring(0, pos), offset, name, text.length, text.length + end.index), rest.substring(pos)];
};

parseKeyword = function(match, text, offset, name, info, rest) {
  return [new Keyword(text, offset, name, text.substring(match[KW_BOILERPLATE].length)), rest];
};

parseExample = function(startLine, offset, start, end, rest) {
  var contentLength, contentPos, lastLine, newRest, text;
  lastLine = fullLine(end, rest);
  newRest = rest.substring(end.index + lastLine.length);
  contentPos = startLine.length;
  contentLength = end.index;
  text = startLine + rest.substring(0, rest.length - newRest.length);
  return [new Example(text, offset, contentPos, contentLength), newRest];
};

parseSrcBlock = function(text, offset, info, infoPos, rest) {
  var end, endLine, line, otherSrcStart;
  end = rest.match(srcEndRE);
  otherSrcStart = rest.match(srcStartRE);
  if (!end || (otherSrcStart && otherSrcStart.index < end.index)) {
    line = text.match(/^.*\n/);
    if (!line) {
      line = [text];
    }
    return [new Meat(line[0]), text.substring(line[0].length) + rest];
  } else {
    endLine = fullLine(end, rest);
    return [new Source$1(text + rest.substring(0, end.index + endLine.length), offset, text.match(srcStartRE)[SRC_NAME], info, infoPos, rest.substring(0, end.index), text.length), rest.substring(end.index + endLine.length)];
  }
};

parseHtmlBlock = function(text, offset, rest, match) {
  var end, endLine, line, otherHtmlStart;
  end = rest.match(htmlEndRE);
  otherHtmlStart = rest.match(htmlStartRE);
  line = text.match(/^.*\n/);
  if (!line) {
    line = [text];
  }
  if (!end || (otherHtmlStart && otherHtmlStart.index < end.index)) {
    return [new Meat(line[0]), text.substring(line[0].length) + rest];
  } else {
    endLine = fullLine(end, rest);
    return [new HTML(text + rest.substring(0, end.index + endLine.length), offset, match[HTML_START_NAME], line[0].length, text.length + end.index - line[0].length, match[HTML_INFO]), rest.substring(end.index + endLine.length)];
  }
};

parseList = function(match, text, offset, level, check, info, rest) {
  var children, contentOffset, inside, insideOffset, node;
  contentOffset = listContentOffset(match);
  insideOffset = offset + contentOffset;
  inside = text.substring(contentOffset);
  children = [];
  while (inside) {
    [node, inside] = parseMeat(inside, insideOffset, '', true);
    while (node) {
      children.push(node);
      insideOffset += node.allText().length;
      node = node.next;
    }
  }
  return [new ListItem(text, offset, level, check === 'X' || (check === ' ' ? false : null), contentOffset, children), rest];
};

parseUnknown = function(line, offset, rest) {
  return [new UnknownDeclaration(line, offset), rest];
};

listContentOffset = function(match) {
  var ref, ref1;
  return match[LIST_LEVEL].length + match[LIST_BOILERPLATE].length + ((ref = (ref1 = match[LIST_CHECK]) != null ? ref1.length : void 0) != null ? ref : 0);
};

markupText = function(text) {
  return {};
};

//parseOrgMode
//parseMeat
//Node
//Headline
//Fragment
//Meat
//Keyword
//Source
//HTML
//Results
//resultsRE
//ListItem
//SimpleMarkup
//Link
//UnknownDeclaration
//Drawer
//Example
//drawerRE
//headlineRE
//HL_LEVEL
//HL_TODO
//HL_PRIORITY
//HL_TEXT
//HL_TAGS
//parseTags
//matchLine
//keywordRE
//KW_BOILERPLATE
//KW_NAME
//KW_INFO
//srcStartRE
//SRC_BOILERPLATE
//SRC_INFO
//nextOrgNode
//AttrHtml
//parseCodeAttributes

var Org = /*#__PURE__*/Object.freeze({
  __proto__: null,
  HL_LEVEL: HL_LEVEL,
  HL_TODO: HL_TODO,
  HL_PRIORITY: HL_PRIORITY,
  HL_TEXT: HL_TEXT,
  HL_TAGS: HL_TAGS,
  headlineRE: headlineRE,
  KW_BOILERPLATE: KW_BOILERPLATE,
  KW_NAME: KW_NAME,
  KW_INFO: KW_INFO,
  keywordRE: keywordRE,
  SRC_BOILERPLATE: SRC_BOILERPLATE,
  SRC_INFO: SRC_INFO,
  srcStartRE: srcStartRE,
  resultsRE: resultsRE,
  drawerRE: drawerRE,
  matchLine: matchLine,
  Node: Node$2,
  Headline: Headline$1,
  Fragment: Fragment$1,
  Meat: Meat,
  SimpleMarkup: SimpleMarkup$1,
  Link: Link,
  ListItem: ListItem,
  Drawer: Drawer,
  Example: Example,
  Keyword: Keyword,
  parseCodeAttributes: parseCodeAttributes,
  Source: Source$1,
  HTML: HTML,
  Results: Results$1,
  AttrHtml: AttrHtml,
  UnknownDeclaration: UnknownDeclaration,
  nextOrgNode: nextOrgNode,
  parseOrgMode: parseOrgMode$1,
  parseTags: parseTags,
  parseMeat: parseMeat
});

// Generated by CoffeeScript 2.6.0
var _L, checkMerged, checkProps, createChildrenDocs, createCodeBlockDoc, createHtmlBlockDoc, createOrgDoc, dump, escapeRegexp, findTitle, getSourceNodeType, isMergeable, isSourceEnd, isYamlResult, load, replaceOrgDoc, safeLoad,
  indexOf = [].indexOf;

_L = Lazy;

({safeLoad, load, dump} = jsyaml);

var ParsedCodeBlock$1 = class ParsedCodeBlock {
  constructor(block) {
    if (typeof block === 'string') {
      this.setBlockText(block);
    } else {
      this.init(block);
    }
  }

  clone() {
    return new ParsedCodeBlock(this.block);
  }

  getOrg() {
    return blockOrg(this.block);
  }

  toString() {
    return `Parsed:\n  ${this.block.text.replace(/\n/g, '\n  ')}`;
  }

  init(block1) {
    var org;
    this.block = block1;
    org = blockOrg(this.block);
    if (org instanceof Fragment$1 || org instanceof Headline$1) {
      org = org.children[0];
    }
    return this.items = getCodeItems$1(org);
  }

  setBlockText(str) {
    var bl, ref;
    if ((bl = orgDoc$1(parseOrgMode$1(str.replace(/\r\n/g, '\n')))).length !== 1 || bl[0].text !== str) {
      throw new Error(`Bad code block: '${str}'`);
    }
    bl[0]._id = (ref = this.block) != null ? ref._id : void 0;
    return this.init(bl[0]);
  }

  spliceItem(itemName, str) {
    var item;
    if (str && _.last(str) !== '\n') {
      str += '\n';
    }
    item = this.items[itemName];
    return this.setBlockText(item ? this.block.text.substring(0, item.offset) + str + this.block.text.substring(item.offset + item.text.length) : this.block.text + `#+${itemName.toUpperCase()}:\n${str}`);
  }

  setCodeInfo(info) {
    var infoStart, source, text;
    ({text} = this.block);
    ({source} = this.items);
    infoStart = source.offset + source.infoPos;
    return this.setBlockText(text.substring(0, infoStart) + info + text.substring(infoStart + source.info.length));
  }

  setCodeAttribute(name, value) {
    var info, m, prefix, ref, ref1, suffix;
    info = (ref = this.items.source.info) != null ? ref : '';
    return this.setCodeInfo(((ref1 = this.block.codeAttributes) != null ? ref1[name.toLowerCase()] : void 0) != null ? (m = info.match(new RegExp(`^((|.*\\S)(\\s*))(:${escapeRegexp(name)})((\\s+[^:]*)?(?=:|$))`, 'i')), prefix = m.index + m[1].length + m[4].length, suffix = info.substring(prefix + m[5].length), suffix ? suffix = ' ' + suffix : void 0, value == null ? info.substring(0, m.index + m[2].length) + suffix : info.substring(0, prefix) + ' ' + value + suffix) : value == null ? info : info + ` :${name}` + (value ? ' ' + value : ''));
  }

  setResults(str) {
    return this.spliceItem('results', str);
  }

  setSource(str) {
    return this.spliceItem('source', str);
  }

  setError(str) {
    return this.spliceItem('error', str);
  }

  addResultType(str) {
    var ref, results, types;
    types = this.getResultTypes();
    if (!(indexOf.call(types, str) >= 0)) {
      results = (ref = this.block.codeAttributes) != null ? ref.results : void 0;
      return this.setCodeAttribute('results', results ? `${results} ${str}` : str);
    }
  }

  removeResultType(str) {
    var end, i, j, k, len, prefix, ref, ref1, ref2, ref3, ref4, res, start, types, values;
    res = (ref = this.block.codeAttributes) != null ? ref.results : void 0;
    types = this.getResultTypes();
    if (ref1 = str.toLowerCase(), indexOf.call(types, ref1) >= 0) {
      values = res.toLowerCase().split(/(\s+)/);
      start = values.indexOf(str.toLowerCase());
      end = start + 1;
      if (start > 0) {
        start--;
      } else if (end < values.length) {
        end++;
      }
      prefix = 0;
      for (i = j = 0, ref2 = start; (0 <= ref2 ? j < ref2 : j > ref2); i = 0 <= ref2 ? ++j : --j) {
        prefix += values[i].length;
      }
      len = 0;
      for (i = k = ref3 = start, ref4 = end; (ref3 <= ref4 ? k < ref4 : k > ref4); i = ref3 <= ref4 ? ++k : --k) {
        len += values[i].length;
        values[i] = false;
      }
      return this.setCodeAttribute('results', _.some(values) ? res.substring(0, prefix) + res.substring(prefix + len) : void 0);
    }
  }

  setResultView(viewStr) {
    var m, newRes, ref, res;
    if (viewStr) {
      viewStr = ' ' + viewStr;
    }
    res = (ref = this.block.codeAttributes) != null ? ref.results : void 0;
    newRes = (m = res.match(/\s*\bview(\(.*\)|\b)/)) ? res.substring(0, m.index) + viewStr + res.substring(m.index + m[0].length) : viewStr ? res + viewStr : res;
    return this.setCodeAttribute('results', newRes);
  }

  setExports(code, results) {
    return this.setCodeAttribute('exports', !code || !results ? (code && 'code') || (results && 'results') || 'none' : void 0);
  }

  exportsCode() {
    var ref;
    return (ref = this.getExports()) === 'code' || ref === 'both';
  }

  exportsResults() {
    var ref;
    return (ref = this.getExports()) === 'results' || ref === 'both';
  }

  getExports() {
    var ref, ref1;
    return ((ref = this.block.codeAttributes) != null ? (ref1 = ref.exports) != null ? ref1.toLowerCase() : void 0 : void 0) || 'both';
  }

  getResultTypes() {
    var ref, ref1, ref2;
    return (ref = (ref1 = this.block.codeAttributes) != null ? (ref2 = ref1.results) != null ? ref2.toLowerCase().split(' ') : void 0 : void 0) != null ? ref : [];
  }

  setDynamic(state) {
    if (this.isDynamic() !== state) {
      if (state) {
        return this.addResultType('dynamic');
      } else {
        return this.removeResultType('dynamic');
      }
    }
  }

  isDynamic() {
    return indexOf.call(this.getResultTypes(), 'dynamic') >= 0;
  }

  setSourceContent(newContent) {
    var src;
    src = this.items.source;
    return this.setSource(`${src.text.substring(0, src.contentPos)}${newContent}${src.text.substring(src.contentPos + src.content.length)}`);
  }

  hasExpected() {
    return this.items.expected;
  }

  resultsAreExpected() {
    return this.items.expected && this.items.results && this.items.expected.content() === this.items.results.content();
  }

  makeResultsExpected() {
    var item, newExpected, source;
    if (this.items.results) {
      newExpected = `:expected:\n${this.items.results.content()}:end:\n`;
      item = this.items.expected;
      return this.setBlockText(item ? this.block.text.substring(0, item.offset) + newExpected + this.block.text.substring(item.offset + item.text.length) : (source = this.items.source, this.block.text.substring(0, source.offset + source.text.length) + newExpected + this.block.text.substring(source.offset + source.text.length)));
    }
  }

  clearExpected() {
    var item;
    if (item = this.items.expected) {
      return this.setBlockText(this.block.text.substring(0, item.offset) + this.block.text.substring(item.offset + item.text.length));
    }
  }

};

escapeRegexp = function(str) {
  return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
};

var blockOrg = function(block) {
  var frag, org, text;
  text = typeof block === 'string' ? block : block.text;
  org = parseOrgMode$1(text);
  org = org.children.length === 1 ? org.children[0] : (frag = new Fragment$1(org.offset, org.children), frag);
  if (typeof block === 'object') {
    org.nodeId = block._id;
    org.shared = block.type;
  }
  org.linkNodes();
  return org;
};

var getCodeItems$1 = function(org) {
  var result, type;
  if (!getSourceNodeType(org)) {
    return {};
  } else {
    result = {};
    while (!isSourceEnd(org)) {
      if (type = getSourceNodeType(org)) {
        if (type === 'html') {
          if (result.first) {
            return result;
          } else {
            return {
              source: org,
              first: org,
              last: org
            };
          }
        }
        if (!result.first) {
          result.first = org;
        } else if (type === 'name') {
          return result;
        }
        if (result[type] != null) {
          return result;
        }
        result.last = result[type] = org;
        if (type === 'name' && org.next.constructor === Meat && org.next.next instanceof Source$1) {
          result.doc = org.next;
        }
        if (type === 'results') {
          break;
        }
      } else if (org instanceof Drawer || org instanceof Keyword || org instanceof UnknownDeclaration) {
        break;
      }
      org = org.next;
    }
    if (result.source) {
      return result;
    } else {
      return {};
    }
  }
};

var isCodeBlock = function(org) {
  var first;
  if (org instanceof Keyword && org.name.match(/^name$/i)) {
    ({first} = getCodeItems$1(org));
    return first;
  } else {
    return org instanceof Source$1;
  }
};

getSourceNodeType = function(org) {
  if (org instanceof Source$1) {
    return 'source';
  } else if (org instanceof HTML) {
    return 'html';
  } else if (org instanceof Results$1) {
    return 'results';
  } else if (org instanceof Drawer && org.name.toLowerCase() === 'expected') {
    return 'expected';
  } else if (org instanceof Keyword && org.name.match(/^name$/i)) {
    return 'name';
  } else if (org instanceof Keyword && org.name.match(/^error$/i)) {
    return 'error';
  } else {
    return false;
  }
};

isSourceEnd = function(org) {
  return !org || org instanceof Headline$1;
};

var createDocFromOrg = function(org, collection, reloading, filter) {
  var doc;
  doc = orgDoc$1(org);
  if (filter != null) {
    doc = _.map(doc, filter);
  }
  replaceOrgDoc(doc, collection, reloading);
  return collection;
};

var docRoot = function(collection) {
  var ref, ref1;
  return (ref = ((ref1 = collection.leisure) != null ? ref1 : collection.leisure = {}).info) != null ? ref : (collection.leisure.info = collection.findOne({
    info: true
  }));
};

replaceOrgDoc = function(docArray, collection, reloading) {
  var doc, info, j, len1, results1;
  if (reloading) {
    collection.remove({
      info: {
        '$exists': false
      }
    });
  } else {
    collection.remove();
  }
  linkDocs(docArray);
  //console.log "DOCS: #{JSON.stringify docArray, null, '  '}"
  if (reloading) {
    info = collection.leisure.info;
    info.head = docArray.length > 0 ? docArray[0]._id : null;
    collection.update(info._id, info);
  } else {
    info = collection.leisure.info = {
      info: true,
      head: docArray.length > 0 ? docArray[0]._id : null,
      _id: new Meteor.Collection.ObjectID().toJSONValue()
    };
    collection.insert(info);
  }
  results1 = [];
  for (j = 0, len1 = docArray.length; j < len1; j++) {
    doc = docArray[j];
    results1.push(collection.insert(doc));
  }
  return results1;
};

var linkDocs = function(docs) {
  var doc, j, len1, prev, results1;
  prev = null;
  results1 = [];
  for (j = 0, len1 = docs.length; j < len1; j++) {
    doc = docs[j];
    doc._id = new Meteor.Collection.ObjectID().toJSONValue();
    if (prev) {
      prev.next = doc._id;
      doc.prev = prev._id;
    }
    results1.push(prev = doc);
  }
  return results1;
};

var orgDoc$1 = function(org, withProperties) {
  return createOrgDoc(org, false, withProperties)[0].toArray();
};

var lineCodeBlockType = function(line) {
  var type;
  type = line && root.matchLine(line);
  if (type === 'srcStart' || type === 'srcEnd' || type === 'htmlStart' || type === 'htmlEnd') {
    return 'code';
  } else if (line.match(/^#+name:/i)) {
    return 'code';
  } else if (type === 'headline-1') {
    return 'headline';
  } else {
    return 'chunk';
  }
};

createOrgDoc = function(org, local, withProps) {
  var block, children, next, result, title;
  next = org.next;
  if (org instanceof Headline$1) {
    local = local || (org.level === 1 && org.properties.local);
    children = createChildrenDocs(org, local, withProps);
    result = org.level === 0 ? (org.children.length && children) || _L([
      {
        text: '\n',
        type: 'chunk',
        offset: org.offset
      }
    ]) : _L([
      {
        text: org.text,
        type: 'headline',
        level: org.level,
        offset: org.offset,
        properties: org.properties
      }
    ]).concat(children);
  } else if (org instanceof HTML) {
    [result, next] = createHtmlBlockDoc(org);
  } else if (isCodeBlock(org)) {
    [result, next] = createCodeBlockDoc(org);
  } else {
    block = {
      text: org.allText(),
      type: 'chunk',
      offset: org.offset
    };
    if (title = findTitle(org)) {
      block.title = title;
    }
    result = _L(checkProps(org, [block]));
  }
  block = result.last();
  if (withProps && block.type === 'code') {
    block.properties = org.allProperties();
  }
  if (local) {
    result.each(function(item) {
      return item.local = true;
    });
  }
  return [result, next];
};

findTitle = function(org) {
  var child, j, len1, ref, title;
  if (org instanceof Keyword && org.name.toLowerCase() === 'title') {
    return org.info.trim();
  } else if (org.children) {
    ref = org.children;
    for (j = 0, len1 = ref.length; j < len1; j++) {
      child = ref[j];
      if (title = findTitle(child)) {
        return title;
      }
    }
  }
};

checkProps = function(org, block) {
  if (typeof org.isProperties === "function" ? org.isProperties() : void 0) {
    return block.properties = org.properties();
  }
};

createChildrenDocs = function(org, local, withProps) {
  var child, childDoc, children, mergedText, newTitle, offset, properties, title;
  children = _L();
  child = org.children[0];
  title = null;
  if (child) {
    mergedText = '';
    properties = _L();
    offset = org.children[0].offset;
    while (child) {
      if (newTitle = findTitle(child)) {
        title = newTitle;
      }
      if (isMergeable(child)) {
        mergedText += child.allText();
        if (typeof child.properties === "function" ? child.properties() : void 0) {
          properties = properties.merge(typeof child.properties === "function" ? child.properties() : void 0);
        }
        child = child.next;
      } else {
        [mergedText, properties, children] = checkMerged(mergedText, properties, children, offset);
        [childDoc, child] = createOrgDoc(child, local, withProps);
        if (title) {
          (children.isEmpty() ? childDoc : children).first().title = title;
          title = null;
        }
        children = children.concat([childDoc]);
        offset = child != null ? child.offset : void 0;
      }
    }
    [mergedText, properties, children] = checkMerged(mergedText, properties, children, offset, title);
  }
  return children;
};

isMergeable = function(org) {
  return !(org instanceof Headline$1 || org instanceof HTML || isCodeBlock(org));
};

checkMerged = function(mergedText, properties, children, offset, title) {
  var child;
  if (mergedText !== '') {
    child = {
      text: mergedText,
      type: 'chunk',
      offset: offset
    };
    if (title) {
      child.title = title;
    }
    if (!properties.isEmpty()) {
      child.properties = properties.toObject();
    }
    children = children.concat([child]);
  }
  return ['', _L(), children];
};

createCodeBlockDoc = function(org) {
  var attr, expected, first, firstOffset, l, last, name, nm, obj, ref, ref1, results, source, text, val, yamlSrc;
  text = '';
  ({first, name, source, last, expected, results} = getCodeItems$1(org));
  if (!first) {
    return [
      _L([
        {
          text: org.allText(),
          type: 'chunk',
          offset: org.offset
        }
      ]),
      org.next
    ];
  } else {
    firstOffset = first.offset;
    while (first !== last.next) {
      text += first.allText();
      first = first.next;
    }
    obj = {
      text: text,
      type: 'code',
      offset: firstOffset
    };
    if (source.attributes()) {
      attr = {};
      ref = source.attributes();
      for (nm in ref) {
        val = ref[nm];
        attr[nm.toLowerCase()] = val;
      }
    } else {
      attr = null;
    }
    obj.codeAttributes = attr;
    obj.codePrelen = source.contentPos + source.offset - firstOffset;
    obj.codePostlen = text.length - obj.codePrelen - source.content.length;
    if (expected) {
      obj.codeContent = source.content;
      obj.codeTestActual = results.content();
      obj.codeTestExpected = expected.content();
      obj.codeTestResult = !results ? 'unknown' : expected.content() === results.content() ? 'pass' : 'fail';
    }
    if (name) {
      obj.codeName = name.info.trim();
    }
    if (((ref1 = obj.codeAttributes) != null ? ref1.local : void 0) != null) {
      obj.local = true;
    }
    if (l = source.lead()) {
      obj.language = l.trim();
    }
    if (isYamlResult(obj) || isYaml(source)) {
      yamlSrc = (isYaml(source) && !results ? source.content : (obj.computedYaml = true, results != null ? results.content().replace(/^: /gm, '') : void 0));
      if (yamlSrc) {
        obj.yaml = parseYaml$1(yamlSrc);
      }
    } else if (isText(source)) {
      obj.yaml = source.content;
    }
    return [_L([obj]), last.next];
  }
};

var parseYaml$1 = function(str) {
  try {
    //safeLoad str
    return load(str);
  } catch (error) {
    return void 0;
  }
};

createHtmlBlockDoc = function(org) {
  var a, obj, text;
  text = org.allText();
  obj = {
    text: text,
    type: 'code',
    offset: org.offset
  };
  obj.codePrelen = org.contentPos;
  obj.codePostlen = text.length - obj.codePrelen - org.contentLength;
  obj.language = 'html';
  if (a = org.attributes()) {
    obj.codeAttributes = a;
  }
  return [_L([obj]), org.next];
};

var isYaml = function(org) {
  return org instanceof Source$1 && org.info.match(/^ *yaml\b/i);
};

isYamlResult = function(block) {
  var ref, ref1, ref2;
  return ((ref = block.codeAttributes) != null ? (ref1 = ref.results) != null ? ref1.match(/\byaml\b/) : void 0 : void 0) || ((ref2 = block.codeAttributes) != null ? ref2.post : void 0);
};

var isText = function(org) {
  return org instanceof Source$1 && org.info.match(/^ *(text|string)\b/i);
};

var checkSingleNode = function(text) {
  var docJson, org;
  org = parseOrgMode$1(text);
  [docJson] = org.children.length > 1 ? orgDoc$1(org) : orgDoc$1(org.children[0]);
  //if docJson.children? then console.log "NEW NODE\n#{JSON.stringify docJson}"
  return docJson;
};

var crnl = function(data) {
  if (typeof data === 'string') {
    return data.replace(/\r\n/g, '\n');
  } else if (data.text) {
    data.text = crnl(data.text);
    return data;
  } else {
    return data;
  }
};

var blockSource$1 = function(block) {
  return block && block.text.substring(block.codePrelen, block.text.length - block.codePostlen);
};

//{
//  getCodeItems
//  isCodeBlock
//  createDocFromOrg
//  checkSingleNode
//  orgDoc
//  docRoot
//  linkDocs
//  isYaml
//  isText
//  crnl
//  lineCodeBlockType
//  blockSource
//  ParsedCodeBlock
//  blockOrg
//  parseYaml
//}

var DocOrg = /*#__PURE__*/Object.freeze({
  __proto__: null,
  ParsedCodeBlock: ParsedCodeBlock$1,
  blockOrg: blockOrg,
  getCodeItems: getCodeItems$1,
  isCodeBlock: isCodeBlock,
  createDocFromOrg: createDocFromOrg,
  docRoot: docRoot,
  linkDocs: linkDocs,
  orgDoc: orgDoc$1,
  lineCodeBlockType: lineCodeBlockType,
  parseYaml: parseYaml$1,
  isYaml: isYaml,
  isText: isText,
  checkSingleNode: checkSingleNode,
  crnl: crnl,
  blockSource: blockSource$1
});

/**
 * MIT License
 * 
 * Copyright (c) 2014-present, Lee Byron and other contributors.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
var DELETE = 'delete';

// Constants describing the size of trie nodes.
var SHIFT = 5; // Resulted in best performance after ______?
var SIZE = 1 << SHIFT;
var MASK = SIZE - 1;

// A consistent shared value representing "not set" which equals nothing other
// than itself, and nothing that could be provided externally.
var NOT_SET = {};

// Boolean references, Rough equivalent of `bool &`.
function MakeRef() {
  return { value: false };
}

function SetRef(ref) {
  if (ref) {
    ref.value = true;
  }
}

// A function which returns a value representing an "owner" for transient writes
// to tries. The return value will only ever equal itself, and will not equal
// the return of any subsequent call of this function.
function OwnerID() {}

function ensureSize(iter) {
  if (iter.size === undefined) {
    iter.size = iter.__iterate(returnTrue);
  }
  return iter.size;
}

function wrapIndex(iter, index) {
  // This implements "is array index" which the ECMAString spec defines as:
  //
  //     A String property name P is an array index if and only if
  //     ToString(ToUint32(P)) is equal to P and ToUint32(P) is not equal
  //     to 2^32−1.
  //
  // http://www.ecma-international.org/ecma-262/6.0/#sec-array-exotic-objects
  if (typeof index !== 'number') {
    var uint32Index = index >>> 0; // N >>> 0 is shorthand for ToUint32
    if ('' + uint32Index !== index || uint32Index === 4294967295) {
      return NaN;
    }
    index = uint32Index;
  }
  return index < 0 ? ensureSize(iter) + index : index;
}

function returnTrue() {
  return true;
}

function wholeSlice(begin, end, size) {
  return (
    ((begin === 0 && !isNeg(begin)) ||
      (size !== undefined && begin <= -size)) &&
    (end === undefined || (size !== undefined && end >= size))
  );
}

function resolveBegin(begin, size) {
  return resolveIndex(begin, size, 0);
}

function resolveEnd(end, size) {
  return resolveIndex(end, size, size);
}

function resolveIndex(index, size, defaultIndex) {
  // Sanitize indices using this shorthand for ToInt32(argument)
  // http://www.ecma-international.org/ecma-262/6.0/#sec-toint32
  return index === undefined
    ? defaultIndex
    : isNeg(index)
    ? size === Infinity
      ? size
      : Math.max(0, size + index) | 0
    : size === undefined || size === index
    ? index
    : Math.min(size, index) | 0;
}

function isNeg(value) {
  // Account for -0 which is negative, but not less than 0.
  return value < 0 || (value === 0 && 1 / value === -Infinity);
}

var IS_COLLECTION_SYMBOL = '@@__IMMUTABLE_ITERABLE__@@';

function isCollection(maybeCollection) {
  return Boolean(maybeCollection && maybeCollection[IS_COLLECTION_SYMBOL]);
}

var IS_KEYED_SYMBOL = '@@__IMMUTABLE_KEYED__@@';

function isKeyed(maybeKeyed) {
  return Boolean(maybeKeyed && maybeKeyed[IS_KEYED_SYMBOL]);
}

var IS_INDEXED_SYMBOL = '@@__IMMUTABLE_INDEXED__@@';

function isIndexed(maybeIndexed) {
  return Boolean(maybeIndexed && maybeIndexed[IS_INDEXED_SYMBOL]);
}

function isAssociative(maybeAssociative) {
  return isKeyed(maybeAssociative) || isIndexed(maybeAssociative);
}

var Collection = function Collection(value) {
  return isCollection(value) ? value : Seq(value);
};

var KeyedCollection = /*@__PURE__*/(function (Collection) {
  function KeyedCollection(value) {
    return isKeyed(value) ? value : KeyedSeq(value);
  }

  if ( Collection ) KeyedCollection.__proto__ = Collection;
  KeyedCollection.prototype = Object.create( Collection && Collection.prototype );
  KeyedCollection.prototype.constructor = KeyedCollection;

  return KeyedCollection;
}(Collection));

var IndexedCollection = /*@__PURE__*/(function (Collection) {
  function IndexedCollection(value) {
    return isIndexed(value) ? value : IndexedSeq(value);
  }

  if ( Collection ) IndexedCollection.__proto__ = Collection;
  IndexedCollection.prototype = Object.create( Collection && Collection.prototype );
  IndexedCollection.prototype.constructor = IndexedCollection;

  return IndexedCollection;
}(Collection));

var SetCollection = /*@__PURE__*/(function (Collection) {
  function SetCollection(value) {
    return isCollection(value) && !isAssociative(value) ? value : SetSeq(value);
  }

  if ( Collection ) SetCollection.__proto__ = Collection;
  SetCollection.prototype = Object.create( Collection && Collection.prototype );
  SetCollection.prototype.constructor = SetCollection;

  return SetCollection;
}(Collection));

Collection.Keyed = KeyedCollection;
Collection.Indexed = IndexedCollection;
Collection.Set = SetCollection;

var IS_SEQ_SYMBOL = '@@__IMMUTABLE_SEQ__@@';

function isSeq(maybeSeq) {
  return Boolean(maybeSeq && maybeSeq[IS_SEQ_SYMBOL]);
}

var IS_RECORD_SYMBOL = '@@__IMMUTABLE_RECORD__@@';

function isRecord(maybeRecord) {
  return Boolean(maybeRecord && maybeRecord[IS_RECORD_SYMBOL]);
}

function isImmutable(maybeImmutable) {
  return isCollection(maybeImmutable) || isRecord(maybeImmutable);
}

var IS_ORDERED_SYMBOL = '@@__IMMUTABLE_ORDERED__@@';

function isOrdered(maybeOrdered) {
  return Boolean(maybeOrdered && maybeOrdered[IS_ORDERED_SYMBOL]);
}

var ITERATE_KEYS = 0;
var ITERATE_VALUES = 1;
var ITERATE_ENTRIES = 2;

var REAL_ITERATOR_SYMBOL = typeof Symbol === 'function' && Symbol.iterator;
var FAUX_ITERATOR_SYMBOL = '@@iterator';

var ITERATOR_SYMBOL = REAL_ITERATOR_SYMBOL || FAUX_ITERATOR_SYMBOL;

var Iterator = function Iterator(next) {
  this.next = next;
};

Iterator.prototype.toString = function toString () {
  return '[Iterator]';
};

Iterator.KEYS = ITERATE_KEYS;
Iterator.VALUES = ITERATE_VALUES;
Iterator.ENTRIES = ITERATE_ENTRIES;

Iterator.prototype.inspect = Iterator.prototype.toSource = function () {
  return this.toString();
};
Iterator.prototype[ITERATOR_SYMBOL] = function () {
  return this;
};

function iteratorValue(type, k, v, iteratorResult) {
  var value = type === 0 ? k : type === 1 ? v : [k, v];
  iteratorResult
    ? (iteratorResult.value = value)
    : (iteratorResult = {
        value: value,
        done: false,
      });
  return iteratorResult;
}

function iteratorDone() {
  return { value: undefined, done: true };
}

function hasIterator(maybeIterable) {
  if (Array.isArray(maybeIterable)) {
    // IE11 trick as it does not support `Symbol.iterator`
    return true;
  }

  return !!getIteratorFn(maybeIterable);
}

function isIterator(maybeIterator) {
  return maybeIterator && typeof maybeIterator.next === 'function';
}

function getIterator(iterable) {
  var iteratorFn = getIteratorFn(iterable);
  return iteratorFn && iteratorFn.call(iterable);
}

function getIteratorFn(iterable) {
  var iteratorFn =
    iterable &&
    ((REAL_ITERATOR_SYMBOL && iterable[REAL_ITERATOR_SYMBOL]) ||
      iterable[FAUX_ITERATOR_SYMBOL]);
  if (typeof iteratorFn === 'function') {
    return iteratorFn;
  }
}

function isEntriesIterable(maybeIterable) {
  var iteratorFn = getIteratorFn(maybeIterable);
  return iteratorFn && iteratorFn === maybeIterable.entries;
}

function isKeysIterable(maybeIterable) {
  var iteratorFn = getIteratorFn(maybeIterable);
  return iteratorFn && iteratorFn === maybeIterable.keys;
}

var hasOwnProperty = Object.prototype.hasOwnProperty;

function isArrayLike(value) {
  if (Array.isArray(value) || typeof value === 'string') {
    return true;
  }

  return (
    value &&
    typeof value === 'object' &&
    Number.isInteger(value.length) &&
    value.length >= 0 &&
    (value.length === 0
      ? // Only {length: 0} is considered Array-like.
        Object.keys(value).length === 1
      : // An object is only Array-like if it has a property where the last value
        // in the array-like may be found (which could be undefined).
        value.hasOwnProperty(value.length - 1))
  );
}

var Seq = /*@__PURE__*/(function (Collection) {
  function Seq(value) {
    return value === null || value === undefined
      ? emptySequence()
      : isImmutable(value)
      ? value.toSeq()
      : seqFromValue(value);
  }

  if ( Collection ) Seq.__proto__ = Collection;
  Seq.prototype = Object.create( Collection && Collection.prototype );
  Seq.prototype.constructor = Seq;

  Seq.prototype.toSeq = function toSeq () {
    return this;
  };

  Seq.prototype.toString = function toString () {
    return this.__toString('Seq {', '}');
  };

  Seq.prototype.cacheResult = function cacheResult () {
    if (!this._cache && this.__iterateUncached) {
      this._cache = this.entrySeq().toArray();
      this.size = this._cache.length;
    }
    return this;
  };

  // abstract __iterateUncached(fn, reverse)

  Seq.prototype.__iterate = function __iterate (fn, reverse) {
    var cache = this._cache;
    if (cache) {
      var size = cache.length;
      var i = 0;
      while (i !== size) {
        var entry = cache[reverse ? size - ++i : i++];
        if (fn(entry[1], entry[0], this) === false) {
          break;
        }
      }
      return i;
    }
    return this.__iterateUncached(fn, reverse);
  };

  // abstract __iteratorUncached(type, reverse)

  Seq.prototype.__iterator = function __iterator (type, reverse) {
    var cache = this._cache;
    if (cache) {
      var size = cache.length;
      var i = 0;
      return new Iterator(function () {
        if (i === size) {
          return iteratorDone();
        }
        var entry = cache[reverse ? size - ++i : i++];
        return iteratorValue(type, entry[0], entry[1]);
      });
    }
    return this.__iteratorUncached(type, reverse);
  };

  return Seq;
}(Collection));

var KeyedSeq = /*@__PURE__*/(function (Seq) {
  function KeyedSeq(value) {
    return value === null || value === undefined
      ? emptySequence().toKeyedSeq()
      : isCollection(value)
      ? isKeyed(value)
        ? value.toSeq()
        : value.fromEntrySeq()
      : isRecord(value)
      ? value.toSeq()
      : keyedSeqFromValue(value);
  }

  if ( Seq ) KeyedSeq.__proto__ = Seq;
  KeyedSeq.prototype = Object.create( Seq && Seq.prototype );
  KeyedSeq.prototype.constructor = KeyedSeq;

  KeyedSeq.prototype.toKeyedSeq = function toKeyedSeq () {
    return this;
  };

  return KeyedSeq;
}(Seq));

var IndexedSeq = /*@__PURE__*/(function (Seq) {
  function IndexedSeq(value) {
    return value === null || value === undefined
      ? emptySequence()
      : isCollection(value)
      ? isKeyed(value)
        ? value.entrySeq()
        : value.toIndexedSeq()
      : isRecord(value)
      ? value.toSeq().entrySeq()
      : indexedSeqFromValue(value);
  }

  if ( Seq ) IndexedSeq.__proto__ = Seq;
  IndexedSeq.prototype = Object.create( Seq && Seq.prototype );
  IndexedSeq.prototype.constructor = IndexedSeq;

  IndexedSeq.of = function of (/*...values*/) {
    return IndexedSeq(arguments);
  };

  IndexedSeq.prototype.toIndexedSeq = function toIndexedSeq () {
    return this;
  };

  IndexedSeq.prototype.toString = function toString () {
    return this.__toString('Seq [', ']');
  };

  return IndexedSeq;
}(Seq));

var SetSeq = /*@__PURE__*/(function (Seq) {
  function SetSeq(value) {
    return (
      isCollection(value) && !isAssociative(value) ? value : IndexedSeq(value)
    ).toSetSeq();
  }

  if ( Seq ) SetSeq.__proto__ = Seq;
  SetSeq.prototype = Object.create( Seq && Seq.prototype );
  SetSeq.prototype.constructor = SetSeq;

  SetSeq.of = function of (/*...values*/) {
    return SetSeq(arguments);
  };

  SetSeq.prototype.toSetSeq = function toSetSeq () {
    return this;
  };

  return SetSeq;
}(Seq));

Seq.isSeq = isSeq;
Seq.Keyed = KeyedSeq;
Seq.Set = SetSeq;
Seq.Indexed = IndexedSeq;

Seq.prototype[IS_SEQ_SYMBOL] = true;

// #pragma Root Sequences

var ArraySeq = /*@__PURE__*/(function (IndexedSeq) {
  function ArraySeq(array) {
    this._array = array;
    this.size = array.length;
  }

  if ( IndexedSeq ) ArraySeq.__proto__ = IndexedSeq;
  ArraySeq.prototype = Object.create( IndexedSeq && IndexedSeq.prototype );
  ArraySeq.prototype.constructor = ArraySeq;

  ArraySeq.prototype.get = function get (index, notSetValue) {
    return this.has(index) ? this._array[wrapIndex(this, index)] : notSetValue;
  };

  ArraySeq.prototype.__iterate = function __iterate (fn, reverse) {
    var array = this._array;
    var size = array.length;
    var i = 0;
    while (i !== size) {
      var ii = reverse ? size - ++i : i++;
      if (fn(array[ii], ii, this) === false) {
        break;
      }
    }
    return i;
  };

  ArraySeq.prototype.__iterator = function __iterator (type, reverse) {
    var array = this._array;
    var size = array.length;
    var i = 0;
    return new Iterator(function () {
      if (i === size) {
        return iteratorDone();
      }
      var ii = reverse ? size - ++i : i++;
      return iteratorValue(type, ii, array[ii]);
    });
  };

  return ArraySeq;
}(IndexedSeq));

var ObjectSeq = /*@__PURE__*/(function (KeyedSeq) {
  function ObjectSeq(object) {
    var keys = Object.keys(object);
    this._object = object;
    this._keys = keys;
    this.size = keys.length;
  }

  if ( KeyedSeq ) ObjectSeq.__proto__ = KeyedSeq;
  ObjectSeq.prototype = Object.create( KeyedSeq && KeyedSeq.prototype );
  ObjectSeq.prototype.constructor = ObjectSeq;

  ObjectSeq.prototype.get = function get (key, notSetValue) {
    if (notSetValue !== undefined && !this.has(key)) {
      return notSetValue;
    }
    return this._object[key];
  };

  ObjectSeq.prototype.has = function has (key) {
    return hasOwnProperty.call(this._object, key);
  };

  ObjectSeq.prototype.__iterate = function __iterate (fn, reverse) {
    var object = this._object;
    var keys = this._keys;
    var size = keys.length;
    var i = 0;
    while (i !== size) {
      var key = keys[reverse ? size - ++i : i++];
      if (fn(object[key], key, this) === false) {
        break;
      }
    }
    return i;
  };

  ObjectSeq.prototype.__iterator = function __iterator (type, reverse) {
    var object = this._object;
    var keys = this._keys;
    var size = keys.length;
    var i = 0;
    return new Iterator(function () {
      if (i === size) {
        return iteratorDone();
      }
      var key = keys[reverse ? size - ++i : i++];
      return iteratorValue(type, key, object[key]);
    });
  };

  return ObjectSeq;
}(KeyedSeq));
ObjectSeq.prototype[IS_ORDERED_SYMBOL] = true;

var CollectionSeq = /*@__PURE__*/(function (IndexedSeq) {
  function CollectionSeq(collection) {
    this._collection = collection;
    this.size = collection.length || collection.size;
  }

  if ( IndexedSeq ) CollectionSeq.__proto__ = IndexedSeq;
  CollectionSeq.prototype = Object.create( IndexedSeq && IndexedSeq.prototype );
  CollectionSeq.prototype.constructor = CollectionSeq;

  CollectionSeq.prototype.__iterateUncached = function __iterateUncached (fn, reverse) {
    if (reverse) {
      return this.cacheResult().__iterate(fn, reverse);
    }
    var collection = this._collection;
    var iterator = getIterator(collection);
    var iterations = 0;
    if (isIterator(iterator)) {
      var step;
      while (!(step = iterator.next()).done) {
        if (fn(step.value, iterations++, this) === false) {
          break;
        }
      }
    }
    return iterations;
  };

  CollectionSeq.prototype.__iteratorUncached = function __iteratorUncached (type, reverse) {
    if (reverse) {
      return this.cacheResult().__iterator(type, reverse);
    }
    var collection = this._collection;
    var iterator = getIterator(collection);
    if (!isIterator(iterator)) {
      return new Iterator(iteratorDone);
    }
    var iterations = 0;
    return new Iterator(function () {
      var step = iterator.next();
      return step.done ? step : iteratorValue(type, iterations++, step.value);
    });
  };

  return CollectionSeq;
}(IndexedSeq));

// # pragma Helper functions

var EMPTY_SEQ;

function emptySequence() {
  return EMPTY_SEQ || (EMPTY_SEQ = new ArraySeq([]));
}

function keyedSeqFromValue(value) {
  var seq = maybeIndexedSeqFromValue(value);
  if (seq) {
    return seq.fromEntrySeq();
  }
  if (typeof value === 'object') {
    return new ObjectSeq(value);
  }
  throw new TypeError(
    'Expected Array or collection object of [k, v] entries, or keyed object: ' +
      value
  );
}

function indexedSeqFromValue(value) {
  var seq = maybeIndexedSeqFromValue(value);
  if (seq) {
    return seq;
  }
  throw new TypeError(
    'Expected Array or collection object of values: ' + value
  );
}

function seqFromValue(value) {
  var seq = maybeIndexedSeqFromValue(value);
  if (seq) {
    return isEntriesIterable(value)
      ? seq.fromEntrySeq()
      : isKeysIterable(value)
      ? seq.toSetSeq()
      : seq;
  }
  if (typeof value === 'object') {
    return new ObjectSeq(value);
  }
  throw new TypeError(
    'Expected Array or collection object of values, or keyed object: ' + value
  );
}

function maybeIndexedSeqFromValue(value) {
  return isArrayLike(value)
    ? new ArraySeq(value)
    : hasIterator(value)
    ? new CollectionSeq(value)
    : undefined;
}

var IS_MAP_SYMBOL = '@@__IMMUTABLE_MAP__@@';

function isMap(maybeMap) {
  return Boolean(maybeMap && maybeMap[IS_MAP_SYMBOL]);
}

function isOrderedMap(maybeOrderedMap) {
  return isMap(maybeOrderedMap) && isOrdered(maybeOrderedMap);
}

function isValueObject(maybeValue) {
  return Boolean(
    maybeValue &&
      typeof maybeValue.equals === 'function' &&
      typeof maybeValue.hashCode === 'function'
  );
}

/**
 * An extension of the "same-value" algorithm as [described for use by ES6 Map
 * and Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map#Key_equality)
 *
 * NaN is considered the same as NaN, however -0 and 0 are considered the same
 * value, which is different from the algorithm described by
 * [`Object.is`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is).
 *
 * This is extended further to allow Objects to describe the values they
 * represent, by way of `valueOf` or `equals` (and `hashCode`).
 *
 * Note: because of this extension, the key equality of Immutable.Map and the
 * value equality of Immutable.Set will differ from ES6 Map and Set.
 *
 * ### Defining custom values
 *
 * The easiest way to describe the value an object represents is by implementing
 * `valueOf`. For example, `Date` represents a value by returning a unix
 * timestamp for `valueOf`:
 *
 *     var date1 = new Date(1234567890000); // Fri Feb 13 2009 ...
 *     var date2 = new Date(1234567890000);
 *     date1.valueOf(); // 1234567890000
 *     assert( date1 !== date2 );
 *     assert( Immutable.is( date1, date2 ) );
 *
 * Note: overriding `valueOf` may have other implications if you use this object
 * where JavaScript expects a primitive, such as implicit string coercion.
 *
 * For more complex types, especially collections, implementing `valueOf` may
 * not be performant. An alternative is to implement `equals` and `hashCode`.
 *
 * `equals` takes another object, presumably of similar type, and returns true
 * if it is equal. Equality is symmetrical, so the same result should be
 * returned if this and the argument are flipped.
 *
 *     assert( a.equals(b) === b.equals(a) );
 *
 * `hashCode` returns a 32bit integer number representing the object which will
 * be used to determine how to store the value object in a Map or Set. You must
 * provide both or neither methods, one must not exist without the other.
 *
 * Also, an important relationship between these methods must be upheld: if two
 * values are equal, they *must* return the same hashCode. If the values are not
 * equal, they might have the same hashCode; this is called a hash collision,
 * and while undesirable for performance reasons, it is acceptable.
 *
 *     if (a.equals(b)) {
 *       assert( a.hashCode() === b.hashCode() );
 *     }
 *
 * All Immutable collections are Value Objects: they implement `equals()`
 * and `hashCode()`.
 */
function is(valueA, valueB) {
  if (valueA === valueB || (valueA !== valueA && valueB !== valueB)) {
    return true;
  }
  if (!valueA || !valueB) {
    return false;
  }
  if (
    typeof valueA.valueOf === 'function' &&
    typeof valueB.valueOf === 'function'
  ) {
    valueA = valueA.valueOf();
    valueB = valueB.valueOf();
    if (valueA === valueB || (valueA !== valueA && valueB !== valueB)) {
      return true;
    }
    if (!valueA || !valueB) {
      return false;
    }
  }
  return !!(
    isValueObject(valueA) &&
    isValueObject(valueB) &&
    valueA.equals(valueB)
  );
}

var imul =
  typeof Math.imul === 'function' && Math.imul(0xffffffff, 2) === -2
    ? Math.imul
    : function imul(a, b) {
        a |= 0; // int
        b |= 0; // int
        var c = a & 0xffff;
        var d = b & 0xffff;
        // Shift by 0 fixes the sign on the high part.
        return (c * d + ((((a >>> 16) * d + c * (b >>> 16)) << 16) >>> 0)) | 0; // int
      };

// v8 has an optimization for storing 31-bit signed numbers.
// Values which have either 00 or 11 as the high order bits qualify.
// This function drops the highest order bit in a signed number, maintaining
// the sign bit.
function smi(i32) {
  return ((i32 >>> 1) & 0x40000000) | (i32 & 0xbfffffff);
}

var defaultValueOf = Object.prototype.valueOf;

function hash(o) {
  if (o == null) {
    return hashNullish(o);
  }

  if (typeof o.hashCode === 'function') {
    // Drop any high bits from accidentally long hash codes.
    return smi(o.hashCode(o));
  }

  var v = valueOf(o);

  if (v == null) {
    return hashNullish(v);
  }

  switch (typeof v) {
    case 'boolean':
      // The hash values for built-in constants are a 1 value for each 5-byte
      // shift region expect for the first, which encodes the value. This
      // reduces the odds of a hash collision for these common values.
      return v ? 0x42108421 : 0x42108420;
    case 'number':
      return hashNumber(v);
    case 'string':
      return v.length > STRING_HASH_CACHE_MIN_STRLEN
        ? cachedHashString(v)
        : hashString(v);
    case 'object':
    case 'function':
      return hashJSObj(v);
    case 'symbol':
      return hashSymbol(v);
    default:
      if (typeof v.toString === 'function') {
        return hashString(v.toString());
      }
      throw new Error('Value type ' + typeof v + ' cannot be hashed.');
  }
}

function hashNullish(nullish) {
  return nullish === null ? 0x42108422 : /* undefined */ 0x42108423;
}

// Compress arbitrarily large numbers into smi hashes.
function hashNumber(n) {
  if (n !== n || n === Infinity) {
    return 0;
  }
  var hash = n | 0;
  if (hash !== n) {
    hash ^= n * 0xffffffff;
  }
  while (n > 0xffffffff) {
    n /= 0xffffffff;
    hash ^= n;
  }
  return smi(hash);
}

function cachedHashString(string) {
  var hashed = stringHashCache[string];
  if (hashed === undefined) {
    hashed = hashString(string);
    if (STRING_HASH_CACHE_SIZE === STRING_HASH_CACHE_MAX_SIZE) {
      STRING_HASH_CACHE_SIZE = 0;
      stringHashCache = {};
    }
    STRING_HASH_CACHE_SIZE++;
    stringHashCache[string] = hashed;
  }
  return hashed;
}

// http://jsperf.com/hashing-strings
function hashString(string) {
  // This is the hash from JVM
  // The hash code for a string is computed as
  // s[0] * 31 ^ (n - 1) + s[1] * 31 ^ (n - 2) + ... + s[n - 1],
  // where s[i] is the ith character of the string and n is the length of
  // the string. We "mod" the result to make it between 0 (inclusive) and 2^31
  // (exclusive) by dropping high bits.
  var hashed = 0;
  for (var ii = 0; ii < string.length; ii++) {
    hashed = (31 * hashed + string.charCodeAt(ii)) | 0;
  }
  return smi(hashed);
}

function hashSymbol(sym) {
  var hashed = symbolMap[sym];
  if (hashed !== undefined) {
    return hashed;
  }

  hashed = nextHash();

  symbolMap[sym] = hashed;

  return hashed;
}

function hashJSObj(obj) {
  var hashed;
  if (usingWeakMap) {
    hashed = weakMap.get(obj);
    if (hashed !== undefined) {
      return hashed;
    }
  }

  hashed = obj[UID_HASH_KEY];
  if (hashed !== undefined) {
    return hashed;
  }

  if (!canDefineProperty) {
    hashed = obj.propertyIsEnumerable && obj.propertyIsEnumerable[UID_HASH_KEY];
    if (hashed !== undefined) {
      return hashed;
    }

    hashed = getIENodeHash(obj);
    if (hashed !== undefined) {
      return hashed;
    }
  }

  hashed = nextHash();

  if (usingWeakMap) {
    weakMap.set(obj, hashed);
  } else if (isExtensible !== undefined && isExtensible(obj) === false) {
    throw new Error('Non-extensible objects are not allowed as keys.');
  } else if (canDefineProperty) {
    Object.defineProperty(obj, UID_HASH_KEY, {
      enumerable: false,
      configurable: false,
      writable: false,
      value: hashed,
    });
  } else if (
    obj.propertyIsEnumerable !== undefined &&
    obj.propertyIsEnumerable === obj.constructor.prototype.propertyIsEnumerable
  ) {
    // Since we can't define a non-enumerable property on the object
    // we'll hijack one of the less-used non-enumerable properties to
    // save our hash on it. Since this is a function it will not show up in
    // `JSON.stringify` which is what we want.
    obj.propertyIsEnumerable = function () {
      return this.constructor.prototype.propertyIsEnumerable.apply(
        this,
        arguments
      );
    };
    obj.propertyIsEnumerable[UID_HASH_KEY] = hashed;
  } else if (obj.nodeType !== undefined) {
    // At this point we couldn't get the IE `uniqueID` to use as a hash
    // and we couldn't use a non-enumerable property to exploit the
    // dontEnum bug so we simply add the `UID_HASH_KEY` on the node
    // itself.
    obj[UID_HASH_KEY] = hashed;
  } else {
    throw new Error('Unable to set a non-enumerable property on object.');
  }

  return hashed;
}

// Get references to ES5 object methods.
var isExtensible = Object.isExtensible;

// True if Object.defineProperty works as expected. IE8 fails this test.
var canDefineProperty = (function () {
  try {
    Object.defineProperty({}, '@', {});
    return true;
  } catch (e) {
    return false;
  }
})();

// IE has a `uniqueID` property on DOM nodes. We can construct the hash from it
// and avoid memory leaks from the IE cloneNode bug.
function getIENodeHash(node) {
  if (node && node.nodeType > 0) {
    switch (node.nodeType) {
      case 1: // Element
        return node.uniqueID;
      case 9: // Document
        return node.documentElement && node.documentElement.uniqueID;
    }
  }
}

function valueOf(obj) {
  return obj.valueOf !== defaultValueOf && typeof obj.valueOf === 'function'
    ? obj.valueOf(obj)
    : obj;
}

function nextHash() {
  var nextHash = ++_objHashUID;
  if (_objHashUID & 0x40000000) {
    _objHashUID = 0;
  }
  return nextHash;
}

// If possible, use a WeakMap.
var usingWeakMap = typeof WeakMap === 'function';
var weakMap;
if (usingWeakMap) {
  weakMap = new WeakMap();
}

var symbolMap = Object.create(null);

var _objHashUID = 0;

var UID_HASH_KEY = '__immutablehash__';
if (typeof Symbol === 'function') {
  UID_HASH_KEY = Symbol(UID_HASH_KEY);
}

var STRING_HASH_CACHE_MIN_STRLEN = 16;
var STRING_HASH_CACHE_MAX_SIZE = 255;
var STRING_HASH_CACHE_SIZE = 0;
var stringHashCache = {};

var ToKeyedSequence = /*@__PURE__*/(function (KeyedSeq) {
  function ToKeyedSequence(indexed, useKeys) {
    this._iter = indexed;
    this._useKeys = useKeys;
    this.size = indexed.size;
  }

  if ( KeyedSeq ) ToKeyedSequence.__proto__ = KeyedSeq;
  ToKeyedSequence.prototype = Object.create( KeyedSeq && KeyedSeq.prototype );
  ToKeyedSequence.prototype.constructor = ToKeyedSequence;

  ToKeyedSequence.prototype.get = function get (key, notSetValue) {
    return this._iter.get(key, notSetValue);
  };

  ToKeyedSequence.prototype.has = function has (key) {
    return this._iter.has(key);
  };

  ToKeyedSequence.prototype.valueSeq = function valueSeq () {
    return this._iter.valueSeq();
  };

  ToKeyedSequence.prototype.reverse = function reverse () {
    var this$1$1 = this;

    var reversedSequence = reverseFactory(this, true);
    if (!this._useKeys) {
      reversedSequence.valueSeq = function () { return this$1$1._iter.toSeq().reverse(); };
    }
    return reversedSequence;
  };

  ToKeyedSequence.prototype.map = function map (mapper, context) {
    var this$1$1 = this;

    var mappedSequence = mapFactory(this, mapper, context);
    if (!this._useKeys) {
      mappedSequence.valueSeq = function () { return this$1$1._iter.toSeq().map(mapper, context); };
    }
    return mappedSequence;
  };

  ToKeyedSequence.prototype.__iterate = function __iterate (fn, reverse) {
    var this$1$1 = this;

    return this._iter.__iterate(function (v, k) { return fn(v, k, this$1$1); }, reverse);
  };

  ToKeyedSequence.prototype.__iterator = function __iterator (type, reverse) {
    return this._iter.__iterator(type, reverse);
  };

  return ToKeyedSequence;
}(KeyedSeq));
ToKeyedSequence.prototype[IS_ORDERED_SYMBOL] = true;

var ToIndexedSequence = /*@__PURE__*/(function (IndexedSeq) {
  function ToIndexedSequence(iter) {
    this._iter = iter;
    this.size = iter.size;
  }

  if ( IndexedSeq ) ToIndexedSequence.__proto__ = IndexedSeq;
  ToIndexedSequence.prototype = Object.create( IndexedSeq && IndexedSeq.prototype );
  ToIndexedSequence.prototype.constructor = ToIndexedSequence;

  ToIndexedSequence.prototype.includes = function includes (value) {
    return this._iter.includes(value);
  };

  ToIndexedSequence.prototype.__iterate = function __iterate (fn, reverse) {
    var this$1$1 = this;

    var i = 0;
    reverse && ensureSize(this);
    return this._iter.__iterate(
      function (v) { return fn(v, reverse ? this$1$1.size - ++i : i++, this$1$1); },
      reverse
    );
  };

  ToIndexedSequence.prototype.__iterator = function __iterator (type, reverse) {
    var this$1$1 = this;

    var iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
    var i = 0;
    reverse && ensureSize(this);
    return new Iterator(function () {
      var step = iterator.next();
      return step.done
        ? step
        : iteratorValue(
            type,
            reverse ? this$1$1.size - ++i : i++,
            step.value,
            step
          );
    });
  };

  return ToIndexedSequence;
}(IndexedSeq));

var ToSetSequence = /*@__PURE__*/(function (SetSeq) {
  function ToSetSequence(iter) {
    this._iter = iter;
    this.size = iter.size;
  }

  if ( SetSeq ) ToSetSequence.__proto__ = SetSeq;
  ToSetSequence.prototype = Object.create( SetSeq && SetSeq.prototype );
  ToSetSequence.prototype.constructor = ToSetSequence;

  ToSetSequence.prototype.has = function has (key) {
    return this._iter.includes(key);
  };

  ToSetSequence.prototype.__iterate = function __iterate (fn, reverse) {
    var this$1$1 = this;

    return this._iter.__iterate(function (v) { return fn(v, v, this$1$1); }, reverse);
  };

  ToSetSequence.prototype.__iterator = function __iterator (type, reverse) {
    var iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
    return new Iterator(function () {
      var step = iterator.next();
      return step.done
        ? step
        : iteratorValue(type, step.value, step.value, step);
    });
  };

  return ToSetSequence;
}(SetSeq));

var FromEntriesSequence = /*@__PURE__*/(function (KeyedSeq) {
  function FromEntriesSequence(entries) {
    this._iter = entries;
    this.size = entries.size;
  }

  if ( KeyedSeq ) FromEntriesSequence.__proto__ = KeyedSeq;
  FromEntriesSequence.prototype = Object.create( KeyedSeq && KeyedSeq.prototype );
  FromEntriesSequence.prototype.constructor = FromEntriesSequence;

  FromEntriesSequence.prototype.entrySeq = function entrySeq () {
    return this._iter.toSeq();
  };

  FromEntriesSequence.prototype.__iterate = function __iterate (fn, reverse) {
    var this$1$1 = this;

    return this._iter.__iterate(function (entry) {
      // Check if entry exists first so array access doesn't throw for holes
      // in the parent iteration.
      if (entry) {
        validateEntry(entry);
        var indexedCollection = isCollection(entry);
        return fn(
          indexedCollection ? entry.get(1) : entry[1],
          indexedCollection ? entry.get(0) : entry[0],
          this$1$1
        );
      }
    }, reverse);
  };

  FromEntriesSequence.prototype.__iterator = function __iterator (type, reverse) {
    var iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
    return new Iterator(function () {
      while (true) {
        var step = iterator.next();
        if (step.done) {
          return step;
        }
        var entry = step.value;
        // Check if entry exists first so array access doesn't throw for holes
        // in the parent iteration.
        if (entry) {
          validateEntry(entry);
          var indexedCollection = isCollection(entry);
          return iteratorValue(
            type,
            indexedCollection ? entry.get(0) : entry[0],
            indexedCollection ? entry.get(1) : entry[1],
            step
          );
        }
      }
    });
  };

  return FromEntriesSequence;
}(KeyedSeq));

ToIndexedSequence.prototype.cacheResult =
  ToKeyedSequence.prototype.cacheResult =
  ToSetSequence.prototype.cacheResult =
  FromEntriesSequence.prototype.cacheResult =
    cacheResultThrough;

function flipFactory(collection) {
  var flipSequence = makeSequence(collection);
  flipSequence._iter = collection;
  flipSequence.size = collection.size;
  flipSequence.flip = function () { return collection; };
  flipSequence.reverse = function () {
    var reversedSequence = collection.reverse.apply(this); // super.reverse()
    reversedSequence.flip = function () { return collection.reverse(); };
    return reversedSequence;
  };
  flipSequence.has = function (key) { return collection.includes(key); };
  flipSequence.includes = function (key) { return collection.has(key); };
  flipSequence.cacheResult = cacheResultThrough;
  flipSequence.__iterateUncached = function (fn, reverse) {
    var this$1$1 = this;

    return collection.__iterate(function (v, k) { return fn(k, v, this$1$1) !== false; }, reverse);
  };
  flipSequence.__iteratorUncached = function (type, reverse) {
    if (type === ITERATE_ENTRIES) {
      var iterator = collection.__iterator(type, reverse);
      return new Iterator(function () {
        var step = iterator.next();
        if (!step.done) {
          var k = step.value[0];
          step.value[0] = step.value[1];
          step.value[1] = k;
        }
        return step;
      });
    }
    return collection.__iterator(
      type === ITERATE_VALUES ? ITERATE_KEYS : ITERATE_VALUES,
      reverse
    );
  };
  return flipSequence;
}

function mapFactory(collection, mapper, context) {
  var mappedSequence = makeSequence(collection);
  mappedSequence.size = collection.size;
  mappedSequence.has = function (key) { return collection.has(key); };
  mappedSequence.get = function (key, notSetValue) {
    var v = collection.get(key, NOT_SET);
    return v === NOT_SET
      ? notSetValue
      : mapper.call(context, v, key, collection);
  };
  mappedSequence.__iterateUncached = function (fn, reverse) {
    var this$1$1 = this;

    return collection.__iterate(
      function (v, k, c) { return fn(mapper.call(context, v, k, c), k, this$1$1) !== false; },
      reverse
    );
  };
  mappedSequence.__iteratorUncached = function (type, reverse) {
    var iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
    return new Iterator(function () {
      var step = iterator.next();
      if (step.done) {
        return step;
      }
      var entry = step.value;
      var key = entry[0];
      return iteratorValue(
        type,
        key,
        mapper.call(context, entry[1], key, collection),
        step
      );
    });
  };
  return mappedSequence;
}

function reverseFactory(collection, useKeys) {
  var this$1$1 = this;

  var reversedSequence = makeSequence(collection);
  reversedSequence._iter = collection;
  reversedSequence.size = collection.size;
  reversedSequence.reverse = function () { return collection; };
  if (collection.flip) {
    reversedSequence.flip = function () {
      var flipSequence = flipFactory(collection);
      flipSequence.reverse = function () { return collection.flip(); };
      return flipSequence;
    };
  }
  reversedSequence.get = function (key, notSetValue) { return collection.get(useKeys ? key : -1 - key, notSetValue); };
  reversedSequence.has = function (key) { return collection.has(useKeys ? key : -1 - key); };
  reversedSequence.includes = function (value) { return collection.includes(value); };
  reversedSequence.cacheResult = cacheResultThrough;
  reversedSequence.__iterate = function (fn, reverse) {
    var this$1$1 = this;

    var i = 0;
    reverse && ensureSize(collection);
    return collection.__iterate(
      function (v, k) { return fn(v, useKeys ? k : reverse ? this$1$1.size - ++i : i++, this$1$1); },
      !reverse
    );
  };
  reversedSequence.__iterator = function (type, reverse) {
    var i = 0;
    reverse && ensureSize(collection);
    var iterator = collection.__iterator(ITERATE_ENTRIES, !reverse);
    return new Iterator(function () {
      var step = iterator.next();
      if (step.done) {
        return step;
      }
      var entry = step.value;
      return iteratorValue(
        type,
        useKeys ? entry[0] : reverse ? this$1$1.size - ++i : i++,
        entry[1],
        step
      );
    });
  };
  return reversedSequence;
}

function filterFactory(collection, predicate, context, useKeys) {
  var filterSequence = makeSequence(collection);
  if (useKeys) {
    filterSequence.has = function (key) {
      var v = collection.get(key, NOT_SET);
      return v !== NOT_SET && !!predicate.call(context, v, key, collection);
    };
    filterSequence.get = function (key, notSetValue) {
      var v = collection.get(key, NOT_SET);
      return v !== NOT_SET && predicate.call(context, v, key, collection)
        ? v
        : notSetValue;
    };
  }
  filterSequence.__iterateUncached = function (fn, reverse) {
    var this$1$1 = this;

    var iterations = 0;
    collection.__iterate(function (v, k, c) {
      if (predicate.call(context, v, k, c)) {
        iterations++;
        return fn(v, useKeys ? k : iterations - 1, this$1$1);
      }
    }, reverse);
    return iterations;
  };
  filterSequence.__iteratorUncached = function (type, reverse) {
    var iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
    var iterations = 0;
    return new Iterator(function () {
      while (true) {
        var step = iterator.next();
        if (step.done) {
          return step;
        }
        var entry = step.value;
        var key = entry[0];
        var value = entry[1];
        if (predicate.call(context, value, key, collection)) {
          return iteratorValue(type, useKeys ? key : iterations++, value, step);
        }
      }
    });
  };
  return filterSequence;
}

function countByFactory(collection, grouper, context) {
  var groups = Map().asMutable();
  collection.__iterate(function (v, k) {
    groups.update(grouper.call(context, v, k, collection), 0, function (a) { return a + 1; });
  });
  return groups.asImmutable();
}

function groupByFactory(collection, grouper, context) {
  var isKeyedIter = isKeyed(collection);
  var groups = (isOrdered(collection) ? OrderedMap() : Map()).asMutable();
  collection.__iterate(function (v, k) {
    groups.update(
      grouper.call(context, v, k, collection),
      function (a) { return ((a = a || []), a.push(isKeyedIter ? [k, v] : v), a); }
    );
  });
  var coerce = collectionClass(collection);
  return groups.map(function (arr) { return reify(collection, coerce(arr)); }).asImmutable();
}

function sliceFactory(collection, begin, end, useKeys) {
  var originalSize = collection.size;

  if (wholeSlice(begin, end, originalSize)) {
    return collection;
  }

  var resolvedBegin = resolveBegin(begin, originalSize);
  var resolvedEnd = resolveEnd(end, originalSize);

  // begin or end will be NaN if they were provided as negative numbers and
  // this collection's size is unknown. In that case, cache first so there is
  // a known size and these do not resolve to NaN.
  if (resolvedBegin !== resolvedBegin || resolvedEnd !== resolvedEnd) {
    return sliceFactory(collection.toSeq().cacheResult(), begin, end, useKeys);
  }

  // Note: resolvedEnd is undefined when the original sequence's length is
  // unknown and this slice did not supply an end and should contain all
  // elements after resolvedBegin.
  // In that case, resolvedSize will be NaN and sliceSize will remain undefined.
  var resolvedSize = resolvedEnd - resolvedBegin;
  var sliceSize;
  if (resolvedSize === resolvedSize) {
    sliceSize = resolvedSize < 0 ? 0 : resolvedSize;
  }

  var sliceSeq = makeSequence(collection);

  // If collection.size is undefined, the size of the realized sliceSeq is
  // unknown at this point unless the number of items to slice is 0
  sliceSeq.size =
    sliceSize === 0 ? sliceSize : (collection.size && sliceSize) || undefined;

  if (!useKeys && isSeq(collection) && sliceSize >= 0) {
    sliceSeq.get = function (index, notSetValue) {
      index = wrapIndex(this, index);
      return index >= 0 && index < sliceSize
        ? collection.get(index + resolvedBegin, notSetValue)
        : notSetValue;
    };
  }

  sliceSeq.__iterateUncached = function (fn, reverse) {
    var this$1$1 = this;

    if (sliceSize === 0) {
      return 0;
    }
    if (reverse) {
      return this.cacheResult().__iterate(fn, reverse);
    }
    var skipped = 0;
    var isSkipping = true;
    var iterations = 0;
    collection.__iterate(function (v, k) {
      if (!(isSkipping && (isSkipping = skipped++ < resolvedBegin))) {
        iterations++;
        return (
          fn(v, useKeys ? k : iterations - 1, this$1$1) !== false &&
          iterations !== sliceSize
        );
      }
    });
    return iterations;
  };

  sliceSeq.__iteratorUncached = function (type, reverse) {
    if (sliceSize !== 0 && reverse) {
      return this.cacheResult().__iterator(type, reverse);
    }
    // Don't bother instantiating parent iterator if taking 0.
    if (sliceSize === 0) {
      return new Iterator(iteratorDone);
    }
    var iterator = collection.__iterator(type, reverse);
    var skipped = 0;
    var iterations = 0;
    return new Iterator(function () {
      while (skipped++ < resolvedBegin) {
        iterator.next();
      }
      if (++iterations > sliceSize) {
        return iteratorDone();
      }
      var step = iterator.next();
      if (useKeys || type === ITERATE_VALUES || step.done) {
        return step;
      }
      if (type === ITERATE_KEYS) {
        return iteratorValue(type, iterations - 1, undefined, step);
      }
      return iteratorValue(type, iterations - 1, step.value[1], step);
    });
  };

  return sliceSeq;
}

function takeWhileFactory(collection, predicate, context) {
  var takeSequence = makeSequence(collection);
  takeSequence.__iterateUncached = function (fn, reverse) {
    var this$1$1 = this;

    if (reverse) {
      return this.cacheResult().__iterate(fn, reverse);
    }
    var iterations = 0;
    collection.__iterate(
      function (v, k, c) { return predicate.call(context, v, k, c) && ++iterations && fn(v, k, this$1$1); }
    );
    return iterations;
  };
  takeSequence.__iteratorUncached = function (type, reverse) {
    var this$1$1 = this;

    if (reverse) {
      return this.cacheResult().__iterator(type, reverse);
    }
    var iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
    var iterating = true;
    return new Iterator(function () {
      if (!iterating) {
        return iteratorDone();
      }
      var step = iterator.next();
      if (step.done) {
        return step;
      }
      var entry = step.value;
      var k = entry[0];
      var v = entry[1];
      if (!predicate.call(context, v, k, this$1$1)) {
        iterating = false;
        return iteratorDone();
      }
      return type === ITERATE_ENTRIES ? step : iteratorValue(type, k, v, step);
    });
  };
  return takeSequence;
}

function skipWhileFactory(collection, predicate, context, useKeys) {
  var skipSequence = makeSequence(collection);
  skipSequence.__iterateUncached = function (fn, reverse) {
    var this$1$1 = this;

    if (reverse) {
      return this.cacheResult().__iterate(fn, reverse);
    }
    var isSkipping = true;
    var iterations = 0;
    collection.__iterate(function (v, k, c) {
      if (!(isSkipping && (isSkipping = predicate.call(context, v, k, c)))) {
        iterations++;
        return fn(v, useKeys ? k : iterations - 1, this$1$1);
      }
    });
    return iterations;
  };
  skipSequence.__iteratorUncached = function (type, reverse) {
    var this$1$1 = this;

    if (reverse) {
      return this.cacheResult().__iterator(type, reverse);
    }
    var iterator = collection.__iterator(ITERATE_ENTRIES, reverse);
    var skipping = true;
    var iterations = 0;
    return new Iterator(function () {
      var step;
      var k;
      var v;
      do {
        step = iterator.next();
        if (step.done) {
          if (useKeys || type === ITERATE_VALUES) {
            return step;
          }
          if (type === ITERATE_KEYS) {
            return iteratorValue(type, iterations++, undefined, step);
          }
          return iteratorValue(type, iterations++, step.value[1], step);
        }
        var entry = step.value;
        k = entry[0];
        v = entry[1];
        skipping && (skipping = predicate.call(context, v, k, this$1$1));
      } while (skipping);
      return type === ITERATE_ENTRIES ? step : iteratorValue(type, k, v, step);
    });
  };
  return skipSequence;
}

function concatFactory(collection, values) {
  var isKeyedCollection = isKeyed(collection);
  var iters = [collection]
    .concat(values)
    .map(function (v) {
      if (!isCollection(v)) {
        v = isKeyedCollection
          ? keyedSeqFromValue(v)
          : indexedSeqFromValue(Array.isArray(v) ? v : [v]);
      } else if (isKeyedCollection) {
        v = KeyedCollection(v);
      }
      return v;
    })
    .filter(function (v) { return v.size !== 0; });

  if (iters.length === 0) {
    return collection;
  }

  if (iters.length === 1) {
    var singleton = iters[0];
    if (
      singleton === collection ||
      (isKeyedCollection && isKeyed(singleton)) ||
      (isIndexed(collection) && isIndexed(singleton))
    ) {
      return singleton;
    }
  }

  var concatSeq = new ArraySeq(iters);
  if (isKeyedCollection) {
    concatSeq = concatSeq.toKeyedSeq();
  } else if (!isIndexed(collection)) {
    concatSeq = concatSeq.toSetSeq();
  }
  concatSeq = concatSeq.flatten(true);
  concatSeq.size = iters.reduce(function (sum, seq) {
    if (sum !== undefined) {
      var size = seq.size;
      if (size !== undefined) {
        return sum + size;
      }
    }
  }, 0);
  return concatSeq;
}

function flattenFactory(collection, depth, useKeys) {
  var flatSequence = makeSequence(collection);
  flatSequence.__iterateUncached = function (fn, reverse) {
    if (reverse) {
      return this.cacheResult().__iterate(fn, reverse);
    }
    var iterations = 0;
    var stopped = false;
    function flatDeep(iter, currentDepth) {
      iter.__iterate(function (v, k) {
        if ((!depth || currentDepth < depth) && isCollection(v)) {
          flatDeep(v, currentDepth + 1);
        } else {
          iterations++;
          if (fn(v, useKeys ? k : iterations - 1, flatSequence) === false) {
            stopped = true;
          }
        }
        return !stopped;
      }, reverse);
    }
    flatDeep(collection, 0);
    return iterations;
  };
  flatSequence.__iteratorUncached = function (type, reverse) {
    if (reverse) {
      return this.cacheResult().__iterator(type, reverse);
    }
    var iterator = collection.__iterator(type, reverse);
    var stack = [];
    var iterations = 0;
    return new Iterator(function () {
      while (iterator) {
        var step = iterator.next();
        if (step.done !== false) {
          iterator = stack.pop();
          continue;
        }
        var v = step.value;
        if (type === ITERATE_ENTRIES) {
          v = v[1];
        }
        if ((!depth || stack.length < depth) && isCollection(v)) {
          stack.push(iterator);
          iterator = v.__iterator(type, reverse);
        } else {
          return useKeys ? step : iteratorValue(type, iterations++, v, step);
        }
      }
      return iteratorDone();
    });
  };
  return flatSequence;
}

function flatMapFactory(collection, mapper, context) {
  var coerce = collectionClass(collection);
  return collection
    .toSeq()
    .map(function (v, k) { return coerce(mapper.call(context, v, k, collection)); })
    .flatten(true);
}

function interposeFactory(collection, separator) {
  var interposedSequence = makeSequence(collection);
  interposedSequence.size = collection.size && collection.size * 2 - 1;
  interposedSequence.__iterateUncached = function (fn, reverse) {
    var this$1$1 = this;

    var iterations = 0;
    collection.__iterate(
      function (v) { return (!iterations || fn(separator, iterations++, this$1$1) !== false) &&
        fn(v, iterations++, this$1$1) !== false; },
      reverse
    );
    return iterations;
  };
  interposedSequence.__iteratorUncached = function (type, reverse) {
    var iterator = collection.__iterator(ITERATE_VALUES, reverse);
    var iterations = 0;
    var step;
    return new Iterator(function () {
      if (!step || iterations % 2) {
        step = iterator.next();
        if (step.done) {
          return step;
        }
      }
      return iterations % 2
        ? iteratorValue(type, iterations++, separator)
        : iteratorValue(type, iterations++, step.value, step);
    });
  };
  return interposedSequence;
}

function sortFactory(collection, comparator, mapper) {
  if (!comparator) {
    comparator = defaultComparator;
  }
  var isKeyedCollection = isKeyed(collection);
  var index = 0;
  var entries = collection
    .toSeq()
    .map(function (v, k) { return [k, v, index++, mapper ? mapper(v, k, collection) : v]; })
    .valueSeq()
    .toArray();
  entries
    .sort(function (a, b) { return comparator(a[3], b[3]) || a[2] - b[2]; })
    .forEach(
      isKeyedCollection
        ? function (v, i) {
            entries[i].length = 2;
          }
        : function (v, i) {
            entries[i] = v[1];
          }
    );
  return isKeyedCollection
    ? KeyedSeq(entries)
    : isIndexed(collection)
    ? IndexedSeq(entries)
    : SetSeq(entries);
}

function maxFactory(collection, comparator, mapper) {
  if (!comparator) {
    comparator = defaultComparator;
  }
  if (mapper) {
    var entry = collection
      .toSeq()
      .map(function (v, k) { return [v, mapper(v, k, collection)]; })
      .reduce(function (a, b) { return (maxCompare(comparator, a[1], b[1]) ? b : a); });
    return entry && entry[0];
  }
  return collection.reduce(function (a, b) { return (maxCompare(comparator, a, b) ? b : a); });
}

function maxCompare(comparator, a, b) {
  var comp = comparator(b, a);
  // b is considered the new max if the comparator declares them equal, but
  // they are not equal and b is in fact a nullish value.
  return (
    (comp === 0 && b !== a && (b === undefined || b === null || b !== b)) ||
    comp > 0
  );
}

function zipWithFactory(keyIter, zipper, iters, zipAll) {
  var zipSequence = makeSequence(keyIter);
  var sizes = new ArraySeq(iters).map(function (i) { return i.size; });
  zipSequence.size = zipAll ? sizes.max() : sizes.min();
  // Note: this a generic base implementation of __iterate in terms of
  // __iterator which may be more generically useful in the future.
  zipSequence.__iterate = function (fn, reverse) {
    /* generic:
    var iterator = this.__iterator(ITERATE_ENTRIES, reverse);
    var step;
    var iterations = 0;
    while (!(step = iterator.next()).done) {
      iterations++;
      if (fn(step.value[1], step.value[0], this) === false) {
        break;
      }
    }
    return iterations;
    */
    // indexed:
    var iterator = this.__iterator(ITERATE_VALUES, reverse);
    var step;
    var iterations = 0;
    while (!(step = iterator.next()).done) {
      if (fn(step.value, iterations++, this) === false) {
        break;
      }
    }
    return iterations;
  };
  zipSequence.__iteratorUncached = function (type, reverse) {
    var iterators = iters.map(
      function (i) { return ((i = Collection(i)), getIterator(reverse ? i.reverse() : i)); }
    );
    var iterations = 0;
    var isDone = false;
    return new Iterator(function () {
      var steps;
      if (!isDone) {
        steps = iterators.map(function (i) { return i.next(); });
        isDone = zipAll ? steps.every(function (s) { return s.done; }) : steps.some(function (s) { return s.done; });
      }
      if (isDone) {
        return iteratorDone();
      }
      return iteratorValue(
        type,
        iterations++,
        zipper.apply(
          null,
          steps.map(function (s) { return s.value; })
        )
      );
    });
  };
  return zipSequence;
}

// #pragma Helper Functions

function reify(iter, seq) {
  return iter === seq ? iter : isSeq(iter) ? seq : iter.constructor(seq);
}

function validateEntry(entry) {
  if (entry !== Object(entry)) {
    throw new TypeError('Expected [K, V] tuple: ' + entry);
  }
}

function collectionClass(collection) {
  return isKeyed(collection)
    ? KeyedCollection
    : isIndexed(collection)
    ? IndexedCollection
    : SetCollection;
}

function makeSequence(collection) {
  return Object.create(
    (isKeyed(collection)
      ? KeyedSeq
      : isIndexed(collection)
      ? IndexedSeq
      : SetSeq
    ).prototype
  );
}

function cacheResultThrough() {
  if (this._iter.cacheResult) {
    this._iter.cacheResult();
    this.size = this._iter.size;
    return this;
  }
  return Seq.prototype.cacheResult.call(this);
}

function defaultComparator(a, b) {
  if (a === undefined && b === undefined) {
    return 0;
  }

  if (a === undefined) {
    return 1;
  }

  if (b === undefined) {
    return -1;
  }

  return a > b ? 1 : a < b ? -1 : 0;
}

function arrCopy(arr, offset) {
  offset = offset || 0;
  var len = Math.max(0, arr.length - offset);
  var newArr = new Array(len);
  for (var ii = 0; ii < len; ii++) {
    newArr[ii] = arr[ii + offset];
  }
  return newArr;
}

function invariant(condition, error) {
  if (!condition) { throw new Error(error); }
}

function assertNotInfinite(size) {
  invariant(
    size !== Infinity,
    'Cannot perform this action with an infinite size.'
  );
}

function coerceKeyPath(keyPath) {
  if (isArrayLike(keyPath) && typeof keyPath !== 'string') {
    return keyPath;
  }
  if (isOrdered(keyPath)) {
    return keyPath.toArray();
  }
  throw new TypeError(
    'Invalid keyPath: expected Ordered Collection or Array: ' + keyPath
  );
}

var toString = Object.prototype.toString;

function isPlainObject(value) {
  // The base prototype's toString deals with Argument objects and native namespaces like Math
  if (
    !value ||
    typeof value !== 'object' ||
    toString.call(value) !== '[object Object]'
  ) {
    return false;
  }

  var proto = Object.getPrototypeOf(value);
  if (proto === null) {
    return true;
  }

  // Iteratively going up the prototype chain is needed for cross-realm environments (differing contexts, iframes, etc)
  var parentProto = proto;
  var nextProto = Object.getPrototypeOf(proto);
  while (nextProto !== null) {
    parentProto = nextProto;
    nextProto = Object.getPrototypeOf(parentProto);
  }
  return parentProto === proto;
}

/**
 * Returns true if the value is a potentially-persistent data structure, either
 * provided by Immutable.js or a plain Array or Object.
 */
function isDataStructure(value) {
  return (
    typeof value === 'object' &&
    (isImmutable(value) || Array.isArray(value) || isPlainObject(value))
  );
}

function quoteString(value) {
  try {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
  } catch (_ignoreError) {
    return JSON.stringify(value);
  }
}

function has(collection, key) {
  return isImmutable(collection)
    ? collection.has(key)
    : isDataStructure(collection) && hasOwnProperty.call(collection, key);
}

function get(collection, key, notSetValue) {
  return isImmutable(collection)
    ? collection.get(key, notSetValue)
    : !has(collection, key)
    ? notSetValue
    : typeof collection.get === 'function'
    ? collection.get(key)
    : collection[key];
}

function shallowCopy(from) {
  if (Array.isArray(from)) {
    return arrCopy(from);
  }
  var to = {};
  for (var key in from) {
    if (hasOwnProperty.call(from, key)) {
      to[key] = from[key];
    }
  }
  return to;
}

function remove(collection, key) {
  if (!isDataStructure(collection)) {
    throw new TypeError(
      'Cannot update non-data-structure value: ' + collection
    );
  }
  if (isImmutable(collection)) {
    if (!collection.remove) {
      throw new TypeError(
        'Cannot update immutable value without .remove() method: ' + collection
      );
    }
    return collection.remove(key);
  }
  if (!hasOwnProperty.call(collection, key)) {
    return collection;
  }
  var collectionCopy = shallowCopy(collection);
  if (Array.isArray(collectionCopy)) {
    collectionCopy.splice(key, 1);
  } else {
    delete collectionCopy[key];
  }
  return collectionCopy;
}

function set(collection, key, value) {
  if (!isDataStructure(collection)) {
    throw new TypeError(
      'Cannot update non-data-structure value: ' + collection
    );
  }
  if (isImmutable(collection)) {
    if (!collection.set) {
      throw new TypeError(
        'Cannot update immutable value without .set() method: ' + collection
      );
    }
    return collection.set(key, value);
  }
  if (hasOwnProperty.call(collection, key) && value === collection[key]) {
    return collection;
  }
  var collectionCopy = shallowCopy(collection);
  collectionCopy[key] = value;
  return collectionCopy;
}

function updateIn$1(collection, keyPath, notSetValue, updater) {
  if (!updater) {
    updater = notSetValue;
    notSetValue = undefined;
  }
  var updatedValue = updateInDeeply(
    isImmutable(collection),
    collection,
    coerceKeyPath(keyPath),
    0,
    notSetValue,
    updater
  );
  return updatedValue === NOT_SET ? notSetValue : updatedValue;
}

function updateInDeeply(
  inImmutable,
  existing,
  keyPath,
  i,
  notSetValue,
  updater
) {
  var wasNotSet = existing === NOT_SET;
  if (i === keyPath.length) {
    var existingValue = wasNotSet ? notSetValue : existing;
    var newValue = updater(existingValue);
    return newValue === existingValue ? existing : newValue;
  }
  if (!wasNotSet && !isDataStructure(existing)) {
    throw new TypeError(
      'Cannot update within non-data-structure value in path [' +
        keyPath.slice(0, i).map(quoteString) +
        ']: ' +
        existing
    );
  }
  var key = keyPath[i];
  var nextExisting = wasNotSet ? NOT_SET : get(existing, key, NOT_SET);
  var nextUpdated = updateInDeeply(
    nextExisting === NOT_SET ? inImmutable : isImmutable(nextExisting),
    nextExisting,
    keyPath,
    i + 1,
    notSetValue,
    updater
  );
  return nextUpdated === nextExisting
    ? existing
    : nextUpdated === NOT_SET
    ? remove(existing, key)
    : set(
        wasNotSet ? (inImmutable ? emptyMap() : {}) : existing,
        key,
        nextUpdated
      );
}

function setIn$1(collection, keyPath, value) {
  return updateIn$1(collection, keyPath, NOT_SET, function () { return value; });
}

function setIn(keyPath, v) {
  return setIn$1(this, keyPath, v);
}

function removeIn(collection, keyPath) {
  return updateIn$1(collection, keyPath, function () { return NOT_SET; });
}

function deleteIn(keyPath) {
  return removeIn(this, keyPath);
}

function update$1(collection, key, notSetValue, updater) {
  return updateIn$1(collection, [key], notSetValue, updater);
}

function update(key, notSetValue, updater) {
  return arguments.length === 1
    ? key(this)
    : update$1(this, key, notSetValue, updater);
}

function updateIn(keyPath, notSetValue, updater) {
  return updateIn$1(this, keyPath, notSetValue, updater);
}

function merge$1() {
  var iters = [], len = arguments.length;
  while ( len-- ) iters[ len ] = arguments[ len ];

  return mergeIntoKeyedWith(this, iters);
}

function mergeWith$1(merger) {
  var iters = [], len = arguments.length - 1;
  while ( len-- > 0 ) iters[ len ] = arguments[ len + 1 ];

  if (typeof merger !== 'function') {
    throw new TypeError('Invalid merger function: ' + merger);
  }
  return mergeIntoKeyedWith(this, iters, merger);
}

function mergeIntoKeyedWith(collection, collections, merger) {
  var iters = [];
  for (var ii = 0; ii < collections.length; ii++) {
    var collection$1 = KeyedCollection(collections[ii]);
    if (collection$1.size !== 0) {
      iters.push(collection$1);
    }
  }
  if (iters.length === 0) {
    return collection;
  }
  if (
    collection.toSeq().size === 0 &&
    !collection.__ownerID &&
    iters.length === 1
  ) {
    return collection.constructor(iters[0]);
  }
  return collection.withMutations(function (collection) {
    var mergeIntoCollection = merger
      ? function (value, key) {
          update$1(collection, key, NOT_SET, function (oldVal) { return oldVal === NOT_SET ? value : merger(oldVal, value, key); }
          );
        }
      : function (value, key) {
          collection.set(key, value);
        };
    for (var ii = 0; ii < iters.length; ii++) {
      iters[ii].forEach(mergeIntoCollection);
    }
  });
}

function mergeDeepWithSources(collection, sources, merger) {
  return mergeWithSources(collection, sources, deepMergerWith(merger));
}

function mergeWithSources(collection, sources, merger) {
  if (!isDataStructure(collection)) {
    throw new TypeError(
      'Cannot merge into non-data-structure value: ' + collection
    );
  }
  if (isImmutable(collection)) {
    return typeof merger === 'function' && collection.mergeWith
      ? collection.mergeWith.apply(collection, [ merger ].concat( sources ))
      : collection.merge
      ? collection.merge.apply(collection, sources)
      : collection.concat.apply(collection, sources);
  }
  var isArray = Array.isArray(collection);
  var merged = collection;
  var Collection = isArray ? IndexedCollection : KeyedCollection;
  var mergeItem = isArray
    ? function (value) {
        // Copy on write
        if (merged === collection) {
          merged = shallowCopy(merged);
        }
        merged.push(value);
      }
    : function (value, key) {
        var hasVal = hasOwnProperty.call(merged, key);
        var nextVal =
          hasVal && merger ? merger(merged[key], value, key) : value;
        if (!hasVal || nextVal !== merged[key]) {
          // Copy on write
          if (merged === collection) {
            merged = shallowCopy(merged);
          }
          merged[key] = nextVal;
        }
      };
  for (var i = 0; i < sources.length; i++) {
    Collection(sources[i]).forEach(mergeItem);
  }
  return merged;
}

function deepMergerWith(merger) {
  function deepMerger(oldValue, newValue, key) {
    return isDataStructure(oldValue) &&
      isDataStructure(newValue) &&
      areMergeable(oldValue, newValue)
      ? mergeWithSources(oldValue, [newValue], deepMerger)
      : merger
      ? merger(oldValue, newValue, key)
      : newValue;
  }
  return deepMerger;
}

/**
 * It's unclear what the desired behavior is for merging two collections that
 * fall into separate categories between keyed, indexed, or set-like, so we only
 * consider them mergeable if they fall into the same category.
 */
function areMergeable(oldDataStructure, newDataStructure) {
  var oldSeq = Seq(oldDataStructure);
  var newSeq = Seq(newDataStructure);
  // This logic assumes that a sequence can only fall into one of the three
  // categories mentioned above (since there's no `isSetLike()` method).
  return (
    isIndexed(oldSeq) === isIndexed(newSeq) &&
    isKeyed(oldSeq) === isKeyed(newSeq)
  );
}

function mergeDeep() {
  var iters = [], len = arguments.length;
  while ( len-- ) iters[ len ] = arguments[ len ];

  return mergeDeepWithSources(this, iters);
}

function mergeDeepWith(merger) {
  var iters = [], len = arguments.length - 1;
  while ( len-- > 0 ) iters[ len ] = arguments[ len + 1 ];

  return mergeDeepWithSources(this, iters, merger);
}

function mergeIn(keyPath) {
  var iters = [], len = arguments.length - 1;
  while ( len-- > 0 ) iters[ len ] = arguments[ len + 1 ];

  return updateIn$1(this, keyPath, emptyMap(), function (m) { return mergeWithSources(m, iters); });
}

function mergeDeepIn(keyPath) {
  var iters = [], len = arguments.length - 1;
  while ( len-- > 0 ) iters[ len ] = arguments[ len + 1 ];

  return updateIn$1(this, keyPath, emptyMap(), function (m) { return mergeDeepWithSources(m, iters); }
  );
}

function withMutations(fn) {
  var mutable = this.asMutable();
  fn(mutable);
  return mutable.wasAltered() ? mutable.__ensureOwner(this.__ownerID) : this;
}

function asMutable() {
  return this.__ownerID ? this : this.__ensureOwner(new OwnerID());
}

function asImmutable() {
  return this.__ensureOwner();
}

function wasAltered() {
  return this.__altered;
}

var Map = /*@__PURE__*/(function (KeyedCollection) {
  function Map(value) {
    return value === null || value === undefined
      ? emptyMap()
      : isMap(value) && !isOrdered(value)
      ? value
      : emptyMap().withMutations(function (map) {
          var iter = KeyedCollection(value);
          assertNotInfinite(iter.size);
          iter.forEach(function (v, k) { return map.set(k, v); });
        });
  }

  if ( KeyedCollection ) Map.__proto__ = KeyedCollection;
  Map.prototype = Object.create( KeyedCollection && KeyedCollection.prototype );
  Map.prototype.constructor = Map;

  Map.of = function of () {
    var keyValues = [], len = arguments.length;
    while ( len-- ) keyValues[ len ] = arguments[ len ];

    return emptyMap().withMutations(function (map) {
      for (var i = 0; i < keyValues.length; i += 2) {
        if (i + 1 >= keyValues.length) {
          throw new Error('Missing value for key: ' + keyValues[i]);
        }
        map.set(keyValues[i], keyValues[i + 1]);
      }
    });
  };

  Map.prototype.toString = function toString () {
    return this.__toString('Map {', '}');
  };

  // @pragma Access

  Map.prototype.get = function get (k, notSetValue) {
    return this._root
      ? this._root.get(0, undefined, k, notSetValue)
      : notSetValue;
  };

  // @pragma Modification

  Map.prototype.set = function set (k, v) {
    return updateMap(this, k, v);
  };

  Map.prototype.remove = function remove (k) {
    return updateMap(this, k, NOT_SET);
  };

  Map.prototype.deleteAll = function deleteAll (keys) {
    var collection = Collection(keys);

    if (collection.size === 0) {
      return this;
    }

    return this.withMutations(function (map) {
      collection.forEach(function (key) { return map.remove(key); });
    });
  };

  Map.prototype.clear = function clear () {
    if (this.size === 0) {
      return this;
    }
    if (this.__ownerID) {
      this.size = 0;
      this._root = null;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return emptyMap();
  };

  // @pragma Composition

  Map.prototype.sort = function sort (comparator) {
    // Late binding
    return OrderedMap(sortFactory(this, comparator));
  };

  Map.prototype.sortBy = function sortBy (mapper, comparator) {
    // Late binding
    return OrderedMap(sortFactory(this, comparator, mapper));
  };

  Map.prototype.map = function map (mapper, context) {
    var this$1$1 = this;

    return this.withMutations(function (map) {
      map.forEach(function (value, key) {
        map.set(key, mapper.call(context, value, key, this$1$1));
      });
    });
  };

  // @pragma Mutability

  Map.prototype.__iterator = function __iterator (type, reverse) {
    return new MapIterator(this, type, reverse);
  };

  Map.prototype.__iterate = function __iterate (fn, reverse) {
    var this$1$1 = this;

    var iterations = 0;
    this._root &&
      this._root.iterate(function (entry) {
        iterations++;
        return fn(entry[1], entry[0], this$1$1);
      }, reverse);
    return iterations;
  };

  Map.prototype.__ensureOwner = function __ensureOwner (ownerID) {
    if (ownerID === this.__ownerID) {
      return this;
    }
    if (!ownerID) {
      if (this.size === 0) {
        return emptyMap();
      }
      this.__ownerID = ownerID;
      this.__altered = false;
      return this;
    }
    return makeMap(this.size, this._root, ownerID, this.__hash);
  };

  return Map;
}(KeyedCollection));

Map.isMap = isMap;

var MapPrototype = Map.prototype;
MapPrototype[IS_MAP_SYMBOL] = true;
MapPrototype[DELETE] = MapPrototype.remove;
MapPrototype.removeAll = MapPrototype.deleteAll;
MapPrototype.setIn = setIn;
MapPrototype.removeIn = MapPrototype.deleteIn = deleteIn;
MapPrototype.update = update;
MapPrototype.updateIn = updateIn;
MapPrototype.merge = MapPrototype.concat = merge$1;
MapPrototype.mergeWith = mergeWith$1;
MapPrototype.mergeDeep = mergeDeep;
MapPrototype.mergeDeepWith = mergeDeepWith;
MapPrototype.mergeIn = mergeIn;
MapPrototype.mergeDeepIn = mergeDeepIn;
MapPrototype.withMutations = withMutations;
MapPrototype.wasAltered = wasAltered;
MapPrototype.asImmutable = asImmutable;
MapPrototype['@@transducer/init'] = MapPrototype.asMutable = asMutable;
MapPrototype['@@transducer/step'] = function (result, arr) {
  return result.set(arr[0], arr[1]);
};
MapPrototype['@@transducer/result'] = function (obj) {
  return obj.asImmutable();
};

// #pragma Trie Nodes

var ArrayMapNode = function ArrayMapNode(ownerID, entries) {
  this.ownerID = ownerID;
  this.entries = entries;
};

ArrayMapNode.prototype.get = function get (shift, keyHash, key, notSetValue) {
  var entries = this.entries;
  for (var ii = 0, len = entries.length; ii < len; ii++) {
    if (is(key, entries[ii][0])) {
      return entries[ii][1];
    }
  }
  return notSetValue;
};

ArrayMapNode.prototype.update = function update (ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
  var removed = value === NOT_SET;

  var entries = this.entries;
  var idx = 0;
  var len = entries.length;
  for (; idx < len; idx++) {
    if (is(key, entries[idx][0])) {
      break;
    }
  }
  var exists = idx < len;

  if (exists ? entries[idx][1] === value : removed) {
    return this;
  }

  SetRef(didAlter);
  (removed || !exists) && SetRef(didChangeSize);

  if (removed && entries.length === 1) {
    return; // undefined
  }

  if (!exists && !removed && entries.length >= MAX_ARRAY_MAP_SIZE) {
    return createNodes(ownerID, entries, key, value);
  }

  var isEditable = ownerID && ownerID === this.ownerID;
  var newEntries = isEditable ? entries : arrCopy(entries);

  if (exists) {
    if (removed) {
      idx === len - 1
        ? newEntries.pop()
        : (newEntries[idx] = newEntries.pop());
    } else {
      newEntries[idx] = [key, value];
    }
  } else {
    newEntries.push([key, value]);
  }

  if (isEditable) {
    this.entries = newEntries;
    return this;
  }

  return new ArrayMapNode(ownerID, newEntries);
};

var BitmapIndexedNode = function BitmapIndexedNode(ownerID, bitmap, nodes) {
  this.ownerID = ownerID;
  this.bitmap = bitmap;
  this.nodes = nodes;
};

BitmapIndexedNode.prototype.get = function get (shift, keyHash, key, notSetValue) {
  if (keyHash === undefined) {
    keyHash = hash(key);
  }
  var bit = 1 << ((shift === 0 ? keyHash : keyHash >>> shift) & MASK);
  var bitmap = this.bitmap;
  return (bitmap & bit) === 0
    ? notSetValue
    : this.nodes[popCount(bitmap & (bit - 1))].get(
        shift + SHIFT,
        keyHash,
        key,
        notSetValue
      );
};

BitmapIndexedNode.prototype.update = function update (ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
  if (keyHash === undefined) {
    keyHash = hash(key);
  }
  var keyHashFrag = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
  var bit = 1 << keyHashFrag;
  var bitmap = this.bitmap;
  var exists = (bitmap & bit) !== 0;

  if (!exists && value === NOT_SET) {
    return this;
  }

  var idx = popCount(bitmap & (bit - 1));
  var nodes = this.nodes;
  var node = exists ? nodes[idx] : undefined;
  var newNode = updateNode(
    node,
    ownerID,
    shift + SHIFT,
    keyHash,
    key,
    value,
    didChangeSize,
    didAlter
  );

  if (newNode === node) {
    return this;
  }

  if (!exists && newNode && nodes.length >= MAX_BITMAP_INDEXED_SIZE) {
    return expandNodes(ownerID, nodes, bitmap, keyHashFrag, newNode);
  }

  if (
    exists &&
    !newNode &&
    nodes.length === 2 &&
    isLeafNode(nodes[idx ^ 1])
  ) {
    return nodes[idx ^ 1];
  }

  if (exists && newNode && nodes.length === 1 && isLeafNode(newNode)) {
    return newNode;
  }

  var isEditable = ownerID && ownerID === this.ownerID;
  var newBitmap = exists ? (newNode ? bitmap : bitmap ^ bit) : bitmap | bit;
  var newNodes = exists
    ? newNode
      ? setAt(nodes, idx, newNode, isEditable)
      : spliceOut(nodes, idx, isEditable)
    : spliceIn(nodes, idx, newNode, isEditable);

  if (isEditable) {
    this.bitmap = newBitmap;
    this.nodes = newNodes;
    return this;
  }

  return new BitmapIndexedNode(ownerID, newBitmap, newNodes);
};

var HashArrayMapNode = function HashArrayMapNode(ownerID, count, nodes) {
  this.ownerID = ownerID;
  this.count = count;
  this.nodes = nodes;
};

HashArrayMapNode.prototype.get = function get (shift, keyHash, key, notSetValue) {
  if (keyHash === undefined) {
    keyHash = hash(key);
  }
  var idx = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
  var node = this.nodes[idx];
  return node
    ? node.get(shift + SHIFT, keyHash, key, notSetValue)
    : notSetValue;
};

HashArrayMapNode.prototype.update = function update (ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
  if (keyHash === undefined) {
    keyHash = hash(key);
  }
  var idx = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
  var removed = value === NOT_SET;
  var nodes = this.nodes;
  var node = nodes[idx];

  if (removed && !node) {
    return this;
  }

  var newNode = updateNode(
    node,
    ownerID,
    shift + SHIFT,
    keyHash,
    key,
    value,
    didChangeSize,
    didAlter
  );
  if (newNode === node) {
    return this;
  }

  var newCount = this.count;
  if (!node) {
    newCount++;
  } else if (!newNode) {
    newCount--;
    if (newCount < MIN_HASH_ARRAY_MAP_SIZE) {
      return packNodes(ownerID, nodes, newCount, idx);
    }
  }

  var isEditable = ownerID && ownerID === this.ownerID;
  var newNodes = setAt(nodes, idx, newNode, isEditable);

  if (isEditable) {
    this.count = newCount;
    this.nodes = newNodes;
    return this;
  }

  return new HashArrayMapNode(ownerID, newCount, newNodes);
};

var HashCollisionNode = function HashCollisionNode(ownerID, keyHash, entries) {
  this.ownerID = ownerID;
  this.keyHash = keyHash;
  this.entries = entries;
};

HashCollisionNode.prototype.get = function get (shift, keyHash, key, notSetValue) {
  var entries = this.entries;
  for (var ii = 0, len = entries.length; ii < len; ii++) {
    if (is(key, entries[ii][0])) {
      return entries[ii][1];
    }
  }
  return notSetValue;
};

HashCollisionNode.prototype.update = function update (ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
  if (keyHash === undefined) {
    keyHash = hash(key);
  }

  var removed = value === NOT_SET;

  if (keyHash !== this.keyHash) {
    if (removed) {
      return this;
    }
    SetRef(didAlter);
    SetRef(didChangeSize);
    return mergeIntoNode(this, ownerID, shift, keyHash, [key, value]);
  }

  var entries = this.entries;
  var idx = 0;
  var len = entries.length;
  for (; idx < len; idx++) {
    if (is(key, entries[idx][0])) {
      break;
    }
  }
  var exists = idx < len;

  if (exists ? entries[idx][1] === value : removed) {
    return this;
  }

  SetRef(didAlter);
  (removed || !exists) && SetRef(didChangeSize);

  if (removed && len === 2) {
    return new ValueNode(ownerID, this.keyHash, entries[idx ^ 1]);
  }

  var isEditable = ownerID && ownerID === this.ownerID;
  var newEntries = isEditable ? entries : arrCopy(entries);

  if (exists) {
    if (removed) {
      idx === len - 1
        ? newEntries.pop()
        : (newEntries[idx] = newEntries.pop());
    } else {
      newEntries[idx] = [key, value];
    }
  } else {
    newEntries.push([key, value]);
  }

  if (isEditable) {
    this.entries = newEntries;
    return this;
  }

  return new HashCollisionNode(ownerID, this.keyHash, newEntries);
};

var ValueNode = function ValueNode(ownerID, keyHash, entry) {
  this.ownerID = ownerID;
  this.keyHash = keyHash;
  this.entry = entry;
};

ValueNode.prototype.get = function get (shift, keyHash, key, notSetValue) {
  return is(key, this.entry[0]) ? this.entry[1] : notSetValue;
};

ValueNode.prototype.update = function update (ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
  var removed = value === NOT_SET;
  var keyMatch = is(key, this.entry[0]);
  if (keyMatch ? value === this.entry[1] : removed) {
    return this;
  }

  SetRef(didAlter);

  if (removed) {
    SetRef(didChangeSize);
    return; // undefined
  }

  if (keyMatch) {
    if (ownerID && ownerID === this.ownerID) {
      this.entry[1] = value;
      return this;
    }
    return new ValueNode(ownerID, this.keyHash, [key, value]);
  }

  SetRef(didChangeSize);
  return mergeIntoNode(this, ownerID, shift, hash(key), [key, value]);
};

// #pragma Iterators

ArrayMapNode.prototype.iterate = HashCollisionNode.prototype.iterate =
  function (fn, reverse) {
    var entries = this.entries;
    for (var ii = 0, maxIndex = entries.length - 1; ii <= maxIndex; ii++) {
      if (fn(entries[reverse ? maxIndex - ii : ii]) === false) {
        return false;
      }
    }
  };

BitmapIndexedNode.prototype.iterate = HashArrayMapNode.prototype.iterate =
  function (fn, reverse) {
    var nodes = this.nodes;
    for (var ii = 0, maxIndex = nodes.length - 1; ii <= maxIndex; ii++) {
      var node = nodes[reverse ? maxIndex - ii : ii];
      if (node && node.iterate(fn, reverse) === false) {
        return false;
      }
    }
  };

// eslint-disable-next-line no-unused-vars
ValueNode.prototype.iterate = function (fn, reverse) {
  return fn(this.entry);
};

var MapIterator = /*@__PURE__*/(function (Iterator) {
  function MapIterator(map, type, reverse) {
    this._type = type;
    this._reverse = reverse;
    this._stack = map._root && mapIteratorFrame(map._root);
  }

  if ( Iterator ) MapIterator.__proto__ = Iterator;
  MapIterator.prototype = Object.create( Iterator && Iterator.prototype );
  MapIterator.prototype.constructor = MapIterator;

  MapIterator.prototype.next = function next () {
    var type = this._type;
    var stack = this._stack;
    while (stack) {
      var node = stack.node;
      var index = stack.index++;
      var maxIndex = (void 0);
      if (node.entry) {
        if (index === 0) {
          return mapIteratorValue(type, node.entry);
        }
      } else if (node.entries) {
        maxIndex = node.entries.length - 1;
        if (index <= maxIndex) {
          return mapIteratorValue(
            type,
            node.entries[this._reverse ? maxIndex - index : index]
          );
        }
      } else {
        maxIndex = node.nodes.length - 1;
        if (index <= maxIndex) {
          var subNode = node.nodes[this._reverse ? maxIndex - index : index];
          if (subNode) {
            if (subNode.entry) {
              return mapIteratorValue(type, subNode.entry);
            }
            stack = this._stack = mapIteratorFrame(subNode, stack);
          }
          continue;
        }
      }
      stack = this._stack = this._stack.__prev;
    }
    return iteratorDone();
  };

  return MapIterator;
}(Iterator));

function mapIteratorValue(type, entry) {
  return iteratorValue(type, entry[0], entry[1]);
}

function mapIteratorFrame(node, prev) {
  return {
    node: node,
    index: 0,
    __prev: prev,
  };
}

function makeMap(size, root, ownerID, hash) {
  var map = Object.create(MapPrototype);
  map.size = size;
  map._root = root;
  map.__ownerID = ownerID;
  map.__hash = hash;
  map.__altered = false;
  return map;
}

var EMPTY_MAP;
function emptyMap() {
  return EMPTY_MAP || (EMPTY_MAP = makeMap(0));
}

function updateMap(map, k, v) {
  var newRoot;
  var newSize;
  if (!map._root) {
    if (v === NOT_SET) {
      return map;
    }
    newSize = 1;
    newRoot = new ArrayMapNode(map.__ownerID, [[k, v]]);
  } else {
    var didChangeSize = MakeRef();
    var didAlter = MakeRef();
    newRoot = updateNode(
      map._root,
      map.__ownerID,
      0,
      undefined,
      k,
      v,
      didChangeSize,
      didAlter
    );
    if (!didAlter.value) {
      return map;
    }
    newSize = map.size + (didChangeSize.value ? (v === NOT_SET ? -1 : 1) : 0);
  }
  if (map.__ownerID) {
    map.size = newSize;
    map._root = newRoot;
    map.__hash = undefined;
    map.__altered = true;
    return map;
  }
  return newRoot ? makeMap(newSize, newRoot) : emptyMap();
}

function updateNode(
  node,
  ownerID,
  shift,
  keyHash,
  key,
  value,
  didChangeSize,
  didAlter
) {
  if (!node) {
    if (value === NOT_SET) {
      return node;
    }
    SetRef(didAlter);
    SetRef(didChangeSize);
    return new ValueNode(ownerID, keyHash, [key, value]);
  }
  return node.update(
    ownerID,
    shift,
    keyHash,
    key,
    value,
    didChangeSize,
    didAlter
  );
}

function isLeafNode(node) {
  return (
    node.constructor === ValueNode || node.constructor === HashCollisionNode
  );
}

function mergeIntoNode(node, ownerID, shift, keyHash, entry) {
  if (node.keyHash === keyHash) {
    return new HashCollisionNode(ownerID, keyHash, [node.entry, entry]);
  }

  var idx1 = (shift === 0 ? node.keyHash : node.keyHash >>> shift) & MASK;
  var idx2 = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;

  var newNode;
  var nodes =
    idx1 === idx2
      ? [mergeIntoNode(node, ownerID, shift + SHIFT, keyHash, entry)]
      : ((newNode = new ValueNode(ownerID, keyHash, entry)),
        idx1 < idx2 ? [node, newNode] : [newNode, node]);

  return new BitmapIndexedNode(ownerID, (1 << idx1) | (1 << idx2), nodes);
}

function createNodes(ownerID, entries, key, value) {
  if (!ownerID) {
    ownerID = new OwnerID();
  }
  var node = new ValueNode(ownerID, hash(key), [key, value]);
  for (var ii = 0; ii < entries.length; ii++) {
    var entry = entries[ii];
    node = node.update(ownerID, 0, undefined, entry[0], entry[1]);
  }
  return node;
}

function packNodes(ownerID, nodes, count, excluding) {
  var bitmap = 0;
  var packedII = 0;
  var packedNodes = new Array(count);
  for (var ii = 0, bit = 1, len = nodes.length; ii < len; ii++, bit <<= 1) {
    var node = nodes[ii];
    if (node !== undefined && ii !== excluding) {
      bitmap |= bit;
      packedNodes[packedII++] = node;
    }
  }
  return new BitmapIndexedNode(ownerID, bitmap, packedNodes);
}

function expandNodes(ownerID, nodes, bitmap, including, node) {
  var count = 0;
  var expandedNodes = new Array(SIZE);
  for (var ii = 0; bitmap !== 0; ii++, bitmap >>>= 1) {
    expandedNodes[ii] = bitmap & 1 ? nodes[count++] : undefined;
  }
  expandedNodes[including] = node;
  return new HashArrayMapNode(ownerID, count + 1, expandedNodes);
}

function popCount(x) {
  x -= (x >> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  x += x >> 8;
  x += x >> 16;
  return x & 0x7f;
}

function setAt(array, idx, val, canEdit) {
  var newArray = canEdit ? array : arrCopy(array);
  newArray[idx] = val;
  return newArray;
}

function spliceIn(array, idx, val, canEdit) {
  var newLen = array.length + 1;
  if (canEdit && idx + 1 === newLen) {
    array[idx] = val;
    return array;
  }
  var newArray = new Array(newLen);
  var after = 0;
  for (var ii = 0; ii < newLen; ii++) {
    if (ii === idx) {
      newArray[ii] = val;
      after = -1;
    } else {
      newArray[ii] = array[ii + after];
    }
  }
  return newArray;
}

function spliceOut(array, idx, canEdit) {
  var newLen = array.length - 1;
  if (canEdit && idx === newLen) {
    array.pop();
    return array;
  }
  var newArray = new Array(newLen);
  var after = 0;
  for (var ii = 0; ii < newLen; ii++) {
    if (ii === idx) {
      after = 1;
    }
    newArray[ii] = array[ii + after];
  }
  return newArray;
}

var MAX_ARRAY_MAP_SIZE = SIZE / 4;
var MAX_BITMAP_INDEXED_SIZE = SIZE / 2;
var MIN_HASH_ARRAY_MAP_SIZE = SIZE / 4;

var IS_LIST_SYMBOL = '@@__IMMUTABLE_LIST__@@';

function isList(maybeList) {
  return Boolean(maybeList && maybeList[IS_LIST_SYMBOL]);
}

var List = /*@__PURE__*/(function (IndexedCollection) {
  function List(value) {
    var empty = emptyList();
    if (value === null || value === undefined) {
      return empty;
    }
    if (isList(value)) {
      return value;
    }
    var iter = IndexedCollection(value);
    var size = iter.size;
    if (size === 0) {
      return empty;
    }
    assertNotInfinite(size);
    if (size > 0 && size < SIZE) {
      return makeList(0, size, SHIFT, null, new VNode(iter.toArray()));
    }
    return empty.withMutations(function (list) {
      list.setSize(size);
      iter.forEach(function (v, i) { return list.set(i, v); });
    });
  }

  if ( IndexedCollection ) List.__proto__ = IndexedCollection;
  List.prototype = Object.create( IndexedCollection && IndexedCollection.prototype );
  List.prototype.constructor = List;

  List.of = function of (/*...values*/) {
    return this(arguments);
  };

  List.prototype.toString = function toString () {
    return this.__toString('List [', ']');
  };

  // @pragma Access

  List.prototype.get = function get (index, notSetValue) {
    index = wrapIndex(this, index);
    if (index >= 0 && index < this.size) {
      index += this._origin;
      var node = listNodeFor(this, index);
      return node && node.array[index & MASK];
    }
    return notSetValue;
  };

  // @pragma Modification

  List.prototype.set = function set (index, value) {
    return updateList(this, index, value);
  };

  List.prototype.remove = function remove (index) {
    return !this.has(index)
      ? this
      : index === 0
      ? this.shift()
      : index === this.size - 1
      ? this.pop()
      : this.splice(index, 1);
  };

  List.prototype.insert = function insert (index, value) {
    return this.splice(index, 0, value);
  };

  List.prototype.clear = function clear () {
    if (this.size === 0) {
      return this;
    }
    if (this.__ownerID) {
      this.size = this._origin = this._capacity = 0;
      this._level = SHIFT;
      this._root = this._tail = this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return emptyList();
  };

  List.prototype.push = function push (/*...values*/) {
    var values = arguments;
    var oldSize = this.size;
    return this.withMutations(function (list) {
      setListBounds(list, 0, oldSize + values.length);
      for (var ii = 0; ii < values.length; ii++) {
        list.set(oldSize + ii, values[ii]);
      }
    });
  };

  List.prototype.pop = function pop () {
    return setListBounds(this, 0, -1);
  };

  List.prototype.unshift = function unshift (/*...values*/) {
    var values = arguments;
    return this.withMutations(function (list) {
      setListBounds(list, -values.length);
      for (var ii = 0; ii < values.length; ii++) {
        list.set(ii, values[ii]);
      }
    });
  };

  List.prototype.shift = function shift () {
    return setListBounds(this, 1);
  };

  // @pragma Composition

  List.prototype.concat = function concat (/*...collections*/) {
    var arguments$1 = arguments;

    var seqs = [];
    for (var i = 0; i < arguments.length; i++) {
      var argument = arguments$1[i];
      var seq = IndexedCollection(
        typeof argument !== 'string' && hasIterator(argument)
          ? argument
          : [argument]
      );
      if (seq.size !== 0) {
        seqs.push(seq);
      }
    }
    if (seqs.length === 0) {
      return this;
    }
    if (this.size === 0 && !this.__ownerID && seqs.length === 1) {
      return this.constructor(seqs[0]);
    }
    return this.withMutations(function (list) {
      seqs.forEach(function (seq) { return seq.forEach(function (value) { return list.push(value); }); });
    });
  };

  List.prototype.setSize = function setSize (size) {
    return setListBounds(this, 0, size);
  };

  List.prototype.map = function map (mapper, context) {
    var this$1$1 = this;

    return this.withMutations(function (list) {
      for (var i = 0; i < this$1$1.size; i++) {
        list.set(i, mapper.call(context, list.get(i), i, this$1$1));
      }
    });
  };

  // @pragma Iteration

  List.prototype.slice = function slice (begin, end) {
    var size = this.size;
    if (wholeSlice(begin, end, size)) {
      return this;
    }
    return setListBounds(
      this,
      resolveBegin(begin, size),
      resolveEnd(end, size)
    );
  };

  List.prototype.__iterator = function __iterator (type, reverse) {
    var index = reverse ? this.size : 0;
    var values = iterateList(this, reverse);
    return new Iterator(function () {
      var value = values();
      return value === DONE
        ? iteratorDone()
        : iteratorValue(type, reverse ? --index : index++, value);
    });
  };

  List.prototype.__iterate = function __iterate (fn, reverse) {
    var index = reverse ? this.size : 0;
    var values = iterateList(this, reverse);
    var value;
    while ((value = values()) !== DONE) {
      if (fn(value, reverse ? --index : index++, this) === false) {
        break;
      }
    }
    return index;
  };

  List.prototype.__ensureOwner = function __ensureOwner (ownerID) {
    if (ownerID === this.__ownerID) {
      return this;
    }
    if (!ownerID) {
      if (this.size === 0) {
        return emptyList();
      }
      this.__ownerID = ownerID;
      this.__altered = false;
      return this;
    }
    return makeList(
      this._origin,
      this._capacity,
      this._level,
      this._root,
      this._tail,
      ownerID,
      this.__hash
    );
  };

  return List;
}(IndexedCollection));

List.isList = isList;

var ListPrototype = List.prototype;
ListPrototype[IS_LIST_SYMBOL] = true;
ListPrototype[DELETE] = ListPrototype.remove;
ListPrototype.merge = ListPrototype.concat;
ListPrototype.setIn = setIn;
ListPrototype.deleteIn = ListPrototype.removeIn = deleteIn;
ListPrototype.update = update;
ListPrototype.updateIn = updateIn;
ListPrototype.mergeIn = mergeIn;
ListPrototype.mergeDeepIn = mergeDeepIn;
ListPrototype.withMutations = withMutations;
ListPrototype.wasAltered = wasAltered;
ListPrototype.asImmutable = asImmutable;
ListPrototype['@@transducer/init'] = ListPrototype.asMutable = asMutable;
ListPrototype['@@transducer/step'] = function (result, arr) {
  return result.push(arr);
};
ListPrototype['@@transducer/result'] = function (obj) {
  return obj.asImmutable();
};

var VNode = function VNode(array, ownerID) {
  this.array = array;
  this.ownerID = ownerID;
};

// TODO: seems like these methods are very similar

VNode.prototype.removeBefore = function removeBefore (ownerID, level, index) {
  if (index === level ? 1 << level : this.array.length === 0) {
    return this;
  }
  var originIndex = (index >>> level) & MASK;
  if (originIndex >= this.array.length) {
    return new VNode([], ownerID);
  }
  var removingFirst = originIndex === 0;
  var newChild;
  if (level > 0) {
    var oldChild = this.array[originIndex];
    newChild =
      oldChild && oldChild.removeBefore(ownerID, level - SHIFT, index);
    if (newChild === oldChild && removingFirst) {
      return this;
    }
  }
  if (removingFirst && !newChild) {
    return this;
  }
  var editable = editableVNode(this, ownerID);
  if (!removingFirst) {
    for (var ii = 0; ii < originIndex; ii++) {
      editable.array[ii] = undefined;
    }
  }
  if (newChild) {
    editable.array[originIndex] = newChild;
  }
  return editable;
};

VNode.prototype.removeAfter = function removeAfter (ownerID, level, index) {
  if (index === (level ? 1 << level : 0) || this.array.length === 0) {
    return this;
  }
  var sizeIndex = ((index - 1) >>> level) & MASK;
  if (sizeIndex >= this.array.length) {
    return this;
  }

  var newChild;
  if (level > 0) {
    var oldChild = this.array[sizeIndex];
    newChild =
      oldChild && oldChild.removeAfter(ownerID, level - SHIFT, index);
    if (newChild === oldChild && sizeIndex === this.array.length - 1) {
      return this;
    }
  }

  var editable = editableVNode(this, ownerID);
  editable.array.splice(sizeIndex + 1);
  if (newChild) {
    editable.array[sizeIndex] = newChild;
  }
  return editable;
};

var DONE = {};

function iterateList(list, reverse) {
  var left = list._origin;
  var right = list._capacity;
  var tailPos = getTailOffset(right);
  var tail = list._tail;

  return iterateNodeOrLeaf(list._root, list._level, 0);

  function iterateNodeOrLeaf(node, level, offset) {
    return level === 0
      ? iterateLeaf(node, offset)
      : iterateNode(node, level, offset);
  }

  function iterateLeaf(node, offset) {
    var array = offset === tailPos ? tail && tail.array : node && node.array;
    var from = offset > left ? 0 : left - offset;
    var to = right - offset;
    if (to > SIZE) {
      to = SIZE;
    }
    return function () {
      if (from === to) {
        return DONE;
      }
      var idx = reverse ? --to : from++;
      return array && array[idx];
    };
  }

  function iterateNode(node, level, offset) {
    var values;
    var array = node && node.array;
    var from = offset > left ? 0 : (left - offset) >> level;
    var to = ((right - offset) >> level) + 1;
    if (to > SIZE) {
      to = SIZE;
    }
    return function () {
      while (true) {
        if (values) {
          var value = values();
          if (value !== DONE) {
            return value;
          }
          values = null;
        }
        if (from === to) {
          return DONE;
        }
        var idx = reverse ? --to : from++;
        values = iterateNodeOrLeaf(
          array && array[idx],
          level - SHIFT,
          offset + (idx << level)
        );
      }
    };
  }
}

function makeList(origin, capacity, level, root, tail, ownerID, hash) {
  var list = Object.create(ListPrototype);
  list.size = capacity - origin;
  list._origin = origin;
  list._capacity = capacity;
  list._level = level;
  list._root = root;
  list._tail = tail;
  list.__ownerID = ownerID;
  list.__hash = hash;
  list.__altered = false;
  return list;
}

var EMPTY_LIST;
function emptyList() {
  return EMPTY_LIST || (EMPTY_LIST = makeList(0, 0, SHIFT));
}

function updateList(list, index, value) {
  index = wrapIndex(list, index);

  if (index !== index) {
    return list;
  }

  if (index >= list.size || index < 0) {
    return list.withMutations(function (list) {
      index < 0
        ? setListBounds(list, index).set(0, value)
        : setListBounds(list, 0, index + 1).set(index, value);
    });
  }

  index += list._origin;

  var newTail = list._tail;
  var newRoot = list._root;
  var didAlter = MakeRef();
  if (index >= getTailOffset(list._capacity)) {
    newTail = updateVNode(newTail, list.__ownerID, 0, index, value, didAlter);
  } else {
    newRoot = updateVNode(
      newRoot,
      list.__ownerID,
      list._level,
      index,
      value,
      didAlter
    );
  }

  if (!didAlter.value) {
    return list;
  }

  if (list.__ownerID) {
    list._root = newRoot;
    list._tail = newTail;
    list.__hash = undefined;
    list.__altered = true;
    return list;
  }
  return makeList(list._origin, list._capacity, list._level, newRoot, newTail);
}

function updateVNode(node, ownerID, level, index, value, didAlter) {
  var idx = (index >>> level) & MASK;
  var nodeHas = node && idx < node.array.length;
  if (!nodeHas && value === undefined) {
    return node;
  }

  var newNode;

  if (level > 0) {
    var lowerNode = node && node.array[idx];
    var newLowerNode = updateVNode(
      lowerNode,
      ownerID,
      level - SHIFT,
      index,
      value,
      didAlter
    );
    if (newLowerNode === lowerNode) {
      return node;
    }
    newNode = editableVNode(node, ownerID);
    newNode.array[idx] = newLowerNode;
    return newNode;
  }

  if (nodeHas && node.array[idx] === value) {
    return node;
  }

  if (didAlter) {
    SetRef(didAlter);
  }

  newNode = editableVNode(node, ownerID);
  if (value === undefined && idx === newNode.array.length - 1) {
    newNode.array.pop();
  } else {
    newNode.array[idx] = value;
  }
  return newNode;
}

function editableVNode(node, ownerID) {
  if (ownerID && node && ownerID === node.ownerID) {
    return node;
  }
  return new VNode(node ? node.array.slice() : [], ownerID);
}

function listNodeFor(list, rawIndex) {
  if (rawIndex >= getTailOffset(list._capacity)) {
    return list._tail;
  }
  if (rawIndex < 1 << (list._level + SHIFT)) {
    var node = list._root;
    var level = list._level;
    while (node && level > 0) {
      node = node.array[(rawIndex >>> level) & MASK];
      level -= SHIFT;
    }
    return node;
  }
}

function setListBounds(list, begin, end) {
  // Sanitize begin & end using this shorthand for ToInt32(argument)
  // http://www.ecma-international.org/ecma-262/6.0/#sec-toint32
  if (begin !== undefined) {
    begin |= 0;
  }
  if (end !== undefined) {
    end |= 0;
  }
  var owner = list.__ownerID || new OwnerID();
  var oldOrigin = list._origin;
  var oldCapacity = list._capacity;
  var newOrigin = oldOrigin + begin;
  var newCapacity =
    end === undefined
      ? oldCapacity
      : end < 0
      ? oldCapacity + end
      : oldOrigin + end;
  if (newOrigin === oldOrigin && newCapacity === oldCapacity) {
    return list;
  }

  // If it's going to end after it starts, it's empty.
  if (newOrigin >= newCapacity) {
    return list.clear();
  }

  var newLevel = list._level;
  var newRoot = list._root;

  // New origin might need creating a higher root.
  var offsetShift = 0;
  while (newOrigin + offsetShift < 0) {
    newRoot = new VNode(
      newRoot && newRoot.array.length ? [undefined, newRoot] : [],
      owner
    );
    newLevel += SHIFT;
    offsetShift += 1 << newLevel;
  }
  if (offsetShift) {
    newOrigin += offsetShift;
    oldOrigin += offsetShift;
    newCapacity += offsetShift;
    oldCapacity += offsetShift;
  }

  var oldTailOffset = getTailOffset(oldCapacity);
  var newTailOffset = getTailOffset(newCapacity);

  // New size might need creating a higher root.
  while (newTailOffset >= 1 << (newLevel + SHIFT)) {
    newRoot = new VNode(
      newRoot && newRoot.array.length ? [newRoot] : [],
      owner
    );
    newLevel += SHIFT;
  }

  // Locate or create the new tail.
  var oldTail = list._tail;
  var newTail =
    newTailOffset < oldTailOffset
      ? listNodeFor(list, newCapacity - 1)
      : newTailOffset > oldTailOffset
      ? new VNode([], owner)
      : oldTail;

  // Merge Tail into tree.
  if (
    oldTail &&
    newTailOffset > oldTailOffset &&
    newOrigin < oldCapacity &&
    oldTail.array.length
  ) {
    newRoot = editableVNode(newRoot, owner);
    var node = newRoot;
    for (var level = newLevel; level > SHIFT; level -= SHIFT) {
      var idx = (oldTailOffset >>> level) & MASK;
      node = node.array[idx] = editableVNode(node.array[idx], owner);
    }
    node.array[(oldTailOffset >>> SHIFT) & MASK] = oldTail;
  }

  // If the size has been reduced, there's a chance the tail needs to be trimmed.
  if (newCapacity < oldCapacity) {
    newTail = newTail && newTail.removeAfter(owner, 0, newCapacity);
  }

  // If the new origin is within the tail, then we do not need a root.
  if (newOrigin >= newTailOffset) {
    newOrigin -= newTailOffset;
    newCapacity -= newTailOffset;
    newLevel = SHIFT;
    newRoot = null;
    newTail = newTail && newTail.removeBefore(owner, 0, newOrigin);

    // Otherwise, if the root has been trimmed, garbage collect.
  } else if (newOrigin > oldOrigin || newTailOffset < oldTailOffset) {
    offsetShift = 0;

    // Identify the new top root node of the subtree of the old root.
    while (newRoot) {
      var beginIndex = (newOrigin >>> newLevel) & MASK;
      if ((beginIndex !== newTailOffset >>> newLevel) & MASK) {
        break;
      }
      if (beginIndex) {
        offsetShift += (1 << newLevel) * beginIndex;
      }
      newLevel -= SHIFT;
      newRoot = newRoot.array[beginIndex];
    }

    // Trim the new sides of the new root.
    if (newRoot && newOrigin > oldOrigin) {
      newRoot = newRoot.removeBefore(owner, newLevel, newOrigin - offsetShift);
    }
    if (newRoot && newTailOffset < oldTailOffset) {
      newRoot = newRoot.removeAfter(
        owner,
        newLevel,
        newTailOffset - offsetShift
      );
    }
    if (offsetShift) {
      newOrigin -= offsetShift;
      newCapacity -= offsetShift;
    }
  }

  if (list.__ownerID) {
    list.size = newCapacity - newOrigin;
    list._origin = newOrigin;
    list._capacity = newCapacity;
    list._level = newLevel;
    list._root = newRoot;
    list._tail = newTail;
    list.__hash = undefined;
    list.__altered = true;
    return list;
  }
  return makeList(newOrigin, newCapacity, newLevel, newRoot, newTail);
}

function getTailOffset(size) {
  return size < SIZE ? 0 : ((size - 1) >>> SHIFT) << SHIFT;
}

var OrderedMap = /*@__PURE__*/(function (Map) {
  function OrderedMap(value) {
    return value === null || value === undefined
      ? emptyOrderedMap()
      : isOrderedMap(value)
      ? value
      : emptyOrderedMap().withMutations(function (map) {
          var iter = KeyedCollection(value);
          assertNotInfinite(iter.size);
          iter.forEach(function (v, k) { return map.set(k, v); });
        });
  }

  if ( Map ) OrderedMap.__proto__ = Map;
  OrderedMap.prototype = Object.create( Map && Map.prototype );
  OrderedMap.prototype.constructor = OrderedMap;

  OrderedMap.of = function of (/*...values*/) {
    return this(arguments);
  };

  OrderedMap.prototype.toString = function toString () {
    return this.__toString('OrderedMap {', '}');
  };

  // @pragma Access

  OrderedMap.prototype.get = function get (k, notSetValue) {
    var index = this._map.get(k);
    return index !== undefined ? this._list.get(index)[1] : notSetValue;
  };

  // @pragma Modification

  OrderedMap.prototype.clear = function clear () {
    if (this.size === 0) {
      return this;
    }
    if (this.__ownerID) {
      this.size = 0;
      this._map.clear();
      this._list.clear();
      this.__altered = true;
      return this;
    }
    return emptyOrderedMap();
  };

  OrderedMap.prototype.set = function set (k, v) {
    return updateOrderedMap(this, k, v);
  };

  OrderedMap.prototype.remove = function remove (k) {
    return updateOrderedMap(this, k, NOT_SET);
  };

  OrderedMap.prototype.__iterate = function __iterate (fn, reverse) {
    var this$1$1 = this;

    return this._list.__iterate(
      function (entry) { return entry && fn(entry[1], entry[0], this$1$1); },
      reverse
    );
  };

  OrderedMap.prototype.__iterator = function __iterator (type, reverse) {
    return this._list.fromEntrySeq().__iterator(type, reverse);
  };

  OrderedMap.prototype.__ensureOwner = function __ensureOwner (ownerID) {
    if (ownerID === this.__ownerID) {
      return this;
    }
    var newMap = this._map.__ensureOwner(ownerID);
    var newList = this._list.__ensureOwner(ownerID);
    if (!ownerID) {
      if (this.size === 0) {
        return emptyOrderedMap();
      }
      this.__ownerID = ownerID;
      this.__altered = false;
      this._map = newMap;
      this._list = newList;
      return this;
    }
    return makeOrderedMap(newMap, newList, ownerID, this.__hash);
  };

  return OrderedMap;
}(Map));

OrderedMap.isOrderedMap = isOrderedMap;

OrderedMap.prototype[IS_ORDERED_SYMBOL] = true;
OrderedMap.prototype[DELETE] = OrderedMap.prototype.remove;

function makeOrderedMap(map, list, ownerID, hash) {
  var omap = Object.create(OrderedMap.prototype);
  omap.size = map ? map.size : 0;
  omap._map = map;
  omap._list = list;
  omap.__ownerID = ownerID;
  omap.__hash = hash;
  omap.__altered = false;
  return omap;
}

var EMPTY_ORDERED_MAP;
function emptyOrderedMap() {
  return (
    EMPTY_ORDERED_MAP ||
    (EMPTY_ORDERED_MAP = makeOrderedMap(emptyMap(), emptyList()))
  );
}

function updateOrderedMap(omap, k, v) {
  var map = omap._map;
  var list = omap._list;
  var i = map.get(k);
  var has = i !== undefined;
  var newMap;
  var newList;
  if (v === NOT_SET) {
    // removed
    if (!has) {
      return omap;
    }
    if (list.size >= SIZE && list.size >= map.size * 2) {
      newList = list.filter(function (entry, idx) { return entry !== undefined && i !== idx; });
      newMap = newList
        .toKeyedSeq()
        .map(function (entry) { return entry[0]; })
        .flip()
        .toMap();
      if (omap.__ownerID) {
        newMap.__ownerID = newList.__ownerID = omap.__ownerID;
      }
    } else {
      newMap = map.remove(k);
      newList = i === list.size - 1 ? list.pop() : list.set(i, undefined);
    }
  } else if (has) {
    if (v === list.get(i)[1]) {
      return omap;
    }
    newMap = map;
    newList = list.set(i, [k, v]);
  } else {
    newMap = map.set(k, list.size);
    newList = list.set(list.size, [k, v]);
  }
  if (omap.__ownerID) {
    omap.size = newMap.size;
    omap._map = newMap;
    omap._list = newList;
    omap.__hash = undefined;
    omap.__altered = true;
    return omap;
  }
  return makeOrderedMap(newMap, newList);
}

var IS_STACK_SYMBOL = '@@__IMMUTABLE_STACK__@@';

function isStack(maybeStack) {
  return Boolean(maybeStack && maybeStack[IS_STACK_SYMBOL]);
}

var Stack = /*@__PURE__*/(function (IndexedCollection) {
  function Stack(value) {
    return value === null || value === undefined
      ? emptyStack()
      : isStack(value)
      ? value
      : emptyStack().pushAll(value);
  }

  if ( IndexedCollection ) Stack.__proto__ = IndexedCollection;
  Stack.prototype = Object.create( IndexedCollection && IndexedCollection.prototype );
  Stack.prototype.constructor = Stack;

  Stack.of = function of (/*...values*/) {
    return this(arguments);
  };

  Stack.prototype.toString = function toString () {
    return this.__toString('Stack [', ']');
  };

  // @pragma Access

  Stack.prototype.get = function get (index, notSetValue) {
    var head = this._head;
    index = wrapIndex(this, index);
    while (head && index--) {
      head = head.next;
    }
    return head ? head.value : notSetValue;
  };

  Stack.prototype.peek = function peek () {
    return this._head && this._head.value;
  };

  // @pragma Modification

  Stack.prototype.push = function push (/*...values*/) {
    var arguments$1 = arguments;

    if (arguments.length === 0) {
      return this;
    }
    var newSize = this.size + arguments.length;
    var head = this._head;
    for (var ii = arguments.length - 1; ii >= 0; ii--) {
      head = {
        value: arguments$1[ii],
        next: head,
      };
    }
    if (this.__ownerID) {
      this.size = newSize;
      this._head = head;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return makeStack(newSize, head);
  };

  Stack.prototype.pushAll = function pushAll (iter) {
    iter = IndexedCollection(iter);
    if (iter.size === 0) {
      return this;
    }
    if (this.size === 0 && isStack(iter)) {
      return iter;
    }
    assertNotInfinite(iter.size);
    var newSize = this.size;
    var head = this._head;
    iter.__iterate(function (value) {
      newSize++;
      head = {
        value: value,
        next: head,
      };
    }, /* reverse */ true);
    if (this.__ownerID) {
      this.size = newSize;
      this._head = head;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return makeStack(newSize, head);
  };

  Stack.prototype.pop = function pop () {
    return this.slice(1);
  };

  Stack.prototype.clear = function clear () {
    if (this.size === 0) {
      return this;
    }
    if (this.__ownerID) {
      this.size = 0;
      this._head = undefined;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return emptyStack();
  };

  Stack.prototype.slice = function slice (begin, end) {
    if (wholeSlice(begin, end, this.size)) {
      return this;
    }
    var resolvedBegin = resolveBegin(begin, this.size);
    var resolvedEnd = resolveEnd(end, this.size);
    if (resolvedEnd !== this.size) {
      // super.slice(begin, end);
      return IndexedCollection.prototype.slice.call(this, begin, end);
    }
    var newSize = this.size - resolvedBegin;
    var head = this._head;
    while (resolvedBegin--) {
      head = head.next;
    }
    if (this.__ownerID) {
      this.size = newSize;
      this._head = head;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return makeStack(newSize, head);
  };

  // @pragma Mutability

  Stack.prototype.__ensureOwner = function __ensureOwner (ownerID) {
    if (ownerID === this.__ownerID) {
      return this;
    }
    if (!ownerID) {
      if (this.size === 0) {
        return emptyStack();
      }
      this.__ownerID = ownerID;
      this.__altered = false;
      return this;
    }
    return makeStack(this.size, this._head, ownerID, this.__hash);
  };

  // @pragma Iteration

  Stack.prototype.__iterate = function __iterate (fn, reverse) {
    var this$1$1 = this;

    if (reverse) {
      return new ArraySeq(this.toArray()).__iterate(
        function (v, k) { return fn(v, k, this$1$1); },
        reverse
      );
    }
    var iterations = 0;
    var node = this._head;
    while (node) {
      if (fn(node.value, iterations++, this) === false) {
        break;
      }
      node = node.next;
    }
    return iterations;
  };

  Stack.prototype.__iterator = function __iterator (type, reverse) {
    if (reverse) {
      return new ArraySeq(this.toArray()).__iterator(type, reverse);
    }
    var iterations = 0;
    var node = this._head;
    return new Iterator(function () {
      if (node) {
        var value = node.value;
        node = node.next;
        return iteratorValue(type, iterations++, value);
      }
      return iteratorDone();
    });
  };

  return Stack;
}(IndexedCollection));

Stack.isStack = isStack;

var StackPrototype = Stack.prototype;
StackPrototype[IS_STACK_SYMBOL] = true;
StackPrototype.shift = StackPrototype.pop;
StackPrototype.unshift = StackPrototype.push;
StackPrototype.unshiftAll = StackPrototype.pushAll;
StackPrototype.withMutations = withMutations;
StackPrototype.wasAltered = wasAltered;
StackPrototype.asImmutable = asImmutable;
StackPrototype['@@transducer/init'] = StackPrototype.asMutable = asMutable;
StackPrototype['@@transducer/step'] = function (result, arr) {
  return result.unshift(arr);
};
StackPrototype['@@transducer/result'] = function (obj) {
  return obj.asImmutable();
};

function makeStack(size, head, ownerID, hash) {
  var map = Object.create(StackPrototype);
  map.size = size;
  map._head = head;
  map.__ownerID = ownerID;
  map.__hash = hash;
  map.__altered = false;
  return map;
}

var EMPTY_STACK;
function emptyStack() {
  return EMPTY_STACK || (EMPTY_STACK = makeStack(0));
}

var IS_SET_SYMBOL = '@@__IMMUTABLE_SET__@@';

function isSet(maybeSet) {
  return Boolean(maybeSet && maybeSet[IS_SET_SYMBOL]);
}

function isOrderedSet(maybeOrderedSet) {
  return isSet(maybeOrderedSet) && isOrdered(maybeOrderedSet);
}

function deepEqual(a, b) {
  if (a === b) {
    return true;
  }

  if (
    !isCollection(b) ||
    (a.size !== undefined && b.size !== undefined && a.size !== b.size) ||
    (a.__hash !== undefined &&
      b.__hash !== undefined &&
      a.__hash !== b.__hash) ||
    isKeyed(a) !== isKeyed(b) ||
    isIndexed(a) !== isIndexed(b) ||
    isOrdered(a) !== isOrdered(b)
  ) {
    return false;
  }

  if (a.size === 0 && b.size === 0) {
    return true;
  }

  var notAssociative = !isAssociative(a);

  if (isOrdered(a)) {
    var entries = a.entries();
    return (
      b.every(function (v, k) {
        var entry = entries.next().value;
        return entry && is(entry[1], v) && (notAssociative || is(entry[0], k));
      }) && entries.next().done
    );
  }

  var flipped = false;

  if (a.size === undefined) {
    if (b.size === undefined) {
      if (typeof a.cacheResult === 'function') {
        a.cacheResult();
      }
    } else {
      flipped = true;
      var _ = a;
      a = b;
      b = _;
    }
  }

  var allEqual = true;
  var bSize = b.__iterate(function (v, k) {
    if (
      notAssociative
        ? !a.has(v)
        : flipped
        ? !is(v, a.get(k, NOT_SET))
        : !is(a.get(k, NOT_SET), v)
    ) {
      allEqual = false;
      return false;
    }
  });

  return allEqual && a.size === bSize;
}

function mixin(ctor, methods) {
  var keyCopier = function (key) {
    ctor.prototype[key] = methods[key];
  };
  Object.keys(methods).forEach(keyCopier);
  Object.getOwnPropertySymbols &&
    Object.getOwnPropertySymbols(methods).forEach(keyCopier);
  return ctor;
}

function toJS(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (!isCollection(value)) {
    if (!isDataStructure(value)) {
      return value;
    }
    value = Seq(value);
  }
  if (isKeyed(value)) {
    var result$1 = {};
    value.__iterate(function (v, k) {
      result$1[k] = toJS(v);
    });
    return result$1;
  }
  var result = [];
  value.__iterate(function (v) {
    result.push(toJS(v));
  });
  return result;
}

var Set = /*@__PURE__*/(function (SetCollection) {
  function Set(value) {
    return value === null || value === undefined
      ? emptySet()
      : isSet(value) && !isOrdered(value)
      ? value
      : emptySet().withMutations(function (set) {
          var iter = SetCollection(value);
          assertNotInfinite(iter.size);
          iter.forEach(function (v) { return set.add(v); });
        });
  }

  if ( SetCollection ) Set.__proto__ = SetCollection;
  Set.prototype = Object.create( SetCollection && SetCollection.prototype );
  Set.prototype.constructor = Set;

  Set.of = function of (/*...values*/) {
    return this(arguments);
  };

  Set.fromKeys = function fromKeys (value) {
    return this(KeyedCollection(value).keySeq());
  };

  Set.intersect = function intersect (sets) {
    sets = Collection(sets).toArray();
    return sets.length
      ? SetPrototype.intersect.apply(Set(sets.pop()), sets)
      : emptySet();
  };

  Set.union = function union (sets) {
    sets = Collection(sets).toArray();
    return sets.length
      ? SetPrototype.union.apply(Set(sets.pop()), sets)
      : emptySet();
  };

  Set.prototype.toString = function toString () {
    return this.__toString('Set {', '}');
  };

  // @pragma Access

  Set.prototype.has = function has (value) {
    return this._map.has(value);
  };

  // @pragma Modification

  Set.prototype.add = function add (value) {
    return updateSet(this, this._map.set(value, value));
  };

  Set.prototype.remove = function remove (value) {
    return updateSet(this, this._map.remove(value));
  };

  Set.prototype.clear = function clear () {
    return updateSet(this, this._map.clear());
  };

  // @pragma Composition

  Set.prototype.map = function map (mapper, context) {
    var this$1$1 = this;

    // keep track if the set is altered by the map function
    var didChanges = false;

    var newMap = updateSet(
      this,
      this._map.mapEntries(function (ref) {
        var v = ref[1];

        var mapped = mapper.call(context, v, v, this$1$1);

        if (mapped !== v) {
          didChanges = true;
        }

        return [mapped, mapped];
      }, context)
    );

    return didChanges ? newMap : this;
  };

  Set.prototype.union = function union () {
    var iters = [], len = arguments.length;
    while ( len-- ) iters[ len ] = arguments[ len ];

    iters = iters.filter(function (x) { return x.size !== 0; });
    if (iters.length === 0) {
      return this;
    }
    if (this.size === 0 && !this.__ownerID && iters.length === 1) {
      return this.constructor(iters[0]);
    }
    return this.withMutations(function (set) {
      for (var ii = 0; ii < iters.length; ii++) {
        SetCollection(iters[ii]).forEach(function (value) { return set.add(value); });
      }
    });
  };

  Set.prototype.intersect = function intersect () {
    var iters = [], len = arguments.length;
    while ( len-- ) iters[ len ] = arguments[ len ];

    if (iters.length === 0) {
      return this;
    }
    iters = iters.map(function (iter) { return SetCollection(iter); });
    var toRemove = [];
    this.forEach(function (value) {
      if (!iters.every(function (iter) { return iter.includes(value); })) {
        toRemove.push(value);
      }
    });
    return this.withMutations(function (set) {
      toRemove.forEach(function (value) {
        set.remove(value);
      });
    });
  };

  Set.prototype.subtract = function subtract () {
    var iters = [], len = arguments.length;
    while ( len-- ) iters[ len ] = arguments[ len ];

    if (iters.length === 0) {
      return this;
    }
    iters = iters.map(function (iter) { return SetCollection(iter); });
    var toRemove = [];
    this.forEach(function (value) {
      if (iters.some(function (iter) { return iter.includes(value); })) {
        toRemove.push(value);
      }
    });
    return this.withMutations(function (set) {
      toRemove.forEach(function (value) {
        set.remove(value);
      });
    });
  };

  Set.prototype.sort = function sort (comparator) {
    // Late binding
    return OrderedSet(sortFactory(this, comparator));
  };

  Set.prototype.sortBy = function sortBy (mapper, comparator) {
    // Late binding
    return OrderedSet(sortFactory(this, comparator, mapper));
  };

  Set.prototype.wasAltered = function wasAltered () {
    return this._map.wasAltered();
  };

  Set.prototype.__iterate = function __iterate (fn, reverse) {
    var this$1$1 = this;

    return this._map.__iterate(function (k) { return fn(k, k, this$1$1); }, reverse);
  };

  Set.prototype.__iterator = function __iterator (type, reverse) {
    return this._map.__iterator(type, reverse);
  };

  Set.prototype.__ensureOwner = function __ensureOwner (ownerID) {
    if (ownerID === this.__ownerID) {
      return this;
    }
    var newMap = this._map.__ensureOwner(ownerID);
    if (!ownerID) {
      if (this.size === 0) {
        return this.__empty();
      }
      this.__ownerID = ownerID;
      this._map = newMap;
      return this;
    }
    return this.__make(newMap, ownerID);
  };

  return Set;
}(SetCollection));

Set.isSet = isSet;

var SetPrototype = Set.prototype;
SetPrototype[IS_SET_SYMBOL] = true;
SetPrototype[DELETE] = SetPrototype.remove;
SetPrototype.merge = SetPrototype.concat = SetPrototype.union;
SetPrototype.withMutations = withMutations;
SetPrototype.asImmutable = asImmutable;
SetPrototype['@@transducer/init'] = SetPrototype.asMutable = asMutable;
SetPrototype['@@transducer/step'] = function (result, arr) {
  return result.add(arr);
};
SetPrototype['@@transducer/result'] = function (obj) {
  return obj.asImmutable();
};

SetPrototype.__empty = emptySet;
SetPrototype.__make = makeSet;

function updateSet(set, newMap) {
  if (set.__ownerID) {
    set.size = newMap.size;
    set._map = newMap;
    return set;
  }
  return newMap === set._map
    ? set
    : newMap.size === 0
    ? set.__empty()
    : set.__make(newMap);
}

function makeSet(map, ownerID) {
  var set = Object.create(SetPrototype);
  set.size = map ? map.size : 0;
  set._map = map;
  set.__ownerID = ownerID;
  return set;
}

var EMPTY_SET;
function emptySet() {
  return EMPTY_SET || (EMPTY_SET = makeSet(emptyMap()));
}

/**
 * Returns a lazy seq of nums from start (inclusive) to end
 * (exclusive), by step, where start defaults to 0, step to 1, and end to
 * infinity. When start is equal to end, returns empty list.
 */
var Range$1 = /*@__PURE__*/(function (IndexedSeq) {
  function Range(start, end, step) {
    if (!(this instanceof Range)) {
      return new Range(start, end, step);
    }
    invariant(step !== 0, 'Cannot step a Range by 0');
    start = start || 0;
    if (end === undefined) {
      end = Infinity;
    }
    step = step === undefined ? 1 : Math.abs(step);
    if (end < start) {
      step = -step;
    }
    this._start = start;
    this._end = end;
    this._step = step;
    this.size = Math.max(0, Math.ceil((end - start) / step - 1) + 1);
    if (this.size === 0) {
      if (EMPTY_RANGE) {
        return EMPTY_RANGE;
      }
      EMPTY_RANGE = this;
    }
  }

  if ( IndexedSeq ) Range.__proto__ = IndexedSeq;
  Range.prototype = Object.create( IndexedSeq && IndexedSeq.prototype );
  Range.prototype.constructor = Range;

  Range.prototype.toString = function toString () {
    if (this.size === 0) {
      return 'Range []';
    }
    return (
      'Range [ ' +
      this._start +
      '...' +
      this._end +
      (this._step !== 1 ? ' by ' + this._step : '') +
      ' ]'
    );
  };

  Range.prototype.get = function get (index, notSetValue) {
    return this.has(index)
      ? this._start + wrapIndex(this, index) * this._step
      : notSetValue;
  };

  Range.prototype.includes = function includes (searchValue) {
    var possibleIndex = (searchValue - this._start) / this._step;
    return (
      possibleIndex >= 0 &&
      possibleIndex < this.size &&
      possibleIndex === Math.floor(possibleIndex)
    );
  };

  Range.prototype.slice = function slice (begin, end) {
    if (wholeSlice(begin, end, this.size)) {
      return this;
    }
    begin = resolveBegin(begin, this.size);
    end = resolveEnd(end, this.size);
    if (end <= begin) {
      return new Range(0, 0);
    }
    return new Range(
      this.get(begin, this._end),
      this.get(end, this._end),
      this._step
    );
  };

  Range.prototype.indexOf = function indexOf (searchValue) {
    var offsetValue = searchValue - this._start;
    if (offsetValue % this._step === 0) {
      var index = offsetValue / this._step;
      if (index >= 0 && index < this.size) {
        return index;
      }
    }
    return -1;
  };

  Range.prototype.lastIndexOf = function lastIndexOf (searchValue) {
    return this.indexOf(searchValue);
  };

  Range.prototype.__iterate = function __iterate (fn, reverse) {
    var size = this.size;
    var step = this._step;
    var value = reverse ? this._start + (size - 1) * step : this._start;
    var i = 0;
    while (i !== size) {
      if (fn(value, reverse ? size - ++i : i++, this) === false) {
        break;
      }
      value += reverse ? -step : step;
    }
    return i;
  };

  Range.prototype.__iterator = function __iterator (type, reverse) {
    var size = this.size;
    var step = this._step;
    var value = reverse ? this._start + (size - 1) * step : this._start;
    var i = 0;
    return new Iterator(function () {
      if (i === size) {
        return iteratorDone();
      }
      var v = value;
      value += reverse ? -step : step;
      return iteratorValue(type, reverse ? size - ++i : i++, v);
    });
  };

  Range.prototype.equals = function equals (other) {
    return other instanceof Range
      ? this._start === other._start &&
          this._end === other._end &&
          this._step === other._step
      : deepEqual(this, other);
  };

  return Range;
}(IndexedSeq));

var EMPTY_RANGE;

function getIn$1(collection, searchKeyPath, notSetValue) {
  var keyPath = coerceKeyPath(searchKeyPath);
  var i = 0;
  while (i !== keyPath.length) {
    collection = get(collection, keyPath[i++], NOT_SET);
    if (collection === NOT_SET) {
      return notSetValue;
    }
  }
  return collection;
}

function getIn(searchKeyPath, notSetValue) {
  return getIn$1(this, searchKeyPath, notSetValue);
}

function hasIn$1(collection, keyPath) {
  return getIn$1(collection, keyPath, NOT_SET) !== NOT_SET;
}

function hasIn(searchKeyPath) {
  return hasIn$1(this, searchKeyPath);
}

function toObject() {
  assertNotInfinite(this.size);
  var object = {};
  this.__iterate(function (v, k) {
    object[k] = v;
  });
  return object;
}

// Note: all of these methods are deprecated.
Collection.isIterable = isCollection;
Collection.isKeyed = isKeyed;
Collection.isIndexed = isIndexed;
Collection.isAssociative = isAssociative;
Collection.isOrdered = isOrdered;

Collection.Iterator = Iterator;

mixin(Collection, {
  // ### Conversion to other types

  toArray: function toArray() {
    assertNotInfinite(this.size);
    var array = new Array(this.size || 0);
    var useTuples = isKeyed(this);
    var i = 0;
    this.__iterate(function (v, k) {
      // Keyed collections produce an array of tuples.
      array[i++] = useTuples ? [k, v] : v;
    });
    return array;
  },

  toIndexedSeq: function toIndexedSeq() {
    return new ToIndexedSequence(this);
  },

  toJS: function toJS$1() {
    return toJS(this);
  },

  toKeyedSeq: function toKeyedSeq() {
    return new ToKeyedSequence(this, true);
  },

  toMap: function toMap() {
    // Use Late Binding here to solve the circular dependency.
    return Map(this.toKeyedSeq());
  },

  toObject: toObject,

  toOrderedMap: function toOrderedMap() {
    // Use Late Binding here to solve the circular dependency.
    return OrderedMap(this.toKeyedSeq());
  },

  toOrderedSet: function toOrderedSet() {
    // Use Late Binding here to solve the circular dependency.
    return OrderedSet(isKeyed(this) ? this.valueSeq() : this);
  },

  toSet: function toSet() {
    // Use Late Binding here to solve the circular dependency.
    return Set(isKeyed(this) ? this.valueSeq() : this);
  },

  toSetSeq: function toSetSeq() {
    return new ToSetSequence(this);
  },

  toSeq: function toSeq() {
    return isIndexed(this)
      ? this.toIndexedSeq()
      : isKeyed(this)
      ? this.toKeyedSeq()
      : this.toSetSeq();
  },

  toStack: function toStack() {
    // Use Late Binding here to solve the circular dependency.
    return Stack(isKeyed(this) ? this.valueSeq() : this);
  },

  toList: function toList() {
    // Use Late Binding here to solve the circular dependency.
    return List(isKeyed(this) ? this.valueSeq() : this);
  },

  // ### Common JavaScript methods and properties

  toString: function toString() {
    return '[Collection]';
  },

  __toString: function __toString(head, tail) {
    if (this.size === 0) {
      return head + tail;
    }
    return (
      head +
      ' ' +
      this.toSeq().map(this.__toStringMapper).join(', ') +
      ' ' +
      tail
    );
  },

  // ### ES6 Collection methods (ES6 Array and Map)

  concat: function concat() {
    var values = [], len = arguments.length;
    while ( len-- ) values[ len ] = arguments[ len ];

    return reify(this, concatFactory(this, values));
  },

  includes: function includes(searchValue) {
    return this.some(function (value) { return is(value, searchValue); });
  },

  entries: function entries() {
    return this.__iterator(ITERATE_ENTRIES);
  },

  every: function every(predicate, context) {
    assertNotInfinite(this.size);
    var returnValue = true;
    this.__iterate(function (v, k, c) {
      if (!predicate.call(context, v, k, c)) {
        returnValue = false;
        return false;
      }
    });
    return returnValue;
  },

  filter: function filter(predicate, context) {
    return reify(this, filterFactory(this, predicate, context, true));
  },

  find: function find(predicate, context, notSetValue) {
    var entry = this.findEntry(predicate, context);
    return entry ? entry[1] : notSetValue;
  },

  forEach: function forEach(sideEffect, context) {
    assertNotInfinite(this.size);
    return this.__iterate(context ? sideEffect.bind(context) : sideEffect);
  },

  join: function join(separator) {
    assertNotInfinite(this.size);
    separator = separator !== undefined ? '' + separator : ',';
    var joined = '';
    var isFirst = true;
    this.__iterate(function (v) {
      isFirst ? (isFirst = false) : (joined += separator);
      joined += v !== null && v !== undefined ? v.toString() : '';
    });
    return joined;
  },

  keys: function keys() {
    return this.__iterator(ITERATE_KEYS);
  },

  map: function map(mapper, context) {
    return reify(this, mapFactory(this, mapper, context));
  },

  reduce: function reduce$1(reducer, initialReduction, context) {
    return reduce(
      this,
      reducer,
      initialReduction,
      context,
      arguments.length < 2,
      false
    );
  },

  reduceRight: function reduceRight(reducer, initialReduction, context) {
    return reduce(
      this,
      reducer,
      initialReduction,
      context,
      arguments.length < 2,
      true
    );
  },

  reverse: function reverse() {
    return reify(this, reverseFactory(this, true));
  },

  slice: function slice(begin, end) {
    return reify(this, sliceFactory(this, begin, end, true));
  },

  some: function some(predicate, context) {
    return !this.every(not(predicate), context);
  },

  sort: function sort(comparator) {
    return reify(this, sortFactory(this, comparator));
  },

  values: function values() {
    return this.__iterator(ITERATE_VALUES);
  },

  // ### More sequential methods

  butLast: function butLast() {
    return this.slice(0, -1);
  },

  isEmpty: function isEmpty() {
    return this.size !== undefined ? this.size === 0 : !this.some(function () { return true; });
  },

  count: function count(predicate, context) {
    return ensureSize(
      predicate ? this.toSeq().filter(predicate, context) : this
    );
  },

  countBy: function countBy(grouper, context) {
    return countByFactory(this, grouper, context);
  },

  equals: function equals(other) {
    return deepEqual(this, other);
  },

  entrySeq: function entrySeq() {
    var collection = this;
    if (collection._cache) {
      // We cache as an entries array, so we can just return the cache!
      return new ArraySeq(collection._cache);
    }
    var entriesSequence = collection.toSeq().map(entryMapper).toIndexedSeq();
    entriesSequence.fromEntrySeq = function () { return collection.toSeq(); };
    return entriesSequence;
  },

  filterNot: function filterNot(predicate, context) {
    return this.filter(not(predicate), context);
  },

  findEntry: function findEntry(predicate, context, notSetValue) {
    var found = notSetValue;
    this.__iterate(function (v, k, c) {
      if (predicate.call(context, v, k, c)) {
        found = [k, v];
        return false;
      }
    });
    return found;
  },

  findKey: function findKey(predicate, context) {
    var entry = this.findEntry(predicate, context);
    return entry && entry[0];
  },

  findLast: function findLast(predicate, context, notSetValue) {
    return this.toKeyedSeq().reverse().find(predicate, context, notSetValue);
  },

  findLastEntry: function findLastEntry(predicate, context, notSetValue) {
    return this.toKeyedSeq()
      .reverse()
      .findEntry(predicate, context, notSetValue);
  },

  findLastKey: function findLastKey(predicate, context) {
    return this.toKeyedSeq().reverse().findKey(predicate, context);
  },

  first: function first(notSetValue) {
    return this.find(returnTrue, null, notSetValue);
  },

  flatMap: function flatMap(mapper, context) {
    return reify(this, flatMapFactory(this, mapper, context));
  },

  flatten: function flatten(depth) {
    return reify(this, flattenFactory(this, depth, true));
  },

  fromEntrySeq: function fromEntrySeq() {
    return new FromEntriesSequence(this);
  },

  get: function get(searchKey, notSetValue) {
    return this.find(function (_, key) { return is(key, searchKey); }, undefined, notSetValue);
  },

  getIn: getIn,

  groupBy: function groupBy(grouper, context) {
    return groupByFactory(this, grouper, context);
  },

  has: function has(searchKey) {
    return this.get(searchKey, NOT_SET) !== NOT_SET;
  },

  hasIn: hasIn,

  isSubset: function isSubset(iter) {
    iter = typeof iter.includes === 'function' ? iter : Collection(iter);
    return this.every(function (value) { return iter.includes(value); });
  },

  isSuperset: function isSuperset(iter) {
    iter = typeof iter.isSubset === 'function' ? iter : Collection(iter);
    return iter.isSubset(this);
  },

  keyOf: function keyOf(searchValue) {
    return this.findKey(function (value) { return is(value, searchValue); });
  },

  keySeq: function keySeq() {
    return this.toSeq().map(keyMapper).toIndexedSeq();
  },

  last: function last(notSetValue) {
    return this.toSeq().reverse().first(notSetValue);
  },

  lastKeyOf: function lastKeyOf(searchValue) {
    return this.toKeyedSeq().reverse().keyOf(searchValue);
  },

  max: function max(comparator) {
    return maxFactory(this, comparator);
  },

  maxBy: function maxBy(mapper, comparator) {
    return maxFactory(this, comparator, mapper);
  },

  min: function min(comparator) {
    return maxFactory(
      this,
      comparator ? neg(comparator) : defaultNegComparator
    );
  },

  minBy: function minBy(mapper, comparator) {
    return maxFactory(
      this,
      comparator ? neg(comparator) : defaultNegComparator,
      mapper
    );
  },

  rest: function rest() {
    return this.slice(1);
  },

  skip: function skip(amount) {
    return amount === 0 ? this : this.slice(Math.max(0, amount));
  },

  skipLast: function skipLast(amount) {
    return amount === 0 ? this : this.slice(0, -Math.max(0, amount));
  },

  skipWhile: function skipWhile(predicate, context) {
    return reify(this, skipWhileFactory(this, predicate, context, true));
  },

  skipUntil: function skipUntil(predicate, context) {
    return this.skipWhile(not(predicate), context);
  },

  sortBy: function sortBy(mapper, comparator) {
    return reify(this, sortFactory(this, comparator, mapper));
  },

  take: function take(amount) {
    return this.slice(0, Math.max(0, amount));
  },

  takeLast: function takeLast(amount) {
    return this.slice(-Math.max(0, amount));
  },

  takeWhile: function takeWhile(predicate, context) {
    return reify(this, takeWhileFactory(this, predicate, context));
  },

  takeUntil: function takeUntil(predicate, context) {
    return this.takeWhile(not(predicate), context);
  },

  update: function update(fn) {
    return fn(this);
  },

  valueSeq: function valueSeq() {
    return this.toIndexedSeq();
  },

  // ### Hashable Object

  hashCode: function hashCode() {
    return this.__hash || (this.__hash = hashCollection(this));
  },

  // ### Internal

  // abstract __iterate(fn, reverse)

  // abstract __iterator(type, reverse)
});

var CollectionPrototype = Collection.prototype;
CollectionPrototype[IS_COLLECTION_SYMBOL] = true;
CollectionPrototype[ITERATOR_SYMBOL] = CollectionPrototype.values;
CollectionPrototype.toJSON = CollectionPrototype.toArray;
CollectionPrototype.__toStringMapper = quoteString;
CollectionPrototype.inspect = CollectionPrototype.toSource = function () {
  return this.toString();
};
CollectionPrototype.chain = CollectionPrototype.flatMap;
CollectionPrototype.contains = CollectionPrototype.includes;

mixin(KeyedCollection, {
  // ### More sequential methods

  flip: function flip() {
    return reify(this, flipFactory(this));
  },

  mapEntries: function mapEntries(mapper, context) {
    var this$1$1 = this;

    var iterations = 0;
    return reify(
      this,
      this.toSeq()
        .map(function (v, k) { return mapper.call(context, [k, v], iterations++, this$1$1); })
        .fromEntrySeq()
    );
  },

  mapKeys: function mapKeys(mapper, context) {
    var this$1$1 = this;

    return reify(
      this,
      this.toSeq()
        .flip()
        .map(function (k, v) { return mapper.call(context, k, v, this$1$1); })
        .flip()
    );
  },
});

var KeyedCollectionPrototype = KeyedCollection.prototype;
KeyedCollectionPrototype[IS_KEYED_SYMBOL] = true;
KeyedCollectionPrototype[ITERATOR_SYMBOL] = CollectionPrototype.entries;
KeyedCollectionPrototype.toJSON = toObject;
KeyedCollectionPrototype.__toStringMapper = function (v, k) { return quoteString(k) + ': ' + quoteString(v); };

mixin(IndexedCollection, {
  // ### Conversion to other types

  toKeyedSeq: function toKeyedSeq() {
    return new ToKeyedSequence(this, false);
  },

  // ### ES6 Collection methods (ES6 Array and Map)

  filter: function filter(predicate, context) {
    return reify(this, filterFactory(this, predicate, context, false));
  },

  findIndex: function findIndex(predicate, context) {
    var entry = this.findEntry(predicate, context);
    return entry ? entry[0] : -1;
  },

  indexOf: function indexOf(searchValue) {
    var key = this.keyOf(searchValue);
    return key === undefined ? -1 : key;
  },

  lastIndexOf: function lastIndexOf(searchValue) {
    var key = this.lastKeyOf(searchValue);
    return key === undefined ? -1 : key;
  },

  reverse: function reverse() {
    return reify(this, reverseFactory(this, false));
  },

  slice: function slice(begin, end) {
    return reify(this, sliceFactory(this, begin, end, false));
  },

  splice: function splice(index, removeNum /*, ...values*/) {
    var numArgs = arguments.length;
    removeNum = Math.max(removeNum || 0, 0);
    if (numArgs === 0 || (numArgs === 2 && !removeNum)) {
      return this;
    }
    // If index is negative, it should resolve relative to the size of the
    // collection. However size may be expensive to compute if not cached, so
    // only call count() if the number is in fact negative.
    index = resolveBegin(index, index < 0 ? this.count() : this.size);
    var spliced = this.slice(0, index);
    return reify(
      this,
      numArgs === 1
        ? spliced
        : spliced.concat(arrCopy(arguments, 2), this.slice(index + removeNum))
    );
  },

  // ### More collection methods

  findLastIndex: function findLastIndex(predicate, context) {
    var entry = this.findLastEntry(predicate, context);
    return entry ? entry[0] : -1;
  },

  first: function first(notSetValue) {
    return this.get(0, notSetValue);
  },

  flatten: function flatten(depth) {
    return reify(this, flattenFactory(this, depth, false));
  },

  get: function get(index, notSetValue) {
    index = wrapIndex(this, index);
    return index < 0 ||
      this.size === Infinity ||
      (this.size !== undefined && index > this.size)
      ? notSetValue
      : this.find(function (_, key) { return key === index; }, undefined, notSetValue);
  },

  has: function has(index) {
    index = wrapIndex(this, index);
    return (
      index >= 0 &&
      (this.size !== undefined
        ? this.size === Infinity || index < this.size
        : this.indexOf(index) !== -1)
    );
  },

  interpose: function interpose(separator) {
    return reify(this, interposeFactory(this, separator));
  },

  interleave: function interleave(/*...collections*/) {
    var collections = [this].concat(arrCopy(arguments));
    var zipped = zipWithFactory(this.toSeq(), IndexedSeq.of, collections);
    var interleaved = zipped.flatten(true);
    if (zipped.size) {
      interleaved.size = zipped.size * collections.length;
    }
    return reify(this, interleaved);
  },

  keySeq: function keySeq() {
    return Range$1(0, this.size);
  },

  last: function last(notSetValue) {
    return this.get(-1, notSetValue);
  },

  skipWhile: function skipWhile(predicate, context) {
    return reify(this, skipWhileFactory(this, predicate, context, false));
  },

  zip: function zip(/*, ...collections */) {
    var collections = [this].concat(arrCopy(arguments));
    return reify(this, zipWithFactory(this, defaultZipper, collections));
  },

  zipAll: function zipAll(/*, ...collections */) {
    var collections = [this].concat(arrCopy(arguments));
    return reify(this, zipWithFactory(this, defaultZipper, collections, true));
  },

  zipWith: function zipWith(zipper /*, ...collections */) {
    var collections = arrCopy(arguments);
    collections[0] = this;
    return reify(this, zipWithFactory(this, zipper, collections));
  },
});

var IndexedCollectionPrototype = IndexedCollection.prototype;
IndexedCollectionPrototype[IS_INDEXED_SYMBOL] = true;
IndexedCollectionPrototype[IS_ORDERED_SYMBOL] = true;

mixin(SetCollection, {
  // ### ES6 Collection methods (ES6 Array and Map)

  get: function get(value, notSetValue) {
    return this.has(value) ? value : notSetValue;
  },

  includes: function includes(value) {
    return this.has(value);
  },

  // ### More sequential methods

  keySeq: function keySeq() {
    return this.valueSeq();
  },
});

var SetCollectionPrototype = SetCollection.prototype;
SetCollectionPrototype.has = CollectionPrototype.includes;
SetCollectionPrototype.contains = SetCollectionPrototype.includes;
SetCollectionPrototype.keys = SetCollectionPrototype.values;

// Mixin subclasses

mixin(KeyedSeq, KeyedCollectionPrototype);
mixin(IndexedSeq, IndexedCollectionPrototype);
mixin(SetSeq, SetCollectionPrototype);

// #pragma Helper functions

function reduce(collection, reducer, reduction, context, useFirst, reverse) {
  assertNotInfinite(collection.size);
  collection.__iterate(function (v, k, c) {
    if (useFirst) {
      useFirst = false;
      reduction = v;
    } else {
      reduction = reducer.call(context, reduction, v, k, c);
    }
  }, reverse);
  return reduction;
}

function keyMapper(v, k) {
  return k;
}

function entryMapper(v, k) {
  return [k, v];
}

function not(predicate) {
  return function () {
    return !predicate.apply(this, arguments);
  };
}

function neg(predicate) {
  return function () {
    return -predicate.apply(this, arguments);
  };
}

function defaultZipper() {
  return arrCopy(arguments);
}

function defaultNegComparator(a, b) {
  return a < b ? 1 : a > b ? -1 : 0;
}

function hashCollection(collection) {
  if (collection.size === Infinity) {
    return 0;
  }
  var ordered = isOrdered(collection);
  var keyed = isKeyed(collection);
  var h = ordered ? 1 : 0;
  var size = collection.__iterate(
    keyed
      ? ordered
        ? function (v, k) {
            h = (31 * h + hashMerge(hash(v), hash(k))) | 0;
          }
        : function (v, k) {
            h = (h + hashMerge(hash(v), hash(k))) | 0;
          }
      : ordered
      ? function (v) {
          h = (31 * h + hash(v)) | 0;
        }
      : function (v) {
          h = (h + hash(v)) | 0;
        }
  );
  return murmurHashOfSize(size, h);
}

function murmurHashOfSize(size, h) {
  h = imul(h, 0xcc9e2d51);
  h = imul((h << 15) | (h >>> -15), 0x1b873593);
  h = imul((h << 13) | (h >>> -13), 5);
  h = ((h + 0xe6546b64) | 0) ^ size;
  h = imul(h ^ (h >>> 16), 0x85ebca6b);
  h = imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = smi(h ^ (h >>> 16));
  return h;
}

function hashMerge(a, b) {
  return (a ^ (b + 0x9e3779b9 + (a << 6) + (a >> 2))) | 0; // int
}

var OrderedSet = /*@__PURE__*/(function (Set) {
  function OrderedSet(value) {
    return value === null || value === undefined
      ? emptyOrderedSet()
      : isOrderedSet(value)
      ? value
      : emptyOrderedSet().withMutations(function (set) {
          var iter = SetCollection(value);
          assertNotInfinite(iter.size);
          iter.forEach(function (v) { return set.add(v); });
        });
  }

  if ( Set ) OrderedSet.__proto__ = Set;
  OrderedSet.prototype = Object.create( Set && Set.prototype );
  OrderedSet.prototype.constructor = OrderedSet;

  OrderedSet.of = function of (/*...values*/) {
    return this(arguments);
  };

  OrderedSet.fromKeys = function fromKeys (value) {
    return this(KeyedCollection(value).keySeq());
  };

  OrderedSet.prototype.toString = function toString () {
    return this.__toString('OrderedSet {', '}');
  };

  return OrderedSet;
}(Set));

OrderedSet.isOrderedSet = isOrderedSet;

var OrderedSetPrototype = OrderedSet.prototype;
OrderedSetPrototype[IS_ORDERED_SYMBOL] = true;
OrderedSetPrototype.zip = IndexedCollectionPrototype.zip;
OrderedSetPrototype.zipWith = IndexedCollectionPrototype.zipWith;
OrderedSetPrototype.zipAll = IndexedCollectionPrototype.zipAll;

OrderedSetPrototype.__empty = emptyOrderedSet;
OrderedSetPrototype.__make = makeOrderedSet;

function makeOrderedSet(map, ownerID) {
  var set = Object.create(OrderedSetPrototype);
  set.size = map ? map.size : 0;
  set._map = map;
  set.__ownerID = ownerID;
  return set;
}

var EMPTY_ORDERED_SET;
function emptyOrderedSet() {
  return (
    EMPTY_ORDERED_SET || (EMPTY_ORDERED_SET = makeOrderedSet(emptyOrderedMap()))
  );
}

// DOMCursor
// =========
// Copyright (C) 2014, 2021, Bill Burdick, Roy Riggs, TEAM CTHULHU
if (!('CaretPosition' in window))
    window.CaretPosition = (class {
    });
const mozdocument = document;
const webkitdocument = document;
class DOMCursor {
    constructor(node, pos, filter) {
        if (pos instanceof Function)
            filter = pos;
        if (node instanceof Range) {
            if (typeof pos !== 'number')
                pos = node.startOffset;
            node = node.startContainer;
        }
        else if (node instanceof CaretPosition) {
            if (typeof pos !== 'number')
                pos = node.offset;
            node = node.offsetNode;
        }
        this.node = node;
        this.pos = (pos || 0);
        this.filter = filter || (() => true);
        this.computeType();
        this.savedTextPosition = null;
    }
    static differentLines(pos1, pos2) {
        return (pos1.bottom - 4 <= pos2.top) || (pos2.bottom - 4 <= pos1.top);
    }
    static differentPosition(pos1, pos2) {
        if (this.differentLines(pos2, pos1))
            return true;
        if (pos1.right == null)
            return false;
        if (pos2.right == null)
            return Math.floor(pos1.left) !== Math.floor(pos2.left);
        const r1 = Math.floor(pos1.right);
        const r2 = Math.floor(pos2.right);
        const l1 = Math.floor(pos1.left);
        const l2 = Math.floor(pos2.left);
        return (r1 !== r2 || l1 !== l2) && (r2 < l1 || r1 < l2 || ((r1 < r2) === (l1 < l2) && (r1 > r2) === (l1 > l2)));
    }
    static getBoundingRect(node) {
        if (node instanceof HTMLElement)
            return node.getBoundingClientRect();
        spareRange.selectNode(node);
        return spareRange.getBoundingClientRect();
    }
    static getTextPosition(textNode, offset) {
        var r;
        if (offset < textNode.length) {
            spareRange.setStart(textNode, offset);
            spareRange.setEnd(textNode, offset + 1);
            r = getClientRect(spareRange);
            if (!r || (r.width === 0 && r.height === 0)) {
                spareRange.selectNodeContents(textNode.parentNode);
                if (spareRange.getClientRects().length === 0) {
                    r = DOMCursor.getBoundingRect(textNode);
                }
            }
        }
        else {
            spareRange.setStart(textNode, offset);
            spareRange.collapse(true);
            r = getClientRect(spareRange);
        }
        if (!r || (r.width === 0 && r.height === 0)) {
            if (offset === 0) {
                textNode.parentNode.insertBefore(positioner, textNode);
            }
            else if (offset === textNode.length || textNode.splitText(offset)) {
                textNode.parentNode.insertBefore(positioner, textNode.nextSibling);
            }
            spareRange.selectNode(positioner);
            r = spareRange.getBoundingClientRect();
            positioner.parentNode.removeChild(positioner);
            textNode.parentNode.normalize();
        }
        return r;
    }
    static selectRange(r) {
        if (!r)
            return;
        const sel = getSelection();
        debug("select range", r, new Error('trace').stack);
        if (!(sel.rangeCount === 1 && DOMCursor.sameRanges(sel.getRangeAt(0), r))) {
            return sel.setBaseAndExtent(r.startContainer, r.startOffset, r.endContainer, r.endOffset);
        }
    }
    // Thanks to (rangy)[this: https://github.com/timdown/rangy] for the isCollapsed logic
    static isCollapsed(node) {
        var type;
        if (node) {
            type = node.nodeType;
            return type === 7 || type === 8 || (type === node.TEXT_NODE && (node.data === '' || DOMCursor.isCollapsed(node.parentNode))) || /^(script|style)$/i.test(node.nodeName) || (type === node.ELEMENT_NODE && !node.offsetParent);
        }
    }
    static sameRanges(r1, r2) {
        return r1.compareBoundaryPoints(Range.START_TO_START, r2) === 0 && r1.compareBoundaryPoints(Range.END_TO_END, r2) === 0;
    }
    isCollapsed() { return !this.isEmpty() && DOMCursor.isCollapsed(this.node); }
    computeType() {
        this.type = !this.node ? 'empty'
            : this.node.nodeType === this.node.TEXT_NODE ? 'text'
                : 'element';
        return this;
    }
    equals(other) {
        return other instanceof DOMCursor && this.node === other.node && this.pos === other.pos;
    }
    newPos(node, pos) {
        if (node instanceof Range) {
            return new DOMCursor(node);
        }
        else {
            return new DOMCursor(node, pos, this.filter);
        }
    }
    toString() {
        return `DOMCursor(${this.type}, ${this.pos}${this.type === 'text' ? ', ' + this.posString() : ''})`;
    }
    posString() { return this.node.data.substring(0, this.pos) + '|' + this.node.data.substring(this.pos); }
    textPosition() {
        var pos;
        if (this.isEmpty()) {
            return null;
        }
        else {
            return (pos = this.savedTextPosition) != null ? pos : (this.savedTextPosition = DOMCursor.getTextPosition(this.node, this.pos));
        }
    }
    isDomCaretTextPosition() {
        const p = this.textPosition();
        const { node, offset } = DOMCursor.caretPos(p.left, p.top);
        return node === this.node && offset === this.pos;
    }
    // **Character** returns the character at the position
    character() {
        const p = this.type === 'text' ? this : this.save().firstText();
        return p.node.data[p.pos];
    }
    // **isEmpty** returns true if the cursor is empty
    isEmpty() { return this.type === 'empty'; }
    // **setFilter** sets the filter
    setFilter(f) { return new DOMCursor(this.node, this.pos, f); }
    // **addFilter** adds a filter
    addFilter(filt) {
        const oldFilt = this.filter;
        return this.setFilter(n => {
            const oldF = oldFilt(n);
            const f = filt(n);
            if (oldF === 'quit' || f === 'quit')
                return 'quit';
            if (oldF === 'skip' || f === 'skip')
                return 'skip';
            return oldF && f;
        });
    }
    // **next** moves to the next filtered node
    next(up) {
        const saved = this.save();
        let n = this.nodeAfter(up);
        let res;
        while (!n.isEmpty()) {
            switch (res = this.filter(n)) {
                case 'skip':
                    n = n.nodeAfter(true);
                    continue;
                case 'quit':
                    break;
                default:
                    if (res)
                        return n;
            }
            n = n.nodeAfter();
        }
        return this.restore(saved).emptyNext();
    }
    // **prev** moves to the next filtered node
    prev(up) {
        const saved = this.save();
        let n = this.nodeBefore(up);
        while (!n.isEmpty()) {
            const res = this.filter(n);
            switch (res) {
                case 'skip':
                    n = n.nodeBefore(true);
                    continue;
                case 'quit':
                    break;
                default:
                    if (res)
                        return n;
            }
            n = n.nodeBefore();
        }
        return this.restore(saved).emptyPrev();
    }
    // **nodes** returns all of the nodes this cursor finds
    nodes() {
        const results = [];
        let n = this;
        while (!(n = n.next()).isEmpty()) {
            results.push(n.node);
        }
        return results;
    }
    // **moveCaret** move the document selection to the current position
    moveCaret(r) {
        if (!this.isEmpty()) {
            if (!r)
                r = document.createRange();
            r.setStart(this.node, this.pos);
            r.collapse(true);
            DOMCursor.selectRange(r);
        }
        return this;
    }
    adjustForNewline() {
        if (this.isEmpty())
            return this;
        const s = this.save();
        let n = this;
        if (this.pos === 0 && this.node.data[0] === '\n') {
            while (!n.isEmpty() && (n = n.prev()).type !== 'text') { }
            if (n.isEmpty())
                return s;
            if (n.node.data[n.pos - 1] === '\n')
                return s;
            return n;
        }
        else if (this.pos === this.node.length && this.node.data[this.pos - 1] === '\n') {
            while (!n.isEmpty() && (n = n.next()).type !== 'text') { }
            if (n.node.data[n.pos] === '\n')
                return s;
            return n;
        }
        return this;
    }
    // **range** create a range between two positions
    range(other, r) {
        if (!r) {
            r = document.createRange();
        }
        if (other == null) {
            other = this;
        }
        r.setStart(this.node, this.pos);
        r.setEnd(other.node, other.pos);
        return r;
    }
    // **firstText** find the first text node (the 'backwards' argument is optional and if true,
    // indicates to find the first text node behind the cursor).
    firstText(backwards) {
        let n = this;
        while (!n.isEmpty() && (n.type !== 'text' || (!backwards && n.pos === n.node.data.length))) {
            n = (backwards ? n.prev() : n.next());
        }
        return n;
    }
    // **countChars** count the characters in the filtered nodes until we get to (node, pos)
    // Include (node, 0) up to but not including (node, pos)
    countChars(node, pos) {
        const start = this.copy();
        let n = this;
        let tot = 0;
        if (node instanceof DOMCursor) {
            pos = node.pos;
            node = node.node;
        }
        while (!n.isEmpty() && n.node !== node) {
            if (n.type === 'text')
                tot += n.node.length;
            n = n.next();
        }
        if (n.isEmpty() || n.node !== node)
            return -1;
        if (n.type === 'text') {
            tot += pos;
            if (start.node === n.node)
                tot -= start.pos;
            return tot;
        }
        return tot;
    }
    // **forwardChars** moves the cursor forward by count characters
    // if contain is true and the final location is 0 then go to the end of
    // the previous text node (node, node.length)
    forwardChars(count, contain) {
        if (count === 0)
            return this;
        let dc = this;
        count += this.pos;
        while (!dc.isEmpty() && 0 <= count) {
            if (dc.type === 'text') {
                if (count < dc.node.length) {
                    if (count === 0 && contain) {
                        dc = dc.prev();
                        while (dc.type !== 'text')
                            dc = dc.prev();
                        return dc.newPos(dc.node, dc.node.length);
                    }
                    return dc.newPos(dc.node, count);
                }
                count -= dc.node.length;
            }
            dc = dc.next();
        }
        return dc.emptyNext();
    }
    // **hasAttribute** returns true if the node is an element and has the attribute or if it is a text node and its parent has the attribute
    hasAttribute(a) {
        return (this.node != null) && this.node.nodeType === this.node.ELEMENT_NODE && this.node.hasAttribute(a);
    }
    // **getAttribute** returns the attribute if the node is an element and has the attribute
    getAttribute(a) {
        return (this.node != null) && this.node.nodeType === this.node.ELEMENT_NODE && this.node.getAttribute(a);
    }
    // **filterTextNodes** adds text node filtering to the current filter; the cursor will only find text nodes
    filterTextNodes() { return this.addFilter((n) => n.type === 'text'); }
    // **filterTextNodes** adds visible text node filtering to the current filter; the cursor will only find visible text nodes
    filterVisibleTextNodes() { return this.filterTextNodes().addFilter((n) => !n.isCollapsed()); }
    // **filterParent** adds parent filtering to the current filter; the cursor will only find nodes that are contained in the parent (or equal to it)
    filterParent(parent) {
        if (!parent)
            return this.setFilter(() => 'quit');
        return this.addFilter((n) => parent.contains(n.node) || 'quit');
    }
    // **filterRange** adds range filtering to the current filter; the cursor will only find nodes that are contained in the range
    filterRange(sc, startOffset, endContainer, endOffset) {
        const startContainer = sc instanceof Range ? sc.startContainer : sc;
        if (sc instanceof Range) {
            if (startOffset === null || startOffset === undefined)
                return this;
            startOffset = sc.startOffset;
            endContainer = sc.endContainer;
            endOffset = sc.endOffset;
        }
        return this.addFilter((n) => {
            const pos = n.pos;
            const startPos = startContainer.compareDocumentPosition(n.node);
            if (startPos === 0)
                return (startOffset <= pos && pos <= endOffset) || 'quit';
            if (startPos & document.DOCUMENT_POSITION_FOLLOWING) {
                const endPos = endContainer.compareDocumentPosition(n.node);
                if (endPos === 0)
                    return n.pos <= endOffset || 'quit';
                return endPos & document.DOCUMENT_POSITION_PRECEDING || 'quit';
            }
            return 'quit';
            //return (startPos === 0 ? (startOffset <= (ref = n.pos) && ref <= endOffset)
            //    : startPos & document.DOCUMENT_POSITION_FOLLOWING ? (endPos = endContainer.compareDocumentPosition(n.node), endPos === 0 ? n.pos <= endOffset
            //        : endPos & document.DOCUMENT_POSITION_PRECEDING)
            //    : 0)
            //    || 'quit';
        });
    }
    // **getText** gets all of the text at or after the cursor (useful with filtering; see above)
    getText() {
        let t;
        let n = this.mutable().firstText();
        if (n.isEmpty())
            return '';
        t = n.node.data.substring(n.pos);
        while (!(n = n.next()).isEmpty()) {
            if (n.type === 'text')
                t += n.node.data;
        }
        if (t.length) {
            while (n.type !== 'text')
                n.prev();
            n = n.newPos(n.node, n.node.length);
            while (n.pos > 0 && reject(n.filter(n)))
                n.pos--;
            return t.substring(0, t.length - n.node.length + n.pos);
        }
        return '';
    }
    // **getTextTo** gets all of the text at or after the cursor (useful with filtering; see above)
    getTextTo(other) {
        let t;
        let n = this.mutable().firstText();
        if (n.isEmpty())
            return '';
        t = n.node.data.substring(n.pos);
        if (n.node !== other.node) {
            while (!(n = n.next()).isEmpty()) {
                if (n.type === 'text')
                    t += n.node.data;
                if (n.node === other.node)
                    break;
            }
        }
        if (t.length) {
            while (n.type !== 'text')
                n.prev();
            if (n.node === other.node) {
                n = n.newPos(n.node, other.pos);
            }
            else {
                n = n.newPos(n.node, n.node.length);
            }
            while (n.pos > 0 && reject(n.filter(n)))
                n.pos--;
            return t.substring(0, t.length - n.node.length + n.pos);
        }
        return '';
    }
    char() { return this.type === 'text' && this.node.data[this.pos]; }
    // **isNL** returns whether the current character is a newline
    isNL() { return this.char() === '\n'; }
    // **endsInNL** returns whether the current node ends with a newline
    endsInNL() { return this.type === 'text' && this.node.data[this.node.length - 1] === '\n'; }
    // **moveToStart** moves to the beginning of the node
    moveToStart() { return this.newPos(this.node, 0); }
    // **moveToNextStart** moves to the beginning of the next node
    moveToNextStart() { return this.next().moveToStart(); }
    // **moveToEnd** moves to the textual end the node (1 before the end if the node
    // ends in a newline)
    moveToEnd() { return this.newPos(this.node, this.node.length - (this.endsInNL() ? 1 : 0)); }
    // **moveToPrevEnd** moves to the textual end the previous node (1 before
    // the end if the node ends in a newline)
    moveToPrevEnd() { return this.prev().moveToEnd(); }
    /** moves forward until the given function returns false or 'found'.
     *    if false, return the previous position
     *    if 'found', return the current position
     */
    forwardWhile(test) {
        var t;
        let dc = this.immutable();
        let prev = dc;
        while (dc = dc.forwardChar()) {
            if (dc.isEmpty() || !(t = test(dc)))
                return prev;
            if (t === 'found')
                return dc;
            prev = dc;
        }
    }
    /** checks whether a condition is true until the EOL */
    checkToEndOfLine(test) {
        let dc = this.immutable();
        const tp = dc.textPosition();
        while (!dc.isEmpty() && (test(dc))) {
            if (DOMCursor.differentLines(tp, dc.textPosition()))
                return true;
            dc = dc.forwardChar();
        }
        return dc.isEmpty();
    }
    // **checkToStartOfLine** checks whether a condition is true until the EOL
    checkToStartOfLine(test) {
        let dc = this.immutable();
        const tp = dc.textPosition();
        while (!dc.isEmpty() && (test(dc))) {
            if (DOMCursor.differentLines(tp, dc.textPosition()))
                return true;
            dc = dc.backwardChar();
        }
        return dc.isEmpty();
    }
    // **endOfLine** moves to the end of the current line
    endOfLine() {
        const tp = this.textPosition();
        return this.forwardWhile(n => !DOMCursor.differentLines(tp, n.textPosition()));
    }
    // **forwardLine** moves to the next line, trying to keep the current screen pixel column.  Optionally takes a goalFunc that takes the position's screen pixel column as input and returns -1, 0, or 1 from comparing the input to the an goal column
    forwardLine(goalFunc) {
        let line = 0;
        let tp = this.textPosition();
        if (!goalFunc)
            goalFunc = _n => -1;
        return this.forwardWhile(n => {
            const pos = n.textPosition();
            if (DOMCursor.differentLines(tp, pos)) {
                tp = pos;
                line++;
            }
            if (line === 1 && goalFunc(pos.left + 2) > -1)
                return 'found';
            return line !== 2;
        });
    }
    // **backwardWhile** moves backward until the given function is false or 'found',
    // returning the previous position if the function is false or the current
    // position if the function is 'found'
    backwardWhile(test) {
        let t;
        let n = this.immutable();
        let prev = n;
        while (n = n.backwardChar()) {
            if (n.isEmpty() || !(t = test(n))) {
                return prev;
            }
            if (t === 'found') {
                return n;
            }
            prev = n;
        }
    }
    // **endOfLine** moves to the end of the current line
    startOfLine() {
        const tp = this.textPosition();
        return this.backwardWhile(n => !DOMCursor.differentLines(tp, n.textPosition()));
    }
    differentPosition(c) {
        return DOMCursor.differentPosition(this.textPosition(), c.textPosition());
    }
    differentLines(c) {
        return DOMCursor.differentLines(this.textPosition(), c.textPosition());
    }
    // **backwardLine** moves to the previous line, trying to keep the current screen pixel column.  Optionally takes a goalFunc that takes the position's screen pixel column as input and returns -1, 0, or 1 from comparing the input to an internal goal column
    backwardLine(goalFunc) {
        let tp = this.textPosition();
        let line = 0;
        if (!goalFunc)
            goalFunc = _n => -1;
        return (this.backwardWhile(n => {
            const pos = n.textPosition();
            let goal;
            if (DOMCursor.differentLines(tp, pos)) {
                tp = pos;
                line++;
            }
            if (line === 1 && ((goal = goalFunc(n.textPosition().left - 2)) === (-1) || goal === 0)) {
                return 'found';
            }
            return line !== 2;
        })).adjustBackward();
    }
    adjustBackward() {
        const p = this.textPosition();
        return this.backwardWhile(n => !DOMCursor.differentPosition(p, n.textPosition()));
    }
    forwardChar() {
        let n = this;
        if (this.pos + 1 <= this.node.length)
            return this.newPos(this.node, this.pos + 1);
        while (!(n = n.next()).isEmpty()) {
            if (n.node.length !== 0)
                break;
        }
        return n;
    }
    boundedForwardChar() {
        const n = this.save().forwardChar();
        return n.isEmpty() ? n.prev() : n;
    }
    backwardChar() {
        const oldNode = this.node;
        let p = this;
        while (!p.isEmpty() && p.pos === 0)
            p = p.prev();
        return p.isEmpty() ? p
            : p.newPos(p.node, p.node !== oldNode ? p.pos : p.pos - 1);
    }
    boundedBackwardChar() {
        const n = this.save().backwardChar();
        return n.isEmpty() ? n.next() : n;
    }
    // **show** scroll the position into view.  Optionally takes a rectangle representing a toolbar at the top of the page (sorry, this is a bit limited at the moment)
    show(topRect) {
        const p = this.textPosition();
        if (p) {
            const top = (topRect != null ? topRect.width : 0) && topRect.top === 0 ? topRect.bottom : 0;
            if (p.bottom > window.innerHeight) {
                window.scrollBy(0, p.bottom - window.innerHeight);
            }
            else if (p.top < top) {
                window.scrollBy(0, p.top - top);
            }
        }
        return this;
    }
    // **immutable** return an immutable version of this cursor
    immutable() { return this; }
    /** call a function with a mutable version of this cursor and return the cursor afterwards */
    withMutations(func) {
        const dc = this.copy().mutable();
        func(dc);
        return dc;
    }
    // **mutable** return a mutable version of this cursor
    mutable() { return new MutableDOMCursor(this.node, this.pos, this.filter); }
    // **save** generate a memento which can be used to restore the state (used by mutable cursors)
    save() { return this; }
    // **restore** restore the state from a memento (used by mutable cursors)
    restore(n) { return n.immutable(); }
    // **copy** return a copy of this cursor
    copy() { return this; }
    // **nodeAfter** low level method that moves to the unfiltered node after the current one
    nodeAfter(up) {
        var node = this.node;
        while (node) {
            if (node.nodeType === node.ELEMENT_NODE && !up && node.childNodes.length) {
                return this.newPos(node.childNodes[0], 0);
            }
            else if (node.nextSibling) {
                return this.newPos(node.nextSibling, 0);
            }
            else {
                up = true;
                node = node.parentNode;
            }
        }
        return this.emptyNext();
    }
    // **emptyNext** returns an empty cursor whose prev is the current node
    emptyNext() {
        const p = new EmptyDOMCursor();
        // return an empty next node where
        //   prev returns this node
        //   next returns the same empty node
        p.filter = this.filter,
            p.prev = (up) => up ? this.prev(up) : this;
        p.nodeBefore = (up) => up ? this.nodeBefore(up) : this;
        return p;
    }
    // **nodeBefore** low level method that moves to the unfiltered node before the current one
    nodeBefore(up) {
        var newNode;
        let node = this.node;
        while (node) {
            if (node.nodeType === node.ELEMENT_NODE && !up && node.childNodes.length) {
                newNode = node.childNodes[node.childNodes.length - 1];
            }
            else if (node.previousSibling) {
                newNode = node.previousSibling;
            }
            else {
                up = true;
                node = node.parentNode;
                continue;
            }
            return this.newPos(newNode, newNode.length);
        }
        return this.emptyPrev();
    }
    // **emptyPrev** returns an empty cursor whose next is the current node
    emptyPrev() {
        const p = new EmptyDOMCursor();
        p.filter = this.filter;
        p.next = (up) => up ? this.next(up) : this;
        p.nodeAfter = (up) => up ? this.nodeAfter(up) : this;
        return p;
    }
}
DOMCursor.debug = false;
DOMCursor.caretPos = mozdocument.caretPositionFromPoint
    ? (x, y) => {
        const pos = mozdocument.caretPositionFromPoint(x, y);
        return { node: pos.offsetNode, offset: pos.offset };
    } : (x, y) => {
    const pos = webkitdocument.caretRangeFromPoint(x, y);
    return { node: pos.startContainer, offset: pos.startOffset };
};
class EmptyDOMCursor extends DOMCursor {
    constructor() { super(null); }
    moveCaret() { return this; }
    show() { return this; }
    nodeAfter(_up) { return this; }
    nodeBefore(_up) { return this; }
    next() { return this; }
    prev() { return this; }
}
/** Mutable cursor methods change the cursor instead of returning new cursors */
class MutableDOMCursor extends DOMCursor {
    setFilter(filter) {
        this.filter = filter;
        return this;
    }
    newPos(node, pos) {
        if (node instanceof Range) {
            pos = pos || node.startOffset;
            node = node.startContainer;
        }
        this.node = node;
        this.pos = pos;
        this.savedTextPosition = null;
        return this.computeType();
    }
    copy() { return new MutableDOMCursor(this.node, this.pos, this.filter); }
    mutable() { return this; }
    immutable() { return new DOMCursor(this.node, this.pos, this.filter); }
    save() { return this.immutable(); }
    restore(dc) {
        this.node = dc.node;
        this.pos = dc.pos;
        this.filter = dc.filter;
        return this;
    }
    emptyPrev() {
        this.type = 'empty';
        this.next = function (up) {
            this.revertEmpty();
            if (up) {
                return this.next(up);
            }
            else {
                return this;
            }
        };
        this.nodeAfter = function (up) {
            this.computeType();
            if (up) {
                return this.nodeAfter(up);
            }
            else {
                return this;
            }
        };
        this.prev = function () {
            return this;
        };
        this.nodeBefore = function () {
            return this;
        };
        return this;
    }
    revertEmpty() {
        this.computeType();
        delete this.next;
        delete this.prev;
        delete this.nodeAfter;
        delete this.nodeBefore;
        return this;
    }
    /** truncates the range after this node */
    emptyNext() {
        this.type = 'empty';
        this.prev = (up) => {
            this.revertEmpty();
            return up ? this.prev(up) : this;
        };
        this.nodeBefore = (up) => {
            this.computeType();
            return up ? this.nodeBefore(up) : this;
        };
        this.next = () => this;
        this.nodeAfter = () => this;
        return this;
    }
}
// Utility functions
function debug(...args) { DOMCursor.debug && console.log(...args); }
function reject(filterResult) {
    return !filterResult || (filterResult === 'quit' || filterResult === 'skip');
}
// Node location routines
let positioner = document.createElement('DIV');
positioner.setAttribute('style', 'display: inline-block');
positioner.innerHTML = 'x';
let spareRange = document.createRange();
let emptyRect = {
    width: 0,
    height: 0
};
function chooseUpper(r1, r2) { return r1.top < r2.top; }
function chooseLower(r1, r2) { return r1.top > r2.top; }
function getClientRect(r) {
    var comp, i, len, rect, result;
    const rects = r.getClientRects();
    if (rects.length === 1)
        return rects[0];
    if (rects.length === 2) {
        result = rects[0];
        //comp = if r.startContainer.data[r.startOffset] == '\n' then chooseUpper
        comp = r.startContainer.data[r.startOffset] === '\n'
            && r.startOffset > 0
            && r.startContainer.data[r.startOffset] !== '\n' ? chooseUpper
            : chooseLower;
        for (i = 0, len = rects.length; i < len; i++) {
            rect = rects[i];
            if (comp(rect, result))
                result = rect;
        }
        return result;
    }
    return emptyRect;
}
DOMCursor.MutableDOMCursor = MutableDOMCursor;
DOMCursor.emptyDOMCursor = new EmptyDOMCursor();
DOMCursor.debug = false;

// Generated by CoffeeScript 2.6.0
var Deep, DelayedFingerTree, Digit, Empty, Node$1, Single, Split, app3, append, deepLeft, deepRight, fromArray, makeNodeMeasurer, nodes, notImplemented, prepend;

// Placeholder for methods of interfaces / abstract base classes.
notImplemented = function() {
  throw new Error('Not Implemented');
};

// A split is a container which has 3 parts, in which the left part is the
// elements that do not satisfy the predicate, the middle part is the
// first element that satisfies the predicate and the last part is the rest
// elements.
Split = class Split {
  // @param {Array|FingerTree} left
  // @param {*} mid
  // @param {Array|FingerTree} right
  constructor(left1, mid1, right1) {
    this.left = left1;
    this.mid = mid1;
    this.right = right1;
  }

};

// A digit is a measured container of one to four elements.
// @constructor
// @param {Object.<string, function>} measurer
// @param {Array.<*>} items
Digit = class Digit {
  constructor(measurer1, items) {
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
    // @private
    this.measure_ = m;
  }

  // Get the measure of the digit.
  measure() {
    return this.measure_;
  }

  // Get the first element stored in the digit.
  peekFirst() {
    return this.items[0];
  }

  // Get the last element stored in the digit.
  peekLast() {
    return this.items[this.items.length - 1];
  }

  // Return a new digit with the first item removed.
  // @return {Digit}
  removeFirst() {
    return this.slice(1);
  }

  // Return a new digit with the first item removed.
  // @return {Digit}
  removeLast() {
    return this.slice(0, this.length - 1);
  }

  // Return a new digit with the items sliced.
  // @param {Number} start
  // @param {Number} end
  // @return {Digit}
  slice(start, end) {
    if (end == null) {
      end = this.length;
    }
    return new Digit(this.measurer, this.items.slice(start, end));
  }

  // Split the digit into 3 parts, in which the left part is the elements
  // that does not satisfy the predicate, the middle part is the first
  // element that satisfies the predicate and the last part is the rest
  // elements.
  // @param {Function} predicate A function which returns either true or false
  //   given each stored element.
  // @param {*} initial The initial measure for the predicate
  // @return {Split}
  split(predicate, initial) {
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
  }

  // Return the JSON representation of the digit.
  toJSON() {
    return {
      type: 'digit',
      items: this.items,
      measure: this.measure()
    };
  }

};

// A node is a measured container of either 2 or 3 sub-finger-trees.
Node$1 = class Node {
  // @param {Object.<string, function>} measurer
  // @param {Array.<FingerTree>} items
  constructor(measurer1, items) {
    var item, j, len, m, ref;
    this.measurer = measurer1;
    this.items = items;
    m = this.measurer.identity();
    ref = this.items;
    for (j = 0, len = ref.length; j < len; j++) {
      item = ref[j];
      m = this.measurer.sum(m, this.measurer.measure(item));
    }
    // @private
    this.measure_ = m;
  }

  // Get the measure of the node.
  measure() {
    return this.measure_;
  }

  // Convert the node to a digit.
  // @return {Digit}
  toDigit() {
    return new Digit(this.measurer, this.items);
  }

  // Return the JSON representation of the node.
  toJSON() {
    return {
      type: 'node',
      items: this.items,
      measure: this.measure()
    };
  }

};

var FingerTree = (function() {
  // Interface of finger-tree.
  // @interface
  class FingerTree {
    // Force on a normal FingerTree just returns this
    force() {
      return this;
    }

    // Take elements from the tree until the predicate returns true.
    // @param {function(*): boolean} predicate
    // @return {FingerTree}
    takeUntil(predicate) {
      return this.split(predicate)[0];
    }

    // Drop elements from the tree until the predicate returns true.
    // @param {function(*): boolean} predicate
    // @return {FingerTree}
    dropUntil(predicate) {
      return this.split(predicate)[1];
    }

    // iterate over the nodes
    each(func) {
      var results, t;
      t = this;
      results = [];
      while (!t.isEmpty()) {
        func(t.peekFirst());
        results.push(t = t.removeFirst());
      }
      return results;
    }

    // iterate over the nodes
    eachReverse(func) {
      var results, t;
      t = this;
      results = [];
      while (!t.isEmpty()) {
        func(t.peekLast());
        results.push(t = t.removeLast());
      }
      return results;
    }

    toArray() {
      var a;
      a = [];
      this.each(function(n) {
        return a.push(n);
      });
      return a;
    }

  }
  // Get the measure of the tree.
  FingerTree.measure = notImplemented;

  // Check whether the tree is empty.
  // @return {boolean} True if the tree is empty.
  FingerTree.prototype.isEmpty = notImplemented;

  // Return a new tree with an element added to the front.
  // @param {*} v The element to add.
  // @return {FingerTree}
  FingerTree.prototype.addFirst = notImplemented;

  // Return a new tree with an element added to the end.
  // @param {*} v The element to add.
  // @return {FingerTree} A new finger-tree with the element added.
  FingerTree.prototype.addLast = notImplemented;

  // Return a new tree with the first element removed.
  // @return {FingerTree}
  FingerTree.prototype.removeFirst = notImplemented;

  // Return a new tree with the last element removed.
  // @return {FingerTree}
  FingerTree.prototype.removeLast = notImplemented;

  // Get the first element of the tree.
  // @return {*}
  FingerTree.prototype.peekFirst = notImplemented;

  // Get the last element of the tree.
  // @return {*}
  FingerTree.prototype.peekLast = notImplemented;

  // Concatenate this tree with another tree.
  // @param {FingerTree} other
  // @return {FingerTree} The concatenated tree.
  FingerTree.prototype.concat = notImplemented;

  // Split the tree into two halves, where the first half is a finger-tree
  // which contains all the elements that satisfy the given predicate,
  // while the ones from the other half do not.
  // @param {function(*): boolean} predicate
  // @return {Array.<FingerTree>} An array with the first element being a
  //   finger-tree that contains all the satisfying elements and the second
  //   element being a finger-tree that contains all the other elements.
  FingerTree.prototype.split = notImplemented;

  // @return the JSON representation of the tree.
  FingerTree.prototype.toJSON = notImplemented;

  return FingerTree;

}).call(undefined);

// An empty finger-tree.
Empty = class Empty extends FingerTree {
  constructor(measurer1) {
    super();
    this.measurer = measurer1;
    this.measure_ = this.measurer.identity();
  }

  measure() {
    return this.measure_;
  }

  addFirst(v) {
    return new Single(this.measurer, v);
  }

  addLast(v) {
    return new Single(this.measurer, v);
  }

  peekFirst() {
    return null;
  }

  peekLast() {
    return null;
  }

  isEmpty() {
    return true;
  }

  concat(other) {
    return other;
  }

  split(predicate) {
    return [this, this];
  }

  toJSON() {
    return {
      type: 'empty',
      measure: this.measure()
    };
  }

};

// A finger-tree which contains exactly one element.
Single = class Single extends FingerTree {
  // @param {Object.<string, function>} measurer
  // @param {*} value
  constructor(measurer1, value) {
    super();
    this.measurer = measurer1;
    this.value = value;
    this.measure_ = this.measurer.measure(this.value);
  }

  measure() {
    return this.measure_;
  }

  addFirst(v) {
    return new Deep(this.measurer, new Digit(this.measurer, [v]), new Empty(makeNodeMeasurer(this.measurer)), new Digit(this.measurer, [this.value]));
  }

  addLast(v) {
    return new Deep(this.measurer, new Digit(this.measurer, [this.value]), new Empty(makeNodeMeasurer(this.measurer)), new Digit(this.measurer, [v]));
  }

  removeFirst() {
    return new Empty(this.measurer);
  }

  removeLast() {
    return new Empty(this.measurer);
  }

  peekFirst() {
    return this.value;
  }

  peekLast() {
    return this.value;
  }

  isEmpty() {
    return false;
  }

  concat(other) {
    return other.addFirst(this.value);
  }

  // Helper function to split the tree into 3 parts.
  // @private
  // @param {function(*): boolean} predicate
  // @param {*} initial The initial measurement for reducing
  // @return {Split}
  splitTree(predicate, initial) {
    return new Split(new Empty(this.measurer), this.value, new Empty(this.measurer));
  }

  split(predicate) {
    if (predicate(this.measure())) {
      return [new Empty(this.measurer), this];
    } else {
      return [this, new Empty(this.measurer)];
    }
  }

  toJSON() {
    return {
      type: 'single',
      value: this.value,
      measure: this.measure()
    };
  }

};

// A finger-tree which contains two or more elements.
Deep = class Deep extends FingerTree {
  // @param {Object.<string, function>} measurer
  // @param {Digit} left
  // @param {FingerTree} mid
  // @param {Digit} right
  constructor(measurer1, left1, mid1, right1) {
    super();
    this.measurer = measurer1;
    this.left = left1;
    this.mid = mid1;
    this.right = right1;
    this.measure_ = null;
  }

  measure() {
    if (this.measure_ === null) {
      this.measure_ = this.measurer.sum(this.measurer.sum(this.left.measure(), this.mid.measure()), this.right.measure());
    }
    return this.measure_;
  }

  addFirst(v) {
    var leftItems;
    leftItems = this.left.items;
    if (this.left.length === 4) {
      return new Deep(this.measurer, new Digit(this.measurer, [v, leftItems[0]]), this.mid.addFirst(new Node$1(this.measurer, [leftItems[1], leftItems[2], leftItems[3]])), this.right);
    } else {
      return new Deep(this.measurer, new Digit(this.measurer, [v].concat(leftItems)), this.mid, this.right);
    }
  }

  addLast(v) {
    var rightItems;
    rightItems = this.right.items;
    if (this.right.length === 4) {
      return new Deep(this.measurer, this.left, this.mid.addLast(new Node$1(this.measurer, [rightItems[0], rightItems[1], rightItems[2]])), new Digit(this.measurer, [rightItems[3], v]));
    } else {
      return new Deep(this.measurer, this.left, this.mid, new Digit(this.measurer, rightItems.concat([v])));
    }
  }

  removeFirst() {
    var newMid;
    if (this.left.length > 1) {
      return new Deep(this.measurer, this.left.removeFirst(), this.mid, this.right);
    } else if (!this.mid.isEmpty()) {
      newMid = new DelayedFingerTree(() => {
        return this.mid.removeFirst();
      });
      return new Deep(this.measurer, this.mid.peekFirst().toDigit(), newMid, this.right);
    } else if (this.right.length === 1) {
      return new Single(this.measurer, this.right.items[0]);
    } else {
      return new Deep(this.measurer, this.right.slice(0, 1), this.mid, this.right.slice(1));
    }
  }

  removeLast() {
    var newMid;
    if (this.right.length > 1) {
      return new Deep(this.measurer, this.left, this.mid, this.right.removeLast());
    } else if (!this.mid.isEmpty()) {
      newMid = new DelayedFingerTree(() => {
        return this.mid.removeLast();
      });
      return new Deep(this.measurer, this.left, newMid, this.mid.peekLast().toDigit());
    } else if (this.left.length === 1) {
      return new Single(this.measurer, this.left.items[0]);
    } else {
      return new Deep(this.measurer, this.left.slice(0, -1), this.mid, this.left.slice(-1));
    }
  }

  peekFirst() {
    return this.left.peekFirst();
  }

  peekLast() {
    return this.right.peekLast();
  }

  isEmpty() {
    return false;
  }

  concat(other) {
    other = other.force();
    if (other instanceof Empty) {
      return this;
    } else if (other instanceof Single) {
      return this.addLast(other.value);
    } else {
      return app3(this, [], other);
    }
  }

  // Helper function to split the tree into 3 parts.
  // @private
  // @param {function(*): boolean} predicate
  // @param {*} initial The initial measurement for reducing
  // @return {Split}
  splitTree(predicate, initial) {
    var leftMeasure, midMeasure, midSplit, split;
    // see if the split point is inside the left tree
    leftMeasure = this.measurer.sum(initial, this.left.measure());
    if (predicate(leftMeasure)) {
      split = this.left.split(predicate, initial);
      return new Split(fromArray(split.left, this.measurer), split.mid, deepLeft(this.measurer, split.right, this.mid, this.right));
    } else {
      // see if the split point is inside the mid tree
      midMeasure = this.measurer.sum(leftMeasure, this.mid.measure());
      if (predicate(midMeasure)) {
        midSplit = this.mid.splitTree(predicate, leftMeasure);
        split = midSplit.mid.toDigit().split(predicate, this.measurer.sum(leftMeasure, midSplit.left.measure()));
        return new Split(deepRight(this.measurer, this.left, midSplit.left, split.left), split.mid, deepLeft(this.measurer, split.right, midSplit.right, this.right));
      } else {
        // the split point is in the right tree
        split = this.right.split(predicate, midMeasure);
        return new Split(deepRight(this.measurer, this.left, this.mid, split.left), split.mid, fromArray(split.right, this.measurer));
      }
    }
  }

  split(predicate) {
    var split;
    if (predicate(this.measure())) {
      split = this.splitTree(predicate, this.measurer.identity());
      return [split.left, split.right.addFirst(split.mid)];
    } else {
      return [this, new Empty(this.measurer)];
    }
  }

  toJSON() {
    return {
      type: 'deep',
      left: this.left,
      mid: this.mid,
      right: this.right,
      measure: this.measure()
    };
  }

};

// A lazy-evaluted finger-tree.
DelayedFingerTree = class DelayedFingerTree {
  // @param {function(): FingerTree} thunk A function, which when called, will
  constructor(thunk) {
    this.thunk = thunk;
    this.tree = null;
  }

  // Evaluate the thunk and return the finger-tree.
  // @return {FingerTree}
  force() {
    if (this.tree === null) {
      this.tree = this.thunk();
    }
    return this.tree;
  }

  isEmpty(v) {
    return this.force().isEmpty();
  }

  measure() {
    return this.force().measure();
  }

  peekFirst() {
    return this.force().peekFirst();
  }

  peekLast() {
    return this.force().peekLast();
  }

  addFirst(v) {
    return this.force().addFirst(v);
  }

  addLast(v) {
    return this.force().addLast(v);
  }

  removeFirst() {
    return this.force().removeFirst();
  }

  removeLast() {
    return this.force().removeLast();
  }

  concat(other) {
    return this.force().concat(other);
  }

  splitTree(predicate, initial) {
    return this.force().splitTree(predicate, initial);
  }

  split(predicate) {
    return this.force().split(predicate);
  }

  takeUntil(predicate) {
    return this.force().takeUntil(other);
  }

  dropUntil(predicate) {
    return this.force().dropUntil(other);
  }

  toJSON() {
    return this.force().toJSON();
  }

  toArray() {
    return this.force().toArray();
  }

};

// @param {Array} left
// @param {FingerTree} mid
// @param {Digit} right
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

// @param {Digit} left
// @param {FingerTree} mid
// @param {Array} right
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

// Helper function to concatenate two finger-trees with additional elements
// in between.
// @param {FingerTree} t1 Left finger-tree
// @param {Array} ts An array of elements in between the two finger-trees
// @param {FingerTree} t2 Right finger-tree
// @return {FingerTree}
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

// Helper function to group an array of elements into an array of nodes.
// @param {Object.<string, function>} m Measurer
// @param {Array} xs
// @return {Array}
nodes = function(m, xs, res) {
  res = res != null ? res : [];
  switch (xs.length) {
    case 2:
      res.push(new Node$1(m, xs));
      break;
    case 3:
      res.push(new Node$1(m, xs));
      break;
    case 4:
      res.push(new Node$1(m, [xs[0], xs[1]]), new Node$1(m, [xs[2], xs[3]]));
      break;
    default:
      res.push(new Node$1(m, [xs[0], xs[1], xs[2]]));
      nodes(m, xs.slice(3), res);
  }
  return res;
};

// Construct a derived measurer which will return the memoized
// measurement of a node instead of evaluting the node.
// @param {Object.<string, function>} measurer
// @return {Object.<string, function>}
makeNodeMeasurer = function(measurer) {
  return {
    identity: measurer.identity,
    measure: function(n) {
      return n.measure();
    },
    sum: measurer.sum
  };
};

// Prepend an array of elements to the left of a tree.
// Returns a new tree with the original one unmodified.
// @param {FingerTree} tree
// @param {Array} xs
// @return {FingerTree}
prepend = function(tree, xs) {
  var i, j;
  for (i = j = xs.length - 1; j >= 0; i = j += -1) {
    tree = tree.addFirst(xs[i]);
  }
  return tree;
};

// Append an array of elements to the right of a tree.
// Returns a new tree with the original one unmodified.
// @param {FingerTree} tree
// @param {Array} xs
// @return {FingerTree}
append = function(tree, xs) {
  var j, len, x;
  for (j = 0, len = xs.length; j < len; j++) {
    x = xs[j];
    tree = tree.addLast(x);
  }
  return tree;
};

// Construct a fingertree from an array.
// @param {Array} xs An array of elements.
// @param {Object.<string, function>} measurer
// @return {FingerTree}
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

/** id number for next created block */
let idCounter = 0;
//let activating = false
let readyPromise = new Promise(function (accept, reject) {
    if (document.readyState === 'interactive') {
        return accept(null);
    }
    else {
        return document.onreadystatechange = function () {
            if (document.readyState === 'interactive') {
                return accept(null);
            }
        };
    }
});
class Observable {
    constructor() {
        this.listeners = {};
        this.suppressingTriggers = false;
    }
    on(type, callback) {
        if (typeof type == 'object') {
            for (const [t, callback] of Object.entries(type)) {
                this.on(t, callback);
            }
        }
        else {
            if (!this.listeners[type])
                this.listeners[type] = [];
            this.listeners[type].push(callback);
        }
        return this;
    }
    off(type, callback) {
        if (typeof type == 'object') {
            for (const [callbackType, callback] of Object.entries(type)) {
                this.off(callbackType, callback);
            }
        }
        else {
            if (this.listeners[type]) {
                this.listeners[type] = this.listeners[type].filter((l) => l != callback);
            }
        }
        return this;
    }
    trigger(type, ...args) {
        if (!this.suppressingTriggers) {
            for (const listener of this.listeners[type] || []) {
                listener(...args);
            }
        }
    }
    suppressTriggers(func) {
        const oldSuppress = this.suppressingTriggers;
        this.suppressingTriggers = true;
        try {
            func();
        }
        finally {
            this.suppressingTriggers = oldSuppress;
        }
    }
}
/**
 * BasicEditingOptions class
 * =========================
 * BasicEditingOptions is an the options base class.
 *
 * Events:
 *   `load`: new text was loaded into the editor
 *
 * Hook methods (required)
 * -----------------------
 *
 * `renderBlock(block) -> [html, next]`: render a block (and potentially its children) and return the HTML and the next blockId if there is one
 *
 *   * Block DOM (DOM for a block) must be a single element with the same id as the block.
 *   * Block DOM may contain nested block DOM.
 *   * each block's DOM should have the same id as the block and have a data-block attribute
 *   * non-editable parts of the DOM should have contenteditable=false
 *   * completely skipped parts should be non-editable and have a data-noncontent attribute
 *
 * Properties of BasicEditingOptions
 * ---------------------------------
 * * `blocks {id -> block}`: block table
 * * `first`: id of first block
 * * `bindings {keys -> binding(editor, event, selectionRange)}`: a map of bindings (can use LeisureEditCore.defaultBindings)
 *
 * Methods of BasicEditingOptions
 * ------------------------------
 * * `getBlock(id) -> block?`: get the current block for id
 * * `getContainer(node) -> Node?`: get block DOM node containing for a node
 * * `getFirst() -> blockId`: get the first block id
 * * `domCursor(node, pos) -> DOMCursor`: return a domCursor that skips over non-content
 * * `keyUp(editor) -> void`: handle keyup after-actions
 * * `topRect() -> rect?`: returns null or the rectangle of a toolbar at the page top
 * * `blockColumn(pos) -> colNum`: returns the start column on the page for the current block
 * * `load(el, text) -> void`: parse text into blocks and replace el's contents with rendered DOM
 */
class BasicEditingOptionsNew extends Observable {
    /**
     * Main code
     * ---------
     */
    /** */
    constructor() {
        super();
        /** a map of bindings (can use LeisureEditCore.defaultBindings) */
        this.bindings = defaultBindings;
        this.changeContext = null;
        this.initData();
    }
    /** return [HTML, nextId], the rendered HTML and the id of the next block to render */
    renderBlock(_block) {
        throw new Error("options.renderBlock(block) is not implemented");
    }
    /**
     * Hook methods (optional)
     * -----------------------
     */
    /** The editor calls this when the user hits backspace or delete on selected text. */
    simulateCut(_data) { }
    /**
     * alter the drag-enter behavior.  If you want to cancel the drag, for
     * instance, call event.preventDefault() and set the dropEffect to 'none'
     */
    dragEnter(event) {
        if (!event.dataTransfer.getData) {
            useEvent(event);
            event.dataTransfer.dropEffect = 'none';
        }
    }
    /**
     * alter the drag-enter behavior.  If you want to cancel the drag, for
     * instance, call event.preventDefault() and set the dropEffect to 'none'
     */
    dragOver(event) {
        if (!event.dataTransfer.getData) {
            useEvent(event);
            event.dataTransfer.dropEffect = 'none';
        }
    }
    setDiagEnabled(_flag) {
        //#changeAdvice this, flag,
        //#  renderBlocks: diag: wrapDiag
        //#  changed: diag: wrapDiag
        //#if flag then @diag()
    }
    diag() { this.trigger('diag', this.editor.verifyAllNodes()); }
    initData() {
        this.blocks = {};
        this.first = null;
    }
    /** get the first block id */
    getFirst() { return this.first; }
    nodeForId(id) { return $$1(`#${id}`); }
    idForNode(node) { return $$1(node).prop('id'); }
    setEditor(editor) { this.editor = editor; }
    newId() { return this.data.newId(); }
    /** Compute blocks affected by transforming oldBlocks into newText */
    changeStructure(oldBlocks, newText) {
        return computeNewStructure(this, oldBlocks, newText);
    }
    mergeChangeContext(obj) {
        this.changeContext = Object.assign({}, this.changeContext || {}, obj);
    }
    clearChangeContext() { this.changeContext = null; }
    /** get the current block for id */
    getBlock(id) { return this.blocks[id]; }
    /** parse text into array of blocks -- DO NOT provide _id, prev, or next, they may be overwritten! */
    parseBlocks(text) { throw new Error("options.parseBlocks(text) is not implemented"); }
    /** return the start column on the page for the current block */
    blockColumn(pos) { return pos.textPosition().left; }
    /** return null or the rectangle of a toolbar at the page top */
    topRect() { return null; }
    /** handle keyup after-actions */
    keyUp() { }
    /** return a domCursor that skips over non-content */
    domCursor(node, pos) {
        return new DOMCursor(node, pos).addFilter((n) => (n.hasAttribute('data-noncontent') && 'skip') || true);
    }
    /** get block DOM node containing for a node */
    getContainer(node) {
        if (this.editor.node[0].compareDocumentPosition(node) & document.DOCUMENT_POSITION_CONTAINED_BY) {
            return $$1(node).closest('[data-block]')[0];
        }
    }
    replaceText(repl) { this.data.replaceText(repl); }
    /** parse text into blocks and trigger a 'load' event */
    load(_name, text) {
        this.suppressTriggers(() => {
            this.data.suppressTriggers(() => {
                this.replaceText({ start: 0, end: this.getLength(), text, source: 'edit' });
            });
        });
        this.rerenderAll();
        this.trigger('load');
    }
    rerenderAll() {
        this.editor.setHtml(this.editor.node[0], this.renderBlocks());
    }
    blockCount() { return Object.keys(this.blocks).length; }
    blockList() {
        const blocks = [];
        let next = this.getFirst();
        while (next) {
            const bl = this.getBlock(next);
            next = bl.next;
            blocks.push(bl);
        }
        return blocks;
    }
    docOffsetForBlockOffset(bOff, offset) {
        return this.data.docOffsetForBlockOffset(bOff, offset);
    }
    blockOffsetForDocOffset(dOff) { return this.data.blockOffsetForDocOffset(dOff); }
    getPositionForBlock(block) {
        let cur = this.getBlock(this.getFirst());
        let offset = 0;
        while (cur._id != block._id) {
            offset += cur.text.length;
            cur = this.getBlock(cur.next);
        }
        return offset;
    }
    //TODO remove this
    getBlockOffsetForPosition(pos) {
        //let cur = this.getBlock(this.getFirst())
        //while (pos >= cur.text.length) {
        //    pos -= cur.text.length
        //    cur = this.getBlock(cur.next)
        //}
        //return {block: cur, offset: pos}
        return this.blockOffsetForDocOffset(pos);
    }
    renderBlocks() {
        let result = '';
        let next = this.getFirst();
        let html;
        let render;
        while (next && (render = this.renderBlock(this.getBlock(next)))) {
            [html, next] = render;
            result += html;
        }
        return result;
    }
    getText() {
        let text = '';
        let block = this.data.getBlock(this.data.getFirst());
        while (block) {
            text += block.text;
            block = this.data.getBlock(block.next);
        }
        return text;
    }
    getLength() {
        let len = 0;
        let block = this.data.getBlock(this.data.getFirst());
        while (block) {
            len += block.text.length;
            block = this.data.getBlock(block.next);
        }
        return len;
    }
    isValidDocOffset(offset) { return 0 <= offset && offset <= this.getLength(); }
    validatePositions() {
        let block = this.data.getBlock(this.data.getFirst());
        while (block) {
            const node = this.nodeForId(block._id)[0];
            if (node) {
                let cursor = this.domCursor(node, 0).mutable().firstText();
                for (let offset = 0; offset < block.text.length; offset++) {
                    if (cursor.isEmpty() || !sameCharacter(cursor.character(), block.text[offset])) {
                        return { block, offset };
                    }
                    cursor.forwardChar();
                }
            }
            block = this.data.getBlock(block.next);
        }
    }
}
const spaces = String.fromCharCode(32, 160);
function sameCharacter(c1, c2) {
    return c1 == c2 || (spaces.includes(c1) && spaces.includes(c2));
}
function computeNewStructure(access, oldBlocks, newText) {
    let prev = oldBlocks[0]?.prev ?? '0';
    let oldText = null;
    let offset = 0;
    let next;
    let newBlocks;
    oldBlocks = oldBlocks.slice();
    if (oldBlocks.length) {
        while (oldText != newText && (oldBlocks[0].prev || last$1(oldBlocks).next)) {
            const prevBlk = access.getBlock(oldBlocks[0].prev);
            oldText = newText;
            if (prevBlk) {
                oldBlocks.unshift(prevBlk);
                newText = prevBlk.text + newText;
                offset += prevBlk.text.length;
            }
            if (next = access.getBlock(last$1(oldBlocks).next)) {
                oldBlocks.push(next);
                newText += next.text;
            }
            newBlocks = access.parseBlocks(newText);
            if ((!prevBlk || prevBlk.text == newBlocks[0].text) && (!next || next.text == last$1(newBlocks).text)) {
                break;
            }
        }
    }
    if (!newBlocks)
        newBlocks = access.parseBlocks(newText);
    while (oldBlocks.length && newBlocks.length && oldBlocks[0].text == newBlocks[0].text) {
        offset -= oldBlocks[0].text.length;
        prev = oldBlocks[0]._id;
        oldBlocks.shift();
        newBlocks.shift();
    }
    while (oldBlocks.length && newBlocks.length && last$1(oldBlocks).text == last$1(newBlocks).text) {
        oldBlocks.pop();
        newBlocks.pop();
    }
    return { oldBlocks: oldBlocks, newBlocks: newBlocks, offset: offset, prev: prev };
}
function copyBlock$1(block) { return !block ? null : Object.assign({}, block); }
/**
 * DataStore
 * =========
 * An efficient block storage mechanism used by DataStoreEditingOptions
 *
 * Hook methods -- you must define these in your subclass
 * ------------------------------------------------------
 * * `parseBlocks(text) -> blocks`: parse text into array of blocks -- DO NOT provide _id, prev, or next, they may be overwritten!
 *
 * Events
 * ------
 * Data objects support the Observable protocol and emit change events in response to data changes
 *
 * `change {adds, updates, removes, oldFirst, old}`
 *
 *   * `oldFirst id`: the previous first (might be the same as the current)
 *   * `adds {id->true}`: added items
 *   * `updates {id->true}`: updated items
 *   * `removes {id->true}`: removed items
 *   * `old {id->old block}`: the old items from updates and removes
 *
 * Internal API -- provide/override these if you want to change how the store accesses data
 * ----------------------------------------------------------------------------------------
 *
 * * `getFirst()`
 * * `setFirst(firstId)`
 * * `getBlock(id)`
 * * `setBlock(id, block)`
 * * `deleteBlock(id)`
 * * `eachBlock(func(block [, id]))` -- iterate with func (exit if func returns false)
 * * `load(first, blocks)` -- should trigger 'load'
 *
 * External API -- used from outside; alternative data objects must support these methods.
 * ---------------------------------------------------------------------------------------
 *
 * In addition to the methods below, data objects must support the Observable protocol and emit
 * change events in response to data changes
 *
 * * `getFirst() -> id`: id of the first block
 * * `getBlock(id) -> block`: the block for id
 * * `load(name, text)`: replace the current document
 * * `newId()`:
 * * `docOffsetForBlockOffset(args...) -> offset`: args can be a blockOffset or block, offset
 * * `blockOffsetForDocOffset(offset) -> blockOffset`: the block offset for a position in the document
 * * `suppressTriggers(func) -> func's return value`: suppress triggers while executing func (inherited from Observable)
 */
class DataStore$1 extends Observable {
    constructor() {
        super();
        this.blocks = {};
        this.blockIndex = this.newBlockIndex();
        this.changeCount = 0;
        this.clearMarks();
        this.markNames = {};
    }
    load(name, text) {
        var block, blockMap, i, j, len, newBlocks, prev, ref;
        blockMap = {};
        newBlocks = this.parseBlocks(text);
        for (i = j = 0, len = newBlocks.length; j < len; i = ++j) {
            block = newBlocks[i];
            block._id = this.newId();
            blockMap[block._id] = block;
            if (prev = newBlocks[i - 1]) {
                prev.next = block._id;
                block.prev = prev._id;
            }
        }
        this.first = (ref = newBlocks[0]) != null ? ref._id : '0';
        this.blocks = blockMap;
        return this.makeChanges(() => {
            this.indexBlocks();
            return this.trigger('load');
        });
    }
    // `parseBlocks(text) -> blocks`: parse text into array of blocks -- DO NOT provide _id, prev, or next, they may be overwritten!
    parseBlocks(text) {
        throw new Error("options.parseBlocks(text) is not implemented");
    }
    newBlockIndex(contents) {
        return FingerTree.fromArray(contents != null ? contents : [], {
            identity: function () {
                return {
                    ids: Set(),
                    length: 0
                };
            },
            measure: function (v) {
                return {
                    ids: Set([v.id]),
                    length: v.length
                };
            },
            sum: function (a, b) {
                return {
                    ids: a.ids.union(b.ids),
                    length: a.length + b.length
                };
            }
        });
    }
    newId() {
        return `block${idCounter++}`;
    }
    setDiagEnabled(flag) { }
    /** `getLength() -> number`: the length of the entire document */
    getLength() {
        return this.blockIndex.measure().length;
    }
    makeChanges(func) {
        this.changeCount++;
        try {
            return func();
        }
        finally {
            this.changeCount--;
        }
    }
    clearMarks() {
        return this.marks = FingerTree.fromArray([], {
            identity: function () {
                return {
                    names: Set(),
                    length: 0
                };
            },
            measure: function (n) {
                return {
                    names: Set([n.name]),
                    length: n.offset
                };
            },
            sum: function (a, b) {
                return {
                    names: a.names.union(b.names),
                    length: a.length + b.length
                };
            }
        });
    }
    addMark(name, offset) {
        var first, l, n, rest;
        if (this.markNames[name]) {
            this.removeMark(name);
        }
        this.markNames[name] = true;
        [first, rest] = this.marks.split(function (m) {
            return m.length >= offset;
        });
        l = first.measure().length;
        if (!rest.isEmpty()) {
            n = rest.peekFirst();
            rest = rest.removeFirst().addFirst({
                offset: l + n.offset - offset,
                name: n.name
            });
        }
        return this.marks = first.concat(rest.addFirst({
            offset: offset - l,
            name: name
        }));
    }
    removeMark(name) {
        var first, n, removed, rest;
        if (this.markNames[name]) {
            delete this.markNames[name];
            [first, rest] = this.marks.split(function (m) {
                return m.names.contains(name);
            });
            if (!rest.isEmpty()) {
                removed = rest.peekFirst();
                rest = rest.removeFirst();
                if (!rest.isEmpty()) {
                    n = rest.peekFirst();
                    rest = rest.removeFirst().addFirst({
                        offset: removed.offset + n.offset,
                        name: n.name
                    });
                }
            }
            return this.marks = first.concat(rest);
        }
    }
    listMarks() {
        var m, n, t;
        m = [];
        t = this.marks;
        while (!t.isEmpty()) {
            n = t.peekFirst();
            m.push(_.defaults({
                location: this.getMarkLocation(n.name)
            }, n));
            t = t.removeFirst();
        }
        return m;
    }
    getMarkLocation(name) {
        var first, rest;
        if (this.markNames[name]) {
            [first, rest] = this.marks.split(function (m) {
                return m.names.contains(name);
            });
            if (!rest.isEmpty()) {
                return first.measure().length + rest.peekFirst().offset;
            }
        }
    }
    blockOffsetForMark(name) {
        var offset;
        if (offset = this.getMarkLocation(name)) {
            return this.blockOffsetForDocOffset(offset);
        }
    }
    floatMarks(start, end, newLength) {
        var first, n, oldLength, rest;
        if (newLength !== (oldLength = end - start)) {
            [first, rest] = this.marks.split(function (m) {
                return m.length > start;
            });
            if (!rest.isEmpty()) {
                n = rest.peekFirst();
                return this.marks = first.concat(rest.removeFirst().addFirst({
                    name: n.name,
                    offset: n.offset + newLength - oldLength
                }));
            }
        }
    }
    replaceText({ start, end, text }) {
        var newBlocks, oldBlocks, prev;
        ({ prev, oldBlocks, newBlocks } = this.changesForReplacement(start, end, text));
        if (oldBlocks) {
            this.change(this.changesFor(prev, oldBlocks.slice(), newBlocks.slice()));
            return this.floatMarks(start, end, text.length);
        }
    }
    changesForReplacement(start, end, text) {
        var blocks, change, newBlocks, newText, offset, oldBlocks, prev;
        ({ blocks, newText } = this.blockOverlapsForReplacement(start, end, text));
        ({ oldBlocks, newBlocks, offset, prev } = change = computeNewStructure(this, blocks, newText));
        if (oldBlocks.length || newBlocks.length) {
            return change;
        }
        else {
            return {};
        }
    }
    computeRemovesAndNewBlockIds(oldBlocks, newBlocks, newBlockMap, removes) {
        var i, j, len, len1, newBlock, o, oldBlock, prev, ref;
        ref = oldBlocks.slice(newBlocks.length, oldBlocks.length);
        for (j = 0, len = ref.length; j < len; j++) {
            oldBlock = ref[j];
            removes[oldBlock._id] = oldBlock;
        }
        prev = null;
        for (i = o = 0, len1 = newBlocks.length; o < len1; i = ++o) {
            newBlock = newBlocks[i];
            if (oldBlock = oldBlocks[i]) {
                newBlock._id = oldBlock._id;
                newBlock.prev = oldBlock.prev;
                newBlock.next = oldBlock.next;
            }
            else {
                newBlock._id = this.newId();
                if (prev) {
                    link(prev, newBlock);
                }
            }
            prev = newBlockMap[newBlock._id] = newBlock;
        }
        return prev;
    }
    patchNewBlocks(first, oldBlocks, newBlocks, changes, newBlockMap, removes, prev) {
        var lastBlock, next, oldNext, oldPrev;
        if (!oldBlocks.length && (first = this.getBlock(first))) {
            oldNext = this.getBlock(first.next);
            oldBlocks.unshift(first);
            first = newBlockMap[first._id] = copyBlock$1(first);
            link(first, newBlocks[0]);
            newBlocks.unshift(first);
            if (oldNext) {
                oldBlocks.push(oldNext);
                oldNext = newBlockMap[oldNext._id] = copyBlock$1(oldNext);
                link(last$1(newBlocks), oldNext);
                return newBlocks.push(oldNext);
            }
        }
        else if (oldBlocks.length !== newBlocks.length) {
            if (!prev && (prev = copyBlock$1(oldPrev = this.getBlock(oldBlocks[0].prev)))) {
                oldBlocks.unshift(oldPrev);
                newBlocks.unshift(prev);
                newBlockMap[prev._id] = prev;
            }
            lastBlock = last$1(oldBlocks);
            if (next = copyBlock$1(oldNext = this.getBlock((lastBlock ? lastBlock.next : this.getFirst())))) {
                oldBlocks.push(oldNext);
                newBlocks.push(next);
                newBlockMap[next._id] = next;
                if (!(next.prev = prev != null ? prev._id : void 0)) {
                    changes.first = next._id;
                }
            }
            if (prev) {
                if (!first && ((newBlocks.length && !newBlocks[0].prev) || !oldBlocks.length || !this.getFirst() || removes[this.getFirst()])) {
                    changes.first = newBlocks[0]._id;
                }
                return prev.next = next != null ? next._id : void 0;
            }
        }
    }
    changesFor(first, oldBlocks, newBlocks) {
        var changes, newBlockMap, prev, removes;
        newBlockMap = {};
        removes = {};
        changes = {
            removes,
            sets: newBlockMap,
            first: this.getFirst(),
            oldBlocks,
            newBlocks
        };
        prev = this.computeRemovesAndNewBlockIds(oldBlocks, newBlocks, newBlockMap, removes);
        this.patchNewBlocks(first, oldBlocks, newBlocks, changes, newBlockMap, removes, prev);
        this.removeDuplicateChanges(newBlockMap);
        return changes;
    }
    removeDuplicateChanges(newBlockMap) {
        var block, oldBlock, results1;
        let dups = [];
        for (const id in newBlockMap) {
            block = newBlockMap[id];
            if ((oldBlock = this.getBlock(id)) && block.text === oldBlock.text && block.next === oldBlock.next && block.prev === oldBlock.prev) {
                dups.push(id);
            }
        }
        results1 = [];
        for (const id of dups)
            results1.push(delete newBlockMap[id]);
        return results1;
    }
    checkChanges() {
        if (this.changeCount === 0) {
            throw new Error("Attempt to make a change outside of makeChanges");
        }
    }
    setIndex(i) {
        this.checkChanges();
        return this.blockIndex = i;
    }
    getFirst() {
        return this.first;
    }
    setFirst(firstId) {
        return this.first = firstId;
    }
    getBlock(id) {
        return this.blocks[id];
    }
    setBlock(id, block) {
        this.checkChanges();
        this.blocks[id] = block;
        return this.indexBlock(block);
    }
    deleteBlock(id) {
        this.checkChanges();
        delete this.blocks[id];
        return this.unindexBlock(id);
    }
    eachBlock(func) {
        var block;
        block = this.getBlock(this.getFirst());
        while (block && func(block, block._id) !== false) {
            block = this.getBlock(block.next);
        }
        return null;
    }
    indexBlocks() {
        var items;
        this.checkChanges();
        items = [];
        this.eachBlock((block) => {
            return items.push(indexNode(block));
        });
        return this.setIndex(this.newBlockIndex(items));
    }
    splitBlockIndexOnId(id) {
        return this.blockIndex.split(function (m) {
            return m.ids.contains(id);
        });
    }
    splitBlockIndexOnOffset(offset) {
        return this.blockIndex.split(function (m) {
            return m.length > offset;
        });
    }
    indexBlock(block) {
        var first, next, rest, split;
        if (block) {
            this.checkChanges();
            // if the block is indexed, it might be an easy case, otherwise unindex it
            [first, rest] = this.splitBlockIndexOnId(block._id);
            if (!rest.isEmpty() && rest.peekFirst().id === block._id && (next = rest.removeFirst()) && (next.isEmpty() ? !block.next : next.peekFirst().id === block.next) && (first.isEmpty() ? !block.prev : first.peekLast().id === block.prev)) {
                return this.setIndex(first.addLast(indexNode(block)).concat(next));
            }
            if (!rest.isEmpty()) {
                this.unindexBlock(block._id);
            }
            // if next is followed by prev, just insert the block in between
            if ((split = this.fingerNodeOrder(block.prev, block.next)) && _.isArray(split)) {
                [first, rest] = split;
                return this.setIndex(first.addLast(indexNode(block)).concat(rest));
            }
            // repair as much of the index as possible and insert the block
            return this.insertAndRepairIndex(block);
        }
    }
    fingerNode(id) {
        var node;
        return id && (node = this.splitBlockIndexOnId(id)[1].peekFirst()) && node.id === id && node;
    }
    fingerNodeOrder(a, b) {
        var first, ref, ref1, rest, split;
        return !(a || b) || (!a && b ? this.fingerNode(b) : !b && a ? this.fingerNode(a) : ([first, rest] = split = this.splitBlockIndexOnId(b), !first.isEmpty() && !rest.isEmpty() && ((ref = rest.peekFirst()) != null ? ref.id : void 0) === b && ((ref1 = first.peekLast()) != null ? ref1.id : void 0) === a && split));
    }
    /**
     * insert block into the index
     * then trace forwards and backwards, repairing along the way
     */
    insertAndRepairIndex(block) {
        var cur, first, mark, node, rest, results1;
        console.warn("REPAIR");
        node = indexNode(block);
        if (block.next) {
            this.getBlock(block.prev);
            if (!block.prev) {
                this.setIndex(this.blockIndex.addFirst(indexNode(block)));
            }
            else {
                [first, rest] = this.splitBlockIndexOnId(block.next);
                this.setIndex(first.addLast(node).concat(rest));
            }
        }
        else if (block.prev) {
            [first, rest] = this.splitBlockIndexOnId(block.prev);
            this.setIndex(first.addLast(node).concat(rest));
        }
        else {
            this.setIndex(this.newBlockIndex([node]));
        }
        mark = block;
        cur = this.getBlock(block.next);
        while (cur && !this.fingerNodeOrder(mark._id, cur._id)) {
            this.unindexBlock(cur._id);
            [first, rest] = this.splitBlockIndexOnId(mark._id);
            this.setIndex(insertAfterSplit(first, indexNode(cur), rest));
            mark = cur;
            cur = this.getBlock(cur.next);
        }
        mark = block;
        cur = this.getBlock(block.prev);
        results1 = [];
        while (cur && !this.fingerNodeOrder(cur._id, mark._id)) {
            this.unindexBlock(cur._id);
            [first, rest] = this.splitBlockIndexOnId(mark._id);
            this.setIndex(insertInSplit(first, indexNode(cur), rest));
            mark = cur;
            results1.push(cur = this.getBlock(cur.prev));
        }
        return results1;
    }
    unindexBlock(id) {
        var first, ref, rest;
        this.checkChanges();
        if (id) {
            [first, rest] = this.splitBlockIndexOnId(id);
            if (((ref = rest.peekFirst()) != null ? ref.id : void 0) === id) {
                return this.setIndex(first.concat(rest.removeFirst()));
            }
        }
    }
    /** args can be a blockOffset or block, offset */
    docOffsetForBlockOffset(block, offset) {
        if (typeof block === 'object') {
            offset = block.offset;
            block = block.block;
        }
        return this.offsetForBlock(block) + offset;
    }
    blockOffsetForDocOffset(offset) {
        var results;
        results = this.splitBlockIndexOnOffset(offset);
        if (!results[1].isEmpty()) {
            return {
                block: results[1].peekFirst().id,
                offset: offset - results[0].measure().length
            };
        }
        else {
            return {
                block: results[0].peekLast().id,
                offset: results[0].removeLast().measure().length
            };
        }
    }
    offsetForBlock(blockOrId) {
        var id;
        id = typeof blockOrId === 'string' ? blockOrId : blockOrId._id;
        if (this.getBlock(id)) {
            return this.splitBlockIndexOnId(id)[0].measure().length;
        }
        else {
            return 0;
        }
    }
    blockForOffset(offset) {
        var ref, ref1, results;
        results = this.splitBlockIndexOnOffset(offset);
        return ((ref = (ref1 = results[1]) != null ? ref1.peekFirst() : void 0) != null ? ref : results[0].peekLast).id;
    }
    getDocLength() {
        return this.blockIndex.measure().length;
    }
    getDocSubstring(start, end) {
        var block, endOffset, startOffset, text;
        startOffset = this.blockOffsetForDocOffset(start);
        endOffset = this.blockOffsetForDocOffset(end);
        block = this.getBlock(startOffset.block);
        text = '';
        while (block._id !== endOffset.block) {
            text += block.text;
            block = this.getBlock(block.next);
        }
        if (startOffset.block === endOffset.block) {
            return block.text.substring(startOffset.offset, endOffset.offset);
        }
        else {
            return text.substring(startOffset.offset) + block.text.substring(0, endOffset.offset);
        }
    }
    /** the text for the entire document */
    getText() {
        var text;
        text = '';
        this.eachBlock(function (block) {
            return text += block.text;
        });
        return text;
    }
    check() {
        var bl, first, lastBlock, next, oldBl, prev, seen;
        seen = {};
        first = next = this.getFirst();
        prev = null;
        while (next) {
            prev = next;
            if (seen[next]) {
                throw new Error("cycle in next links");
            }
            seen[next] = true;
            oldBl = bl;
            bl = this.getBlock(next);
            if (!bl) {
                throw new Error(`Next of ${oldBl._id} doesn't exist`);
            }
            next = bl.next;
        }
        this.eachBlock(function (block) {
            if (block._id !== first && !seen[block._id]) {
                throw new Error(`${block._id} not in next chain`);
            }
        });
        seen = {};
        lastBlock = prev;
        while (prev) {
            if (seen[prev]) {
                throw new Error("cycle in prev links");
            }
            seen[prev] = true;
            oldBl = bl;
            bl = this.getBlock(prev);
            if (!bl) {
                throw new Error(`Prev of ${oldBl._id} doesn't exist`);
            }
            prev = bl.prev;
        }
        this.eachBlock(function (block) {
            if (block._id !== lastBlock && !seen[block._id]) {
                throw new Error(`${block._id} not in prev chain`);
            }
        });
        return null;
    }
    blockList() {
        var bl, next, results1;
        next = this.getFirst();
        results1 = [];
        while (next) {
            bl = this.getBlock(next);
            next = bl.next;
            results1.push(bl);
        }
        return results1;
    }
    change(changes) {
        return this.trigger('change', this.makeChange(changes));
    }
    makeChange({ first, sets, removes, oldBlocks, newBlocks }) {
        return this.makeChanges(() => {
            var adds, bl, block, err, old, result, updates;
            ({ adds, updates, old } = result = {
                adds: {},
                updates: {},
                removes,
                old: {},
                sets,
                oldFirst: this.getFirst(),
                first: first,
                oldBlocks,
                newBlocks
            });
            this.setFirst(first);
            for (const id in removes) {
                if (bl = this.getBlock(id)) {
                    old[id] = bl;
                    this.deleteBlock(id);
                }
            }
            for (const id in sets) {
                block = sets[id];
                if (bl = this.getBlock(id)) {
                    old[id] = bl;
                    updates[id] = block;
                }
                else {
                    adds[id] = block;
                }
                this.setBlock(id, block);
            }
            try {
                this.check();
            }
            catch (error) {
                err = error;
                console.log(err);
            }
            return result;
        });
    }
    indexArray() {
        return treeToArray(this.blockIndex);
    }
    blockArray() {
        var block, blocks;
        blocks = [];
        block = this.getBlock(this.getFirst());
        while (block) {
            blocks.push(block);
            block = this.getBlock(block.next);
        }
        return blocks;
    }
    diag() { return this.trigger('diag', this.verifyIndex()); }
    verifyIndex() {
        var bArray, blockIds, errs, iArray, j, len, node, offset, ref, treeIds;
        iArray = this.indexArray();
        treeIds = _.map(iArray, _.property('id'));
        bArray = this.blockArray();
        blockIds = _.map(bArray, _.property('_id'));
        if (!_.isEqual(treeIds, blockIds)) {
            console.warn(`INDEX ERROR:\nEXPECTED: ${JSON.stringify(blockIds)}\nBUT GOT: ${JSON.stringify(treeIds)}`);
        }
        errs = new BlockErrors();
        for (j = 0, len = iArray.length; j < len; j++) {
            node = iArray[j];
            if (node.length !== ((ref = this.getBlock(node.id)) != null ? ref.text.length : void 0)) {
                errs.badId(node.id, 'bad index length');
            }
        }
        offset = 0;
        this.eachBlock((block) => {
            if (!this.fingerNodeOrder(block.prev, block._id)) {
                errs.badId(block._id, 'bad order');
                console.warn(`NODE ORDER WRONG FOR ${block.prev}, ${block._id}`);
            }
            if (offset !== this.offsetForBlock(block._id)) {
                errs.badId(block._id, "offset");
            }
            if (block.prev && this.blockForOffset(offset - 1) !== block.prev) {
                errs.badId(block._id, "prev");
            }
            if (block.next && this.blockForOffset(offset + block.text.length) !== block.next) {
                errs.badId(block._id, "next");
            }
            return offset += block.text.length;
        });
        return errs.errors();
    }
    blockOverlapsForReplacement(start, end, text) {
        var blocks, cur, endBlock, fullText, offset, startBlock;
        startBlock = this.getBlock(this.blockForOffset(start));
        if (!startBlock && start) {
            startBlock = this.getBlock(this.blockForOffset(start - 1));
        }
        endBlock = this.getBlock(this.blockForOffset(end));
        if (!endBlock && end) {
            endBlock = this.getBlock(this.blockForOffset(end - 1));
        }
        blocks = [startBlock];
        cur = startBlock;
        while (cur !== endBlock && cur.next) {
            blocks.push(cur = this.getBlock(cur.next));
        }
        fullText = blockText$2(blocks);
        offset = this.offsetForBlock(blocks[0]);
        return {
            blocks: blocks,
            blockText: fullText,
            newText: fullText.substring(0, start - offset) + text + (fullText.substring(end - offset))
        };
    }
}
class BlockErrors {
    constructor() {
        this.order = [];
        this.ids = {};
    }
    isEmpty() { return !this.order.length; }
    badId(id, msg) {
        if (!this.ids[id]) {
            this.order.push(id);
            return this.ids[id] = msg;
        }
        return this.ids[id] += `, ${msg}`;
    }
    errors() {
        var id, j, len, ref, results1;
        if (!this.isEmpty()) {
            ref = this.order;
            results1 = [];
            for (j = 0, len = ref.length; j < len; j++) {
                id = ref[j];
                results1.push([id, `(${this.ids[id]})`]);
            }
            return results1;
        }
    }
}
function link(prev, next) {
    prev.next = next._id;
    next.prev = prev._id;
}
function blockText$2(blocks) {
    let result = '';
    for (const block of blocks)
        result += block.text;
    return result;
}
function indexNode(block) { return { id: block._id, length: block.text.length }; }
function insertInSplit(first, middle, rest) {
    if (first.isEmpty()) {
        return rest.addFirst(middle);
    }
    else if (rest.isEmpty()) {
        return first.addLast(middle);
    }
    else {
        return first.addLast(middle).concat(rest);
    }
}
function insertAfterSplit(first, afterMiddle, rest) {
    var next;
    next = rest.removeFirst().addFirst(afterMiddle);
    if (first.isEmpty()) {
        return next.addFirst(rest.peekFirst());
    }
    else {
        return first.addLast(rest.peekFirst()).concat(next);
    }
}
function treeToArray(tree) {
    let nodes = [];
    while (!tree.isEmpty()) {
        nodes.push(tree.peekFirst());
        tree = tree.removeFirst();
    }
    return nodes;
}
let FJQData = new WeakMap();
function getNodeData(node, create = false) {
    if (create && !FJQData.has(node))
        FJQData.set(node, {});
    return FJQData.get(node);
}
function getDataProperty(node, prop, create) {
    let d = getNodeData(node, create);
    if (!d)
        return null;
    if (!d[prop])
        d[prop] = {};
    return d[prop];
}
function getUserData(node, create) { return node && getDataProperty(node, 'userData', create); }
function getEvents(node, create = false) { return node && getDataProperty(node, 'events', create); }
let $func;
let is$;
let $$1;
const $$$ = (...args) => { return $func(...args); };
$$$.ready = (func) => $func.ready(func);
$$$.ajax = (req) => $func.ajax(req);
$$$.get = (url, success) => $func.get(url, success);
function f$(spec, context = document) { return new FeatherJQ(spec, context); }
function isFeather(obj) { return obj instanceof FeatherJQ || (obj.prop && obj.attr); }
function set$$1(new$, is$Func) {
    $func = new$;
    is$ = is$Func;
}
/**
 * FeatherJQ class
 * ===============
 * A featherweight JQuery replacement.  Users can use set$ to make it use
 * the real jQuery, like this: `set$($, (obj)-> obj instanceof $)`
 */
class FeatherJQ {
    constructor(spec = [], context = document) {
        this.length = 0;
        this.context = context;
        for (const item of featherItem(context, spec)) {
            this.push(item);
        }
    }
    static ajax(req) {
        const { url, success, data } = req;
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                return success(xhr.responseText);
            }
        };
        xhr.open((data ? 'POST' : 'GET'), url, true);
        return xhr.send(data);
    }
    static get(url, success) { return FeatherJQ.ajax({ url, success }); }
    static ready(func) { return readyPromise.then(func); }
    find(sel) {
        var j, l, len, len1, node, ref, ref1, result, results;
        results = f$();
        ref = this;
        for (j = 0, len = ref.length; j < len; j++) {
            node = ref[j];
            if (node.querySelectorAll != null) {
                ref1 = node.querySelectorAll(sel);
                for (l = 0, len1 = ref1.length; l < len1; l++) {
                    result = ref1[l];
                    results.push(result);
                }
            }
        }
        return results;
    }
    attr(name, value) {
        if (value != undefined) {
            for (const node of this) {
                node.setAttribute(name, value);
            }
            return this;
        }
        return this[0] && this[0].getAttribute && this[0].getAttribute(name);
    }
    prop(name, value) {
        var j, len, node, ref, ref1;
        if (value != undefined) {
            ref = this;
            for (j = 0, len = ref.length; j < len; j++) {
                node = ref[j];
                node[name] = value;
            }
            return this;
        }
        return (ref1 = this[0]) != null ? ref1[name] : void 0;
    }
    closest(sel) {
        const result = f$();
        for (const node of this) {
            const n = (node.closest ? node : node.parentNode).closest(sel);
            if (n)
                result.push(n);
        }
        return result;
    }
    is(sel) {
        for (let j = 0, len = this.length; j < len; j++) {
            const node = this[j];
            if (typeof node.matches === "function" && node.matches(sel))
                return true;
        }
        return false;
    }
    push(...items) {
        for (const item of items)
            this[this.length++] = item;
        return this;
    }
    parent() {
        const result = f$();
        for (let j = 0, len = this.length; j < len; j++) {
            const p = this[j]?.parentNode;
            if (p)
                result.push(p);
        }
        return result;
    }
    data(key, value) {
        if (!key)
            return getUserData(this[0], true);
        const d = getUserData(this[0], true);
        if (value == undefined)
            return d[key];
        for (let j = 0, len = this.length; j < len; j++)
            d[key] = value;
        return this;
    }
    on(evtType, func) {
        for (const node of this) {
            const evt = getEvents(node);
            if (!evt[evtType])
                evt[evtType] = [];
            node.addEventListener(evtType, func);
            evt[evtType].push(func);
        }
        return this;
    }
    off(evtType, func) {
        for (const node of this) {
            const allEvents = getEvents(node);
            const evts = allEvents && allEvents[evtType];
            const remaining = [];
            if (!evts)
                continue;
            for (const evtFunc of evts) {
                if (func && evtFunc !== func)
                    remaining.push(evtFunc);
                else
                    node.removeEventListener(evtType, evtFunc);
            }
            if (remaining.length)
                allEvents[evtType] = remaining;
            else
                delete allEvents[evtType];
        }
        return this;
    }
    ready(func) { return FeatherJQ.ready(func); }
    html(newHtml) {
        for (let j = 0, len = this.length; j < len; j++)
            this[j].innerHTML = newHtml;
        return this;
    }
    children(sel) {
        const result = f$();
        for (const node of this) {
            for (const child of node.children) {
                if (!sel || (child.matches && child.matches(sel)))
                    result.push(child);
            }
        }
        return result;
    }
    filter(criterion, thisArg) {
        const pred = typeof criterion === 'string' ? (item) => item.matches(criterion)
            : Array.isArray(criterion) ? (item) => criterion.includes(item)
                : criterion instanceof Function ? criterion
                    : (_item) => false;
        // call super method with computed pred and convert result to FeatherJQ
        return new FeatherJQ(Array.prototype.filter.call(this, pred), this.context);
    }
    insertAfter(sel) {
        const targets = featherItem(this.context, sel);
        let items = this;
        let clone = false;
        for (const target of targets) {
            if (clone)
                items = items.map(i => i.cloneNode(true));
            for (const item of items)
                target.after(item);
            clone = true;
        }
        return this;
    }
    append(sel) {
        let children = featherItem(this.context, sel);
        let clone = false;
        for (const parent of this) {
            if (clone)
                children = children.map(i => i.cloneNode(true));
            for (const child of children)
                parent.append(child);
            clone = true;
        }
        return this;
    }
    remove() {
        for (const node of this)
            node.remove();
        return this;
    }
    first() { return this[0] ? f$(this[0]) : f$(); }
    after(content, content2) {
        if (content instanceof Function) {
            for (let i = 0; i < this.length; i++) {
                const parent = this[i];
                const item = content.length === 1 ? content.call(parent, i)
                    : content.call(parent, i, parent.outerHTML);
                parent.after(item);
            }
        }
        else {
            let children = featherItem(this.context, content);
            let clone = false;
            if (content2) {
                children = children.concat(content2.flatMap(item => featherItem(this.context, item)));
            }
            for (const parent of this) {
                if (clone)
                    children = children.map(i => i.cloneNode(true));
                for (const child of children)
                    parent.after(child);
                clone = true;
            }
        }
        return this;
    }
    [Symbol.iterator]() {
        let index = 0;
        return {
            next: () => index < this.length ? { done: false, value: this[index++] } : { done: true }
        };
    }
}
function featherItem(context, spec) {
    if (typeof spec === 'object' && spec.vfProxyValue)
        return [...spec.vfProxyValue];
    if (spec instanceof FeatherJQ)
        return [...spec];
    if (Array.isArray(spec))
        return spec;
    if (spec instanceof Node)
        return [spec];
    if (typeof spec !== 'string')
        return [];
    try {
        return [...context.querySelectorAll(spec)];
    }
    catch (error) {
        const div = document.createElement('div');
        div.innerHTML = spec;
        return [...div.children];
    }
}
f$.ready = FeatherJQ.ready;
f$.ajax = FeatherJQ.ajax;
f$.get = FeatherJQ.get;
if ('$' in window) {
    $$1 = window['$'];
    is$ = (x => x === $$1);
}
else {
    $$1 = $$$;
    set$$1(f$, isFeather);
    //set$(vFeatherJQ, isFeather)
}

// Generated by CoffeeScript 2.6.0
// LeisureEditCore ([example editor](http://team-cthulhu.github.io/LeisureEditCore/examples/index.html))
// ===============
// Copyright (C) 2015, Bill Burdick, Roy Riggs, TEAM CTHULHU

// Licensed with ZLIB license (see "[License](#license)", below).

// Welcome to LeisureEditCore!  Are you trying to make editable documents
// that are more than just text editors or word processors?  This library
// tries to make it easier to make interesting editable documents.  You
// can find it on [Github](https://github.com/TEAM-CTHULHU/LeisureEditCore).
// LeisureEditCore what [Leisure's](https://github.com/zot/Leisure)
// editor, extracted out into a small HTML5 library.  LeisureEditCore is
// pluggable with an options object that contains customization hooks.
// Code and examples are in Coffeescript (a JS build is provided as a
// convenience).

// Basic Idea
// ==========

// LeisureEditCore edits a doubly-linked list of newline-terminated text
// "blocks" that can render as DOM nodes (and maybe in interesting ways!)

// The rendered DOM tree contains the full text of the block list in the
// proper order, along with ids from the blocks.  Some of the text may
// not be visible and there may be a lot of items in the rendered DOM
// that are not in the blocks.  Also, the rendered DOM may have a nested
// tree-structure.

// When the user makes a change, the editor:

//   1. maps the cursor location in the DOM to the corresponding location in the blocks
//   2. changes block text, regenerating part of the blocks
//   3. rerenders the DOM corresponding to the changed blocks
//   4. replaces the new DOM into the page

// ![Editor flow](editorFlow.png)

// Of course the editor supports [custom key bindings](#defaultBindings).

// Using/Installing LeisureEditCore
// ================================
// Make sure your webpage loads the javascript files in the `build` directory.  Follow
// the instructions below to use it.

// [Here](http://team-cthulhu.github.io/LeisureEditCore/examples/index.html) is an example that edits org-mode text.

// Blocks
// ------
//   * `_id`: the block id
//   * `text`: the text of the block
//   * `prev`: the id of the previous block (optional)
//   * `next`: the id of the next block (optional)
//   * EXTRA STUFF: you can store whatever extra things you like in your text blocks

// BlockOffsets
// ------------
// {block: aBlock, offset: aNumber}
// aBlock can be an id or a block

// Editor (see below for more detailed documentation)
// --------------------------------------------------
// An instance of LeisureEditCore.  You must provide an HTML node to
// contain the document contents and an options object to configure the
// editor.

// Editor options object (see below for more detailed documentation)
// -----------------------------------------------------------------
// DataStoreEditingOptions is the recommended options object but
// you can also subclass BasicEditingOptions.

// Data object (see below for more detailed documentation)
// -------------------------------------------------------
// Manages the document.  It's responsible for parsing text into blocks,
// accessing the blocks, making changes, and converting between block
// locations and document locations.

// Basic usage
// -----------
// To use this in the recommended way...

// 1. The code uses AMD style and depends on 'lodash', 'fingertree', and 'immutable' which you will probably need to map.  This is so that if you are using any of these packages, you won't have to include them more than once.
// 1. Subclass DataStoreEditingOptions and provide a renderBlock(block) method
// 1. Subclass DataStore and provide a parseBlocks(text) method
// 1. Create an editor object with your options object on your data object
// 1. Call the load(name, text) method on your options object

// Included packages
// =================
// - [DOMCursor](https://github.com/zot/DOMCursor) -- locating text in DOM trees

// Third-party packages we use (also included)
// ===========================================
// - [lodash](https://lodash.com/) -- collection, FP, and async utilities
// - [fingertree](https://github.com/qiao/fingertree.js) -- the swiss army knife of data structures
// - [immutable](http://facebook.github.io/immutable-js) -- immutable data structures

// Building
// ========
// If you modify LeisureEditCore and want to build it, you can use the Cakefile.  It needs the
// `which` npm package (`npm install which`).

// <a name="license"></a>License
// =============================
// Licensed with ZLIB license.

// This software is provided 'as-is', without any express or implied
// warranty. In no event will the authors be held liable for any damages
// arising from the use of this software.

// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter it and redistribute it
// freely, subject to the following restrictions:

// 1. The origin of this software must not be misrepresented; you must not
// claim that you wrote the original software. If you use this software
// in a product, an acknowledgment in the product documentation would be
// appreciated but is not required.

// 2. Altered source versions must be plainly marked as such, and must not be
// misrepresented as being the original software.

// 3. This notice may not be removed or altered from any source distribution.

// LeisureEditCore
// ===============
// Create a LeisureEditCore object like this: `new LeisureEditCore editorElement, options`.

// `editorElement` is the HTML element that you want to contain editable text.

// `options` is an object that tells LeisureEditCore things like how to
// convert text to a list of block objects (see below).  See
// BasicEditingOptions and DataStoreEditingOptions for more info.

//import {Set} from './immutable-4.0.0-rc.15.js'
var BS, DEL, DOWN, END, ENTER, HOME, LEFT, PAGEDOWN, PAGEUP, RIGHT, TAB, UP, _to_ascii, detail, dragRange, eventChar, htmlForNode, imbeddedBoundary, isAlphabetic, keyFuncs, maxLastKeys, modifiers, originalEvent, preservingSelection, replacements, selectRange, shiftKey, shiftUps, specialKeys, validatePositions;

({selectRange} = DOMCursor);

imbeddedBoundary = /.\b./;

maxLastKeys = 4;

BS = 8;

ENTER = 13;

DEL = 46;

TAB = 9;

LEFT = 37;

UP = 38;

RIGHT = 39;

DOWN = 40;

HOME = 36;

END = 35;

PAGEUP = 33;

PAGEDOWN = 34;

specialKeys = {};

specialKeys[TAB] = 'TAB';

specialKeys[ENTER] = 'ENTER';

specialKeys[BS] = 'BS';

specialKeys[DEL] = 'DEL';

specialKeys[LEFT] = 'LEFT';

specialKeys[RIGHT] = 'RIGHT';

specialKeys[UP] = 'UP';

specialKeys[DOWN] = 'DOWN';

specialKeys[PAGEUP] = 'PAGEUP';

specialKeys[PAGEDOWN] = 'PAGEDOWN';

specialKeys[HOME] = 'HOME';

specialKeys[END] = 'END';

// Key funcs
// ---------

// Basic functions used by [defaultBindings](#defaultBindings)
var useEvent = function(e) {
  e.preventDefault();
  return e.stopPropagation();
};

keyFuncs = {
  backwardChar: function(editor, e, r) {
    useEvent(e);
    editor.moveSelectionBackward(r);
    return false;
  },
  forwardChar: function(editor, e, r) {
    useEvent(e);
    editor.moveSelectionForward(r);
    return false;
  },
  previousLine: function(editor, e, r) {
    useEvent(e);
    editor.moveSelectionUp(r);
    return false;
  },
  nextLine: function(editor, e, r) {
    useEvent(e);
    editor.moveSelectionDown(r);
    return false;
  },
  stabilizeCursor: function(editor, e, r) {
    setTimeout((function() {
      return editor.domCursorForCaret().moveCaret();
    }), 1);
    return false;
  }
};

// <a name="defaultBindings"></a>Default key bindings
// --------------------------------------------------

// These are the default bindings.  You can set the editor's bindings
// property to this or your own object (which can inherit from this, of
// course.)
var defaultBindings = {
  //'C-S': keyFuncs.save
  'C-Z': function() {
    return alert('UNDO not supported yet');
  },
  'C-S-Z': function() {
    return alert('REDO not supported yet');
  },
  'C-Y': function() {
    return alert('REDO not supported yet');
  },
  'UP': keyFuncs.previousLine,
  'DOWN': keyFuncs.nextLine,
  'LEFT': keyFuncs.backwardChar,
  'RIGHT': keyFuncs.forwardChar,
  'HOME': keyFuncs.stabilizeCursor,
  'END': keyFuncs.stabilizeCursor,
  'C-HOME': keyFuncs.stabilizeCursor,
  'C-END': keyFuncs.stabilizeCursor
};

//'TAB': keyFuncs.expandTemplate
//'C-C C-C': keyFuncs.swapMarkup
//'M-C': keyFuncs.execute
//'C-F': keyFuncs.forwardChar
//'C-B': keyFuncs.backwardChar
//'C-P': keyFuncs.previousLine
//'C-N': keyFuncs.nextLine
//'C-X C-F': keyFuncs.save
dragRange = null;

// #    export class Observable
// #      constructor: ->
// #        @listeners = {}
// #        @suppressingTriggers = false
// #      on: (type, callback)->
// #        if typeof type == 'object'
// #          for type, callback of type
// #            @on type callback
// #        else
// #          if !@listeners[type] then @listeners[type] = []
// #          @listeners[type].push callback
// #        this
// #      off: (type, callback)->
// #        if typeof type == 'object'
// #          for callbackType, callback of type
// #            @off callbackType, callback
// #        else
// #          if @listeners[type]
// #            @listeners[type] = @listeners[type].filter (l)-> l != callback
// #        this
// #      trigger: (type, args...)->
// #        if !@suppressingTriggers
// #          for listener in @listeners[type] || []
// #            listener args...
// #      suppressTriggers: (func)->
// #        oldSuppress = @suppressingTriggers
// #        @suppressingTriggers = true
// #        try
// #          func()
// #        finally
// #          @suppressingTriggers = oldSuppress
// #
// #    readyPromise = new Promise (accept, reject)->
// #      if document.readyState == 'interactive' then accept null
// #      else
// #        document.onreadystatechange = ()->
// #          if document.readyState == 'interactive' then accept null
// #    
// #    ready = (func)-> readyPromise.then func
// #
// #FeatherJQ class
// #===============
// #A featherweight JQuery replacement.  Users can use set$ to make it use
// #the real jQuery, like this: `set$($, (obj)-> obj instanceof $)`
// #
// #    export class FeatherJQ extends Array
// #      constructor: (specs...)->
// #        results = []
// #        results.__proto__ = FeatherJQ.prototype
// #        for spec in specs
// #          results.pushResult spec
// #        return results
// #      find: (sel)->
// #        results = $()
// #        for node in this
// #          if node.querySelectorAll?
// #            for result in node.querySelectorAll(sel)
// #              results.push result
// #        results
// #      attr: (name, value)->
// #        if value?
// #          for node in this
// #            node.setAttribute name, value
// #          this
// #        else this[0]?getAttribute name
// #      prop: (name, value)->
// #        if value?
// #          for node in this
// #            node[name] = value
// #          this
// #        else this[0]?[name]
// #      closest: (sel)->
// #        result = $()
// #        for node in this
// #          if n = (if node.closest? then node else node.parentNode).closest sel
// #            result.push n
// #        result
// #      is: (sel)->
// #        for node in this
// #          if node.matches? sel then return true
// #        false
// #      parent: ->
// #        result = $()
// #        for node in this
// #          if p = node.parentNode then result.push p
// #        result
// #      data: (key, value)->
// #        if !key then getUserData this[0], true
// #        else if !value? then getUserData(this[0], true)?[key]
// #        else for node in this
// #          getUserData(node, true)[key] = value
// #          this
// #      on: (evtType, func)->
// #        for node in this
// #          evt = getEvents node
// #          if !evt[evtType]
// #            node.addEventListener evtType, runEvent
// #            evt[evtType] = []
// #          evt[evtType].push func
// #      off: (evtType, func)->
// #        for node in this when events = getEvents(node) && events[evtType]
// #          events = if func then (h for h in events[evtType] when h != func) else []
// #          if !events.length then delete events[evtType]
// #      pushResult: (spec)->
// #        if typeof spec == 'string'
// #          try
// #            @push document.querySelectorAll(spec)...
// #          catch err
// #            div = document.createElement 'div'
// #            div.innerHTML = html
// #            @push div.children...
// #        #else if spec instanceof FeatherJQ then @push spec...
// #        else if typeof spec == 'object' && spec.nodeName then @push spec
// #        else if typeof spec == 'object' && spec.prop then @push spec...
// #        else @push spec
// #      ready: (func)-> ready func
// #      html: (newHtml)->
// #        for node in this
// #          node.innerHTML = newHtml
// #
// #    $func = (args...)-> new FeatherJQ(args...)
// #
// #    export $ = $func
// #
// #    export is$ = (obj)-> obj instanceof FeatherJQ || (obj.prop && obj.attr)
// #
// #    export set$ = (new$, is$Func)->
// #      $ = $func = new$
// #      is$ = is$Func || is$
// #
// #    FJQData = new WeakMap
// #
// #    runEvent = (evt)->
// #      for handler in getEvents(evt.currentTarget) ? []
// #        handler evt
// #      null
// #
// #    getNodeData = (node, create)->
// #      if create || FJQData.has node
// #        if !FJQData.has node then FJQData.set node, {}
// #        FJQData.get node
// #
// #    getDataProperty = (node, prop, create)->
// #      if d = getNodeData node, create
// #        if !d[prop] then d[prop] = {}
// #        d[prop]
// #
// #    getUserData = (node, create)-> if node then getDataProperty node, 'userData', create
// #
// #    getEvents = (node, create)-> getDataProperty node, 'events', create
// #
// #    $.ready = FeatherJQ.ready = ready
// #
// #    $.ajax = FeatherJQ.ajax = ({url, success, data})->
// #      xhr = new XMLHttpRequest
// #      xhr.onreadystatechange = ->
// #          if xhr.readyState == XMLHttpRequest.DONE then success xhr.responseText
// #      xhr.open (if data then 'POST' else 'GET'), url, true
// #      xhr.send data
// #
// #    $.get = FeatherJQ.get = (url, success)-> FeatherJQ.ajax {url, success}
detail = function(e) {
  return originalEvent(e).detail;
};

originalEvent = function(e) {
  return e.originalEvent || e;
};

// LeisureEditCore class
// =====================
// Events:
//   `moved`: the cursor moved
var LeisureEditCore$1 = class LeisureEditCore extends Observable {
  constructor(node1, options) {
    super();
    this.node = node1;
    this.options = options;
    this.editing = false;
    this.node.attr('contenteditable', 'true').attr('spellcheck', 'false').data('editor', this);
    this.curKeyBinding = this.prevKeybinding = null;
    this.bind();
    this.lastKeys = [];
    this.modCancelled = false;
    this.clipboardKey = null;
    this.ignoreModCheck = 0;
    this.movementGoal = null;
    this.options.setEditor(this);
    this.currentSelectedBlock = null;
  }

  editWith(func) {
    this.editing = true;
    try {
      return func();
    } finally {
      this.editing = false;
    }
  }

  savePosition(func) {
    var pos;
    if (this.editing) {
      return func();
    } else {
      pos = this.getSelectedDocRange();
      try {
        return func();
      } catch (error) {
        return this.selectDocRange(pos);
      }
    }
  }

  getCopy(id) {
    return copyBlock$1(this.options.getBlock(id));
  }

  getText() {
    return this.options.getText();
  }

  blockForCaret() {
    return this.blockForNode(this.domCursorForCaret().node);
  }

  blockForNode(node) {
    return this.options.getBlock(this.options.idForNode(node));
  }

  blockNodeForNode(node) {
    return this.options.nodeForId(this.options.idForNode(node));
  }

  blockTextForNode(node) {
    var next, nextPos, parent, ref;
    parent = this.blockNodeForNode(node)[0];
    if (next = (ref = this.options.getBlock(this.options.idForNode(node))) != null ? ref.next : void 0) {
      nextPos = this.domCursorForText(this.options.nodeForId(next), 0);
      return this.domCursorForText(parent, 0, parent).getTextTo(nextPos);
    } else {
      return this.domCursorForText(parent, 0, parent).getText();
    }
  }

  verifyNode(node) {
    if (typeof node === 'string') {
      node = this.options.nodeForId(node);
    }
    return this.blockTextForNode(node) === this.options.getBlock(this.options.idForNode(node)).text;
  }

  verifyAllNodes() {
    var badIds, block, node;
    badIds = [];
    block = this.options.getBlock(this.options.getFirst());
    while (block) {
      if ((node = this.options.nodeForId(block._id)[0]) && !this.verifyNode(node)) {
        badIds.push(block._id);
      }
      block = this.options.getBlock(block.next);
    }
    if (badIds.length) {
      return badIds;
    }
  }

  domCursor(node, pos) {
    if (is$(node)) {
      node = node[0];
      pos = pos != null ? pos : 0;
    } else if (node instanceof DOMCursor) {
      pos = node.pos;
      node = node.node;
    }
    return this.options.domCursor(node, pos);
  }

  makeElementVisible(node) {
    var r, view;
    r = DOMCursor.getBoundingRect(node);
    view = this.node[0].getBoundingClientRect();
    if (r.top < view.top) {
      return this.node[0].scrollTop -= view.top - r.top;
    } else if (r.bottom > view.bottom) {
      return this.node[0].scrollTop += r.bottom - view.bottom;
    }
  }

  domCursorForText(node, pos, parent) {
    var c;
    c = this.domCursor($$1(node)[0], pos).filterTextNodes().firstText();
    if (parent != null) {
      return c.filterParent($$1(parent)[0]);
    } else {
      return c;
    }
  }

  domCursorForTextPosition(parent, pos, contain) {
    return this.domCursorForText(parent, 0, (contain ? parent : void 0)).mutable().forwardChars(pos, contain).adjustForNewline();
  }

  domCursorForCaret() {
    var n, r, sel;
    sel = getSelection();
    if (sel.type === 'None') {
      return DOMCursor.emptyDOMCursor;
    } else {
      r = sel.getRangeAt(0);
      n = this.domCursor(r.startContainer, r.startOffset).mutable().filterVisibleTextNodes().filterParent(this.node[0]).firstText();
      if (n.isEmpty() || n.pos <= n.node.length) {
        return n;
      } else {
        return n.next();
      }
    }
  }

  getTextPosition(parent, target, pos) {
    var targ;
    if (parent) {
      targ = this.domCursorForText(target, pos);
      if (!this.options.getContainer(targ.node)) {
        targ = targ.prev();
      }
      return this.domCursorForText(parent, 0, parent).mutable().countChars(targ.node, targ.pos);
    } else {
      return -1;
    }
  }

  loadURL(url) {
    return $$1.get(url, (text) => {
      return this.options.load(url, text);
    });
  }

  domCursorForDocOffset(dOff) {
    var bOff, node;
    bOff = this.options.blockOffsetForDocOffset(dOff);
    node = this.options.nodeForId(bOff.block);
    return this.domCursorForText(node, 0, this.node[0]).mutable().forwardChars(bOff.offset);
  }

  docOffsetForCaret() {
    var range, s;
    s = getSelection();
    if (s.type === 'None') {
      return -1;
    } else {
      range = s.getRangeAt(0);
      return this.docOffset(range.startContainer, range.startOffset);
    }
  }

  docOffsetForBlockOffset(block, offset) {
    return this.options.docOffsetForBlockOffset(block, offset);
  }

  docOffset(node, offset) {
    var startHolder;
    if (node instanceof Range) {
      offset = node.startOffset;
      node = node.startContainer;
    } else if (node instanceof DOMCursor) {
      offset = node.pos;
      node = node.node;
    }
    if (startHolder = this.options.getContainer(node)) {
      return this.options.docOffsetForBlockOffset(this.options.idForNode(startHolder), this.getTextPosition(startHolder, node, offset));
    }
  }

  getSelectedDocRange() {
    var end, length, range, s, start;
    s = getSelection();
    if (s.type === 'None') {
      return {
        type: 'None'
      };
    } else {
      range = s.getRangeAt(0);
      if (start = this.docOffset(range.startContainer, range.startOffset)) {
        if (s.type === 'Caret') {
          length = 0;
        } else {
          end = this.docOffset(range.endContainer, range.endOffset);
          length = Math.abs(start - end);
          start = Math.min(start, end);
        }
        return {
          type: s.type,
          start: start,
          length: length,
          scrollTop: this.node[0].scrollTop,
          scrollLeft: this.node[0].scrollLeft
        };
      } else {
        return {
          type: 'None'
        };
      }
    }
  }

  selectDocRange(range) {
    var start;
    if (range.type !== 'None' && !(start = this.domCursorForDocOffset(range.start).save()).isEmpty()) {
      selectRange(start.range(start.mutable().forwardChars(range.length)));
      this.node[0].scrollTop = range.scrollTop;
      return this.node[0].scrollLeft = range.scrollLeft;
    }
  }

  getSelectedBlockRange() {
    var p, s;
    s = getSelection();
    if (s.type !== 'None' && (p = this.blockOffset(s.getRangeAt(0)))) {
      p.type = s.type;
      p.length = this.selectedText(s).length;
      return p;
    } else {
      return {
        type: 'None'
      };
    }
  }

  blockOffset(node, offset) {
    var startHolder;
    if (node instanceof Range) {
      offset = node.startOffset;
      node = node.startContainer;
    } else if (node instanceof DOMCursor) {
      offset = node.pos;
      node = node.node;
    }
    if (startHolder = this.options.getContainer(node)) {
      return {
        block: this.options.getBlock(this.options.idForNode(startHolder)),
        offset: this.getTextPosition(startHolder, node, offset)
      };
    }
  }

  blockRangeForOffsets(start, length) {
    var block, offset;
    ({block, offset} = this.options.getBlockOffsetForPosition(start));
    return {
      block,
      offset,
      length,
      type: length === 0 ? 'Caret' : 'Range'
    };
  }

  replace(e, br, text, select) {
    if (br.type !== 'None') {
      return this.editWith(() => {
        var pos, start;
        start = this.options.docOffsetForBlockOffset(br);
        pos = this.getSelectedDocRange();
        text = text != null ? text : getEventChar(e);
        this.options.replaceText({
          start,
          end: start + br.length,
          text,
          source: 'edit'
        });
        if (select) {
          pos.type = text.length === 0 ? 'Caret' : 'Range';
          pos.length = text.length;
        } else {
          pos.type = 'Caret';
          pos.length = 0;
          pos.start += text.length;
        }
        return this.selectDocRange(pos);
      });
    }
  }

  backspace(event, sel, r) {
    var holderId;
    if (sel.type === 'Range') {
      return this.cutText(event);
    }
    holderId = this.idAtCaret(sel);
    this.currentBlockIds = [holderId];
    return this.handleDelete(event, sel, false);
  }

  del(event, sel, r) {
    var holderId;
    if (sel.type === 'Range') {
      return this.cutText(event);
    }
    holderId = this.idAtCaret(sel);
    this.currentBlockIds = [holderId];
    return this.handleDelete(event, sel, true);
  }

  idAtCaret(sel) {
    return this.options.idForNode(this.options.getContainer(sel.anchorNode));
  }

  selectedText(s) {
    var r;
    r = s.getRangeAt(0);
    if (r.collapsed) {
      return '';
    } else {
      return this.domCursor(r.startContainer, r.startOffset).getTextTo(this.domCursor(r.endContainer, r.endOffset));
    }
  }

  cutText(e) {
    var html, r, sel, text;
    useEvent(e);
    sel = getSelection();
    if (sel.type === 'Range') {
      html = _.map(sel.getRangeAt(0).cloneContents().childNodes, htmlForNode).join('');
      text = this.selectedText(sel);
      this.options.simulateCut({
        html: html,
        text: text
      });
      r = this.getSelectedDocRange();
      this.replace(e, this.getSelectedBlockRange(), '');
      return this.selectDocRange({
        type: 'Caret',
        start: r.start,
        length: 0,
        scrollTop: r.scrollTop,
        scrollLeft: r.scrollLeft
      });
    }
  }

  handleDelete(e, s, forward) {
    var r;
    useEvent(e);
    r = this.getSelectedDocRange();
    if (r.type === 'None' || (r.type === 'Caret' && ((forward && r.start >= this.options.getLength() - 1) || (!forward && r.start === 0)))) {
      return;
    }
    if (r.type === 'Caret') {
      r.length = 1;
      if (!forward) {
        r.start -= 1;
      }
    }
    this.options.replaceText({
      start: r.start,
      end: r.start + r.length,
      text: '',
      source: 'edit'
    });
    return this.selectDocRange({
      type: 'Caret',
      start: r.start,
      length: 0,
      scrollTop: r.scrollTop,
      scrollLeft: r.scrollLeft
    });
  }

  bind() {
    this.bindDragAndDrop();
    this.bindClipboard();
    this.bindMouse();
    return this.bindKeyboard();
  }

  bindDragAndDrop() {
    this.node.on('dragover', (e) => {
      this.options.dragOver(originalEvent(e));
      return true;
    });
    this.node.on('dragenter', (e) => {
      this.options.dragEnter(originalEvent(e));
      return true;
    });
    this.node.on('drop', (e) => {
      var blockId, cutOffset, dr, dropContainer, dropPos, insert, insertOffset, insertText, oe, offset, r, start;
      useEvent(e);
      oe = originalEvent(e);
      oe.dataTransfer.dropEffect = 'move';
      r = DOMCursor.caretPos(oe.clientX, oe.clientY);
      dropPos = this.domCursor(r.node, r.offset).moveCaret();
      dropContainer = this.domCursor(this.options.getContainer(r.node), 0);
      blockId = this.options.idForNode(dropContainer.node);
      offset = dropContainer.countChars(dropPos);
      insertText = oe.dataTransfer.getData('text/plain');
      insert = () => {
        return this.replace(e, {
          type: 'Caret',
          offset,
          block: this.options.getBlock(blockId),
          length: 0
        }, insertText, false);
      };
      if (dragRange) {
        start = this.domCursor(this.options.nodeForId(dragRange.block._id), 0).forwardChars(dragRange.offset);
        start.range(start.forwardChars(dragRange.length));
        insertOffset = this.options.getPositionForBlock(this.options.getBlock(blockId)) + offset;
        cutOffset = this.options.getPositionForBlock(dragRange.block) + dragRange.offset;
        if ((cutOffset <= insertOffset && insertOffset <= cutOffset + dragRange.length)) {
          useEvent(oe);
          oe.dataTransfer.dropEffect = 'none';
          return;
        }
        dr = dragRange;
        dragRange = null;
        if (insertOffset <= cutOffset) {
          this.replace(e, dr, '', false);
          this.replace(e, this.blockRangeForOffsets(insertOffset, 0), insertText, false);
        } else {
          insert();
          this.replace(e, this.blockRangeForOffsets(cutOffset, dr.length), '', false);
        }
      } else {
        insert();
      }
      return true;
    });
    this.node.on('dragstart', (e) => {
      var clipboard, sel;
      sel = getSelection();
      if (sel.type === 'Range') {
        dragRange = this.getSelectedBlockRange();
        clipboard = originalEvent(e).dataTransfer;
        clipboard.setData('text/html', _.map(sel.getRangeAt(0).cloneContents().childNodes, htmlForNode).join(''));
        clipboard.setData('text/plain', this.selectedText(sel));
        clipboard.effectAllowed = 'copyMove';
        clipboard.dropEffect = 'move';
      }
      return true;
    });
    return this.node[0].addEventListener('dragend', (e) => {
      var dr, sel;
      if (dr = dragRange) {
        dragRange = null;
        if (e.dataTransfer.dropEffect === 'move') {
          useEvent(e);
          sel = this.getSelectedDocRange();
          this.replace(e, dr, '');
          return this.selectDocRange(sel);
        }
      }
    });
  }

  bindClipboard() {
    this.node.on('cut', (e) => {
      var clipboard, sel;
      useEvent(e);
      sel = getSelection();
      if (sel.type === 'Range') {
        clipboard = originalEvent(e).clipboardData;
        clipboard.setData('text/html', _.map(sel.getRangeAt(0).cloneContents().childNodes, htmlForNode).join(''));
        clipboard.setData('text/plain', this.selectedText(sel));
        return this.replace(e, this.getSelectedBlockRange(), '');
      }
    });
    this.node.on('copy', (e) => {
      var clipboard, sel;
      useEvent(e);
      sel = getSelection();
      if (sel.type === 'Range') {
        clipboard = originalEvent(e).clipboardData;
        clipboard.setData('text/html', _.map(sel.getRangeAt(0).cloneContents().childNodes, htmlForNode).join(''));
        return clipboard.setData('text/plain', this.selectedText(sel));
      }
    });
    return this.node.on('paste', (e) => {
      useEvent(e);
      return this.replace(e, this.getSelectedBlockRange(), originalEvent(e).clipboardData.getData('text/plain'), false);
    });
  }

  bindMouse() {
    this.node.on('mousedown', (e) => {
      var end, s, start, txt;
      if (this.lastDragRange && detail(e) === 2) {
        this.dragRange = this.lastDragRange;
        console.log("double click");
        start = this.domCursor(this.dragRange).mutable();
        end = start.copy();
        txt = start.char();
        while (true) {
          start.backwardChar();
          if (!start.isEmpty() && start.type === 'text') {
            txt = start.char() + txt;
          }
          if (start.isEmpty() || start.type !== 'text' || txt.match(imbeddedBoundary)) {
            //start.forwardChar()
            break;
          }
        }
        txt = end.char();
        while (true) {
          end.forwardChar();
          if (!end.isEmpty() && end.type === 'text') {
            txt += end.char();
          }
          if (end.isEmpty() || end.type !== 'text' || txt.match(imbeddedBoundary)) {
            end.backwardChar();
            break;
          }
        }
        s = getSelection();
        s.removeAllRanges();
        this.dragRange.setStart(start.node, start.pos);
        this.dragRange.setEnd(end.node, end.pos);
        s.addRange(this.dragRange);
        e.preventDefault();
      } else if (this.dragRange = this.getAdjustedCaretRange(e)) {
        this.domCursor(this.dragRange).moveCaret();
        e.preventDefault();
      }
      setTimeout((() => {
        return this.trigger('moved', this);
      }), 1);
      return this.setCurKeyBinding(null);
    });
    this.node.on('mouseup', (e) => {
      this.lastDragRange = this.dragRange;
      this.dragRange = null;
      this.adjustSelection(e);
      return this.trigger('moved', this);
    });
    return this.node.on('mousemove', (e) => {
      var r2, s;
      if (this.dragRange) {
        s = getSelection();
        s.removeAllRanges();
        s.addRange(this.dragRange);
        r2 = this.getAdjustedCaretRange(e, true);
        s.extend(r2.startContainer, r2.startOffset);
        return e.preventDefault();
      }
    });
  }

  getAdjustedCaretRange(e, returnUnchanged) {
    var node, offset, r2, rect1, rect2;
    ({node, offset} = DOMCursor.caretPos(e.clientX, e.clientY));
    r2 = this.domCursor(node, offset).backwardChar().range();
    rect1 = DOMCursor.getBoundingRect(node);
    rect2 = r2.getBoundingClientRect();
    if (rect1.top === rect2.top && rect1.bottom === rect2.bottom && rect2.left < rect1.left && e.clientX <= (rect1.left + rect2.left) / 2) {
      return r2;
    } else if (returnUnchanged) {
      return r;
    }
  }

  bindKeyboard() {
    this.node.on('keyup', (e) => {
      return this.handleKeyup(e);
    });
    this.node.on('keydown', (e) => {
      var bound, c, checkMod, r, s;
      this.modCancelled = false;
      c = eventChar(e);
      if (!this.addKeyPress(e, c)) {
        return;
      }
      s = getSelection();
      r = s.rangeCount > 0 && s.getRangeAt(0);
      this.currentBlockIds = this.blockIdsForSelection(s, r);
      [bound, checkMod] = this.findKeyBinding(e, r);
      if (bound) {
        return this.modCancelled = !checkMod;
      } else {
        this.modCancelled = false;
        if (c === ENTER) {
          return this.enter(e);
        } else if (c === BS) {
          useEvent(e);
          return this.backspace(e, s, r);
        } else if (c === DEL) {
          useEvent(e);
          return this.del(e, s, r);
        } else if ((modifyingKey(c, e)) && !isAlphabetic(e)) {
          this.char = getEventChar(e);
          return this.keyPress(e);
        }
      }
    });
    return this.node.on('keypress', (e) => {
      if (!e.altKey && !e.metaKey && !e.ctrlKey) {
        return this.keyPress(e);
      }
    });
  }

  enter(e) {
    useEvent(e);
    return this.replace(e, this.getSelectedBlockRange(), '\n', false);
  }

  keyPress(e) {
    useEvent(e);
    return this.replace(e, this.getSelectedBlockRange(), null, false);
  }

  blockIdsForSelection(sel, r) {
    var blocks, cont, cur, end;
    if (!sel) {
      sel = getSelection();
    }
    if (sel.rangeCount === 1) {
      if (!r) {
        r = sel.getRangeAt(0);
      }
      blocks = (cont = this.options.getContainer(r.startContainer)) ? [this.options.idForNode(cont)] : [];
      if (!(r != null ? r.collapsed : void 0)) {
        cur = blocks[0];
        end = this.options.idForNode(this.options.getContainer(r.endContainer));
        while (cur && cur !== end) {
          if (cur = (this.getCopy(cur)).next) {
            blocks.push(cur);
          }
        }
      }
      return blocks;
    }
  }

  setCurKeyBinding(f) {
    this.prevKeybinding = this.curKeyBinding;
    return this.curKeyBinding = f;
  }

  addKeyPress(e, c) {
    var i, j, notShift, ref;
    if (notShift = !shiftKey(c)) {
      e.DE_editorShiftkey = true;
      this.lastKeys.push(modifiers(e, c));
      while (this.lastKeys.length > maxLastKeys) {
        this.lastKeys.shift();
      }
      this.keyCombos = new Array(maxLastKeys);
      for (i = j = 0, ref = Math.min(this.lastKeys.length, maxLastKeys); (0 <= ref ? j < ref : j > ref); i = 0 <= ref ? ++j : --j) {
        this.keyCombos[i] = this.lastKeys.slice(this.lastKeys.length - i - 1, this.lastKeys.length).join(' ');
      }
      this.keyCombos.reverse();
    }
    return notShift;
  }

  findKeyBinding(e, r) {
    var f, j, k, len, ref;
    ref = this.keyCombos;
    for (j = 0, len = ref.length; j < len; j++) {
      k = ref[j];
      if (f = this.options.bindings[k]) {
        this.lastKeys = [];
        this.keyCombos = [];
        this.setCurKeyBinding(f);
        return [true, f(this, e, r)];
      }
    }
    this.setCurKeyBinding(null);
    return [false];
  }

  handleKeyup(e) {
    if (this.ignoreModCheck = this.ignoreModCheck) {
      this.ignoreModCheck--;
    }
    if (this.clipboardKey || (!e.DE_shiftkey && !this.modCancelled && modifyingKey(eventChar(e), e))) {
      this.options.keyUp();
      return this.clipboardKey = null;
    }
  }

  adjustSelection(e) {
    var pos, r, s;
    if (detail(e) === 1) {
      return;
    }
    s = getSelection();
    if (s.type === 'Range') {
      r = s.getRangeAt(0);
      pos = this.domCursor(r.endContainer, r.endOffset).mutable().filterVisibleTextNodes().firstText();
      while (!pos.isEmpty() && pos.node !== r.startContainer && pos.node.data.trim() === '') {
        pos = pos.prev();
      }
      while (!pos.isEmpty() && pos.pos > 0 && pos.node.data[pos.pos - 1] === ' ') {
        pos.pos--;
      }
      if ((pos.node !== r.startContainer || pos.pos > r.startOffset) && (pos.node !== r.endContainer || pos.pos < r.endOffset)) {
        r.setEnd(pos.node, pos.pos);
        return selectRange(r);
      }
    }
  }

  moveSelectionForward() {
    return this.showCaret(this.moveForward());
  }

  moveSelectionDown() {
    return this.showCaret(this.moveDown());
  }

  moveSelectionBackward() {
    return this.showCaret(this.moveBackward());
  }

  moveSelectionUp() {
    return this.showCaret(this.moveUp());
  }

  showCaret(pos) {
    if (pos.isEmpty()) {
      pos = pos.prev();
    }
    pos = this.domCursorForCaret();
    pos.moveCaret();
    //(if pos.node.nodeType == pos.node.TEXT_NODE then pos.node.parentNode else pos.node).scrollIntoView()
    this.makeElementVisible(pos.node);
    return this.trigger('moved', this);
  }

  moveForward() {
    var offset, pos, r, sel, start;
    sel = getSelection();
    offset = sel.type === 'None' ? 0 : (r = sel.getRangeAt(0), offset = r.endContainer === r.startContainer ? this.docOffset(r.endContainer, Math.max(r.startOffset, r.endOffset)) : this.docOffset(r.endContainer, r.endOffset));
    start = pos = this.domCursorForCaret().firstText().save();
    if (!pos.isEmpty() && this.options.isValidDocOffset(offset) && (this.domCursorForCaret().firstText().equals(start) || pos.isCollapsed())) {
      pos = this.domCursorForDocOffset(offset);
      while (!pos.isEmpty() && (this.domCursorForCaret().firstText().equals(start) || pos.isCollapsed())) {
        if (pos.isCollapsed()) {
          pos.next().moveCaret();
        } else {
          pos.forwardChars(1).moveCaret();
        }
      }
    }
    if (pos.isEmpty()) {
      offset = this.options.getLength() - 1;
      pos = this.domCursorForDocOffset(offset).firstText();
      while (!pos.isEmpty() && pos.isCollapsed()) {
        pos = this.domCursorForDocOffset(--offset);
      }
    } else if (!this.options.isValidDocOffset(offset)) {
      pos = start;
    }
    return pos.moveCaret();
  }

  moveBackward() {
    var offset, pos, r, sel, start;
    sel = getSelection();
    offset = sel.type === 'None' ? 0 : (r = sel.getRangeAt(0), offset = r.endContainer === r.startContainer ? this.docOffset(r.endContainer, Math.min(r.startOffset, r.endOffset)) : this.docOffset(r.startContainer, r.startOffset));
    start = pos = this.domCursorForCaret().firstText().save();
    if (!pos.isEmpty() && (this.domCursorForCaret().firstText().equals(start) || pos.isCollapsed())) {
      pos = this.domCursorForDocOffset(offset);
      while (!pos.isEmpty() && (this.domCursorForCaret().firstText().equals(start) || pos.isCollapsed())) {
        if (pos.isCollapsed()) {
          pos.prev();
        } else {
          pos.backwardChar().moveCaret();
        }
      }
    }
    if (pos.isEmpty()) {
      offset = 0;
      pos = this.domCursorForDocOffset(offset).firstText();
      while (!pos.isEmpty() && pos.isCollapsed()) {
        pos = this.domCursorForDocOffset(++offset);
      }
    }
    return pos.moveCaret();
  }

  firstText() {
    return this.domCursor(this.node, 0).firstText().node;
  }

  moveDown() {
    var docPos, lastPos, line, linePos, lineTop, p, pos, prev, ref;
    linePos = prev = pos = this.domCursorForCaret().save();
    if (!((ref = this.prevKeybinding) === keyFuncs.nextLine || ref === keyFuncs.previousLine)) {
      this.movementGoal = this.options.blockColumn(pos);
      line = 0;
    } else {
      line = (pos.pos === 0 && pos.node === this.firstText() && this.options.blockColumn(pos) < this.movementGoal ? 1 : 0);
    }
    lineTop = posFor$1(linePos).top;
    lastPos = this.docOffset(pos) - 1;
    while (!(pos = this.moveForward()).isEmpty() && (docPos = this.docOffset(pos)) !== lastPos) {
      lastPos = docPos;
      p = posFor$1(pos);
      if (lineTop < p.top) {
        line++;
        pos = linePos = p.pos;
        lineTop = p.top;
      }
      if (line === 2) {
        return prev.moveCaret();
      }
      if (line === 1 && this.options.blockColumn(pos) >= this.movementGoal) {
        return this.moveToBestPosition(pos, prev, linePos);
      }
      prev = pos;
    }
    return pos;
  }

  moveUp() {
    var docPos, lastPos, line, linePos, pos, prev, ref;
    linePos = prev = pos = this.domCursorForCaret().save();
    if (!((ref = this.prevKeybinding) === keyFuncs.nextLine || ref === keyFuncs.previousLine)) {
      this.movementGoal = this.options.blockColumn(pos);
    }
    line = 0;
    lastPos = this.options.getLength();
    while (!(pos = this.moveBackward()).isEmpty() && (docPos = this.docOffset(pos)) !== lastPos) {
      lastPos = docPos;
      if (linePos.differentLines(pos)) {
        line++;
        linePos = pos;
      }
      if (line === 2) {
        return prev.moveCaret();
      }
      if (line === 1 && this.options.blockColumn(pos) <= this.movementGoal) {
        return this.moveToBestPosition(pos, prev, linePos);
      }
      prev = pos;
    }
    return pos;
  }

  // `moveToBestPosition(pos, prev, linePos)` tries to move the caret to the best position in the HTML text.  If pos is closer to the goal, return it, otherwise move to prev and return prev.
  moveToBestPosition(pos, prev, linePos) {
    if (linePos === pos || Math.abs(this.options.blockColumn(pos) - this.movementGoal) < Math.abs(this.options.blockColumn(prev) - this.movementGoal)) {
      return pos;
    } else {
      return prev.moveCaret();
    }
  }

  // Set html of an element and evaluate scripts so that document.currentScript is properly set
  setHtml(el, html, outer) {
    var next, par, prev, ref, ref1;
    if (outer) {
      prev = el.previousSibling;
      next = el.nextSibling;
      par = el.parentNode;
      el.outerHTML = html;
      el = (ref = (ref1 = prev != null ? prev.nextSibling : void 0) != null ? ref1 : next != null ? next.previousSibling : void 0) != null ? ref : par != null ? par.firstChild : void 0;
    } else {
      el.innerHTML = html;
    }
    this.activateScripts($$1(el));
    return el;
  }

  activateScripts(jq) {
    var activating, j, len, newScript, ref, results, script, text;
    if (!activating) {
      activating = true;
      try {
        ref = jq.find('script');
        results = [];
        for (j = 0, len = ref.length; j < len; j++) {
          script = ref[j];
          text = !script.type || script.type.toLowerCase() === 'text/javascript' ? script.textContent : script.type.toLowerCase() === 'text/coffeescript' ? CoffeeScript.compile(script.textContent, {
            bare: true
          }) : script.type.toLowerCase() === 'text/literate-coffeescript' ? CoffeeScript.compile(script.textContent, {
            bare: true,
            literate: true
          }) : void 0;
          if (text) {
            newScript = document.createElement('script');
            newScript.type = 'text/javascript';
            if (script.src) {
              newScript.src = script.src;
            }
            newScript.textContent = text;
            this.setCurrentScript(newScript);
            script.parentNode.insertBefore(newScript, script);
            results.push(script.parentNode.removeChild(script));
          } else {
            results.push(void 0);
          }
        }
        return results;
      } finally {
        this.setCurrentScript(null);
        activating = false;
      }
    }
  }

  setCurrentScript(script) {
    return LeisureEditCore.currentScript = null;
  }

};

eventChar = function(e) {
  return e.charCode || e.keyCode || e.which;
};

isAlphabetic = function(e) {
  var ref;
  return !e.altKey && !e.ctrlKey && !e.metaKey && ((64 < (ref = eventChar(e)) && ref < 91));
};

// #BasicEditingOptions class
// #=========================
// #BasicEditingOptions is an the options base class.
// #
// #Events:
// #  `load`: new text was loaded into the editor
// #
// #Hook methods (required)
// #-----------------------
// #
// #`renderBlock(block) -> [html, next]`: render a block (and potentially its children) and return the HTML and the next blockId if there is one
// #
// #  * Block DOM (DOM for a block) must be a single element with the same id as the block.
// #  * Block DOM may contain nested block DOM.
// #  * each block's DOM should have the same id as the block and have a data-block attribute
// #  * non-editable parts of the DOM should have contenteditable=false
// #  * completely skipped parts should be non-editable and have a data-noncontent attribute
// #
// #Properties of BasicEditingOptions
// #---------------------------------
// #* `blocks {id -> block}`: block table
// #* `first`: id of first block
// #* `bindings {keys -> binding(editor, event, selectionRange)}`: a map of bindings (can use LeisureEditCore.defaultBindings)
// #
// #Methods of BasicEditingOptions
// #------------------------------
// #* `getBlock(id) -> block?`: get the current block for id
// #* `getContainer(node) -> Node?`: get block DOM node containing for a node
// #* `getFirst() -> blockId`: get the first block id
// #* `domCursor(node, pos) -> DOMCursor`: return a domCursor that skips over non-content
// #* `keyUp(editor) -> void`: handle keyup after-actions
// #* `topRect() -> rect?`: returns null or the rectangle of a toolbar at the page top
// #* `blockColumn(pos) -> colNum`: returns the start column on the page for the current block
// #* `load(el, text) -> void`: parse text into blocks and replace el's contents with rendered DOM
// #
// #    class BasicEditingOptionsOld extends Observable
// #
// #      renderBlock: (block)-> throw new Error "options.renderBlock(block) is not implemented"
// #
// #Hook methods (optional)
// #-----------------------
// #
// #`simulateCut({html, text})`: The editor calls this when the user hits backspace or delete on selected text.
// #
// #      simulateCut: ({html, text})->
// #
// #`dragEnter(event)`: alter the drag-enter behavior.  If you want to cancel the drag, for
// #instance, call event.preventDefault() and set the dropEffect to 'none'
// #
// #      dragEnter: (event)->
// #        if !event.dataTransfer.getData
// #          useEvent event
// #          event.dropEffect = 'none'
// #
// #`dragOver(event)`: alter the drag-enter behavior.  If you want to cancel the drag, for
// #instance, call event.preventDefault() and set the dropEffect to 'none'
// #
// #      dragOver: (event)->
// #        if !event.dataTransfer.getData
// #          useEvent event
// #          event.dropEffect = 'none'
// #
// #Main code
// #---------
// #
// #      constructor: ->
// #        super()
// #        @changeContext = null
// #        @initData()
// #
// #      setDiagEnabled: (flag)->
// #        #changeAdvice this, flag,
// #        #  renderBlocks: diag: wrapDiag
// #        #  changed: diag: wrapDiag
// #        #if flag then @diag()
// #
// #      diag: -> @trigger 'diag', @editor.verifyAllNodes()
// #
// #      initData: ->
// #
// #`blocks {id -> block}`: block table
// #
// #        @blocks = {}
// #
// #`first`: id of first block
// #
// #        @first = null
// #
// #`getFirst() -> blockId`: get the first block id
// #
// #      getFirst: -> @first
// #      nodeForId: (id)-> $("##{id}")
// #      idForNode: (node)-> $(node).prop 'id'
// #      setEditor: (@editor)->
// #      newId: -> @data.newId()
// #
// #`changeStructure(oldBlocks, newText)`: Compute blocks affected by transforming oldBlocks into newText
// #
// #      changeStructure: (oldBlocks, newText)->
// #        computeNewStructure this, oldBlocks, newText
// #      mergeChangeContext: (obj)-> @changeContext = _.merge {}, @changeContext ? {}, obj
// #      clearChangeContext: -> @changeContext = null
// #
// #`getBlock(id) -> block?`: get the current block for id
// #
// #      getBlock: (id)-> @blocks[id]
// #
// #`bindings {keys -> binding(editor, event, selectionRange)}`: a map of bindings (can use LeisureEditCore.defaultBindings)
// #
// #      bindings: defaultBindings
// #
// #`blockColumn(pos) -> colNum`: returns the start column on the page for the current block
// #
// #      blockColumn: (pos)-> pos.textPosition().left
// #
// #`topRect() -> rect?`: returns null or the rectangle of a toolbar at the page top
// #
// #      topRect: -> null
// #
// #`keyUp(editor) -> void`: handle keyup after-actions
// #
// #      keyUp: ->
// #
// #`domCursor(node, pos) -> DOMCursor`: return a domCursor that skips over non-content
// #
// #      domCursor: (node, pos)->
// #        new DOMCursor(node, pos).addFilter (n)-> (n.hasAttribute('data-noncontent') && 'skip') || true
// #
// #`getContainer(node) -> Node?`: get block DOM node containing for a node
// #
// #      getContainer: (node)->
// #        if @editor.node[0].compareDocumentPosition(node) & Element.DOCUMENT_POSITION_CONTAINED_BY
// #          $(node).closest('[data-block]')[0]
// #
// #`load(name, text) -> void`: parse text into blocks and trigger a 'load' event
// #
// #      load: (name, text)->
// #        @options.suppressTriggers =>
// #          @options.data.suppressTriggers =>
// #            @replaceText {start: 0, end: @getLength(), text, source: 'edit'}
// #        @rerenderAll()
// #        @trigger 'load'
// #      rerenderAll: ->
// #        @editor.setHtml @editor.node[0], @renderBlocks()
// #        if result = @validatePositions()
// #          console.error "DISCREPENCY AT POSITION #{result.block._id}, #{result.offset},",
// #      blockCount: ->
// #        c = 0
// #        for b of @blocks
// #          c++
// #        c
// #      blockList: ->
// #        next = @getFirst()
// #        while next
// #          bl = @getBlock next
// #          next = bl.next
// #          bl
// #      docOffsetForBlockOffset: (bOff, offset)-> @data.docOffsetForBlockOffset bOff, offset
// #      blockOffsetForDocOffset: (dOff)-> @data.blockOffsetForDocOffset dOff
// #      getPositionForBlock: (block)->
// #        cur = @getBlock @getFirst()
// #        offset = 0
// #        while cur._id != block._id
// #          offset += cur.text.length
// #          cur = @getBlock cur.next
// #        offset
// #      getBlockOffsetForPosition: (pos)->
// #        cur = @getBlock @getFirst()
// #        while pos >= cur.text.length
// #          pos -= cur.text.length
// #          cur = @getBlock cur.next
// #        block: cur
// #        offset: pos
// #      renderBlocks: ->
// #        result = ''
// #        next = @getFirst()
// #        while next && [html, next] = @renderBlock @getBlock next
// #          result += html
// #        result
// #      getText: ->
// #        text = ''
// #        block = @data.getBlock @data.getFirst()
// #        while block
// #          text += block.text
// #          block = @data.getBlock block.next
// #        text
// #      getLength: ->
// #        len = 0
// #        block = @data.getBlock @data.getFirst()
// #        while block
// #          len += block.text.length
// #          block = @data.getBlock block.next
// #        len
// #      isValidDocOffset: (offset)-> 0 <= offset <= @getLength()
// #      validatePositions: ->
// #        block = @data.getBlock @data.getFirst()
// #        while block
// #          if node = @nodeForId(block._id)[0]
// #            cursor = @domCursor(node, 0).mutable()
// #            for offset in [0...block.text.length]
// #              cursor = cursor.firstText()
// #              if cursor.isEmpty() || !sameCharacter cursor.character(), block.text[offset]
// #                return {block, offset}
// #              cursor.forwardChar()
// #          block = @data.getBlock block.next

//export BasicEditingOptions = BasicEditingOptionsOld
var BasicEditingOptions = BasicEditingOptionsNew;

// #DataStore
// #=========
// #An efficient block storage mechanism used by DataStoreEditingOptions
// #
// #Hook methods -- you must define these in your subclass
// #------------------------------------------------------
// #* `parseBlocks(text) -> blocks`: parse text into array of blocks -- DO NOT provide _id, prev, or next, they may be overwritten!
// #
// #Events
// #------
// #Data objects support the Observable protocol and emit change events in response to data changes
// #
// #`change {adds, updates, removes, oldFirst, old}`
// #
// #  * `oldFirst id`: the previous first (might be the same as the current)
// #  * `adds {id->true}`: added items
// #  * `updates {id->true}`: updated items
// #  * `removes {id->true}`: removed items
// #  * `old {id->old block}`: the old items from updates and removes
// #
// #Internal API -- provide/override these if you want to change how the store accesses data
// #----------------------------------------------------------------------------------------
// #
// #* `getFirst()`
// #* `setFirst(firstId)`
// #* `getBlock(id)`
// #* `setBlock(id, block)`
// #* `deleteBlock(id)`
// #* `eachBlock(func(block [, id]))` -- iterate with func (exit if func returns false)
// #* `load(first, blocks)` -- should trigger 'load'
// #
// #External API -- used from outside; alternative data objects must support these methods.
// #---------------------------------------------------------------------------------------
// #
// #In addition to the methods below, data objects must support the Observable protocol and emit
// #change events in response to data changes
// #
// #* `getFirst() -> id`: id of the first block
// #* `getBlock(id) -> block`: the block for id
// #* `load(name, text)`: replace the current document
// #* `newId()`:
// #* `docOffsetForBlockOffset(args...) -> offset`: args can be a blockOffset or block, offset
// #* `blockOffsetForDocOffset(offset) -> blockOffset`: the block offset for a position in the document
// #* `suppressTriggers(func) -> func's return value`: suppress triggers while executing func (inherited from Observable)
// #
// #<!-- -->
// #
// #    export class DataStore extends Observable
// #      constructor: ->
// #        super()
// #        @blocks = {}
// #        @blockIndex = @newBlockIndex()
// #        @changeCount = 0
// #        @clearMarks()
// #        @markNames = {}
// #      load: (name, text)->
// #        blockMap = {}
// #        newBlocks = @parseBlocks text
// #        for block, i in newBlocks
// #          block._id = @newId()
// #          blockMap[block._id] = block
// #          if prev = newBlocks[i - 1]
// #            prev.next = block._id
// #            block.prev = prev._id
// #        @first = newBlocks[0]?._id
// #        @blocks = blockMap
// #        @makeChanges =>
// #          @indexBlocks()
// #          @trigger 'load'
// #
// #`parseBlocks(text) -> blocks`: parse text into array of blocks -- DO NOT provide _id, prev, or next, they may be overwritten!
// #
// #      parseBlocks: (text)-> throw new Error "options.parseBlocks(text) is not implemented"
// #
// #      newBlockIndex: (contents)-> FingerTree.fromArray contents ? [],
// #        identity: -> ids: Set(), length: 0
// #        measure: (v)-> ids: Set([v.id]), length: v.length
// #        sum: (a, b)-> ids: a.ids.union(b.ids), length: a.length + b.length
// #      newId: -> "block#{idCounter++}"
// #      setDiagEnabled: (flag)->
// #        #changeAdvice this, flag,
// #        #  makeChanges: diag: afterMethod ->
// #        #    if @changeCount == 0 then @diag()
// #        #if flag then @diag()
// #
// #`getLength() -> number`: the length of the entire document
// #
// #      getLength: -> @blockIndex.measure().length
// #      makeChanges: (func)->
// #        @changeCount++
// #        try
// #          func()
// #        finally
// #          @changeCount--
// #      clearMarks: -> @marks = FingerTree.fromArray [],
// #        identity: -> names: Set(), length: 0
// #        measure: (n)-> names: Set([n.name]), length: n.offset
// #        sum: (a, b)-> names: a.names.union(b.names), length: a.length + b.length
// #      addMark: (name, offset)->
// #        if @markNames[name] then @removeMark name
// #        @markNames[name] = true
// #        [first, rest] = @marks.split (m)-> m.length >= offset
// #        l = first.measure().length
// #        if !rest.isEmpty()
// #          n = rest.peekFirst()
// #          rest = rest.removeFirst().addFirst
// #            offset: l + n.offset - offset
// #            name: n.name
// #        @marks = first.concat rest.addFirst
// #          offset: offset - l
// #          name: name
// #      removeMark: (name)-> if @markNames[name]
// #        delete @markNames[name]
// #        [first, rest] = @marks.split (m)-> m.names.contains name
// #        if !rest.isEmpty()
// #          removed = rest.peekFirst()
// #          rest = rest.removeFirst()
// #          if !rest.isEmpty()
// #            n = rest.peekFirst()
// #            rest = rest.removeFirst()
// #              .addFirst offset: removed.offset + n.offset, name: n.name
// #        @marks = first.concat rest
// #      listMarks: ->
// #        m = []
// #        t = @marks
// #        while !t.isEmpty()
// #          n = t.peekFirst()
// #          m.push _.defaults {location: @getMarkLocation n.name}, n
// #          t = t.removeFirst()
// #        m
// #      getMarkLocation: (name)-> if @markNames[name]
// #        [first, rest] = @marks.split (m)-> m.names.contains name
// #        if !rest.isEmpty() then first.measure().length + rest.peekFirst().offset
// #      blockOffsetForMark: (name)-> if offset = @getMarkLocation name
// #        @blockOffsetForDocOffset offset
// #      floatMarks: (start, end, newLength)-> if newLength != oldLength = end - start
// #        [first, rest] = @marks.split (m)-> m.length > start
// #        if !rest.isEmpty()
// #          n = rest.peekFirst()
// #          @marks = first.concat rest.removeFirst().addFirst
// #            name: n.name
// #            offset: n.offset + newLength - oldLength
// #      replaceText: ({start, end, text})->
// #        {prev, oldBlocks, newBlocks} = @changesForReplacement start, end, text
// #        if oldBlocks
// #          @change @changesFor prev, oldBlocks.slice(), newBlocks.slice()
// #          @floatMarks start, end, text.length
// #      changesForReplacement: (start, end, text)->
// #        {blocks, newText} = @blockOverlapsForReplacement start, end, text
// #        {oldBlocks, newBlocks, offset, prev} = change = computeNewStructure this, blocks, newText
// #        if oldBlocks.length || newBlocks.length then change else {}
// #      computeRemovesAndNewBlockIds: (oldBlocks, newBlocks, newBlockMap, removes)->
// #        for oldBlock in oldBlocks[newBlocks.length...oldBlocks.length]
// #          removes[oldBlock._id] = oldBlock
// #        prev = null
// #        for newBlock, i in newBlocks
// #          if oldBlock = oldBlocks[i]
// #            newBlock._id = oldBlock._id
// #            newBlock.prev = oldBlock.prev
// #            newBlock.next = oldBlock.next
// #          else
// #            newBlock._id = @newId()
// #            if prev then link prev, newBlock
// #          prev = newBlockMap[newBlock._id] = newBlock
// #        prev
// #      patchNewBlocks: (first, oldBlocks, newBlocks, changes, newBlockMap, removes, prev)->
// #        if !oldBlocks.length && first = @getBlock first
// #          oldNext = @getBlock first.next
// #          oldBlocks.unshift first
// #          first = newBlockMap[first._id] = copyBlock first
// #          link first, newBlocks[0]
// #          newBlocks.unshift first
// #          if oldNext
// #            oldBlocks.push oldNext
// #            oldNext = newBlockMap[oldNext._id] = copyBlock oldNext
// #            link last(newBlocks), oldNext
// #            newBlocks.push oldNext
// #        else if oldBlocks.length != newBlocks.length
// #          if !prev && prev = copyBlock oldPrev = @getBlock oldBlocks[0].prev
// #            oldBlocks.unshift oldPrev
// #            newBlocks.unshift prev
// #            newBlockMap[prev._id] = prev
// #          lastBlock = last oldBlocks
// #          if next = copyBlock oldNext = @getBlock (if lastBlock then lastBlock.next else @getFirst())
// #            oldBlocks.push oldNext
// #            newBlocks.push next
// #            newBlockMap[next._id] = next
// #            if !(next.prev = prev?._id) then changes.first = next._id
// #          if prev
// #            if !first && ((newBlocks.length && !newBlocks[0].prev) || !oldBlocks.length || !@getFirst() || removes[@getFirst()])
// #              changes.first = newBlocks[0]._id
// #            prev.next = next?._id
// #      changesFor: (first, oldBlocks, newBlocks)->
// #        newBlockMap = {}
// #        removes = {}
// #        changes = {removes, sets: newBlockMap, first: @getFirst(), oldBlocks, newBlocks}
// #        prev = @computeRemovesAndNewBlockIds oldBlocks, newBlocks, newBlockMap, removes
// #        @patchNewBlocks first, oldBlocks, newBlocks, changes, newBlockMap, removes, prev
// #        @removeDuplicateChanges newBlockMap
// #        changes
// #      removeDuplicateChanges: (newBlockMap)->
// #        dups = []
// #        for id, block of newBlockMap
// #          if (oldBlock = @getBlock id) && block.text == oldBlock.text && block.next == oldBlock.next && block.prev == oldBlock.prev
// #            dups.push id
// #        for id of dups
// #          delete newBlockMap[id]
// #      checkChanges: -> if @changeCount == 0
// #        throw new Error "Attempt to make a change outside of makeChanges"
// #      setIndex: (i)->
// #        @checkChanges()
// #        @blockIndex = i
// #      getFirst: -> @first
// #      setFirst: (firstId)-> @first = firstId
// #      getBlock: (id)-> @blocks[id]
// #      setBlock: (id, block)->
// #        @checkChanges()
// #        @blocks[id] = block
// #        @indexBlock block
// #      deleteBlock: (id)->
// #        @checkChanges()
// #        delete @blocks[id]
// #        @unindexBlock id
// #      eachBlock: (func)->
// #        block = @getBlock @getFirst()
// #        while block && func(block, block._id) != false
// #          block = @getBlock block.next
// #        null
// #      indexBlocks: ->
// #        @checkChanges()
// #        items = []
// #        @eachBlock (block)=> items.push indexNode block
// #        @setIndex @newBlockIndex items
// #      splitBlockIndexOnId: (id)-> @blockIndex.split (m)-> m.ids.contains id
// #      splitBlockIndexOnOffset: (offset)-> @blockIndex.split (m)-> m.length > offset
// #      indexBlock: (block)-> if block
// #        @checkChanges()
// #        # if the block is indexed, it might be an easy case, otherwise unindex it
// #        [first, rest] = @splitBlockIndexOnId block._id
// #        if !rest.isEmpty() && rest.peekFirst().id == block._id &&
// #          (next = rest.removeFirst()) &&
// #          (if next.isEmpty() then !block.next else next.peekFirst().id == block.next) &&
// #          (if first.isEmpty() then !block.prev else first.peekLast().id == block.prev)
// #            return @setIndex first.addLast(indexNode block).concat next
// #        if !rest.isEmpty() then @unindexBlock block._id
// #        # if next is followed by prev, just insert the block in between
// #        if (split = @fingerNodeOrder(block.prev, block.next)) && _.isArray split
// #          [first, rest] = split
// #          return @setIndex first.addLast(indexNode block).concat rest
// #        # repair as much of the index as possible and insert the block
// #        @insertAndRepairIndex block
// #      fingerNode: (id)->
// #        id && (node = @splitBlockIndexOnId(id)[1].peekFirst()) && node.id == id && node
// #      fingerNodeOrder: (a, b)->
// #        return !(a || b) ||
// #        if !a && b then @fingerNode b
// #        else if !b && a then @fingerNode a
// #        else
// #          [first, rest] = split = @splitBlockIndexOnId b
// #          !first.isEmpty() && !rest.isEmpty() && rest.peekFirst()?.id == b && first.peekLast()?.id == a && split
// #      # insert block into the index
// #      # then trace forwards and backwards, repairing along the way
// #      insertAndRepairIndex: (block)->
// #        console.warn "REPAIR"
// #        node = indexNode block
// #        if block.next
// #          prev = @getBlock block.prev
// #          if !block.prev
// #            @setIndex @blockIndex.addFirst indexNode block
// #          else
// #            [first, rest] = @splitBlockIndexOnId block.next
// #            @setIndex first.addLast(node).concat rest
// #        else if block.prev
// #          [first, rest] = @splitBlockIndexOnId block.prev
// #          @setIndex first.addLast(node).concat rest
// #        else @setIndex @newBlockIndex [node]
// #        mark = block
// #        cur = @getBlock block.next
// #        while cur && !@fingerNodeOrder mark._id, cur._id
// #          @unindexBlock cur._id
// #          [first, rest] = @splitBlockIndexOnId mark._id
// #          @setIndex insertAfterSplit first, indexNode(cur), rest
// #          mark = cur
// #          cur = @getBlock cur.next
// #        mark = block
// #        cur = @getBlock block.prev
// #        while cur && !@fingerNodeOrder cur._id, mark._id
// #          @unindexBlock cur._id
// #          [first, rest] = @splitBlockIndexOnId mark._id
// #          @setIndex insertInSplit first, indexNode(cur), rest
// #          mark = cur
// #          cur = @getBlock cur.prev
// #      unindexBlock: (id)->
// #        @checkChanges()
// #        if id
// #          [first, rest] = @splitBlockIndexOnId id
// #          if rest.peekFirst()?.id == id
// #            @setIndex first.concat rest.removeFirst()
// #
// #`docOffsetForBlockOffset(args...) -> offset`: args can be a blockOffset or block, offset
// #
// #      docOffsetForBlockOffset: (block, offset)->
// #        if typeof block == 'object'
// #          offset = block.offset
// #          block = block.block
// #        @offsetForBlock(block) + offset
// #      blockOffsetForDocOffset: (offset)->
// #        results = @splitBlockIndexOnOffset offset
// #        if !results[1].isEmpty()
// #          block: results[1].peekFirst().id
// #          offset: offset - results[0].measure().length
// #        else
// #          block: results[0].peekLast().id
// #          offset: results[0].removeLast().measure().length
// #      offsetForBlock: (blockOrId)->
// #        id = if typeof blockOrId == 'string' then blockOrId else blockOrId._id
// #        if @getBlock id then @splitBlockIndexOnId(id)[0].measure().length else 0
// #      blockForOffset: (offset)->
// #        results = @splitBlockIndexOnOffset offset
// #        (results[1]?.peekFirst() ? results[0].peekLast).id
// #      getDocLength: -> @blockIndex.measure().length
// #      getDocSubstring: (start, end)->
// #        startOffset = @blockOffsetForDocOffset start
// #        endOffset = @blockOffsetForDocOffset end
// #        block = @getBlock startOffset.block
// #        text = ''
// #        while block._id != endOffset.block
// #          text += block.text
// #          block = @getBlock block.next
// #        if startOffset.block == endOffset.block
// #          block.text.substring startOffset.offset, endOffset.offset
// #        else text.substring(startOffset.offset) + block.text.substring 0, endOffset.offset
// #
// #`getText(): -> string`: the text for the entire document
// #
// #      getText: ->
// #        text = ''
// #        @eachBlock (block)-> text += block.text
// #        text
// #      check: ->
// #        seen = {}
// #        first = next = @getFirst()
// #        prev = null
// #        while next
// #          prev = next
// #          if seen[next] then throw new Error "cycle in next links"
// #          seen[next] = true
// #          oldBl = bl
// #          bl = @getBlock next
// #          if !bl then throw new Error "Next of #{oldBl._id} doesn't exist"
// #          next = bl.next
// #        @eachBlock (block)->
// #          if block._id != first && !seen[block._id] then throw new Error "#{block._id} not in next chain"
// #        seen = {}
// #        lastBlock = prev
// #        while prev
// #          if seen[prev] then throw new Error "cycle in prev links"
// #          seen[prev] = true
// #          oldBl = bl
// #          bl = @getBlock prev
// #          if !bl then throw new Error "Prev of #{oldBl._id} doesn't exist"
// #          prev = bl.prev
// #        @eachBlock (block)->
// #          if block._id != lastBlock && !seen[block._id] then throw new Error "#{block._id} not in prev chain"
// #        null
// #      blockList: ->
// #        next = @getFirst()
// #        while next
// #          bl = @getBlock next
// #          next = bl.next
// #          bl
// #      change: (changes)-> @trigger 'change', @makeChange changes
// #      makeChange: ({first, sets, removes, oldBlocks, newBlocks})->
// #        @makeChanges =>
// #          {adds, updates, old} = result = {adds: {}, updates: {}, removes, old: {}, sets, oldFirst: @getFirst(), first: first, oldBlocks, newBlocks}
// #          @setFirst first
// #          for id of removes
// #            if bl = @getBlock id
// #              old[id] = bl
// #              @deleteBlock id
// #          for id, block of sets
// #            if bl = @getBlock id
// #              old[id] = bl
// #              updates[id] = block
// #            else adds[id] = block
// #            @setBlock id, block
// #          try
// #            @check()
// #          catch err
// #            console.log err
// #          result
// #      indexArray: -> treeToArray @blockIndex
// #      blockArray: ->
// #        blocks = []
// #        block = @getBlock @getFirst()
// #        while block
// #          blocks.push block
// #          block = @getBlock block.next
// #        blocks
// #      diag: -> @trigger 'diag', @verifyIndex()
// #      verifyIndex: ->
// #        iArray = @indexArray()
// #        treeIds = _.map iArray, _.property 'id'
// #        bArray = @blockArray()
// #        blockIds = _.map bArray, _.property '_id'
// #        if !_.isEqual treeIds, blockIds
// #          console.warn "INDEX ERROR:\nEXPECTED: #{JSON.stringify blockIds}\nBUT GOT: #{JSON.stringify treeIds}"
// #        last = null
// #        errs = new BlockErrors()
// #        for node in iArray
// #          if node.length != @getBlock(node.id)?.text.length
// #            errs.badId node.id, 'bad index length'
// #        offset = 0
// #        @eachBlock (block)=>
// #          last = block
// #          if !@fingerNodeOrder block.prev, block._id
// #            errs.badId block._id, 'bad order'
// #            console.warn "NODE ORDER WRONG FOR #{block.prev}, #{block._id}"
// #          if offset != @offsetForBlock block._id
// #            errs.badId block._id, "offset"
// #          if block.prev && @blockForOffset(offset - 1) != block.prev
// #            errs.badId block._id, "prev"
// #          if block.next && @blockForOffset(offset + block.text.length) != block.next
// #            errs.badId block._id, "next"
// #          offset += block.text.length
// #        errs.errors()
// #      blockOverlapsForReplacement: (start, end, text)->
// #        startBlock = @getBlock @blockForOffset(start)
// #        if !startBlock && start then startBlock = @getBlock @blockForOffset(start - 1)
// #        endBlock = @getBlock @blockForOffset end
// #        if !endBlock && end then endBlock = @getBlock @blockForOffset(end - 1)
// #        blocks = [startBlock]
// #        cur = startBlock
// #        while cur != endBlock && cur.next
// #          blocks.push cur = @getBlock cur.next
// #        fullText = blockText blocks
// #        offset = @offsetForBlock blocks[0]
// #        blocks: blocks
// #        blockText: fullText
// #        newText: fullText.substring(0, start - offset) + text + (fullText.substring end - offset)
// #
// #    class BlockErrors
// #      constructor: ->
// #        @order = []
// #        @ids = {}
// #      isEmpty: -> !@order.length
// #      badId: (id, msg)->
// #        if !@ids[id]
// #          @order.push id
// #          @ids[id] = msg
// #        else @ids[id] += ", #{msg}"
// #      errors: -> if !@isEmpty() then [id, "(#{@ids[id]})"] for id in @order
// #
// #    export treeToArray = (tree)->
// #      nodes = []
// #      while !tree.isEmpty()
// #        nodes.push tree.peekFirst()
// #        tree = tree.removeFirst()
// #      nodes
// #
// #    indexNode = (block)-> id: block._id, length: block.text.length
// #
// #    insertInSplit = (first, middle, rest)->
// #      if first.isEmpty() then rest.addFirst middle
// #      else if rest.isEmpty() then first.addLast middle
// #      else first.addLast(middle).concat rest
// #
// #    insertAfterSplit = (first, afterMiddle, rest)->
// #      next = rest.removeFirst().addFirst(afterMiddle)
// #      if first.isEmpty() then next.addFirst rest.peekFirst()
// #      else first.addLast(rest.peekFirst()).concat next

  // DataStoreEditingOptions
// =======================
var DataStoreEditingOptions$1 = class DataStoreEditingOptions extends BasicEditingOptions {
  constructor(data) {
    super();
    this.data = data;
    this.callbacks = {};
    this.addDataCallbacks({
      change: (changes) => {
        return this.dataChanged(changes);
      },
      load: () => {
        return this.dataLoaded();
      }
    });
  }

  addDataCallbacks(cb) {
    var func, results, type;
    results = [];
    for (type in cb) {
      func = cb[type];
      results.push(this.data.on(type, this.callbacks[type] = func));
    }
    return results;
  }

  dataChanged(changes) {
    return preserveSelection(() => {
      return this.changed(changes);
    });
  }

  dataLoaded() {
    return this.trigger('load');
  }

  cleanup() {
    return this.data.off(this.callbacks);
  }

  initData() {}

  load(name, text) {
    return this.data.load(name, text);
  }

  replaceText(repl) {
    return this.data.replaceText(repl);
  }

  getBlock(id) {
    return this.data.getBlock(id);
  }

  getFirst(first) {
    return this.data.getFirst();
  }

  change(changes) {
    if (changes) {
      return this.data.change(changes);
    }
  }

  changed(changes) {
    return this.rerenderAll();
  }

  offsetForBlock(blockOrId) {
    return this.data.offsetForBlock(blockOrId);
  }

};

// Utilities
// =========
var isEditable = function(n) {
  n = n.nodeType === n.TEXT_NODE ? n.parentNode : n;
  return n.isContentEditable;
};

// #    export link = (prev, next)->
// #      prev.next = next._id
// #      next.prev = prev._id
var blockText$1 = function(blocks) {
  var block;
  return ((function() {
    var j, len, results;
    results = [];
    for (j = 0, len = blocks.length; j < len; j++) {
      block = blocks[j];
      results.push(block.text);
    }
    return results;
  })()).join('');
};

// getEventChar(e)
// --------------
// adapted from Vega on [StackOverflow](http://stackoverflow.com/a/13127566/1026782)
_to_ascii = {
  '188': '44',
  '109': '45',
  '190': '46',
  '191': '47',
  '192': '96',
  '220': '92',
  '222': '39',
  '221': '93',
  '219': '91',
  '173': '45',
  '187': '61', //IE Key codes
  '186': '59', //IE Key codes
  '189': '45' //IE Key codes
};

shiftUps = {
  "96": "~",
  "49": "!",
  "50": "@",
  "51": "#",
  "52": "$",
  "53": "%",
  "54": "^",
  "55": "&",
  "56": "*",
  "57": "(",
  "48": ")",
  "45": "_",
  "61": "+",
  "91": "{",
  "93": "}",
  "92": "|",
  "59": ":",
  "39": "\"",
  "44": "<",
  "46": ">",
  "47": "?"
};

htmlForNode = function(n) {
  if (n.nodeType === n.TEXT_NODE) {
    return escapeHtml$1(n.data);
  } else {
    return n.outerHTML;
  }
};

var getEventChar = function(e) {
  var c, shifton;
  if (e.type === 'keypress') {
    return String.fromCharCode(eventChar(e));
  } else {
    c = e.charCode || e.keyCode || e.which;
    shifton = e.shiftKey || !!(e.modifiers & 4);
    // normalize keyCode
    if (_to_ascii.hasOwnProperty(c)) {
      c = _to_ascii[c];
    }
    if (!shifton && (c >= 65 && c <= 90)) {
      c = String.fromCharCode(c + 32);
    } else if (e.shiftKey && shiftUps.hasOwnProperty(c)) {
      // get shifted keyCode value
      c = shiftUps[c];
    } else {
      c = String.fromCharCode(c);
    }
    return c;
  }
};

shiftKey = function(c) {
  return (15 < c && c < 19);
};

modifiers = function(e, c) {
  var res;
  res = specialKeys[c] || String.fromCharCode(c);
  if (e.altKey) {
    res = "M-" + res;
  }
  if (e.metaKey) {
    res = "M-" + res;
  }
  if (e.ctrlKey) {
    res = "C-" + res;
  }
  if (e.shiftKey) {
    res = "S-" + res;
  }
  return res;
};

var modifyingKey = function(c, e) {
  return !e.altKey && !e.metaKey && !e.ctrlKey && (((47 < c && c < 58)) || c === 32 || c === ENTER || c === BS || c === DEL || ((64 < c && c < 91)) || ((95 < c && c < 112)) || ((185 < c && c < 193)) || ((218 < c && c < 223))); // [\]' (in order)
};

var last$1 = function(array) {
  return array.length && array[array.length - 1];
};

var posFor$1 = function(pos) {
  var p, result;
  if (result = (pos.pos === pos.node.length && pos.node.data[pos.pos - 1] === '\n' && !(p = pos.save().next()).isEmpty() ? p : pos).textPosition()) {
    result.pos = p != null ? p : pos;
    return result;
  }
};

replacements = {
  '<': "&lt;",
  '>': "&gt;",
  '&': "&amp;"
};

var escapeHtml$1 = function(str) {
  if (typeof str === 'string') {
    return str.replace(/[<>&]/g, function(c) {
      return replacements[c];
    });
  } else {
    return str;
  }
};

var findEditor = function(node) {
  var ref, target;
  target = $$1(node);
  while (target.length && !($$1(target).data().editor instanceof LeisureEditCore$1)) {
    target = $$1(target).parent();
  }
  return (ref = target.data()) != null ? ref.editor : void 0;
};

// `preserveSelection` -- restore the current selection after func() completes.  This may
// work better for you than LeisureEditCore.savePosition because it always preserves the
// selection, regardless of the current value of LeisureEditCore.editing.
preservingSelection = null;

validatePositions = function() {
  var editor, node, result;
  node = ($$1(document.activeElement).is('input[input-number]') ? document.activeElement : getSelection().anchorNode);
  if (editor = node && findEditor(node)) {
    result = editor.options.validatePositions();
    if (result) {
      return console.error(`DISCREPENCY AT POSITION ${result.block._id}, ${result.offset}`);
    }
  }
};

var preserveSelection = function(func) {
  var editor, end, input, num, parent, parentId, start;
  if (preservingSelection) {
    return func(preservingSelection);
  } else if ($$1(document.activeElement).is('input[input-number]')) {
    num = document.activeElement.getAttribute('input-number');
    parentId = $$1(document.activeElement).closest('[data-view-block-name]').prop('id');
    input = document.activeElement;
    start = input.selectionStart;
    end = input.selectionEnd;
    try {
      return func({
        type: 'None',
        scrollTop: 0,
        scrollLeft: 0
      });
    } finally {
      setTimeout(validatePositions, 1);
      parent = $$1(`#${parentId}`);
      if (input = parent.find(`[input-number='${num}']`)) {
        input.selectionStart = start;
        input.selectionEnd = end;
        input.focus();
      }
    }
  } else if (editor = findEditor(getSelection().anchorNode)) {
    preservingSelection = editor.getSelectedDocRange();
    try {
      return func(preservingSelection);
    } finally {
      setTimeout(validatePositions, 1);
      editor.selectDocRange(preservingSelection);
      preservingSelection = null;
    }
  } else {
    return func({
      type: 'None',
      scrollTop: 0,
      scrollLeft: 0
    });
  }
};

var Editor = /*#__PURE__*/Object.freeze({
  __proto__: null,
  useEvent: useEvent,
  defaultBindings: defaultBindings,
  LeisureEditCore: LeisureEditCore$1,
  BasicEditingOptions: BasicEditingOptions,
  DataStoreEditingOptions: DataStoreEditingOptions$1,
  isEditable: isEditable,
  blockText: blockText$1,
  getEventChar: getEventChar,
  modifyingKey: modifyingKey,
  last: last$1,
  posFor: posFor$1,
  escapeHtml: escapeHtml$1,
  findEditor: findEditor,
  preserveSelection: preserveSelection,
  copyBlock: copyBlock$1,
  DataStore: DataStore$1,
  FeatherJQ: FeatherJQ,
  get $ () { return $$1; },
  get is$ () { return is$; },
  set$: set$$1
});

// Generated by CoffeeScript 2.6.0
// OrgData example editor (based on Leisure)
// =========================================
// This extends Data store and pushes parsing into the store instead of keeping
// it in the editing options and options delegate it to the store.
var $, DataStore, DataStoreEditingOptions, FancyEditing, Fragment, Headline, LeisureEditCore, OrgEditing, ParsedCodeBlock, PlainEditing, Results, SimpleMarkup, Source, addChange, blockAttrs, blockLabel, blockSource, blockText, checkStructure, contentSpan, copyBlock, data, displayStructure, docBlockOrg, escapeAttr, escapeHtml, getCodeItems, getId, greduce, last, numSpan, orgDoc, parseOrgDoc, parseOrgMode, parseYaml, posFor, set$;

({parseOrgMode, orgDoc, Source, Results, Headline, SimpleMarkup, Fragment} = Org);

({
  orgDoc,
  getCodeItems,
  blockSource,
  blockOrg: docBlockOrg,
  ParsedCodeBlock,
  parseYaml
} = DocOrg);

({last, DataStore, DataStoreEditingOptions, blockText, posFor, escapeHtml, copyBlock, LeisureEditCore, set$} = Editor);

$ = $$1;

data = null;

var OrgData = class OrgData extends DataStore {
  getBlock(thing, changes) {
    var ref;
    if (typeof thing === 'object') {
      return thing;
    } else {
      return (ref = changes != null ? changes.sets[thing] : void 0) != null ? ref : super.getBlock(thing);
    }
  }

  changesFor(first, oldBlocks, newBlocks) {
    var changes;
    changes = super.changesFor(first, oldBlocks, newBlocks);
    this.linkAllSiblings(changes);
    return changes;
  }

  load(name, text) {
    return this.makeChanges(() => {
      this.suppressTriggers(() => {
        return super.load(name, text);
      });
      this.linkAllSiblings({
        first: this.first,
        sets: this.blocks,
        oldBlocks: [],
        newBlocks: this.blockList()
      });
      return this.trigger('load');
    });
  }

  parseBlocks(text) {
    return parseOrgDoc(text);
  }

  nextSibling(thing, changes) {
    var ref;
    return this.getBlock((ref = this.getBlock(thing, changes)) != null ? ref.nextSibling : void 0, changes);
  }

  previousSibling(thing, changes) {
    return this.getBlock(this.getBlock(thing, changes).previousSibling, changes);
  }

  reducePreviousSiblings(thing, changes, func, arg) {
    return greduce(this.getBlock(thing, changes), changes, func, arg, (b) => {
      return this.getBlock(b.previousSibling, changes);
    });
  }

  reduceNextSiblings(thing, changes, func, arg) {
    return greduce(this.getBlock(thing, changes), changes, func, arg, (b) => {
      return this.getBlock(b.nextSibling, changes);
    });
  }

  lastSibling(thing, changes) {
    return this.reduceNextSiblings(thing, changes, (function(x, y) {
      return y;
    }), null);
  }

  firstSibling(thing, changes) {
    return this.reducePreviousSiblings(thing, changes, (function(x, y) {
      return y;
    }), null);
  }

  parent(thing, changes) {
    var ref;
    return this.getBlock((ref = this.firstSibling(thing, changes)) != null ? ref.prev : void 0, changes);
  }

  properties(thing) {
    var bl, props;
    props = {};
    bl = this.getBlock(thing);
    if (bl.type !== 'headline') {
      if (bl.type === 'code') {
        _.defaults(props, bl.codeAttributes);
        _.defaults(props, bl.properties);
      } else if (bl.type === 'chunk') {
        _.defaults(props, bl.properties);
      }
      bl = this.parent(bl);
    }
    while (bl) {
      this.scrapePropertiesInto(bl, props);
      bl = this.parent(bl);
    }
    return props;
  }

  scrapePropertiesInto(block, props) {
    var child, j, len, ref, results;
    ref = this.children(block);
    results = [];
    for (j = 0, len = ref.length; j < len; j++) {
      child = ref[j];
      if (child.type === 'chunk' && child.properties && !_.isEmpty(child.properties)) {
        results.push(_.defaults(props, child.properties));
      } else {
        results.push(void 0);
      }
    }
    return results;
  }

  firstChild(thing, changes) {
    var block, n;
    if ((block = this.getBlock(thing, changes)) && (n = this.getBlock(block.next, changes)) && !n.previousSibling) {
      return n;
    }
  }

  lastChild(thing, changes) {
    return this.lastSibling(this.firstChild(thing, changes), changes);
  }

  children(thing, changes) {
    var c;
    c = [];
    this.reduceNextSiblings(this.firstChild(thing, changes), changes, (function(x, y) {
      return c.push(y);
    }), null);
    return c;
  }

  // `nextRight` returns the next thing in the tree after this subtree, which is just the
  // next sibling if there is one, otherwise it's the closest "right uncle" of this node
  nextRight(thing, changes) {
    var sib;
    while (thing) {
      if (sib = this.nextSibling(thing, changes)) {
        return sib;
      }
      thing = this.parent(thing, changes);
    }
    return null;
  }

  // `linkAllSiblings` -- modify changes so that the sibling links will be correct when the changes are applied.
  linkAllSiblings(changes) {
    var block, cur, emptyNexts, id, parent, results, sibling, stack;
    stack = [];
    parent = null;
    sibling = null;
    emptyNexts = {};
    cur = this.getBlock(changes.first, changes);
    while (cur) {
      if (cur.nextSibling) {
        emptyNexts[cur._id] = cur;
      }
      if (cur.type === 'headline') {
        while (parent && cur.level <= parent.level) {
          [parent, sibling] = stack.pop();
        }
      } else if (cur.type === 'chunk' && (cur.properties != null) && parent && !_(parent.propertiesBlocks).includes(cur._id)) {
        if (!parent.propertiesBlocks) {
          parent.propertiesBlocks = [];
        }
        parent.propertiesBlocks.push(cur._id);
      }
      if (sibling) {
        delete emptyNexts[sibling._id];
        if (sibling.nextSibling !== cur._id) {
          addChange(sibling, changes).nextSibling = cur._id;
        }
        if (cur.previousSibling !== sibling._id) {
          addChange(cur, changes).previousSibling = sibling._id;
        }
      } else if (cur.previousSibling) {
        delete addChange(cur, changes).previousSibling;
      }
      sibling = cur;
      if (cur.type === 'headline') {
        stack.push([parent, sibling]);
        parent = cur;
        sibling = null;
      }
      cur = this.getBlock(cur.next, changes);
    }
    results = [];
    for (id in emptyNexts) {
      block = emptyNexts[id];
      results.push(delete addChange(block, changes).nextSibling);
    }
    return results;
  }

};

parseOrgDoc = function(text) {
  if (text === '') {
    return [];
  } else {
    return orgDoc(parseOrgMode(text.replace(/\r\n/g, '\n')), true);
  }
};

addChange = function(block, changes) {
  if (!changes.sets[block._id]) {
    changes.oldBlocks.push(block);
    changes.newBlocks.push(changes.sets[block._id] = copyBlock(block));
  }
  return changes.sets[block._id];
};

greduce = function(thing, changes, func, arg, next) {
  if (typeof changes === 'function') {
    next = arg;
    arg = func;
    func = changes;
  }
  if (thing && typeof arg === 'undefined') {
    arg = thing;
    thing = next(thing);
  }
  while (thing) {
    arg = func(arg, thing);
    thing = next(thing);
  }
  return arg;
};

getId = function(thing) {
  if (typeof thing === 'string') {
    return thing;
  } else {
    return thing._id;
  }
};

OrgEditing = class OrgEditing extends DataStoreEditingOptions {
  constructor(data) {
    super(data);
    data.on('load', () => {
      return this.editor.setHtml(this.editor.node[0], this.renderBlocks());
    });
  }

  blockLineFor(node, offset) {
    var block;
    ({block, offset} = this.editor.blockOffset(node, offset));
    return this.blockLine(block, offset);
  }

  blockLine(block, offset) {
    var lines, text;
    text = block.text.substring(0, offset);
    lines = text.split('\n');
    return {
      line: lines.length,
      col: last(lines).length
    };
  }

  lineInfo(block, offset) {
    var col, docLine, holder, line, p, startBlock;
    if (block) {
      ({line, col} = this.blockLine(block, offset));
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
  }

  setEditor(editor1) {
    this.editor = editor1;
    return this.editor.on('moved', () => {
      var block, blockLine, col, left, line, offset, top;
      ({block, offset} = this.editor.getSelectedBlockRange());
      if (block) {
        ({line, col, blockLine, top, left} = this.lineInfo(block, offset));
        if (line) {
          return this.updateStatus(`line: ${numSpan(line)} col: ${numSpan(col)} block: ${block._id}:${numSpan(blockLine)} top: ${numSpan(top)} left: ${numSpan(left)}`);
        }
      }
      return this.updateStatus("No selection");
    });
  }

};

PlainEditing = class PlainEditing extends OrgEditing {
  nodeForId(id) {
    return $(`#plain-${id}`);
  }

  idForNode(node) {
    var ref;
    return (ref = node.id.match(/^plain-(.*)$/)) != null ? ref[1] : void 0;
  }

  parseBlocks(text) {
    return this.data.parseBlocks(text);
  }

  renderBlock(block) {
    return [`<span id='plain-${block._id}' data-block>${escapeHtml(block.text)}</span>`, block.next];
  }

  updateStatus(line) {
    return $("#plainStatus").html(line);
  }

};

FancyEditing = class FancyEditing extends OrgEditing {
  changed(changes) {
    var block, id, j, len, ref, ref1, ref2, rendered, results;
    rendered = {};
    ref = changes.removes;
    for (id in ref) {
      block = ref[id];
      this.removeBlock(block);
    }
    ref1 = changes.newBlocks;
    for (j = 0, len = ref1.length; j < len; j++) {
      block = ref1[j];
      rendered[block._id] = true;
      this.updateBlock(block, changes.old[block._id]);
    }
    ref2 = changes.sets;
    results = [];
    for (id in ref2) {
      block = ref2[id];
      if (!rendered[id]) {
        results.push(this.updateBlock(block, changes.old[block._id]));
      } else {
        results.push(void 0);
      }
    }
    return results;
  }

  nodeForId(id) {
    return id && $(`#fancy-${getId(id)}`);
  }

  idForNode(node) {
    var ref;
    return (ref = node.id.match(/^fancy-(.*)$/)) != null ? ref[1] : void 0;
  }

  parseBlocks(text) {
    return this.data.parseBlocks(text);
  }

  removeBlock(block) {
    var content, node;
    if ((node = this.nodeForId(block._id)).length) {
      if (block.type === 'headline') {
        content = node.children().filter('[data-content]');
        content.children().filter('[data-block]').insertAfter(node);
      }
      return node.remove();
    }
  }

  updateBlock(block, old) {
    var child, content, html, j, len, node, ref, results;
    if ((node = this.nodeForId(block._id)).length) {
      content = node.children().filter('[data-content]');
      if (block.type !== (old != null ? old.type : void 0) || block.nextSibling !== (old != null ? old.nextSibling : void 0) || block.previousSibling !== (old != null ? old.previousSibling : void 0) || block.prev !== (old != null ? old.prev : void 0)) {
        if (block.type !== 'headline' && old.type === 'headline') {
          content.children().filter('[data-block]').insertAfter(node);
        }
        this.insertUpdateNode(block, node);
      }
      if (block.text !== (old != null ? old.text : void 0)) {
        if (node.is('[data-headline]')) {
          content.children().filter('[data-block]').insertAfter(node);
        }
        [html] = this.renderBlock(block, true);
        node = $(this.editor.setHtml(node[0], html, true));
        content = node.children().filter('[data-content]');
        if (block.type === 'headline') {
          ref = this.data.children(block);
          results = [];
          for (j = 0, len = ref.length; j < len; j++) {
            child = ref[j];
            results.push(content.append(this.nodeForId(child._id)));
          }
          return results;
        }
      }
    } else {
      node = $("<div></div>");
      this.insertUpdateNode(block, node);
      [html] = this.renderBlock(block, true);
      return this.editor.setHtml(node[0], html, true);
    }
  }

  insertUpdateNode(block, node) {
    var next, parentNode, prev, ref, ref1, ref2;
    if ((ref = (prev = this.nodeForId(this.data.previousSibling(block)))) != null ? ref.length : void 0) {
      return prev.after(node);
    } else if (!block.prev) {
      return this.editor.node.prepend(node);
    } else if (!block.previousSibling && ((ref1 = (parentNode = this.nodeForId(block.prev))) != null ? ref1.is("[data-headline]") : void 0)) {
      return parentNode.children().filter("[data-content]").children().first().after(node);
    } else if ((ref2 = (next = this.nodeForId(this.data.nextSibling(block)))) != null ? ref2.length : void 0) {
      return next.before(node);
    } else {
      return this.editor.node.append(node);
    }
  }

  renderBlock(block, skipChildren) {
    var child, html, ref;
    html = block.type === 'headline' ? `<div ${blockAttrs(block)} contenteditable='false'>${blockLabel(block)}<div contenteditable='true' data-content>${contentSpan(block.text, 'text')}${!skipChildren ? ((function() {
      var j, len, ref, ref1, results;
      ref1 = (ref = this.data.children(block)) != null ? ref : [];
      results = [];
      for (j = 0, len = ref1.length; j < len; j++) {
        child = ref1[j];
        results.push(this.renderBlock(child)[0]);
      }
      return results;
    }).call(this)).join('') : ''}</div></div>` : block.type === 'code' ? `<span ${blockAttrs(block)}>${blockLabel(block)}${escapeHtml(block.text)}</span>` : `<span ${blockAttrs(block)}>${blockLabel(block)}${escapeHtml(block.text)}</span>`;
    return [html, ((ref = this.data.nextSibling(block)) != null ? ref._id : void 0) || !this.data.firstChild(block) && block.next];
  }

  updateStatus(line) {
    return $("#orgStatus").html(line);
  }

};

numSpan = function(n) {
  return `<span class='status-num'>${n}</span>`;
};

blockLabel = function(block) {
  return `<span class='blockLabel' contenteditable='false' data-noncontent>[${block.type} ${block._id}]</span>`;
};

blockAttrs = function(block) {
  var extra;
  extra = '';
  if (block.type === 'headline') {
    extra += ` data-headline='${escapeAttr(block.level)}'`;
  }
  return `id='fancy-${escapeAttr(block._id)}' data-block='${escapeAttr(block._id)}' data-type='${escapeAttr(block.type)}'${extra}`;
};

contentSpan = function(str, type) {
  str = escapeHtml(str);
  if (str) {
    return `<span${type ? ` data-org-type='${escapeAttr(type)}'` : ''}>${str}</span>`;
  } else {
    return '';
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
  var bad, check, checks, cur, info, level, p;
  info = "";
  level = 0;
  cur = data.getBlock(data.first);
  checks = {
    nextSibling: {},
    previousSibling: {},
    prev: {}
  };
  check = cur;
  while (check) {
    checks.nextSibling[check.previousSibling] = check._id;
    checks.previousSibling[check.nextSibling] = check._id;
    checks.prev[check.next] = check._id;
    check = data.getBlock(check.next);
  }
  while (cur) {
    bad = [];
    if (cur.nextSibling !== checks.nextSibling[cur._id]) {
      bad.push('nextSibling');
    }
    if (cur.previousSibling !== checks.previousSibling[cur._id]) {
      bad.push('previousSibling');
    }
    if (cur.prev !== checks.prev[cur._id]) {
      bad.push('prev');
    }
    if (!cur.previousSibling) {
      p = cur;
      while (p = data.parent(p)) {
        level++;
      }
    }
    info += `${((function() {
      var j, ref, results;
      results = [];
      for (j = 0, ref = level; (0 <= ref ? j < ref : j > ref); 0 <= ref ? ++j : --j) {
        results.push('   ');
      }
      return results;
    })()).join('')}${cur._id}${checkStructure(cur, bad)}: ${JSON.stringify(cur.text)}\n`;
    if (!cur.nextSibling) {
      level = 0;
    }
    cur = data.getBlock(cur.next);
  }
  return $("#blocks").html(info);
};

checkStructure = function(block, bad) {
  var err;
  if (bad.length) {
    return ' <span class="err">[' + ((function() {
      var j, len, results;
      results = [];
      for (j = 0, len = bad.length; j < len; j++) {
        err = bad[j];
        results.push(`${err}: ${block[err]}`);
      }
      return results;
    })()).join(', ') + ']</span>';
  } else {
    return '';
  }
};

$(document).ready(function() {
  var editor;
  window.DATA = data = new OrgData();
  data.on('change', function(changes) {
    return displayStructure(data);
  }).on('load', function() {
    return displayStructure(data);
  });
  window.ED = editor = new LeisureEditCore($("#fancyEditor"), new FancyEditing(data));
  window.ED2 = new LeisureEditCore($("#plainEditor"), new PlainEditing(data));
  return setTimeout((function() {
    return editor.loadURL("example.lorg");
  }), 1);
});

export { DocOrg, Editor, Org, OrgData };
//# sourceMappingURL=example-bundle.js.map
