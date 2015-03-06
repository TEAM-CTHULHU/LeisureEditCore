# guts taken from [cakefile-template](https://github.com/twilson63/cakefile-template)
# and then modified.

fs = require "fs"
{spawn, exec} = require 'child_process'

cp = (src, dst)-> fs.createReadStream(src).pipe(fs.createWriteStream(dst))

try
  which = require('which').sync
catch err
  if process.platform.match(/^win/)?
    console.log 'WARNING: the which module is required for windows\ntry: npm install which'
  which = null

files = [
  'domCursor.litcoffee',
  'editor.litcoffee'
]

# ANSI Terminal Colors
bold = '\x1b[0;1m'
green = '\x1b[0;32m'
reset = '\x1b[0m'
red = '\x1b[0;31m'

task 'build', 'compile source', (options) ->
  build false, (-> log ":-)", green), useMapping: useMapping = options.map
  cp 'adiff.js', 'build/adiff.js'
  cp 'editor.litcoffee', 'README.md'

# ## *log* 
# 
# **given** string as a message
# **and** string as a color
# **and** optional string as an explanation
# **then** builds a statement and logs to console.
# 
log = (message, color, explanation) -> console.log color + message + reset + ' ' + (explanation or '')

# ## *launch*
#
# **given** string as a cmd
# **and** optional array and option flags
# **and** optional callback
# **then** spawn cmd with options
# **and** pipe to process stdout and stderr respectively
# **and** on child process exit emit callback if set and status is 0
launch = (cmd, options=[], callback) ->
  cmd = which(cmd) if which
  app = spawn cmd, options
  app.stdout.pipe(process.stdout)
  app.stderr.pipe(process.stderr)
  app.on 'exit', (status) ->
    if status is 0
      callback()
    else
      process.exit(status)

# ## *build*
#
# **given** optional boolean as watch
# **and** optional function as callback
# **then** invoke launch passing coffee command
# **and** defaulted options to compile src to lib
build = (watch, callback, {useMapping} = {}) ->
  useMapping ?= false
  
  if typeof watch is 'function'
    callback = watch
    watch = false
  
  options = ['-c', '-b']
  options.push("--map") if useMapping
  options.push("-o")
  options.push 'build'
  options = options.concat files
  options.unshift '-w' if watch
  launch 'coffee', options, callback
