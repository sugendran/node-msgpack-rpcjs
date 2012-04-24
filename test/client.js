var rpc = require("../index");

var client = rpc.createClient({
	port: 12345,
	host: "127.0.0.1"
});

function test1() {
	client.request("ping", function(error, response) {
		console.log("response to ping was " + response);
		test2();
	});
}

function test2() {
	client.request("add", 10, 20, function(error, response) {
		console.log("10 + 20 = " + response);
		test3();
	});
}

function test3() {
	client.request("shouldErr", function(error) {
		console.log(error);
		test4();
	});
}

function test4() {
	client.notify("fyi", "You smell");
}

client.on("connect", function() {
	test1();
});
