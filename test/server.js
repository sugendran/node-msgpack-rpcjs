var rpc = require("../index");

var server = rpc.createServer({ port: 12345 });
server.on("ping", function(callback) {
	callback(null, "pong");
});
server.on("add", function(a, b, callback) {
	callback(null, a + b);
});
server.on("shouldErr", function(callback) {
	callback(new Error("This is an error"));
});
server.on("fyi", function(msg) {
	console.log("client sent a notification: " + msg);
});