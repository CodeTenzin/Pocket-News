const http = require("http");
const https = require("https");
const fs = require("fs");
const url = require("url");
const querystring = require("querystring");

const [{token}, {consumer_key}] = require("./auth/credentials.json");
const redirect_uri = "http://localhost:3000/receive_code";

const country = "us";
const lang = "en";
const max = "5";

let request_token, temp_news;

const port = 3000;
const server = http.createServer();


server.on("listening", listen_handler);
server.listen(port);
function listen_handler() {
    console.log(`Now listening on port ${port}`);
}

server.on("request", request_handler);
function request_handler(req, res) {
    console.log(`New Request from ${req.socket.remoteAddress} for ${req.url}`);
    if(req.url === "/") {
        const form = fs.createReadStream("html/index.html");
        res.writeHead(200, {"Content-Type": "text/html"})
		form.pipe(res);
    }
    else if (req.url.startsWith("/search")){
		let {news} = url.parse(req.url,true).query;
        if(news == null || news === ""){
			not_found(res);
			return;
		}
        temp_news = news;  
		obtainRequestToken(res);
    }
    else if (req.url.startsWith("/receive_code")){
        convert_requesttoken_to_accesstoken(request_token, temp_news, res);
    }
    else {
        res.writeHead(404, {"Content-Type": "text/html"});
        res.end(`<h1>404 Not Found</h1>`);
    }
}


function not_found(res){
	res.writeHead(404, {"Content-Type": "text/html"});
	res.end(`<h1>404 Not Found</h1>`);
}


function obtainRequestToken(res) {
    const token_request_endpoint = 'https://getpocket.com/v3/oauth/request';
    const uri = querystring.stringify({consumer_key, redirect_uri});
    let options = {
		method: "POST",
		headers:{
            "Host" : "getpocket.com",
			"Content-Type":"application/x-www-form-urlencoded",
            "X-Accept" : "application/x-www-form-urlencoded"
		}
	}
    https.request(
		token_request_endpoint, 
		options, 
	    (token_stream) => process_stream(token_stream, receive_request_token, res)).end(uri);
}

function process_stream (stream, callback , ...args){
	let body = "";
	stream.on("data", chunk => body += chunk);
	stream.on("end", () => callback(body, ...args));
}

function receive_request_token(body, res){
    request_token = body.substring(body.indexOf('=') + 1);
    redirect_to_pocket(request_token, res);
}

function redirect_to_pocket(request_token, res) {
    const authorization_endpoint = 'https://getpocket.com/auth/authorize';
    const uri = querystring.stringify({request_token, redirect_uri});
    res.writeHead(302, {Location: `${authorization_endpoint}?${uri}`})
	   .end();
}

function convert_requesttoken_to_accesstoken(code, q, res){
    const convert_request_endpoint = 'https://getpocket.com/v3/oauth/authorize';
    const uri = querystring.stringify({consumer_key, code});
    let options = {
		method: "POST",
		headers:{
            "Host" : "getpocket.com",
			"Content-Type":"application/x-www-form-urlencoded",
            "X-Accept" : "application/x-www-form-urlencoded"
		}
	}
    https.request(
		convert_request_endpoint, 
		options, 
	    (token_stream) => process_stream(token_stream, receive_access_token, q, res)).end(uri);
}

function receive_access_token(body, q, res) {
    const access_token = body.slice(
        body.indexOf('=') + 1,
        body.lastIndexOf('&'),
      );
    get_news(access_token, q, res);

}

function get_news(access_token, q, res) {
    const gNews_endpoint = 'https://gnews.io/api/v4/search';
    const uri = querystring.stringify({token, q, country, max, lang});
    let options = {
		method: "GET",
		headers:{
			"Content-Type":"application/x-www-form-urlencoded",
		}
	}
    const gNews_request = https.get(`${gNews_endpoint}?${uri}`, options);
    gNews_request.once("response", process_stream);
	function process_stream (news_stream){
		let news_data = "";
		news_stream.on("data", chunk => news_data += chunk);
		news_stream.on("end", () => addToPocket(access_token, news_data, res));

    }
}

function addToPocket(access_token, news_data, res) {
    const add_endpoint = 'https://getpocket.com/v3/add';
    let news_object = JSON.parse(news_data);
    let options = {
		method: "POST",
		headers:{
            "Host" : "getpocket.com",
			"Content-Type":"application/x-www-form-urlencoded",
            "X-Accept" : "application/x-www-form-urlencoded"
		}
	}
    for(let i=0; i<max; i++) {
        let url = news_object.articles[i][`url`];
        const uri = querystring.stringify({url, consumer_key, access_token});
        https.request(
		    add_endpoint, 
		    options, 
	    (token_stream) => process_stream(token_stream, receive_task_response, res)).end(uri);
    }
}

function receive_task_response(body, res){
    res.writeHead(302, {Location: `https://getpocket.com/saves?src=navbar`})
			   .end();
}

