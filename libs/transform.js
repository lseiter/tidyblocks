'use strict'

const stats = require('simple-statistics')

const util = require('./util')
const {ExprBase} = require('./expr')
const DataFrame = require('./dataframe')
const Summarize = require('./summarize')

const FAMILY = '@transform'

/**
 * Store information about a transform in a pipeline
 * Derived classes must provide `run(env, dataframe)`.
 */
class TransformBase {
  /**
   * @param {string} name What this transform is called.
   * @param {string[]} requires What datasets are required before this can run?
   * @param {string} produces What dataset does this transform produce?
   * @param {Boolean} input Does this transform require input?
   * @param {Boolean} output Does this transform produce input?
   */
  constructor (name, requires, produces, input, output) {
    util.check(name && (typeof name === 'string') &&
               Array.isArray(requires) &&
               requires.every(x => (typeof x === 'string')) &&
               ((produces === null) || (typeof produces === 'string')),
               `Bad parameters to constructor`)
    this.name = name
    this.requires = requires
    this.produces = produces
    this.input = input
    this.output = output
  }

  equal (other) {
    return (other instanceof TransformBase) &&
      (this.name === other.name)
  }

  equalColumns (other) {
    util.check('columns' in this,
               `This object must have columns`)
    util.check('columns' in other,
               `Other object must have columns`)
    return (other instanceof TransformBase) &&
      (this.name === other.name) &&
      (this.columns.length === other.columns.length) &&
      this.columns.every(x => other.columns.includes(x))
  }
}

// ----------------------------------------------------------------------

/**
 * Get a dataset.
 * @param {string} dataset Name of dataset.
 */
class TransformData extends TransformBase {
  constructor (dataset) {
    util.check(typeof dataset === 'string',
               `Expected string`)
    super('read', [], null, false, true)
    this.dataset = dataset
  }

  equal (other) {
    return super.equal(other) &&
      (this.dataset === other.dataset)
  }

  run (env, df) {
    env.appendLog(this.name)
    util.check(df === null,
               `Cannot provide input dataframe to reader`)
    const loaded = env.getData(this.dataset)
    return new DataFrame(loaded.data, loaded.columns)
  }
}

/**
 * Drop columns.
 */
class TransformDrop extends TransformBase {
  constructor (columns) {
    util.check(Array.isArray(columns),
               `Expected array of columns`)
    super('drop', [], null, true, true)
    this.columns = columns
  }

  equal (other) {
    return this.equalColumns(other)
  }

  run (env, df) {
    env.appendLog(this.name)
    return df.drop(this.columns)
  }
}

/**
 * Filter rows.
 * @param {Expr} expr The operation function that tests rows.
 */
class TransformFilter extends TransformBase {
  constructor (expr) {
    util.check(expr instanceof ExprBase,
               `Expected expression`)
    super('filter', [], null, true, true)
    this.expr = expr
  }

  equal (other) {
    return super.equal(other) &&
      this.expr.equal(other.expr)
  }

  run (env, df) {
    env.appendLog(this.name)
    return df.filter(this.expr)
  }
}

/**
 * Group values.
 * @param {string[]} columns The columns that determine groups.
 */
class TransformGroupBy extends TransformBase {
  constructor (columns) {
    util.check(Array.isArray(columns),
               `Expected array of columns`)
    super('groupBy', [], null, true, true)
    this.columns = columns
  }

  equal (other) {
    return this.equalColumns(other)
  }

  run (env, df) {
    env.appendLog(this.name)
    return df.groupBy(this.columns)
  }
}

/**
 * Join values.
 * @param {string} leftName Name of left table to wait for.
 * @param {string} leftCol Name of column in left table.
 * @param {string} rightName Name of right table to wait for.
 * @param {string} rightCol Name of column in right table.
 */
class TransformJoin extends TransformBase {
  constructor (leftName, leftCol, rightName, rightCol) {
    super('join', [leftName, rightName], null, false, true)
    this.leftName = leftName
    this.leftCol = leftCol
    this.rightName = rightName
    this.rightCol = rightCol
  }

  equal (other) {
    return super.equal(other) &&
      (this.leftName === other.leftName) &&
      (this.leftCol === other.leftCol) &&
      (this.rightName === other.rightName) &&
      (this.rightCol === other.rightCol)
  }

  run (env, df) {
    env.appendLog(this.name)
    util.check(df === null,
               `Cannot provide input dataframe to join`)
    const left = env.getData(this.leftName)
    const right = env.getData(this.rightName)
    return left.join(this.leftName, this.leftCol,
                     right, this.rightName, this.rightCol)
  }
}

/**
 * Create new columns.
 * @param {string} newName New column's name.
 * @param {function} expr Create new values.
 */
class TransformMutate extends TransformBase {
  constructor (newName, expr) {
    util.check(typeof newName === 'string',
               `Expected string as new name`)
    util.check(expr instanceof ExprBase,
               `Expected expression`)
    super('mutate', [], null, true, true)
    this.newName = newName
    this.expr = expr
  }

  equal (other) {
    return super.equal(other) &&
      (this.newName === other.newName) &&
      (this.expr.equal(other.expr))
  }

  run (env, df) {
    env.appendLog(this.name)
    return df.mutate(this.newName, this.expr)
  }
}

/**
 * Notify that a result is available.
 * @param {string} label Name to use for notification.
 */
class TransformNotify extends TransformBase {
  constructor (label) {
    util.check(typeof label === 'string',
               `Expected string`)
    super('notify', [], label, true, false)
    this.label = label
  }

  equal (other) {
    return super.equal(other) &&
      (this.label === other.label)
  }

  run (env, df) {
    env.appendLog(this.name)
    return df
  }
}

/**
 * Select columns.
 * @param {string[]} columns The names of the columns to keep.
 */
class TransformSelect extends TransformBase {
  constructor (columns) {
    util.check(Array.isArray(columns),
               `Expected array of columns`)
    super('select', [], null, true, true)
    this.columns = columns
  }

  equal (other) {
    return this.equalColumns(other)
  }

  run (env, df) {
    env.appendLog(this.name)
    return df.select(this.columns)
  }
}

/**
 * Create a numerical sequence.
 * @param {string} newName New column's name.
 * @param {number} limit How many to create.
 */
class TransformSequence extends TransformBase {
  constructor (newName, limit) {
    util.check(typeof newName === 'string',
               `Expected string as new name`)
    super('sequence', [], null, true, true)
    this.newName = newName
    this.limit = limit
  }

  equal (other) {
    return super.equal(other) &&
      (this.newName === other.newName) &&
      (this.limit === other.limit)
  }

  run (env, df) {
    env.appendLog(this.name)
    const raw = Array.from(
      {length: this.limit},
      (v, k) => {
        const result = {}
        result[this.newName] = k + 1
        return result
      })
    return new DataFrame(raw)
  }
}

/**
 * Sort data.
 * @param {string[]} columns Names of columns to sort by.
 * @param {Boolean} reverse Sort in reverse (descending) order?
 */
class TransformSort extends TransformBase {
  constructor (columns, reverse) {
    util.check(Array.isArray(columns),
               `Expected array of columns`)
    util.check(typeof reverse === 'boolean',
               `Expected Boolean`)
    super('sort', [], null, true, true)
    this.columns = columns
    this.reverse = reverse
  }

  equal (other) {
    return this.equalColumns(other)
  }

  run (env, df) {
    env.appendLog(this.name)
    return df.sort(this.columns, this.reverse)
  }
}

/**
 * Summarize data.
 * @param {string} op Name of operation.
 * @param {string} column Column to summarize.
 */
class TransformSummarize extends TransformBase {
  constructor (op, column) {
    util.check(typeof op === 'string',
               `Expected string as op`)
    util.check(op in Summarize,
               `Unknown summarization operation ${op}`)
    util.check(typeof column === 'string',
               `Expected string as column name`)
    super('summarize', [], null, true, true)
    this.op = op
    this.column = column
  }

  equal (other) {
    return super.equal(other) &&
      (this.op === other.op) &&
      (this.column === other.column)
  }

  run (env, df) {
    env.appendLog(this.name)
    const summarizer = new Summarize[this.op](this.column)
    return df.summarize(summarizer)
  }
}

/**
 * Make a function to remove grouping
 */
class TransformUngroup extends TransformBase {
  constructor () {
    super('ungroup', [], null, true, true)
  }

  run (env, df) {
    env.appendLog(this.name)
    return df.ungroup()
  }
}

/**
 * Select rows with unique values.
 * @param {string[]} columns The columns to use for uniqueness test.
 */
class TransformUnique extends TransformBase {
  constructor (columns) {
    util.check(Array.isArray(columns),
               `Expected array of columns`)
    super('unique', [], null, true, true)
    this.columns = columns
  }

  equal (other) {
    return this.equalColumns(other)
  }

  run (env, df) {
    env.appendLog(this.name)
    return df.unique(this.columns)
  }
}

// ----------------------------------------------------------------------

/**
 * Store information about a plotting transform.
 */
class TransformPlot extends TransformBase {
  constructor (name, label, spec, fillin) {
    util.check(label && (typeof label === 'string'),
               `Must provide non-empty label`)
    super(name, [], null, true, false)
    this.label = label
    this.spec = Object.assign({}, spec, fillin, {name})
  }

  run (env, df) {
    env.appendLog(this.name)
    this.spec.data.values = df.data
    env.setPlot(this.label, this.spec)
  }
}

/**
 * Create a bar plot.
 * @param {string} axisX Which column to use for the X axis.
 * @param {string} axisY Which column to use for the Y axis.
 */
class TransformBar extends TransformPlot {
  constructor (label, axisX, axisY) {
    util.check(axisX && (typeof axisX === 'string') &&
               axisY && (typeof axisY === 'string'),
               `Must provide non-empty strings for axes`)
    const spec = {
      data: {values: null},
      mark: 'bar',
      encoding: {
        x: {field: axisX, type: 'ordinal'},
        y: {field: axisY, type: 'quantitative'},
        tooltip: {field: axisY, type: 'quantitative'}
      }
    }
    super('bar', label, spec, {axisX, axisY})
  }
}

/**
 * Create a box plot.
 * @param {string} axisX Which column to use for the X axis.
 * @param {string} axisY Which column to use for the Y axis.
 */
class TransformBox extends TransformPlot {
  constructor (label, axisX, axisY) {
    util.check(axisX && (typeof axisX === 'string') &&
               axisY && (typeof axisY === 'string'),
               `Must provide non-empty strings for axes`)
    const spec = {
      data: {values: null},
      mark: {type: 'boxplot', extent: 1.5},
      encoding: {
        x: {field: axisX, type: 'ordinal'},
        y: {field: axisY, type: 'quantitative'}
      }
    }
    super('box', label, spec, {axisX, axisY})
  }
}

/**
 * Create a dot plot.
 * @param {string} axisX Which column to use for the X axis.
 */
class TransformDot extends TransformPlot {
  constructor (label, axisX) {
    util.check(axisX && (typeof axisX === 'string'),
               `Must provide non-empty string for axis`)
    const spec = {
      data: {values: null},
      mark: {type: 'circle', opacity: 1},
      transform: [{
        window: [{op: 'rank', as: 'id'}],
        groupby: [axisX]
      }],
      encoding: {
        x: {field: axisX, type: 'ordinal'},
        y: {
          field: 'id',
          type: 'ordinal',
          axis: null,
          sort: 'descending'
        }
      }
    }
    super('dot', label, spec, {axisX})
  }
}

/**
 * Create a histogram.
 * @param {string} column Which column to use for values.
 * @param {number} bins How many bins to use.
 */
class TransformHistogram extends TransformPlot {
  constructor (label, column, bins) {
    util.check(column && (typeof column === 'string') &&
               (typeof bins === 'number') && (bins > 0),
               `Invalid parameters for histogram`)
    const spec = {
      data: {values: null},
      mark: 'bar',
      encoding: {
        x: {
          bin: {maxbins: bins},
          field: column,
          type: 'quantitative'
        },
        y: {
          aggregate: 'count',
          type: 'quantitative'
        },
        tooltip: null
      }
    }
    super('histogram', label, spec, {column, bins})
  }
}

/**
 * Create a scatter plot.
 * @param {string} axisX Which column to use for the X axis.
 * @param {string} axisY Which column to use for the Y axis.
 * @param {string} color Which column to use for color (if any).
 */
class TransformScatter extends TransformPlot {
  constructor (label, axisX, axisY, color) {
    util.check(axisX && (typeof axisX === 'string') &&
               axisY && (typeof axisY === 'string'),
               `Must provide non-empty strings for axes`)
    util.check((color === null) ||
               ((typeof color === 'string') && color),
               `Must provide null or non-empty string for color`)
    const spec = {
      data: {values: null},
      mark: 'point',
      encoding: {
        x: {field: axisX, type: 'quantitative'},
        y: {field: axisY, type: 'quantitative'}
      }
    }
    if (color) {
      spec.encoding.color = {field: color, type: 'nominal'}
    }
    super('scatter', label, spec, {axisX, axisY, color})
  }
}

// ----------------------------------------------------------------------

/**
 * One-sample two-sided t-test.
 * @param {string} colName The column to get values from.
 * @param {number} mean Mean value tested for.
 */
class TransformTTestOneSample extends TransformBase {
  constructor (label, colName, mean) {
    super('ttest_one', [], null, true, false)
    this.label = label
    this.colName = colName
    this.mean = mean
  }

  run (env, df) {
    env.appendLog(this.name)
    const samples = df.data.map(row => row[this.colName])
    const pValue = stats.tTest(samples, this.mean)
    env.setStats(this.label, pValue)
    return df
  }
}

/**
 * Paired two-sided t-test.
 * @param {number} significance Significance tested for.
 * @param {string} labelCol The column to get labels from.
 * @param {string} valueCol The column to get the values from.
 */
class TransformTTestPaired extends TransformBase {
  constructor (label, labelCol, valueCol) {
    super('ttest_two', [], null, true, false)
    this.label = label
    this.labelCol = labelCol
    this.valueCol = valueCol
  }

  run (env, df) {
    env.appendLog(this.name)
    const known = new Set(df.data.map(row => row[this.labelCol]))
    util.check(known.size === 2,
               `Must have exactly two labels for data`)
    const [leftVal, rightVal] = Array.from(known)
    const leftVals = df.data
          .filter(row => (row[this.labelCol] === leftVal))
          .map(row => row[this.valueCol])
    const rightVals = df
          .data
          .filter(row => (row[this.labelCol] === rightVal))
          .map(row => row[this.valueCol])
    const pValue = stats.tTestTwoSample(leftVals, rightVals, 0)
    env.setStats(this.label, pValue)
    return df
  }
}

// ----------------------------------------------------------------------

module.exports = {
  FAMILY: FAMILY,
  base: TransformBase,
  data: TransformData,
  drop: TransformDrop,
  filter: TransformFilter,
  groupBy: TransformGroupBy,
  join: TransformJoin,
  mutate: TransformMutate,
  notify: TransformNotify,
  select: TransformSelect,
  sequence: TransformSequence,
  sort: TransformSort,
  summarize: TransformSummarize,
  ungroup: TransformUngroup,
  unique: TransformUnique,
  bar: TransformBar,
  box: TransformBox,
  dot: TransformDot,
  histogram: TransformHistogram,
  scatter: TransformScatter,
  ttest_one: TransformTTestOneSample,
  ttest_two: TransformTTestPaired
}
