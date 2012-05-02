var msgpack = require("msgpack-js"),
	net = require("net"),
	events = require("events"),
	util = require("util");

var nextSequenceId = 1;

/*
 * The client object
 * options = {
 *	port: <port to listen on>
 * }
 *
 */

function Client(options) {
	events.EventEmitter.call(this);

	this.requests = {};
	this.connected = false;
	this.timeout = options.timeout || 30000;
	this.heartbeat = options.heartbeat || 60000;
	var self = this;
	this.socket = net.connect(options.port, options.host, function() {
		self.connected = true;
		self.emit("connect", self);
		setTimeout(function() {
			self._ping();
		}, self.heartbeat);
	});
	var buf = null;
	this.socket.on("data", function(data) {
		if (buf) {
			// append
			var newBuf = new Buffer(buf.length + data.length);
			buf.copy(newBuf, 0, 0, buf.length);
			data.copy(newBuf, buf.length, 0, data.length);
			buf = newBuf;
		} else {
			buf = data;
		}

		var messageObj;
		// ugly but there isn't another way to know if we're received all packets
		try {
			messageObj = msgpack.decode(buf);
		} catch (e) {
			// not done
		}
		if (messageObj) {
			buf = null;
			if (messageObj[0] === 1) {
				var msgId = messageObj[1];
				var err = messageObj[2];
				var result = messageObj[3];
				if (self.requests[msgId]) {
					self.requests[msgId](err, result);
				}
			}
		}
	});
	this.socket.on("error", function(err) {
		self._end("error", err);
	});
	this.socket.on("timeout", function() {
		self._end("timeout");
	});
	this.socket.on("close", function(hadErr) {
		if(hadErr) {
			self._end("error", new Error("Socket closed due to transmission error"));
		} else {
			self._end("close");
		}
	});
}
util.inherits(Client, events.EventEmitter);

Client.prototype._end = function(evtName, val) {
	this.connected = false;
	this.emit(evtName, val);
};

Client.prototype._ping = function() {
	if (this.connected) {
		var self = this;
		var expire = setTimeout(function() {
			self._end("timeout");
		}, this.timeout);
		this.request("__ping", function() {
			clearTimeout(expire);
			setTimeout(function() {
				self._ping();
			}, self.heartbeat);
		});
	}
};

Client.prototype.request = function() {
	var method = arguments[0];
	var params = [];
	for (var i = 1, ii = arguments.length - 1; i < ii; i++) {
		params.push(arguments[i]);
	}
	var msgId = nextSequenceId++;
	var callback = arguments[arguments.length - 1];
	this.requests[msgId] = callback;
	var obj = msgpack.encode([0, msgId, method, params]);
	this.socket.write(obj);
};

Client.prototype.notify = function() {
	var method = arguments[0];
	var params = [];
	for (var i = 1, ii = arguments.length; i < ii; i++) {
		params.push(arguments[i]);
	}
	var obj = msgpack.encode([2, method, params]);
	this.socket.write(obj);
};

exports.createClient = function(options) {
	return new Client(options);
};


/*
 * The server.
 * options = {
 *	port: <port to listen on>
 * }
 *
 * will emit requests
 * var myServer = require("msgpack-rpcjs").createServer({port: 1234});
 * myServer.on("myMethod", function(param){ console.log(param); });
 */

function Server(options) {
	events.EventEmitter.call(this);

	var self = this;
	this.socket = net.createServer(function(connection) {
		var buf = null;
		connection.on("data", function(data) {
			if (buf) {
				// append
				var newBuf = new Buffer(buf.length + data.length);
				buf.copy(newBuf, 0, 0, buf.length);
				data.copy(newBuf, buf.length, 0, data.length);
				buf = newBuf;
			} else {
				buf = data;
			}

			var messageObj;
			// ugly but there isn't another way to know if we're received all packets
			try {
				messageObj = msgpack.decode(buf);
			} catch (e) {
				// not done
			}
			if (messageObj) {
				buf = null;

				if (messageObj[0] === 0) {
					// request
					var msgId = messageObj[1];
					var method = messageObj[2];
					var params = messageObj[3];
					var respCallback = function(err, result) {
							if (err && err.constructor == Error) {
								err = err.message;
							}
							var response = [1, msgId, err, result || null];
							var packed = msgpack.encode(response);
							connection.write(packed);
						};
					// internal heartbeat
					if (method == "_ping") {
						return respCallback(null, "_pong");
					}
					params.push(respCallback);
					params.splice(0, 0, method);
					self.emit.apply(self, params);
				} else if (messageObj[0] === 2) {
					// notification
					var method = messageObj[1];
					var params = messageObj[2];
					params.splice(0, 0, method);
					self.emit.apply(self, params);
				}
			}
		});
		connection.on('end', function() {
			// cleanup
		});
	});

	this.socket.on("error", function(err) {
		self.socket.close();
		self.emit("error", err);
	});

	this.socket.listen(options.port, function(e) {
		if (e) {
			if (e.code == 'EADDRINUSE') {
				console.log('Address in use, retrying...');
				return setTimeout(function() {
					self.socket.close();
					self.socket.listen(PORT, HOST);
				}, 1000);
			}
			self.socket.close();
			throw e;
		}
	});
}

util.inherits(Server, events.EventEmitter);

exports.createServer = function(options) {
	return new Server(options);
};
