
/**
 * Module dependencies.
 */

var Emitter = require('events').EventEmitter;
var debug = require('debug')('mongroup:process');
var exec = require('child_process').exec;
var path = require('path');
var fs = require('fs');
var join = path.join;

/**
 * Expose `Process`.
 */

module.exports = Process;

/**
 * Initialize a `Process` of `name` with `cmd`.
 *
 * @param {String} name
 * @param {String} cmd
 * @api public
 */

function Process(group, name, cmd) {
  this.group = group;
  this.name = name;
  this.cmd = cmd;
  this.logfile = join(group.conf.logs, name + '.log');
  this.pidfile = join(group.conf.pids, name + '.pid');
  this.monpidfile = this.pidfile.replace('.pid', '.mon.pid');
  this.pid = this.readPid();
  this.monpid = this.readMonPid();
  debug('process %s (pid %s) (mon %s)', this.name, this.pid, this.monpid)
}

/**
 * Inherit from `Emitter.prototype`.
 */

Process.prototype.__proto__ = Emitter.prototype;

/**
 * Return pidfile mtime.
 *
 * @return {Date}
 * @api public
 */

Process.prototype.mtime = function(){
  return fs.statSync(this.pidfile).mtime;
};

/**
 * Return the pid.
 *
 * @return {Number} pid or undefined
 * @api private
 */

Process.prototype.readPid = function(){
  try {
    return parseInt(fs.readFileSync(this.pidfile, 'ascii'), 10);
  } catch (err) {
    // ignore
  }
};

/**
 * Return the mon pid.
 *
 * @return {Number} pid or undefined
 * @api private
 */

Process.prototype.readMonPid = function(){
  try {
    return parseInt(fs.readFileSync(this.monpidfile, 'ascii'), 10);
  } catch (err) {
    // ignore
  }
};

/**
 * Remove pidfiles.
 *
 * @api public
 */

Process.prototype.removePidfiles = function(){
  fs.unlinkSync(this.pidfile);
  fs.unlinkSync(this.monpidfile);
};

/**
 * Return the state:
 *
 *  - stopped
 *  - dead
 *  - alive
 *
 * @return {String}
 * @api public
 */

Process.prototype.state = function(){
  if (!this.monpid || !this.pid) return 'stopped';
  if (this.alive()) return 'alive';
  return 'dead';
};

/**
 * Check if the process is alive.
 *
 * @return {Boolean}
 * @api public
 */

Process.prototype.alive = function(){
  return alive(this.pid)
};

/**
 * Check if the mon process is alive.
 *
 * @return {Boolean}
 * @api public
 */

Process.prototype.monalive = function(){
  return alive(this.monpid);
};

/**
 * Start the process.
 *
 * @param {Function} fn
 * @api public
 */

Process.prototype.start = function(fn){
  var self = this;
  var cmd = ['mon'];
  cmd.push('-d');
  cmd.push('-l ' + this.logfile);
  cmd.push('-p ' + this.pidfile);
  cmd.push('-m ' + this.monpidfile);
  cmd.push('"' + this.cmd + '"');
  cmd = cmd.join(' ');

  debug('exec `%s`', cmd);
  var proc = exec(cmd, fn);
};

/**
 * Stop the process with `sig`.
 *
 * @param {String} sig
 * @param {Function} fn
 * @api public
 */

Process.prototype.stop = function(sig, fn){
  debug('stop %s with %s', this.monpid, sig);
  if (this.monalive()) process.kill(this.monpid, sig);
  this.pollExit(fn);
};

/**
 * Poll for exit and invoke `fn()`.
 *
 * @param {Function} fn
 * @api private
 */

Process.prototype.pollExit = function(fn){
  var self = this;
  setTimeout(function(){
    if (self.monalive()) return self.pollExit(fn);
    debug('poll %s for exit', self.name);
    self.removePidfiles();
    fn();
  }, 500);
};

/**
 * Check if process `pid` is alive.
 *
 * @param {Number} pid
 * @return {Boolean}
 * @api private
 */

function alive(pid) {
  try {
    if ('number' != typeof pid) return false;
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if ('ESRCH' != err.code) throw err;
    return false;
  }
}